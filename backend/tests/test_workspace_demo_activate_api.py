"""Workspace auth API — demo subscription activation guards."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def test_demo_activate_subscription_allowed_on_staging(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    res = client.post(
        "/v1/workspace/demo-activate-subscription",
        json={"user_id": "user-staging-test", "previous_org_id": "org-staging-test"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body.get("ok") is True
    assert body.get("org_id") == "org-staging-test"


def test_demo_activate_subscription_not_found_on_production(
    monkeypatch: pytest.MonkeyPatch, client: TestClient,
) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    res = client.post(
        "/v1/workspace/demo-activate-subscription",
        json={"user_id": "user-prod-test", "previous_org_id": "org-prod-test"},
    )
    assert res.status_code == 404
