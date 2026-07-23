"""GET /v1/subscriptions/{org_id} — auth required; missing row is null body, not HTTP 404."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.auth_fixtures import (
    configure_production_like_jwt,
    owner_headers_production_like,
)


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    configure_production_like_jwt(monkeypatch)
    return TestClient(app, raise_server_exceptions=False)


def test_subscription_probe_missing_org_returns_null_not_404(client: TestClient) -> None:
    headers = owner_headers_production_like(user_id="probe-owner")
    res = client.get(
        f"/v1/subscriptions/{headers['X-Claw-Org-Id']}",
        headers={**headers, "Accept": "application/json"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body.get("subscription") is None


def test_subscription_probe_anonymous_rejected(client: TestClient) -> None:
    res = client.get("/v1/subscriptions/user-victim", headers={"Accept": "application/json"})
    assert res.status_code == 401
