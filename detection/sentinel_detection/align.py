"""Resample irregular telemetry onto a common time grid.

Telemetry is sample-and-hold: a value stays valid until the next sample arrives.
We therefore forward-fill, but only for a bounded time (``hold_factor`` times the
channel's own typical cadence). Beyond that bound the cell is NaN, so a
communication gap stays visible as a gap instead of being silently papered over.
A sample whose value is itself non-finite (invalid data) is kept as NaN and is
never replaced by an older valid value.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


class AlignmentError(ValueError):
    """Raised when channels cannot be aligned onto a usable grid."""


@dataclass
class ChannelSeries:
    id: str
    subsystem: str
    times: np.ndarray  # epoch seconds, float
    values: np.ndarray  # float, NaN = invalid / missing
    value_type: str = "numeric"

    def __post_init__(self) -> None:
        self.times = np.asarray(self.times, dtype=float)
        self.values = np.asarray(self.values, dtype=float)
        if self.times.shape != self.values.shape:
            raise AlignmentError(f"channel {self.id}: times/values length mismatch")
        order = np.argsort(self.times, kind="stable")
        self.times = self.times[order]
        self.values = self.values[order]


@dataclass
class AlignedData:
    times: np.ndarray  # (T,) epoch seconds
    values: np.ndarray  # (T, C), NaN where unobserved
    channel_ids: list[str]
    step: float
    hold_seconds: list[float] = field(default_factory=list)


def parse_times(strings) -> np.ndarray:
    """ISO-8601 strings (naive or trailing 'Z', UTC) -> float epoch seconds."""
    if len(strings) == 0:
        return np.empty(0, dtype=float)
    cleaned = [s[:-1] if s.endswith("Z") else s for s in strings]
    return np.array(cleaned, dtype="datetime64[us]").astype("int64") / 1e6


def to_iso(seconds: float) -> str:
    return str(np.datetime64(int(round(float(seconds) * 1e6)), "us")) + "Z"


def _median_dt(times: np.ndarray) -> float | None:
    if len(times) < 2:
        return None
    d = np.diff(times)
    d = d[d > 0]
    return float(np.median(d)) if len(d) else None


def align_channels(
    series: list[ChannelSeries],
    step: float | None = None,
    hold_factor: float = 5.0,
    max_rows: int = 1_000_000,
) -> AlignedData:
    if not series:
        raise AlignmentError("no channels to align")
    nonempty = [s for s in series if len(s.times)]
    if not nonempty:
        raise AlignmentError("all channels are empty")
    cadences = [c for c in (_median_dt(s.times) for s in nonempty) if c]
    if step is None:
        if not cadences:
            raise AlignmentError("cannot infer a grid step; pass step_seconds")
        step = float(np.median(cadences))
    if step <= 0:
        raise AlignmentError("step must be positive")
    t0 = min(s.times[0] for s in nonempty)
    t1 = max(s.times[-1] for s in nonempty)
    n = int(np.floor((t1 - t0) / step)) + 1
    if n > max_rows:
        raise AlignmentError(
            f"grid would have {n} rows (limit {max_rows}); increase step_seconds"
        )
    grid = t0 + step * np.arange(n)
    values = np.full((n, len(series)), np.nan)
    holds: list[float] = []
    for j, s in enumerate(series):
        own = _median_dt(s.times) or step
        hold = hold_factor * max(own, step)
        holds.append(hold)
        if not len(s.times):
            continue
        idx = np.searchsorted(s.times, grid, side="right") - 1
        valid = idx >= 0
        safe = np.clip(idx, 0, None)
        age = grid - s.times[safe]
        ok = valid & (age <= hold)
        values[ok, j] = s.values[safe[ok]]
    return AlignedData(grid, values, [s.id for s in series], step, holds)
