"""Monte Carlo threshold calibration over known-normal scores.

Method
------
Scores from held-out *normal* data are serially dependent (slow dynamics, shared
drivers), so i.i.d. resampling would give falsely tight false-alarm estimates.
We use the **stationary bootstrap** (Politis & Romano): resample blocks with
geometric lengths whose mean is set from the integrated autocorrelation time of
the log-scores. Blocks never cross the boundary of a normal segment, so we never
splice across an anomaly or a data gap.

For every replicate we compute the point-level false-alarm rate FAR(tau) on a grid
of thresholds. The result is the threshold-vs-FAR curve with a percentile
confidence band. Two thresholds are offered:

* ``mean``         - smallest tau whose expected FAR <= target (this coincides with
                     the empirical quantile; the Monte Carlo adds the uncertainty).
* ``conservative`` - smallest tau whose *upper confidence bound* on FAR <= target.

When the target FAR is too small to be resolved by the available normal data
(fewer than ~5 effectively independent exceedances expected) we say so instead of
reporting a falsely precise threshold.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .gaps import find_runs


def segments_from_mask(scores: np.ndarray, mask: np.ndarray) -> list[np.ndarray]:
    """Score arrays for each run of consecutive rows that are in ``mask`` and finite."""
    ok = np.asarray(mask, dtype=bool) & np.isfinite(scores)
    return [scores[s : e + 1] for s, e in find_runs(ok)]


def _pool(segments: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    x = np.concatenate(segments)
    ends = np.concatenate(
        [np.full(len(s), off + len(s)) for off, s in zip(np.cumsum([0] + [len(s) for s in segments[:-1]]), segments)]
    )
    return x, ends


def estimate_block_length(segments: list[np.ndarray], max_lag: int = 500, cap: float | None = None) -> float:
    """Mean block length = integrated autocorrelation time of log-scores (>= 1)."""
    logs = [np.log(np.asarray(s, dtype=float) + 1e-12) for s in segments if len(s) > 3]
    if not logs:
        return 1.0
    pooled = np.concatenate(logs)
    n = len(pooled)
    mu, var = pooled.mean(), pooled.var()
    if var <= 0:
        return 1.0
    bound = 2.0 / np.sqrt(n)
    iact = 1.0
    for lag in range(1, min(max_lag, max(len(s) for s in logs) - 1) + 1):
        num = cnt = 0.0
        for s in logs:
            if len(s) > lag:
                num += float(np.dot(s[:-lag] - mu, s[lag:] - mu))
                cnt += len(s) - lag
        if cnt == 0:
            break
        rho = num / cnt / var
        if rho < bound:
            break
        iact += 2.0 * rho
    cap = cap if cap is not None else max(1.0, n / 10.0)
    return float(np.clip(iact, 1.0, cap))


def _resample_indices(rng: np.random.Generator, n_pool: int, seg_end: np.ndarray, n_out: int, p: float) -> np.ndarray:
    chunks, total = [], 0
    while total < n_out:
        m = max(16, int((n_out - total) * p * 1.5) + 8)
        starts = rng.integers(0, n_pool, size=m)
        lens = np.minimum(rng.geometric(p, size=m), seg_end[starts] - starts)
        cs = np.cumsum(lens)
        idx = np.repeat(starts, lens) + (np.arange(cs[-1]) - np.repeat(cs - lens, lens))
        chunks.append(idx)
        total += len(idx)
    return np.concatenate(chunks)[:n_out]


@dataclass
class CalibrationResult:
    thresholds: np.ndarray
    far_mean: np.ndarray
    far_lo: np.ndarray
    far_hi: np.ndarray
    far_empirical: np.ndarray
    block_length: float
    n_samples: int
    n_segments: int
    replicates: int
    confidence: float
    target_far: float
    threshold_mean: float
    threshold_conservative: float
    threshold: float
    threshold_mode: str
    resolvable: bool
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "method": "stationary bootstrap over known-normal scores",
            "target_far": self.target_far,
            "threshold": self.threshold,
            "threshold_mode": self.threshold_mode,
            "threshold_mean": self.threshold_mean,
            "threshold_conservative": self.threshold_conservative,
            "resolvable": self.resolvable,
            "block_length": round(self.block_length, 2),
            "n_samples": self.n_samples,
            "n_effective_samples": round(self.n_samples / max(self.block_length, 1.0), 1),
            "n_segments": self.n_segments,
            "replicates": self.replicates,
            "confidence": self.confidence,
            "warnings": self.warnings,
            "curve": {
                "thresholds": self.thresholds.tolist(),
                "far_mean": self.far_mean.tolist(),
                "far_lo": self.far_lo.tolist(),
                "far_hi": self.far_hi.tolist(),
                "far_empirical": self.far_empirical.tolist(),
            },
        }


def calibrate_threshold(
    segments: list[np.ndarray],
    target_far: float = 0.01,
    replicates: int = 1000,
    confidence: float = 0.95,
    n_thresholds: int = 120,
    threshold_mode: str = "mean",
    seed: int = 0,
    block_length: float | None = None,
) -> CalibrationResult:
    if not segments or sum(len(s) for s in segments) < 30:
        raise ValueError("too few known-normal calibration scores (need at least 30)")
    if not 0 < target_far < 1:
        raise ValueError("target_far must be in (0, 1)")
    if threshold_mode not in ("mean", "conservative"):
        raise ValueError("threshold_mode must be 'mean' or 'conservative'")
    rng = np.random.default_rng(seed)
    x, seg_end = _pool(segments)
    n = len(x)
    L = float(block_length) if block_length else estimate_block_length(segments)
    p = 1.0 / max(L, 1.0)
    fars = np.geomspace(0.25, max(2.0 / n, 1e-5), n_thresholds)
    thr = np.unique(np.quantile(x, 1.0 - fars))
    sx = np.sort(x)
    far_emp = 1.0 - np.searchsorted(sx, thr, side="right") / n
    reps = np.empty((replicates, len(thr)))
    for b in range(replicates):
        v = x[_resample_indices(rng, n, seg_end, n, p)]
        counts = np.bincount(np.searchsorted(thr, v, side="left"), minlength=len(thr) + 1)
        reps[b] = counts[::-1].cumsum()[::-1][1:] / n
    alpha = (1.0 - confidence) / 2.0
    far_mean = np.minimum.accumulate(reps.mean(axis=0))
    far_lo = np.percentile(reps, 100 * alpha, axis=0)
    far_hi = np.minimum.accumulate(np.percentile(reps, 100 * (1 - alpha), axis=0))

    warnings: list[str] = []
    n_eff = n / max(L, 1.0)
    resolvable = target_far * n_eff >= 5.0 and target_far >= 2.0 / n
    if not resolvable:
        warnings.append(
            f"target_far={target_far:g} is not resolvable from {n} normal samples "
            f"(~{n_eff:.0f} effectively independent); threshold falls back to the largest normal score"
        )
    tau_mean = float(np.quantile(x, 1.0 - target_far)) if resolvable else float(sx[-1])
    ok = np.where(far_hi <= target_far)[0]
    if ok.size:
        tau_cons = float(thr[ok[0]])
    else:
        tau_cons = float(sx[-1])
        warnings.append("no grid threshold has an upper FAR bound below the target; using the largest normal score")
    tau_cons = max(tau_cons, tau_mean)
    return CalibrationResult(
        thresholds=thr, far_mean=far_mean, far_lo=far_lo, far_hi=far_hi, far_empirical=far_emp,
        block_length=L, n_samples=n, n_segments=len(segments), replicates=replicates,
        confidence=confidence, target_far=target_far,
        threshold_mean=tau_mean, threshold_conservative=tau_cons,
        threshold=tau_mean if threshold_mode == "mean" else tau_cons,
        threshold_mode=threshold_mode, resolvable=resolvable, warnings=warnings,
    )


def far_with_ci(
    segments: list[np.ndarray],
    tau: float,
    replicates: int = 1000,
    confidence: float = 0.95,
    seed: int = 0,
    block_length: float | None = None,
) -> dict | None:
    """False-alarm rate at a fixed threshold on (held-out) normal scores, with a dependence-aware CI."""
    if not segments or sum(len(s) for s in segments) < 30:
        return None
    rng = np.random.default_rng(seed)
    x, seg_end = _pool(segments)
    n = len(x)
    L = float(block_length) if block_length else estimate_block_length(segments)
    p = 1.0 / max(L, 1.0)
    far = np.array([np.mean(x[_resample_indices(rng, n, seg_end, n, p)] > tau) for _ in range(replicates)])
    alpha = (1.0 - confidence) / 2.0
    return {
        "far": float(np.mean(x > tau)),
        "ci_lo": float(np.percentile(far, 100 * alpha)),
        "ci_hi": float(np.percentile(far, 100 * (1 - alpha))),
        "n": int(n),
        "block_length": round(L, 2),
        "confidence": confidence,
    }
