import numpy as np
import pytest
from dataclasses import replace

from sentinel_detection.pipeline import run_subsystem
from sentinel_detection.robustness import corrupt

from conftest import series_from


@pytest.fixture(scope="module")
def rob(sub):
    from sentinel_detection.pipeline import DetectionConfig

    cfg = DetectionConfig(bootstrap_replicates=200, run_robustness=True, robustness_trials=4, seed=3)
    return run_subsystem("s", series_from(sub), sub["labels"], cfg)["robustness"]


def by(rows, kind):
    return [r for r in rows if r["scenario"] == kind]


def test_baseline_first_and_all_metrics_present(rob):
    assert rob[0]["scenario"] == "clean" and rob[0]["score_correlation"]["mean"] == pytest.approx(1.0)
    assert {"dropout", "outage", "noise", "spike"} <= {r["scenario"] for r in rob}


def test_dropout_reduces_scorable_fraction_monotonically(rob):
    f = [r["scorable_fraction"]["mean"] for r in by(rob, "dropout")]
    assert f == sorted(f, reverse=True) and f[-1] < f[0]


def test_noise_degrades_false_alarm_rate_at_fixed_threshold(rob):
    clean = rob[0]["false_alarm_rate"]["mean"]
    assert by(rob, "noise")[-1]["false_alarm_rate"]["mean"] > 5 * max(clean, 1e-3)


def test_recall_and_rates_are_probabilities(rob):
    for r in rob:
        for k in ("event_recall", "false_alarm_rate", "scorable_fraction"):
            m = r[k]["mean"]
            assert m is None or 0.0 <= m <= 1.0


def test_corruption_is_seeded_and_validated():
    X = np.random.default_rng(0).normal(size=(200, 4))
    a = corrupt(X, "dropout", 0.2, np.random.default_rng(1), X.std(0))
    b = corrupt(X, "dropout", 0.2, np.random.default_rng(1), X.std(0))
    assert np.array_equal(np.isnan(a), np.isnan(b)) and 0.1 < np.isnan(a).mean() < 0.3
    assert not np.isnan(X).any()  # input untouched
    with pytest.raises(ValueError):
        corrupt(X, "bogus", 0.1, np.random.default_rng(0), X.std(0))
