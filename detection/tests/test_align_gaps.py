import numpy as np
import pytest

from sentinel_detection.align import AlignmentError, ChannelSeries, align_channels, parse_times, to_iso
from sentinel_detection.gaps import analyze_gaps, find_runs


def test_time_roundtrip_and_z_suffix():
    t = parse_times(["2000-01-01T00:00:02.805000", "2009-12-10T13:16:09.894Z"])
    assert t[0] == pytest.approx(946684802.805)
    assert to_iso(t[1]).startswith("2009-12-10T13:16:09.894")


def test_forward_fill_with_bounded_hold():
    a = ChannelSeries("a", "s", np.arange(0, 100, 10.0), np.arange(10.0))
    # b has a 500 s communication gap between t=40 and t=540
    tb = np.concatenate([np.arange(0, 41, 10.0), np.arange(540, 700, 10.0)])
    b = ChannelSeries("b", "s", tb, np.ones(len(tb)))
    out = align_channels([a, b], step=10.0, hold_factor=3.0)
    col_b = out.values[:, 1]
    assert np.isfinite(col_b[:8]).all()  # held 3 cadences past the last sample at t=40 (rows 0-7)
    assert np.isnan(col_b[8:54]).all()  # long communication gap stays NaN
    assert np.isfinite(col_b[54:]).all()  # data resumes at t=540


def test_gap_stays_nan_and_invalid_sample_is_not_hidden():
    t = np.arange(0, 200, 10.0)
    v = np.arange(20.0)
    v[5] = np.nan  # invalid sample
    keep = np.ones(20, bool)
    keep[10:16] = False  # comms gap
    ch = ChannelSeries("a", "s", t[keep], v[keep])
    out = align_channels([ch], step=10.0, hold_factor=2.0)
    col = out.values[:, 0]
    assert np.isnan(col[5])  # invalid sample not replaced by the older valid one
    assert np.isnan(col[13:16]).all()  # long gap beyond the hold limit
    assert np.isfinite(col[10:12]).all()  # short hold across the start of the gap


def test_before_first_sample_is_nan_and_grid_limit():
    a = ChannelSeries("a", "s", np.arange(0, 100, 10.0), np.ones(10))
    b = ChannelSeries("b", "s", np.arange(50, 100, 10.0), np.ones(5))
    out = align_channels([a, b], step=10.0)
    assert np.isnan(out.values[:5, 1]).all() and np.isfinite(out.values[5:, 1]).all()
    with pytest.raises(AlignmentError):
        align_channels([a], step=0.001, max_rows=100)


def test_gap_report_finds_system_gap_and_applies_completeness_rule():
    v = np.ones((100, 4))
    v[20:30] = np.nan  # all channels missing for 10 rows
    v[60:65, :2] = np.nan  # half the channels missing
    v[80:82, 0] = np.nan  # short single-channel blip
    rep = analyze_gaps(v, list("abcd"), min_completeness=0.8, min_gap_rows=3)
    assert rep.system_gaps == [(20, 29)]
    assert not rep.scorable[20:30].any() and not rep.scorable[60:65].any()  # 0% and 50% observed < 80%
    assert not rep.scorable[80:82].any()  # 75% observed < 80%
    assert analyze_gaps(v, list("abcd"), min_completeness=0.75).scorable[80:82].all()
    assert rep.channel_gap_counts[0] == 2 and rep.channel_gap_counts[3] == 1
    s = rep.summary()
    assert s["n_system_gaps"] == 1 and s["scorable_fraction"] == pytest.approx(0.83)


def test_find_runs():
    assert find_runs([0, 1, 1, 0, 1]) == [(1, 2), (4, 4)]
    assert find_runs([]) == []
