import numpy as np
import pytest

from sentinel_detection.calibration import (
    _pool,
    _resample_indices,
    calibrate_threshold,
    estimate_block_length,
    far_with_ci,
    segments_from_mask,
)


def ar_scores(n, phi, seed):
    rng = np.random.default_rng(seed)
    e = rng.normal(size=n)
    x = np.zeros(n)
    for i in range(1, n):
        x[i] = phi * x[i - 1] + e[i]
    return np.exp(0.5 * x)  # positive, heavy-tailed like a squared-error score


def test_curve_is_monotone_and_banded():
    cal = calibrate_threshold([ar_scores(3000, 0.5, 1)], replicates=200, seed=0)
    assert (np.diff(cal.far_mean) <= 1e-12).all()
    assert (cal.far_lo <= cal.far_mean + 1e-9).all() and (cal.far_mean <= cal.far_hi + 1e-9).all()
    assert cal.threshold_conservative >= cal.threshold_mean


def test_block_length_reflects_dependence():
    assert estimate_block_length([ar_scores(4000, 0.0, 2)]) < 3
    assert estimate_block_length([ar_scores(4000, 0.9, 2)]) > 8


def test_ci_is_wider_than_naive_iid_for_dependent_scores():
    x = ar_scores(4000, 0.9, 4)
    tau = float(np.quantile(x, 0.95))
    r = far_with_ci([x], tau, replicates=400, seed=1)
    naive = 2 * 1.96 * np.sqrt(0.05 * 0.95 / len(x))
    assert (r["ci_hi"] - r["ci_lo"]) > 1.5 * naive  # temporal structure preserved


def test_calibrated_threshold_holds_out_of_sample():
    x = ar_scores(40000, 0.7, 5)
    cal = calibrate_threshold([x[:10000]], target_far=0.02, replicates=200, seed=0)
    held = np.mean(x[10000:] > cal.threshold)
    assert 0.008 < held < 0.04


def test_unresolvable_target_is_reported_not_faked():
    x = ar_scores(100, 0.0, 6)
    cal = calibrate_threshold([x], target_far=0.001, replicates=100)
    assert not cal.resolvable and cal.warnings
    assert cal.threshold == pytest.approx(x.max())


def test_too_few_samples_rejected():
    with pytest.raises(ValueError):
        calibrate_threshold([np.ones(10)])
    with pytest.raises(ValueError):
        calibrate_threshold([ar_scores(100, 0, 1)], threshold_mode="bogus")


def test_blocks_never_cross_segment_boundaries():
    segs = [np.arange(0, 50.0), np.arange(1000, 1030.0), np.arange(5000, 5100.0)]
    x, seg_end = _pool(segs)
    idx = _resample_indices(np.random.default_rng(0), len(x), seg_end, 5000, p=0.05)
    consecutive = np.where(np.diff(idx) == 1)[0]
    assert (seg_end[idx[consecutive]] == seg_end[idx[consecutive + 1]]).all()


def test_segments_from_mask_splits_on_mask_and_nan():
    s = np.arange(10.0)
    s[4] = np.nan
    mask = np.ones(10, bool)
    mask[7] = False
    parts = segments_from_mask(s, mask)
    assert [p.tolist() for p in parts] == [[0, 1, 2, 3], [5, 6], [8, 9]]
