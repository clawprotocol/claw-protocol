"""QA payment bypass authorization — server-authoritative session + allowlist."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from backend.affiliates.genesis_referral_service import create_genesis_affiliate
from backend.economics.store import EconomicsStore
from backend.security.qa_payment_bypass_session import COOKIE_NAME, mint_qa_payment_bypass_session, session_secret_bytes


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite"))
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "test-admin-secret")
    from backend.main import app

    return TestClient(app)


def test_authorization_denies_anonymous_production_user(client: TestClient) -> None:
    res = client.get("/v1/workspace/qa-payment-bypass/authorization")
    assert res.status_code == 200
    assert res.json() == {"authorized": False, "reason": "not_authorized"}


def test_authorization_allowlisted_user(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_QA_PAYMENT_BYPASS_USER_IDS", "user-qa-1,user-qa-2")
    res = client.get(
        "/v1/workspace/qa-payment-bypass/authorization",
        headers={"X-Claw-User-Id": "user-qa-1"},
    )
    assert res.status_code == 200
    assert res.json() == {"authorized": True, "reason": "qa_allowlist"}


def test_authorization_qa_role_user(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_QA_PAYMENT_BYPASS_ROLE_USER_IDS", "role-user-1")
    res = client.get(
        "/v1/workspace/qa-payment-bypass/authorization",
        headers={"X-Claw-User-Id": "role-user-1"},
    )
    assert res.status_code == 200
    assert res.json() == {"authorized": True, "reason": "qa_role"}


def test_authorization_genesis_affiliate_alone_denied(client: TestClient, tmp_path) -> None:
    eco = EconomicsStore(path=str(tmp_path / "economics.sqlite"))
    eco.init_schema()
    create_genesis_affiliate(
        eco,
        user_id="aff-user-1",
        display_name="Genesis Tester",
        referral_code="GENQA1",
        affiliate_status="active",
    )
    res = client.get(
        "/v1/workspace/qa-payment-bypass/authorization",
        headers={"X-Claw-User-Id": "aff-user-1"},
    )
    assert res.status_code == 200
    assert res.json() == {"authorized": False, "reason": "not_authorized"}


def test_bootstrap_session_and_authorize(client: TestClient) -> None:
    res = client.post(
        "/v1/workspace/qa-payment-bypass/session",
        json={"admin_secret": "test-admin-secret"},
    )
    assert res.status_code == 200
    assert res.json() == {"ok": True}
    assert COOKIE_NAME in res.cookies

    auth = client.get("/v1/workspace/qa-payment-bypass/authorization")
    assert auth.status_code == 200
    assert auth.json() == {"authorized": True, "reason": "admin_session"}


def test_bootstrap_sets_cross_origin_cookie_attributes(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    res = client.post(
        "/v1/workspace/qa-payment-bypass/session",
        json={"admin_secret": "test-admin-secret"},
        headers={"Origin": "https://lawdog.me"},
    )
    assert res.status_code == 200
    set_cookie = res.headers.get("set-cookie") or ""
    assert COOKIE_NAME in set_cookie
    assert "httponly" in set_cookie.lower()
    assert "secure" in set_cookie.lower()
    assert "samesite=none" in set_cookie.lower()


def test_bootstrap_rejects_invalid_admin_secret(client: TestClient) -> None:
    res = client.post(
        "/v1/workspace/qa-payment-bypass/session",
        json={"admin_secret": "wrong-secret"},
    )
    assert res.status_code == 401


def test_expired_admin_session_denied(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    secret = session_secret_bytes()
    expired = mint_qa_payment_bypass_session(secret=secret, ttl_seconds=-120)
    client.cookies.set(COOKIE_NAME, expired)
    res = client.get("/v1/workspace/qa-payment-bypass/authorization")
    assert res.status_code == 200
    assert res.json() == {"authorized": False, "reason": "admin_session_expired"}


def test_invalid_admin_session_denied(client: TestClient) -> None:
    client.cookies.set(COOKIE_NAME, "not.a.valid.session")
    res = client.get("/v1/workspace/qa-payment-bypass/authorization")
    assert res.status_code == 200
    assert res.json()["authorized"] is False
    assert res.json()["reason"] in {"admin_session_invalid", "admin_session_expired"}


def test_legacy_genesis_qa_status_endpoint_removed(client: TestClient) -> None:
    res = client.get("/v1/workspace/genesis-qa-payment-bypass/status")
    assert res.status_code == 404
