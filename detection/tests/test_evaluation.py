import numpy as np

from sentinel_detection.evaluation import alarm_episodes, evaluate_events, event_detection, wilson


def test_episode_merging():
    alarm = np.zeros(30, bool)
    alarm[[3, 4, 7, 20]] = True
    assert alarm_episodes(alarm, merge_gap=0) == [(3, 4), (7, 7), (20, 20)]
    assert alarm_episodes(alarm, merge_gap=2) == [(3, 7), (20, 20)]


def test_event_detection_tolerance_and_observability():
    alarm = np.zeros(50, bool)
    alarm[12] = True
    scorable = np.ones(50, bool)
    scorable[30:40] = False
    obs, det = event_detection(alarm, scorable, [(14, 16), (32, 36), (45, 46)], tol=2)
    assert obs.tolist() == [True, False, True]
    assert det.tolist() == [True, False, False]


def test_metrics_and_cis_on_known_case():
    n = 200
    alarm = np.zeros(n, bool)
    alarm[[10, 11, 50, 51, 120]] = True  # hits events 1 and 2, plus one false episode at 120
    events = [(9, 12), (49, 52), (90, 95)]  # third event missed
    r = evaluate_events(alarm, np.ones(n, bool), events, tolerance_rows=1, merge_gap_rows=1, replicates=500, seed=1)
    assert r["n_events_detected"] == 2 and r["n_alarm_episodes"] == 3 and r["n_false_episodes"] == 1
    assert r["event_recall"] == 2 / 3 and r["episode_precision"] == 2 / 3
    lo, hi = r["event_recall_ci_bootstrap"]
    assert lo <= r["event_recall"] <= hi
    wl, wh = r["event_recall_ci_wilson"]
    assert wl < 2 / 3 < wh
    assert r["event_f1_ci_bootstrap"][0] <= r["event_f1"] <= r["event_f1_ci_bootstrap"][1]


def test_unobservable_events_are_reported_separately():
    n = 100
    scorable = np.ones(n, bool)
    scorable[40:60] = False
    alarm = np.zeros(n, bool)
    alarm[10] = True
    r = evaluate_events(alarm, scorable, [(9, 11), (45, 50)], tolerance_rows=2, replicates=100)
    assert r["n_events_unobservable"] == 1
    assert r["event_recall"] == 1.0  # over observable events only
    assert r["event_recall_incl_unobservable"] == 0.5


def test_no_events_gives_none_not_zero():
    r = evaluate_events(np.zeros(20, bool), np.ones(20, bool), [], replicates=50)
    assert r["event_recall"] is None and r["event_f1"] is None and r["episode_precision"] is None


def test_wilson_never_degenerate_at_one():
    lo, hi = wilson(6, 6)
    assert lo < 1.0 and hi == 1.0 or hi > 0.999
    assert wilson(0, 0) is None
