import numpy as np
import pytest

from sentinel_detection.align import ChannelSeries
from sentinel_detection.pipeline import DetectionError, dilate, labels_to_rows, merge_intervals, run_subsystem

from conftest import series_from


def test_multivariate_detects_what_per_channel_thresholds_miss(sub, cfg):
    r = run_subsystem("s", series_from(sub), sub["labels"], cfg)
    ev = r["evaluation"]
    assert ev["event_recall"] >= 0.8
    X = sub["X"]
    naive = (np.abs((X - X.mean(0)) / X.std(0)) > 3).any(axis=1)
    naive_recall = np.mean([naive[max(0, a - 3) : b + 4].any() for a, b in sub["events"]])
    assert naive_recall <= 0.2 < ev["event_recall"]


def test_labels_keep_anomalies_out_of_fit_and_calibration(sub, cfg):
    r = run_subsystem("s", series_from(sub), sub["labels"], cfg)
    T = r["grid"]["n_rows"]
    events, mask, _ = labels_to_rows(sub["labels"], sub["times"], sub["step"])
    excluded = int(dilate(mask, cfg.guard_rows).sum())
    sp = r["splits"]
    assert sp["n_known_normal_rows"] == T - excluded
    assert sp["train_rows"] + sp["calibration_rows"] + sp["test_rows"] <= sp["n_known_normal_rows"]
    assert sp["labels_used"] and r["n_events_labelled"] == len(sub["events"])


def test_calibrated_far_is_validated_on_held_out_normal_rows(sub, cfg):
    r = run_subsystem("s", series_from(sub), sub["labels"], cfg)
    h = r["held_out_far"]
    assert h["ci_lo"] <= h["far"] <= h["ci_hi"]
    assert h["far"] < 0.03  # target 0.01
    assert r["calibration"]["resolvable"] and r["calibration"]["curve"]["thresholds"]


def test_communication_gap_is_not_scored_and_event_inside_is_unobservable(sub, cfg):
    a, b = sub["events"][0]
    keep = np.ones(len(sub["times"]), bool)
    keep[a - 20 : b + 20] = False
    r = run_subsystem("s", series_from(sub, keep), sub["labels"], cfg)
    g = r["gaps"]
    assert g["n_system_gaps"] >= 1 and g["scorable_fraction"] < 1.0
    assert r["evaluation"]["n_events_unobservable"] >= 1
    assert r["evaluation"]["event_recall"] >= 0.8  # recall over observable events only
    assert any(v is None for v in r["scores"]["values"])  # gap rows carry no score
    # no alarm may start inside the gap
    from sentinel_detection.align import parse_times

    lo, hi = sub["times"][a + 6], sub["times"][b + 14]  # gap rows beyond the hold window
    for al in r["alarms"]:
        s_t = parse_times([al["start"]])[0]
        assert not (lo <= s_t <= hi)


def test_unusable_channels_are_excluded_with_reasons(sub, cfg):
    chans = series_from(sub)
    chans.append(ChannelSeries("cat", "subsystem_1", sub["times"], np.zeros(len(sub["times"])), "categorical"))
    chans.append(ChannelSeries("flat", "subsystem_1", sub["times"], np.full(len(sub["times"]), 4.2)))
    chans.append(ChannelSeries("sparse", "subsystem_1", sub["times"][:300], np.ones(300)))
    r = run_subsystem("s", chans, sub["labels"], cfg)
    reasons = {e["channel"]: e["reason"] for e in r["channels_excluded"]}
    assert "categorical" in reasons["cat"] and "constant" in reasons["flat"] and "missing" in reasons["sparse"]
    assert set(r["channels_used"]) == set(sub["channel_ids"])


def test_too_few_usable_channels_is_a_clear_error(sub, cfg):
    only = series_from(sub)[:1]
    with pytest.raises(DetectionError, match="at least 2"):
        run_subsystem("s", only, [], cfg)


def test_without_labels_it_warns_and_skips_evaluation(sub, cfg):
    r = run_subsystem("s", series_from(sub), [], cfg)
    assert r["evaluation"] is None and r["threshold"] > 0
    assert any("no labelled events" in w for w in r["warnings"])


def test_threshold_modes_are_ordered(sub, cfg):
    from dataclasses import replace

    mean = run_subsystem("s", series_from(sub), sub["labels"], cfg)["threshold"]
    cons = run_subsystem("s", series_from(sub), sub["labels"], replace(cfg, threshold_mode="conservative"))["threshold"]
    assert cons >= mean


def test_label_helpers():
    assert merge_intervals([(5, 9), (1, 3), (2, 4)]) == [(1, 4), (5, 9)]
    times = np.arange(0, 100.0)
    ev, mask, outside = labels_to_rows([(10.2, 10.4), (500, 600), (20, 25)], times, 1.0)
    assert outside == 1 and ev[0] == (10, 10) and ev[1] == (20, 25)  # sub-step event maps to nearest row
    assert mask.sum() == 1 + 6
    assert dilate(mask, 2)[8] and not dilate(mask, 0)[8]
