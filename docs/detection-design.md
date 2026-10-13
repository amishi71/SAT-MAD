# Detection Service Design

## Why a separate Python service

The MERN layer stores, serves and visualises; the numerical work (eigendecomposition, vectorised bootstrap, later scikit-learn/SciPy methods) lives in `detection/` behind a small HTTP contract (`POST /detect`, `GET /health`, OpenAPI at `/openapi.json`, generated from `schemas.py`). The boundary keeps statistical code testable in isolation (pytest, synthetic data) and replaceable without touching the API. `backend/src/pca.js` is superseded and is removed once Express calls this service.

## Pipeline (per subsystem)

1. **Group** channels by subsystem; PCA is fitted per subsystem, never across subsystems.
2. **Align** irregular channels onto a common grid. Sample-and-hold forward fill is bounded (`hold_factor` x the channel's own cadence); beyond that the cell is NaN. A sample that is itself invalid stays NaN.
3. **Exclude** categorical channels, constant channels, and channels missing more than `max_channel_missing` on the grid. Each exclusion is returned with a reason.
4. **Gap analysis.** Rows with fewer than `min_completeness` of channels observed are *unscorable*: not scored, not alarmed, not counted as misses. System-wide gaps and per-channel gap counts are reported.
5. **Labels to rows.** Label intervals from all channels of the subsystem are merged into events and mapped to grid rows. Rows within `guard_rows` of an event are removed from the normal pool.
6. **Chronological split** of known-normal rows: train (50%), calibration (25%), test (25%). Training uses fully observed rows only.
7. **Fit PCA** on train (standardised, components chosen for `var_target` explained variance, at most c-1).
8. **Score** all rows. Score = residual variance of the observed channels after projection, divided by the residual degrees of freedom (`n_observed - k`). Rows with missing channels are projected by ridge least squares on the observed channels only, and the dof normalisation keeps their scores comparable to fully observed rows.
9. **Calibrate** the threshold by Monte Carlo (below), **validate** it on the untouched test rows, **evaluate** against labels, optionally run **robustness** trials.

Labels never enter the score. They only pick normal rows and drive evaluation. Without labels the whole scorable series is assumed nominal and a warning says so.

## Monte Carlo calibration

Normal scores are serially dependent, so i.i.d. resampling would give falsely tight false-alarm estimates. We use the stationary bootstrap: geometric block lengths with mean equal to the integrated autocorrelation time of the log-scores, blocks never crossing a normal-segment boundary (so never splicing across an anomaly or a gap). Each replicate yields FAR(tau) on a threshold grid; the output is the threshold-vs-FAR curve with a percentile confidence band (stored later as `calibration_results`).

- `mean` threshold: smallest tau with expected FAR <= target. This equals the empirical quantile; the Monte Carlo contributes the uncertainty, not a different point estimate.
- `conservative` threshold: smallest tau whose *upper* confidence bound on FAR <= target.
- If fewer than about 5 effectively independent exceedances are expected at the target FAR, the target is flagged unresolvable instead of reporting a precise-looking threshold.
- The achieved FAR is re-measured on the held-out test rows with a dependence-aware CI.

## Evaluation

Event-level: an event is detected if an alarm falls within `tolerance_rows` of it; alarms are merged into episodes. Reported: event recall, episode precision, F1, each with percentile-bootstrap CI (resampling events / episodes) and a Wilson interval, because the percentile bootstrap collapses to [1, 1] or [0, 0] with few events. Events lying entirely in unscorable data are reported as unobservable, not as misses.

## Robustness

With model and threshold frozen, the raw matrix is corrupted (iid dropout, contiguous outages, additive noise, spikes) over repeated seeded trials. Reported per level: scorable fraction, event recall, false-alarm rate on normal rows, and score correlation with the clean run.

## Known limitations

- **Resolution.** Detection needs a dense, time-bounded window. The 120-point summaries in `backend/data/` span years, are not time-aligned across channels, and cannot resolve events lasting minutes; running the detector on them skips almost every subsystem. The ingestion step must extract a dense window (2-3 subsystems, fixed range).
- Linear model: faults that do not break linear cross-channel structure are missed.
- A chronological split assumes the normal regime is stable; drift between train and test shows up as a held-out FAR above target.
- The bootstrap resamples scores, so it does not capture the variance of the PCA fit itself.
- Point-level FAR is not an alarm-episode rate; a 1% point FAR on a 1-minute grid still produces many false episodes per month. Lower `target_far` or raise `merge_gap_rows` for operations.
- Few labelled events means wide CIs; that is the honest result.
- Payloads travel as JSON; large windows need a reference-based hand-off instead.
