from fastapi.testclient import TestClient

from backend.main import app


def test_metrics_lite_counts_increment():
    client = TestClient(app)
    base = client.get("/v1/metrics-lite").json()
    client.get("/v1/healthz")
    after = client.get("/v1/metrics-lite").json()
    assert after["requests_total"] >= base["requests_total"] + 1
