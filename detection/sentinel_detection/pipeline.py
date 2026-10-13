"""End-to-end detection for one subsystem.

Flow: align -> drop unusable channels -> gap analysis -> labels to rows ->
chronological split of known-normal rows (train / calibration / test) ->
fit PCA on train -> score everything -> Monte Carlo calibration on calibration ->
held-out FAR check on test -> event-level evaluation (if labels) -> optional robustness.

Labels are used ONLY to (a) keep anomalous rows out of fit and calibration and
(b) evaluate. Scoring itself never looks at labels.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

from .align import ChannelSeries, align_channels, to_iso
from .calibration import calibrate_threshold, far_with_ci, segments_from_mask
from .evaluation import evaluate_events
from .gaps import analyze_gaps
from .pca_model import MIN_STD, PCAModel
from .robustness import run_robustness


class DetectionError(ValueError):
    """A subsystem cannot be processed (reason is user-facing)."""


@dataclass
class DetectionConfig:
    step_seconds: float | None = None
    hold_factor: float = 5.0
    max_rows: int = 1_000_000
    min_completeness: float = 0.8
    min_gap_rows: int = 3
    max_channel_missing: float = 0.5
    var_target: float = 0.95
    max_components: int | None = None
    train_fraction: float = 0.5
    calibration_fraction: float = 0.25
    min_train_rows: int = 50
    min_calibration_rows: int = 30
    guard_rows: int = 5
    target_far: float = 0.01
    threshold_mode: str = "mean"
    bootstrap_replicates: int = 1000
    confidence: float = 0.95
    merge_gap_rows: int = 3
    tolerance_rows: int = 3
    seed: int = 0
    run_robustness: bool = False
    robustness_trials: int = 10
    include_scores: bool = True
    max_scores_returned: int = 5000
    max_alarms_returned: int = 500


def merge_intervals(intervals: list[tuple[float, float]]) -> list[tuple[float, float]]:
    out: list[list[float]] = []
    for s, e in sorted(intervals):
        if out and s <= out[-1][1]:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return [(a, b) for a, b in out]


def labels_to_rows(labels, times: np.ndarray, step: float):
    """Merge label intervals and map them to inclusive row ranges on the grid.

    Events shorter than the grid step map to the nearest row. Events entirely
    outside the grid span are counted and ignored.
    """
    T = len(times)
    mask = np.zeros(T, dtype=bool)
    events, outside = [], 0
    for s, e in merge_intervals([(float(a), float(b)) for a, b in labels]):
        if e < times[0] or s > times[-1] + step:
            outside += 1
            continue
        i0 = int(np.searchsorted(times, s, side="left"))
        i1 = int(np.searchsorted(times, e, side="right"))
        if i1 <= i0:
            i0 = int(np.clip(np.rint(((s + e) / 2 - times[0]) / step), 0, T - 1))
            i1 = i0 + 1
        i0, i1 = max(0, i0), min(T, i1)
        events.append((i0, i1 - 1))
        mask[i0:i1] = True
    return events, mask, outside


def dilate(mask: np.ndarray, k: int) -> np.ndarray:
    if k <= 0:
        return mask.copy()
    return np.convolve(mask.astype(np.int32), np.ones(2 * k + 1, dtype=np.int32), mode="same") > 0


def _decimate_max(values: np.ndarray, max_points: int):
    n = len(values)
    stride = max(1, int(np.ceil(n / max_points)))
    if stride == 1:
        return values, 1
    pad = (-n) % stride
    padded = np.concatenate([values, np.full(pad, np.nan)]).reshape(-1, stride)
    with np.errstate(all="ignore"):
        out = np.nanmax(np.where(np.isfinite(padded), padded, -np.inf), axis=1)
    out[~np.isfinite(out)] = np.nan
    return out, stride


def _clean(obj):
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items() if not str(k).startswith("_")}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return _clean(obj.tolist())
    if isinstance(obj, (np.floating, float)):
        f = float(obj)
        return f if np.isfinite(f) else None
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.bool_):
        return bool(obj)
    return obj


def run_subsystem(
    subsystem: str,
    channels: list[ChannelSeries],
    labels: list[tuple[float, float]],
    cfg: DetectionConfig | None = None,
) -> dict:
    cfg = cfg or DetectionConfig()
    warnings: list[str] = []
    excluded: list[dict] = []
    usable: list[ChannelSeries] = []
    for ch in channels:
        if ch.value_type == "categorical":
            excluded.append({"channel": ch.id, "reason": "categorical channel (not valid for PCA)"})
        elif len(ch.times) < 2:
            excluded.append({"channel": ch.id, "reason": "fewer than 2 samples"})
        else:
            usable.append(ch)
    if len(usable) < 2:
        raise DetectionError(f"subsystem {subsystem}: need at least 2 usable numeric channels, got {len(usable)}")

    try:
        aligned = align_channels(usable, cfg.step_seconds, cfg.hold_factor, cfg.max_rows)
    except ValueError as exc:
        raise DetectionError(f"subsystem {subsystem}: {exc}") from exc

    X, ids = aligned.values, list(aligned.channel_ids)
    finite = np.isfinite(X)
    keep = []
    for j, cid in enumerate(ids):
        miss = 1.0 - finite[:, j].mean()
        if miss > cfg.max_channel_missing:
            excluded.append({"channel": cid, "reason": f"{miss:.0%} missing on the common grid"})
        elif finite[:, j].sum() < 2 or X[finite[:, j], j].std() <= MIN_STD:
            excluded.append({"channel": cid, "reason": "constant channel"})
        else:
            keep.append(j)
    X, ids = X[:, keep], [ids[j] for j in keep]
    if len(ids) < 2:
        raise DetectionError(f"subsystem {subsystem}: fewer than 2 channels left after quality filtering")

    times, step = aligned.times, aligned.step
    T = len(times)
    gaps = analyze_gaps(X, ids, cfg.min_completeness, cfg.min_gap_rows)
    scorable, complete = gaps.scorable, gaps.row_completeness >= 1.0

    events, label_mask, outside = labels_to_rows(labels, times, step)
    if outside:
        warnings.append(f"{outside} labelled event(s) fall outside the data span and were ignored")
    has_labels = bool(events)
    if not has_labels:
        warnings.append(
            "no labelled events: all scorable rows are assumed nominal for fit and calibration "
            "(anomalies in the data will contaminate both); evaluation is skipped"
        )
    guard = dilate(label_mask, cfg.guard_rows)

    pool = np.where(scorable & ~guard)[0]
    n_pool = len(pool)
    cut_train = int(n_pool * cfg.train_fraction)
    cut_cal = int(n_pool * (cfg.train_fraction + cfg.calibration_fraction))
    train_idx = pool[:cut_train]
    train_idx = train_idx[complete[train_idx]]
    cal_idx, test_idx = pool[cut_train:cut_cal], pool[cut_cal:]
    if len(train_idx) < max(cfg.min_train_rows, 3 * len(ids)):
        raise DetectionError(
            f"subsystem {subsystem}: only {len(train_idx)} fully observed known-normal rows for training "
            f"({len(ids)} channels); need at least {max(cfg.min_train_rows, 3 * len(ids))}"
        )

    model = PCAModel(cfg.var_target, cfg.max_components).fit(X[train_idx])
    scores = model.score(X)
    scores[~scorable] = np.nan

    cal_mask = np.zeros(T, dtype=bool)
    cal_mask[cal_idx] = True
    cal_segments = segments_from_mask(scores, cal_mask)
    try:
        cal = calibrate_threshold(
            cal_segments, cfg.target_far, cfg.bootstrap_replicates, cfg.confidence,
            threshold_mode=cfg.threshold_mode, seed=cfg.seed,
        )
    except ValueError as exc:
        raise DetectionError(f"subsystem {subsystem}: calibration failed: {exc}") from exc
    warnings.extend(cal.warnings)
    tau = cal.threshold

    test_mask = np.zeros(T, dtype=bool)
    test_mask[test_idx] = True
    held_out = far_with_ci(
        segments_from_mask(scores, test_mask), tau, cfg.bootstrap_replicates, cfg.confidence, cfg.seed + 1
    )
    if held_out is None:
        warnings.append("too few held-out normal rows to validate the calibrated false-alarm rate")

    train_mask = np.zeros(T, dtype=bool)
    train_mask[train_idx] = True
    finite_scores = np.isfinite(scores)
    eval_mask = finite_scores & ~train_mask
    alarm = finite_scores & (scores > tau)

    evaluation, episodes, ep_true = None, [], None
    if has_labels:
        ev = evaluate_events(
            alarm & eval_mask, eval_mask, events, cfg.tolerance_rows, cfg.merge_gap_rows,
            cfg.bootstrap_replicates, cfg.confidence, cfg.seed + 2,
        )
        episodes, ep_true = ev.pop("_episodes"), ev.pop("_episode_true")
        evaluation = ev
    else:
        from .evaluation import alarm_episodes

        episodes = alarm_episodes(alarm & eval_mask, cfg.merge_gap_rows)

    alarms_out = []
    for i, (s, e) in enumerate(episodes[: cfg.max_alarms_returned]):
        alarms_out.append(
            {
                "start": to_iso(times[s]), "end": to_iso(times[e]), "n_rows": int(e - s + 1),
                "peak_score": float(np.nanmax(scores[s : e + 1])),
                "matches_label": bool(ep_true[i]) if ep_true is not None else None,
            }
        )

    robustness = None
    if cfg.run_robustness:
        robustness = run_robustness(
            model, tau, X, eval_mask, eval_mask & ~guard, events,
            cfg.min_completeness, cfg.tolerance_rows, n_trials=cfg.robustness_trials, seed=cfg.seed + 3,
        )

    scores_out = None
    if cfg.include_scores:
        dec, stride = _decimate_max(scores, cfg.max_scores_returned)
        scores_out = {"start": to_iso(times[0]), "step_seconds": step * stride, "stride": stride, "values": dec}

    result = {
        "subsystem": subsystem,
        "channels_used": ids,
        "channels_excluded": excluded,
        "grid": {"start": to_iso(times[0]), "end": to_iso(times[-1]), "step_seconds": step, "n_rows": T},
        "gaps": gaps.summary(times),
        "splits": {
            "n_known_normal_rows": int(n_pool),
            "train_rows": int(len(train_idx)),
            "calibration_rows": int(len(cal_idx)),
            "test_rows": int(len(test_idx)),
            "labels_used": has_labels,
            "split": "chronological over known-normal rows",
        },
        "model": model.summary(),
        "calibration": cal.to_dict(),
        "threshold": tau,
        "held_out_far": held_out,
        "n_events_labelled": len(events),
        "evaluation": evaluation,
        "alarms": alarms_out,
        "scores": scores_out,
        "robustness": robustness,
        "warnings": warnings,
        "config": asdict(cfg),
    }
    return _clean(result)
