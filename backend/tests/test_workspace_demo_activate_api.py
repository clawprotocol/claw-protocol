"""Workspace auth API — demo subscription activation guards."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def test_demo_activate_subscription_denied_anonymous_on_staging(
    monkeypatch: pytest.MonkeyPatch, client: TestClient, tmp_path
) -> None:
    """Staging is production-like: demo activate must not allow anonymous/demo."""
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.economics.store as eco_store_mod

    eco_store_mod._store = None  # noqa: SLF001
    res = client.post(
        "/v1/workspace/demo-activate-subscription",
        json={"user_id": "user-staging-test", "previous_org_id": "org-staging-test"},
    )
    assert res.status_code in (401, 403, 404)
    eco_store_mod._store = None  # noqa: SLF001


def test_demo_activate_subscription_not_found_on_production(
    monkeypatch: pytest.MonkeyPatch, client: TestClient,
) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    res = client.post(
        "/v1/workspace/demo-activate-subscription",
        json={"user_id": "user-prod-test", "previous_org_id": "org-prod-test"},
    )
    assert res.status_code == 404


def test_demo_activate_subscription_not_found_when_environment_unset(
    monkeypatch: pytest.MonkeyPatch, client: TestClient,
) -> None:
    monkeypatch.delenv("CLAW_ENVIRONMENT", raising=False)
    res = client.post(
        "/v1/workspace/demo-activate-subscription",
        json={"user_id": "user-unset", "previous_org_id": "org-unset"},
    )
    assert res.status_code == 404


def test_demo_activate_subscription_not_found_when_environment_blank(
    monkeypatch: pytest.MonkeyPatch, client: TestClient,
) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "   ")
    res = client.post(
        "/v1/workspace/demo-activate-subscription",
        json={"user_id": "user-blank", "previous_org_id": "org-blank"},
    )
    assert res.status_code == 404
