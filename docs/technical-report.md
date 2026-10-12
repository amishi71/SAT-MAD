# Sentinel Platform Technical Report

## Purpose

Sentinel is an operator-facing monitoring platform for ESA Mission-1 and Mission-2 satellite telemetry. It treats correlated channels within a subsystem as a multivariate observation instead of evaluating every channel in isolation.

## Detection approach

Telemetry windows are normalized per channel, reduced with PCA, and scored with a multivariate detector such as PCA-OCSVM. A Monte Carlo calibration pass samples nominal windows to estimate the score distribution and select a threshold for a target false-alarm rate. Missing segments are preserved as gaps and excluded from a window until the minimum completeness rule is met.

## Current implementation

- `src/App.jsx`: interactive operator workspace with mission overview, subsystem browser, channel explorer, anomaly analysis, and run comparison views.
- `backend/src/server.js`: MongoDB-backed Express API with dataset, channel, and detection endpoints.
- `backend/src/pca.js`: PCA reconstruction-error scoring over aligned indexed telemetry features.
- `openapi.yaml`: REST contract for the service.
- `docker-compose.yml`: API plus MongoDB local stack.
- `.github/workflows/ci.yml`: frontend install and production build verification.

The frontend now consumes MongoDB-backed ESA Mission-1 or Mission-2 documents through the dataset selector. The PCA endpoint normalizes each indexed channel, extracts up to 15 principal components, calculates reconstruction error for each aligned sample, and derives a 95th-percentile score threshold. The seed step derives readable labels such as `Channel 1`, `Subsystem 1`, and `Physical Unit 1` from the source identifiers, while preserving the raw identifiers for traceability. MongoDB is required at runtime; the API refuses to start when the database is unavailable or has not been seeded.

## Recommended next increment

Add Monte Carlo threshold calibration and a `/api/detection/runs/:id` endpoint that persists PCA loadings, calibrated threshold metadata, anomaly intervals, and missing-data coverage for repeatable run comparison.
