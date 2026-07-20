"""GET /v1/subscriptions/{org_id} — scoped to verified workspace."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.commercial_test_helpers import activate_pro_on_org, isolated_economics_store
from backend.tests.conftest_auth_security import make_authenticated_user_headers


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")
    isolated_economics_store(tmp_path, monkeypatch)
    return TestClient(app, raise_server_exceptions=False)


def test_subscription_probe_missing_own_org_returns_null(client: TestClient) -> None:
    user_id = "probe-user"
    org_id = f"user-{user_id}"
    res = client.get(
        f"/v1/subscriptions/{org_id}",
        headers=make_authenticated_user_headers(user_id),
    )
    assert res.status_code == 200
    assert res.json().get("subscription") is None


def test_subscription_probe_cross_workspace_forbidden(client: TestClient, tmp_path, monkeypatch) -> None:
    eco = isolated_economics_store(tmp_path, monkeypatch)
    activate_pro_on_org(eco, "user-victim")
    res = client.get(
        "/v1/subscriptions/user-victim",
        headers=make_authenticated_user_headers("attacker"),
    )
    assert res.status_code == 403


def test_subscription_probe_returns_own_row(client: TestClient, tmp_path, monkeypatch) -> None:
    eco = isolated_economics_store(tmp_path, monkeypatch)
    user_id = "owner-probe"
    org_id = f"user-{user_id}"
    activate_pro_on_org(eco, org_id, user_id=user_id)
    res = client.get(
        f"/v1/subscriptions/{org_id}",
        headers=make_authenticated_user_headers(user_id),
    )
    assert res.status_code == 200
    sub = res.json().get("subscription")
    assert sub is not None
    assert sub.get("plan_code") == "pro"
