"""Request/response contract for the detection service (drives the OpenAPI document)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class PointIn(BaseModel):
    time: str = Field(description="ISO-8601 timestamp, UTC (a trailing Z is accepted)")
    value: float | None = Field(default=None, description="null marks an invalid/missing sample")


class AnomalyIn(BaseModel):
    id: str | None = None
    startTime: str
    endTime: str


class ChannelIn(BaseModel):
    id: str
    subsystem: str
    valueType: str | None = "numeric"
    points: list[PointIn]
    anomalies: list[AnomalyIn] = []


class ConfigIn(BaseModel):
    step_seconds: float | None = Field(default=None, gt=0, description="common grid step; default = median channel cadence")
    hold_factor: float = Field(default=5.0, gt=0)
    max_rows: int = Field(default=1_000_000, gt=0)
    min_completeness: float = Field(default=0.8, ge=0, le=1)
    min_gap_rows: int = Field(default=3, ge=1)
    max_channel_missing: float = Field(default=0.5, ge=0, le=1)
    var_target: float = Field(default=0.95, gt=0, le=1)
    max_components: int | None = Field(default=None, ge=1)
    train_fraction: float = Field(default=0.5, gt=0, lt=1)
    calibration_fraction: float = Field(default=0.25, gt=0, lt=1)
    min_train_rows: int = Field(default=50, ge=10)
    min_calibration_rows: int = Field(default=30, ge=10)
    guard_rows: int = Field(default=5, ge=0)
    target_far: float = Field(default=0.01, gt=0, lt=1)
    threshold_mode: Literal["mean", "conservative"] = "mean"
    bootstrap_replicates: int = Field(default=1000, ge=50, le=5000)
    confidence: float = Field(default=0.95, gt=0.5, lt=1)
    merge_gap_rows: int = Field(default=3, ge=0)
    tolerance_rows: int = Field(default=3, ge=0)
    seed: int = 0
    run_robustness: bool = False
    robustness_trials: int = Field(default=10, ge=1, le=100)
    include_scores: bool = True
    max_scores_returned: int = Field(default=5000, ge=100, le=100000)
    max_alarms_returned: int = Field(default=500, ge=1, le=10000)


class DetectRequest(BaseModel):
    dataset: str | None = None
    subsystems: list[str] | None = Field(default=None, description="restrict to these subsystem ids")
    channels: list[ChannelIn] = Field(min_length=2)
    config: ConfigIn = ConfigIn()


class SubsystemError(BaseModel):
    subsystem: str
    detail: str


class DetectResponse(BaseModel):
    dataset: str | None
    results: list[dict[str, Any]]
    errors: list[SubsystemError]
