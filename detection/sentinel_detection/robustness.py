"""Robustness trials: how does a *fixed* operating point behave on degraded data?

Each trial corrupts the raw telemetry matrix (never the model or threshold), applies
the same completeness rule as production, rescoring and measuring:

* scorable_fraction   - share of evaluation rows that can still be scored
* event_recall        - recall on events that remain observable
* false_alarm_rate    - alarm rate on known-normal evaluation rows
* score_correlation   - Pearson r of log-scores against the clean run

Scenarios: ``dropout`` (iid missing cells), ``outage`` (contiguous per-channel
blocks), ``noise`` (additive Gaussian, in channel-std units) and ``spike``
(isolated +/- 8 sigma glitches).
"""

from __future__ import annotations

import numpy as np

from .evaluation import event_detection
from .pca_model import PCAModel

DEFAULT_SCENARIOS = {
    "dropout": [0.05, 0.1, 0.2, 0.4],
    "outage": [0.05, 0.1, 0.2],
    "noise": [0.25, 0.5, 1.0],
    "spike": [0.001, 0.01],
}


def corrupt(X: np.ndarray, kind: str, level: float, rng: np.random.Generator, std: np.ndarray) -> np.ndarray:
    Y = X.copy()
    T, C = Y.shape
    if kind == "dropout":
        Y[rng.random(Y.shape) < level] = np.nan
    elif kind == "outage":
        block = max(3, T // 100)
        for j in range(C):
            for _ in range(int(level * T / block)):
                s = int(rng.integers(0, max(1, T - block)))
                Y[s : s + block, j] = np.nan
    elif kind == "noise":
        Y = Y + rng.normal(0.0, 1.0, Y.shape) * (level * std)
    elif kind == "spike":
        hit = rng.random(Y.shape) < level
        Y[hit] += rng.choice([-8.0, 8.0], size=int(hit.sum())) * np.broadcast_to(std, Y.shape)[hit]
    else:
        raise ValueError(f"unknown corruption kind {kind!r}")
    return Y


def _summ(vals: list[float]) -> dict:
    a = np.asarray([v for v in vals if v is not None and np.isfinite(v)], dtype=float)
    if not len(a):
        return {"mean": None, "lo": None, "hi": None}
    return {
        "mean": float(a.mean()),
        "lo": float(np.percentile(a, 2.5)),
        "hi": float(np.percentile(a, 97.5)),
    }


def run_robustness(
    model: PCAModel,
    tau: float,
    X: np.ndarray,
    eval_mask: np.ndarray,
    normal_eval_mask: np.ndarray,
    events: list[tuple[int, int]],
    min_completeness: float = 0.8,
    tolerance_rows: int = 3,
    scenarios: dict[str, list[float]] | None = None,
    n_trials: int = 10,
    seed: int = 0,
) -> list[dict]:
    rng = np.random.default_rng(seed)
    scenarios = scenarios or DEFAULT_SCENARIOS
    finite = np.isfinite(X)
    std = np.array([X[finite[:, j], j].std() if finite[:, j].any() else 1.0 for j in range(X.shape[1])])
    clean = model.score(X)
    clean[finite.mean(axis=1) < min_completeness] = np.nan

    def measure(scores: np.ndarray) -> dict:
        ok = np.isfinite(scores) & eval_mask
        alarm = ok & (scores > tau)
        obs, det = event_detection(alarm, ok, events, tolerance_rows) if events else (np.array([]), np.array([]))
        both = np.isfinite(scores) & np.isfinite(clean) & eval_mask
        corr = (
            float(np.corrcoef(np.log(scores[both] + 1e-12), np.log(clean[both] + 1e-12))[0, 1])
            if both.sum() > 2
            else None
        )
        normal_ok = ok & normal_eval_mask
        return {
            "scorable_fraction": float(ok.sum() / max(eval_mask.sum(), 1)),
            "event_recall": float(det[obs].mean()) if len(obs) and obs.any() else None,
            "false_alarm_rate": float(alarm[normal_ok].mean()) if normal_ok.any() else None,
            "score_correlation": corr,
        }

    rows = [{"scenario": "clean", "level": 0.0, "trials": 1, **{k: {"mean": v, "lo": v, "hi": v} for k, v in measure(clean).items()}}]
    for kind, levels in scenarios.items():
        for level in levels:
            trials = []
            for _ in range(n_trials):
                Y = corrupt(X, kind, level, rng, std)
                s = model.score(Y)
                s[np.isfinite(Y).mean(axis=1) < min_completeness] = np.nan
                trials.append(measure(s))
            rows.append(
                {
                    "scenario": kind,
                    "level": level,
                    "trials": n_trials,
                    **{k: _summ([t[k] for t in trials]) for k in trials[0]},
                }
            )
    return rows
