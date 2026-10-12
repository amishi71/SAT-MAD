# Sentinel Platform Agent Guide

## Project Overview

Sentinel is a React/Vite frontend with an Express/MongoDB backend for ESA Mission-1 and Mission-2 telemetry. The frontend supports dataset selection, subsystem health, telemetry browsing, PCA anomaly scoring, and labelled anomaly comparison.

## Repository Layout

- `src/pages/`: React Router pages for overview, subsystems, telemetry, anomalies, and detection runs.
- `src/components/`: Shared layout and dashboard components.
- `src/context/`: Shared mission and dataset loading state.
- `src/hooks/`: React hooks for shared mission state.
- `backend/src/server.js`: Express API and MongoDB-backed routes.
- `backend/src/models.js`: Mongoose models for missions and channels.
- `backend/src/pca.js`: PCA reconstruction-error scoring and subsystem health aggregation.
- `backend/scripts/`: ESA ingestion and MongoDB seeding scripts.
- `backend/data/`: Generated compact telemetry summaries. Do not edit these files manually.

## Development Commands

Frontend:

```powershell
npm install
npm run dev
npm run build
npm run lint
```

Backend:

```powershell
cd backend
npm install
npm start
```

The backend requires MongoDB and seeded data. Rebuild and seed the summaries with:

```powershell
cd backend
npm run ingest:mission1
npm run ingest:mission2
npm run seed
```

The source archives must be available as `../../ESA-Mission1.zip` and `../../ESA-Mission2.zip` from the `backend` directory. Ingestion requires Python with pandas.

## Docker

```powershell
docker compose up --build
```

The API runs on port `4000`; the Vite frontend runs on port `5173` unless another port is selected.

## Data and API Rules

- MongoDB is the runtime source of truth. Do not reintroduce JSON fallback data into API routes.
- Preserve the `dataset` filter on mission, telemetry, PCA, and detection-run endpoints.
- Keep raw ESA identifiers alongside readable display names.
- Labelled anomaly intervals are comparison data; PCA reconstruction scores drive anomaly health.
- Treat categorical telemetry values as categorical labels and preserve their original values.
- Do not manually modify generated files under `backend/data/`.

## Frontend Rules

- Use React Router for page navigation.
- Keep page-specific UI in `src/pages/` and reusable UI in `src/components/`.
- Load shared mission data through `useMission` rather than duplicating API requests.
- Preserve the existing Sentinel visual language and responsive layout.
- Run `npm run build` and `npm run lint` after frontend changes.

## Backend Rules

- Keep route handlers dataset-aware and MongoDB-backed.
- Keep PCA calculations independent from source labels.
- Run JavaScript syntax checks and an API smoke test after backend changes.
- Update `openapi.yaml` when adding or changing public API routes.
