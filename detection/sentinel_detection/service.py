"""FastAPI service: the integration boundary between the MERN app and the Python detector."""

from __future__ import annotations

import numpy as np
from fastapi import FastAPI, HTTPException

from . import __version__
from .align import ChannelSeries, parse_times
from .pipeline import DetectionConfig, DetectionError, run_subsystem
from .schemas import DetectRequest, DetectResponse, SubsystemError

app = FastAPI(
    title="Sentinel Detection Service",
    version=__version__,
    description="Per-subsystem PCA anomaly scoring with Monte Carlo threshold calibration.",
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "sentinel-detection", "version": __version__}


def _to_series(ch) -> ChannelSeries:
    try:
        times = parse_times([p.time for p in ch.points])
    except ValueError as exc:
        raise HTTPException(422, f"channel {ch.id}: invalid timestamp ({exc})") from exc
    values = np.array([np.nan if p.value is None else p.value for p in ch.points], dtype=float)
    return ChannelSeries(ch.id, ch.subsystem, times, values, (ch.valueType or "numeric").lower())


def _labels(ch) -> list[tuple[float, float]]:
    try:
        out = []
        for a in ch.anomalies:
            s, e = parse_times([a.startTime])[0], parse_times([a.endTime])[0]
            if e < s:
                raise HTTPException(422, f"channel {ch.id}: anomaly {a.id or ''} ends before it starts")
            out.append((float(s), float(e)))
        return out
    except ValueError as exc:
        raise HTTPException(422, f"channel {ch.id}: invalid anomaly timestamp ({exc})") from exc


@app.post("/detect", response_model=DetectResponse)
def detect(request: DetectRequest) -> DetectResponse:
    groups: dict[str, list] = {}
    for ch in request.channels:
        groups.setdefault(ch.subsystem, []).append(ch)
    wanted = request.subsystems or sorted(groups)
    missing = [s for s in wanted if s not in groups]
    if missing:
        raise HTTPException(404, f"unknown subsystem(s): {', '.join(missing)}")
    cfg = DetectionConfig(**request.config.model_dump())
    results, errors = [], []
    for sub in wanted:
        chans = groups[sub]
        labels = [iv for ch in chans for iv in _labels(ch)]
        try:
            results.append(run_subsystem(sub, [_to_series(c) for c in chans], labels, cfg))
        except DetectionError as exc:
            errors.append(SubsystemError(subsystem=sub, detail=str(exc)))
    if not results:
        raise HTTPException(422, {"message": "no subsystem could be processed", "errors": [e.model_dump() for e in errors]})
    return DetectResponse(dataset=request.dataset, results=results, errors=errors)
