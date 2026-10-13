# Sentinel Platform

Sentinel is a React/Vite operator interface backed by an Express API for the ESA Mission-1 and Mission-2 telemetry datasets.

## Run with indexed ESA data

The generated indexes are `backend/data/mission-summary.json` and `backend/data/mission2-summary.json`. The dataset selector switches the entire interface between their MongoDB-backed catalogs, statistics, and anomaly intervals.

```powershell
npm install
cd backend
npm install
npm run seed
npm start
```

In a second terminal:

```powershell
cd ..
npm run dev
```

Open `http://localhost:5173/`.

## Rebuild the index

The source archives must be present at `MERN/ESA-Mission1.zip` and `MERN/ESA-Mission2.zip`. The ingestion script requires Python with pandas:

```powershell
cd backend
python -m pip install -r requirements.txt
npm run ingest:mission1
npm run ingest:mission2
npm run seed
```

Each archive is several GB and contains nested pandas pickles, so ingestion can take several minutes and needs temporary disk space.

## MongoDB and Docker

MongoDB is required by the API. The server refuses to start until the ESA index has been seeded into MongoDB. `npm run seed` replaces the `channels` and `missions` collections from the generated index.

For a local MongoDB installation:

```powershell
$env:MONGO_URI="mongodb://localhost:27017/sentinel"
cd backend
npm run seed
npm start
```

Or start MongoDB, seed, and the API together with Docker:

```powershell
docker compose up --build
```

The API is available at `http://localhost:4000`; OpenAPI docs are at `http://localhost:4000/api/docs`.

## Detection service (Python)

Multivariate PCA scoring, gap handling, Monte Carlo threshold calibration, event-level evaluation with confidence intervals, and robustness trials live in `detection/`.

```powershell
cd detection
python -m pip install -r requirements-dev.txt
python -m pytest -q
python -m uvicorn sentinel_detection.service:app --port 8000   # docs at http://localhost:8000/docs
```

`POST /detect` takes channels (grouped by `subsystem`) and a config, and returns per-subsystem scores, the calibrated threshold with its threshold-vs-false-alarm curve, held-out false-alarm validation, alarms, and event-level metrics with CIs. Method and limitations: `docs/detection-design.md`. The detector needs a dense, time-bounded window per subsystem; the 120-point indexed summaries in `backend/data/` are too coarse to detect anything (see the design doc).
