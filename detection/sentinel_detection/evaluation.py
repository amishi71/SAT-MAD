"""Event-level evaluation with bootstrap and Wilson confidence intervals.

Labels are rare (tens of events), so single point estimates of precision/recall are
noisy. We evaluate at the *event* level (an event is detected if an alarm falls
within ``tolerance_rows`` of it) and report percentile-bootstrap CIs obtained by
resampling events (recall) and alarm episodes (precision). Percentile bootstrap
degenerates at 0 or 1 with few events, so Wilson intervals are reported alongside.
Events that fall entirely in unscorable data (gaps) are reported separately rather
than counted as misses.
"""

from __future__ import annotations

import numpy as np

from .gaps import find_runs


def alarm_episodes(alarm: np.ndarray, merge_gap: int = 0) -> list[tuple[int, int]]:
    runs = find_runs(alarm)
    merged: list[list[int]] = []
    for s, e in runs:
        if merged and s - merged[-1][1] - 1 <= merge_gap:
            merged[-1][1] = e
        else:
            merged.append([s, e])
    return [(s, e) for s, e in merged]


def event_detection(alarm: np.ndarray, scorable: np.ndarray, events: list[tuple[int, int]], tol: int):
    """Per event: (observable, detected). Observable = any scorable row within tolerance."""
    n = len(alarm)
    pa = np.concatenate(([0], np.cumsum(alarm.astype(np.int64))))
    ps = np.concatenate(([0], np.cumsum(scorable.astype(np.int64))))
    observable = np.zeros(len(events), dtype=bool)
    detected = np.zeros(len(events), dtype=bool)
    for i, (s, e) in enumerate(events):
        lo, hi = max(0, s - tol), min(n, e + tol + 1)
        observable[i] = ps[hi] - ps[lo] > 0
        detected[i] = pa[hi] - pa[lo] > 0
    return observable, detected


def wilson(k: int, n: int, confidence: float = 0.95) -> tuple[float, float] | None:
    if n == 0:
        return None
    z = {0.9: 1.645, 0.95: 1.96, 0.99: 2.576}.get(round(confidence, 2), 1.96)
    p = k / n
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return float(max(0.0, centre - half)), float(min(1.0, centre + half))


def _boot_prop(flags: np.ndarray, rng, replicates: int):
    return flags[rng.integers(0, len(flags), (replicates, len(flags)))].mean(axis=1)


def _ci(samples: np.ndarray, confidence: float) -> list[float]:
    a = (1 - confidence) / 2
    return [float(np.percentile(samples, 100 * a)), float(np.percentile(samples, 100 * (1 - a)))]


def _f1(p, r):
    return np.where(p + r > 0, 2 * p * r / np.maximum(p + r, 1e-12), 0.0)


def evaluate_events(
    alarm: np.ndarray,
    scorable: np.ndarray,
    events: list[tuple[int, int]],
    tolerance_rows: int = 3,
    merge_gap_rows: int = 3,
    replicates: int = 1000,
    confidence: float = 0.95,
    seed: int = 0,
) -> dict:
    rng = np.random.default_rng(seed)
    alarm = alarm & scorable
    n = len(alarm)
    episodes = alarm_episodes(alarm, merge_gap_rows)
    observable, detected = event_detection(alarm, scorable, events, tolerance_rows)
    dilated = np.zeros(n, dtype=bool)
    for s, e in events:
        dilated[max(0, s - tolerance_rows) : min(n, e + tolerance_rows + 1)] = True
    ep_true = np.array([dilated[s : e + 1].any() for s, e in episodes], dtype=bool)

    det_obs = detected[observable]
    n_obs, n_det = int(observable.sum()), int(det_obs.sum())
    recall = n_det / n_obs if n_obs else None
    precision = float(ep_true.mean()) if len(episodes) else None

    out = {
        "n_events": len(events),
        "n_events_observable": n_obs,
        "n_events_unobservable": len(events) - n_obs,
        "n_events_detected": n_det,
        "n_alarm_episodes": len(episodes),
        "n_true_episodes": int(ep_true.sum()),
        "n_false_episodes": int((~ep_true).sum()),
        "event_recall": recall,
        "event_recall_incl_unobservable": (n_det / len(events)) if events else None,
        "episode_precision": precision,
        "event_f1": None,
        "confidence": confidence,
        "replicates": replicates,
        "tolerance_rows": tolerance_rows,
        "merge_gap_rows": merge_gap_rows,
    }
    r_b = _boot_prop(det_obs, rng, replicates) if n_obs else None
    p_b = _boot_prop(ep_true, rng, replicates) if len(episodes) else None
    out["event_recall_ci_bootstrap"] = _ci(r_b, confidence) if r_b is not None else None
    out["event_recall_ci_wilson"] = wilson(n_det, n_obs, confidence) if n_obs else None
    out["episode_precision_ci_bootstrap"] = _ci(p_b, confidence) if p_b is not None else None
    out["episode_precision_ci_wilson"] = wilson(int(ep_true.sum()), len(episodes), confidence) if len(episodes) else None
    if recall is not None and precision is not None:
        out["event_f1"] = float(_f1(np.array(precision), np.array(recall)))
        out["event_f1_ci_bootstrap"] = _ci(_f1(p_b, r_b), confidence)
    else:
        out["event_f1_ci_bootstrap"] = None
    out["_episodes"] = episodes
    out["_episode_true"] = ep_true
    return out
