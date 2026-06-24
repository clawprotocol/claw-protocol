"""GET /v1/subscriptions/{org_id} — missing row is null body, not HTTP 404."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    return TestClient(app, raise_server_exceptions=False)


def test_subscription_probe_missing_org_returns_null_not_404(client: TestClient) -> None:
    res = client.get("/v1/subscriptions/local-org", headers={"Accept": "application/json"})
    assert res.status_code == 200
    body = res.json()
    assert body.get("subscription") is None

