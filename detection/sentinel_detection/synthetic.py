"""Synthetic multi-channel telemetry with known cross-channel anomalies (tests and demos).

Channels are noisy mixtures of a few latent factors. The injected anomaly
*decorrelates* some channels by replacing them with draws from their own marginal
distribution: every value stays inside its normal range, so a per-channel
threshold cannot see it, but the cross-channel structure is broken.
"""

from __future__ import annotations

import numpy as np

from .align import to_iso


def make_subsystem(
    n_rows: int = 6000,
    n_channels: int = 8,
    n_factors: int = 2,
    noise: float = 0.25,
    ar: float = 0.5,
    n_events: int = 6,
    event_len: int = 40,
    n_broken: int = 3,
    step: float = 60.0,
    t0: float = 1_600_000_000.0,
    seed: int = 0,
    channel_prefix: str = "ch",
    subsystem: str = "subsystem_1",
) -> dict:
    rng = np.random.default_rng(seed)
    t = np.arange(n_rows)
    factors = np.stack(
        [np.sin(2 * np.pi * t / (97 + 41 * f) + rng.uniform(0, 6.28)) + 0.3 * rng.normal(size=n_rows).cumsum() / np.sqrt(n_rows)
         for f in range(n_factors)],
        axis=1,
    )
    loadings = rng.normal(size=(n_factors, n_channels))
    clean = factors @ loadings
    eps = np.zeros((n_rows, n_channels))
    shock = rng.normal(size=(n_rows, n_channels)) * noise
    for i in range(1, n_rows):
        eps[i] = ar * eps[i - 1] + shock[i]
    X = clean + eps + rng.uniform(-3, 3, size=n_channels)

    # events spread evenly, away from the first 40% so a chronological train split stays clean-ish
    starts = np.linspace(0.15 * n_rows, 0.95 * n_rows - event_len, n_events).astype(int)
    events = []
    for s in starts:
        e = s + event_len
        broken = rng.choice(n_channels, size=n_broken, replace=False)
        for j in broken:
            X[s:e, j] = rng.choice(X[:, j], size=e - s)  # marginal-preserving, correlation-breaking
        events.append((int(s), int(e - 1)))
    times = t0 + step * t
    return {
        "times": times,
        "X": X,
        "events": events,
        "labels": [(float(times[s]), float(times[e])) for s, e in events],
        "channel_ids": [f"{channel_prefix}_{j + 1}" for j in range(n_channels)],
        "subsystem": subsystem,
        "step": step,
    }


def to_payload_channels(sub: dict, drop_ranges: list[tuple[int, int]] | None = None, with_labels: bool = True) -> list[dict]:
    """Service-format channel dicts (ISO times); optional row ranges removed to mimic comms gaps."""
    keep = np.ones(len(sub["times"]), dtype=bool)
    for a, b in drop_ranges or []:
        keep[a:b] = False
    anomalies = [{"id": f"e{i}", "startTime": to_iso(s), "endTime": to_iso(e)} for i, (s, e) in enumerate(sub["labels"])]
    chans = []
    for j, cid in enumerate(sub["channel_ids"]):
        chans.append(
            {
                "id": cid,
                "subsystem": sub["subsystem"],
                "valueType": "numeric",
                "points": [
                    {"time": to_iso(t), "value": float(v)}
                    for t, v in zip(sub["times"][keep], sub["X"][keep, j])
                ],
                "anomalies": anomalies if (with_labels and j == 0) else [],
            }
        )
    return chans
