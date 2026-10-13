import pytest
from fastapi.testclient import TestClient

from sentinel_detection.service import app
from sentinel_detection.synthetic import make_subsystem, to_payload_channels

client = TestClient(app)
CFG = {"bootstrap_replicates": 100, "seed": 1, "max_scores_returned": 500}


@pytest.fixture(scope="module")
def payload():
    a = make_subsystem(n_rows=2000, n_events=4, event_len=25, seed=21, subsystem="subsystem_1", channel_prefix="a")
    b = make_subsystem(n_rows=2000, n_events=4, event_len=25, seed=22, subsystem="subsystem_2", channel_prefix="b")
    return {"dataset": "esa-test", "channels": to_payload_channels(a) + to_payload_channels(b), "config": CFG}


def test_health():
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_detect_runs_each_subsystem_independently(payload):
    r = client.post("/detect", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["dataset"] == "esa-test" and body["errors"] == []
    by_sub = {x["subsystem"]: x for x in body["results"]}
    assert set(by_sub) == {"subsystem_1", "subsystem_2"}
    assert all(c.startswith("a_") for c in by_sub["subsystem_1"]["channels_used"])
    assert all(c.startswith("b_") for c in by_sub["subsystem_2"]["channels_used"])
    one = by_sub["subsystem_1"]
    assert {"threshold", "calibration", "held_out_far", "evaluation", "alarms", "scores", "model", "gaps"} <= set(one)
    assert len(one["scores"]["values"]) <= 500 and one["calibration"]["curve"]["far_hi"]


def test_subsystem_filter_and_unknown_subsystem(payload):
    ok = client.post("/detect", json={**payload, "subsystems": ["subsystem_2"]})
    assert [x["subsystem"] for x in ok.json()["results"]] == ["subsystem_2"]
    bad = client.post("/detect", json={**payload, "subsystems": ["nope"]})
    assert bad.status_code == 404


def test_validation_errors_use_proper_status_codes(payload):
    ch = payload["channels"]
    assert client.post("/detect", json={"channels": ch[:1]}).status_code == 422  # need >= 2 channels
    assert client.post("/detect", json={**payload, "config": {"target_far": 2}}).status_code == 422
    broken = [dict(ch[0], points=[{"time": "not-a-date", "value": 1.0}]), ch[1]]
    assert client.post("/detect", json={"channels": broken}).status_code == 422
    backwards = dict(ch[0], anomalies=[{"startTime": "2020-01-02T00:00:00Z", "endTime": "2020-01-01T00:00:00Z"}])
    assert client.post("/detect", json={"channels": [backwards, ch[1]]}).status_code == 422


def test_one_bad_subsystem_is_reported_not_fatal(payload):
    lone = dict(payload["channels"][0], subsystem="lonely")
    r = client.post("/detect", json={**payload, "channels": payload["channels"] + [lone]})
    assert r.status_code == 200
    assert [e["subsystem"] for e in r.json()["errors"]] == ["lonely"]
    assert len(r.json()["results"]) == 2


def test_all_subsystems_failing_is_422():
    ch = to_payload_channels(make_subsystem(n_rows=300, n_events=1, event_len=10, seed=3))[:2]
    r = client.post("/detect", json={"channels": ch, "config": {**CFG, "min_train_rows": 10_000 // 10}})
    assert r.status_code == 422


def test_openapi_documents_the_contract():
    spec = client.get("/openapi.json").json()
    assert "/detect" in spec["paths"] and "/health" in spec["paths"]
    assert "DetectRequest" in spec["components"]["schemas"]
