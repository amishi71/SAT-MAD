# Sentinel Platform Technical Report

## Purpose

Sentinel is an operator-facing monitoring platform for ESA Mission-1 satellite telemetry. It treats correlated channels within a subsystem as a multivariate observation instead of evaluating every channel in isolation.

## Detection approach

Telemetry windows are normalized per channel, reduced with PCA, and scored with a multivariate detector such as PCA-OCSVM. A Monte Carlo calibration pass samples nominal windows to estimate the score distribution and select a threshold for a target false-alarm rate. Missing segments are preserved as gaps and excluded from a window until the minimum completeness rule is met.

## Current implementation

- `src/App.jsx`: interactive operator workspace with mission overview, subsystem browser, channel explorer, anomaly analysis, and run comparison views.
- `backend/src/server.js`: Mongo-ready Express API with health, channel, and detection-run endpoints.
- `openapi.yaml`: REST contract for the service.
- `docker-compose.yml`: API plus MongoDB local stack.
- `.github/workflows/ci.yml`: frontend install and production build verification.

The frontend now consumes MongoDB-backed ESA Mission-1 documents through the API. The seed step derives readable labels such as `Channel 1`, `Subsystem 1`, and `Physical Unit 1` from the source identifiers, while preserving the raw identifiers for traceability. MongoDB is required at runtime; the API refuses to start when the database is unavailable or has not been seeded.

## Recommended next increment

Add an ingestion worker that writes raw telemetry windows and quality flags to MongoDB, then add a `/api/detection/runs/:id` endpoint that returns PCA loadings, calibrated threshold metadata, anomaly intervals, and missing-data coverage for the UI overlays.
