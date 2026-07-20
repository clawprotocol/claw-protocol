"""Workspace auth API — demo subscription activation guards."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.conftest_auth_security import make_authenticated_user_headers, mint_anonymous_session


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def test_demo_activate_subscription_allowed_in_test(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    user_id = "demo-user-test"
    res = client.post(
        "/v1/workspace/demo-activate-subscription",
        headers=make_authenticated_user_headers(user_id),
        json={"user_id": user_id, "previous_org_id": f"user-{user_id}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body.get("ok") is True
    assert body.get("org_id") == f"user-{user_id}"


def test_demo_activate_subscription_not_found_on_production(
    monkeypatch: pytest.MonkeyPatch, client: TestClient,
) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    res = client.post(
        "/v1/workspace/demo-activate-subscription",
        headers=make_authenticated_user_headers("prod-user"),
        json={"user_id": "prod-user", "previous_org_id": "user-prod-user"},
    )
    assert res.status_code == 404


def test_demo_activate_subscription_rejects_staging(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    res = client.post(
        "/v1/workspace/demo-activate-subscription",
        headers=make_authenticated_user_headers("stage-user"),
        json={"user_id": "stage-user", "previous_org_id": "user-stage-user"},
    )
    assert res.status_code == 404


def test_demo_activate_subscription_requires_auth(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    res = client.post(
        "/v1/workspace/demo-activate-subscription",
        json={"user_id": "no-auth", "previous_org_id": "user-no-auth"},
    )
    assert res.status_code == 401


def test_demo_activate_subscription_rejects_user_mismatch(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    res = client.post(
        "/v1/workspace/demo-activate-subscription",
        headers=make_authenticated_user_headers("real-user"),
        json={"user_id": "other-user", "previous_org_id": "user-other-user"},
    )
    assert res.status_code == 403


def test_demo_activate_anon_org_requires_matching_session(
    monkeypatch: pytest.MonkeyPatch, client: TestClient,
) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")
    anon_org, _token, anon_headers = mint_anonymous_session(client)
    res = client.post(
        "/v1/workspace/demo-activate-subscription",
        headers={**make_authenticated_user_headers("anon-demo-user"), **anon_headers},
        json={"user_id": "anon-demo-user", "previous_org_id": anon_org},
    )
    assert res.status_code == 200
