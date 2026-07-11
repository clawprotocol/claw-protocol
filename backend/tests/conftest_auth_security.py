"""Shared helpers for anonymous session security tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def auth_secrets(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_STRICT_IN_DEV", "1")


def mint_anonymous_session(client: TestClient) -> tuple[str, str, dict]:
    res = client.post("/v1/workspace/anonymous-session")
    assert res.status_code == 200, res.text
    body = res.json()
    org_id = body["org_id"]
    token = body["token"]
    headers = {
        "X-Claw-Org-Id": org_id,
        "X-Claw-Anon-Session": token,
    }
    return org_id, token, headers


def make_test_auth_headers(user_id: str) -> dict:
    return {"X-Claw-Test-Auth-User-Id": user_id}


def make_authenticated_user_headers(user_id: str, *, org_id: str | None = None) -> dict:
    oid = org_id or f"user-{user_id}"
    return {
        "X-Claw-Org-Id": oid,
        **make_test_auth_headers(user_id),
    }
