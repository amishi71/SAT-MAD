"""Gap and invalid-segment analysis.

Communication gaps and invalid samples are first-class: rows whose observed-channel
fraction falls below ``min_completeness`` are *not scored* (neither normal nor
anomalous). Everything downstream (fit, calibration, evaluation) respects that.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


def find_runs(mask) -> list[tuple[int, int]]:
    """Inclusive (start, end) index pairs of consecutive True values."""
    m = np.asarray(mask, dtype=bool)
    if m.size == 0:
        return []
    d = np.diff(np.concatenate(([0], m.astype(np.int8), [0])))
    starts = np.where(d == 1)[0]
    ends = np.where(d == -1)[0] - 1
    return list(zip(starts.tolist(), ends.tolist()))


@dataclass
class GapReport:
    channel_ids: list[str]
    channel_missing_fraction: np.ndarray
    row_completeness: np.ndarray
    scorable: np.ndarray
    system_gaps: list[tuple[int, int]]  # all channels missing, >= min_gap_rows
    channel_gap_counts: np.ndarray
    unscorable_segments: list[tuple[int, int]]
    min_completeness: float
    min_gap_rows: int

    def summary(self, times: np.ndarray | None = None, max_gaps: int = 100) -> dict:
        from .align import to_iso

        gaps = []
        for s, e in self.system_gaps[:max_gaps]:
            g = {"start_row": int(s), "end_row": int(e), "n_rows": int(e - s + 1)}
            if times is not None:
                g["start"], g["end"] = to_iso(times[s]), to_iso(times[e])
            gaps.append(g)
        return {
            "n_rows": int(len(self.row_completeness)),
            "scorable_fraction": float(self.scorable.mean()) if len(self.scorable) else 0.0,
            "min_completeness": self.min_completeness,
            "min_gap_rows": self.min_gap_rows,
            "n_system_gaps": len(self.system_gaps),
            "system_gap_rows": int(sum(e - s + 1 for s, e in self.system_gaps)),
            "n_unscorable_segments": len(self.unscorable_segments),
            "system_gaps": gaps,
            "channel_missing_fraction": {
                c: round(float(f), 4)
                for c, f in zip(self.channel_ids, self.channel_missing_fraction)
            },
            "channel_gap_counts": {
                c: int(n) for c, n in zip(self.channel_ids, self.channel_gap_counts)
            },
        }


def analyze_gaps(
    values: np.ndarray,
    channel_ids: list[str],
    min_completeness: float = 0.8,
    min_gap_rows: int = 3,
) -> GapReport:
    finite = np.isfinite(values)
    completeness = finite.mean(axis=1) if values.shape[1] else np.zeros(len(values))
    scorable = completeness >= min_completeness
    system_gaps = [
        r for r in find_runs(completeness == 0) if r[1] - r[0] + 1 >= min_gap_rows
    ]
    counts = np.array(
        [
            sum(1 for s, e in find_runs(~finite[:, j]) if e - s + 1 >= min_gap_rows)
            for j in range(values.shape[1])
        ]
    )
    return GapReport(
        channel_ids=list(channel_ids),
        channel_missing_fraction=1.0 - finite.mean(axis=0),
        row_completeness=completeness,
        scorable=scorable,
        system_gaps=system_gaps,
        channel_gap_counts=counts,
        unscorable_segments=find_runs(~scorable),
        min_completeness=min_completeness,
        min_gap_rows=min_gap_rows,
    )
