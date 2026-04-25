import pytest
from fastapi.testclient import TestClient

from backend.main import app

pytestmark = pytest.mark.unit


def test_healthz_and_version_headers():
    client = TestClient(app)
    r = client.get("/v1/healthz")
    assert r.status_code == 200
    assert r.json().get("ok") is True
    assert "summary" in r.json()
    assert "X-CLAW-Protocol-Version" in r.headers
    assert "X-CLAW-API-Version" in r.headers
    assert "X-Request-Id" in r.headers

    h = client.get("/health")
    assert h.status_code == 200
    assert h.json().get("summary")

    rz = client.get("/v1/readyz")
    assert rz.status_code == 200
    body = rz.json()
    assert body.get("ok") is True
    summ = body.get("summary") or {}
    assert summ.get("headline")
    assert summ.get("failed_domains") == []
    assert "scope" in summ
    adb = (body.get("checks") or {}).get("anchoring_database") or {}
    assert adb.get("status") in ("ok", "skipped")

    v = client.get("/v1/version")
    assert v.status_code == 200
    assert v.json().get("protocol_version")
    assert v.json().get("api_version")
