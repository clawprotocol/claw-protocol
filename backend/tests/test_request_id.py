from fastapi.testclient import TestClient

from backend.main import app


def test_request_id_on_success_and_error():
    client = TestClient(app)
    ok = client.get("/v1/healthz")
    assert ok.status_code == 200
    assert ok.headers.get("X-Request-Id")

    bad = client.post("/v1/workflow/timeline/create", json={})
    assert bad.status_code == 422
    assert bad.headers.get("X-Request-Id")
    payload = bad.json()
    assert "error_code" in payload
