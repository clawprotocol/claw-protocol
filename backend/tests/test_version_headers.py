from fastapi.testclient import TestClient

from backend.main import app


def test_healthz_and_version_headers():
    client = TestClient(app)
    r = client.get("/v1/healthz")
    assert r.status_code == 200
    assert "X-CLAW-Protocol-Version" in r.headers
    assert "X-CLAW-API-Version" in r.headers
    assert "X-Request-Id" in r.headers

    v = client.get("/v1/version")
    assert v.status_code == 200
    assert v.json().get("protocol_version")
    assert v.json().get("api_version")
