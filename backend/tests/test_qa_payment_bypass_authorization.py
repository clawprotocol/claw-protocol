"""QA payment bypass authorization — server-authoritative session + allowlist."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.affiliates.genesis_referral_service import create_genesis_affiliate
from backend.economics.store import EconomicsStore
from backend.security.qa_payment_bypass_session import COOKIE_NAME, mint_qa_payment_bypass_session, session_secret_bytes


def _ops_headers(*, secret: str = "test-admin-secret") -> dict[str, str]:
    return {
        "x-claw-admin-secret": secret,
        "X-Claw-Test-Auth-User-Id": "ops_admin",
        "X-Claw-Test-Operator-Role": "admin",
        "x-claw-admin-reason": "qa payment bypass bootstrap",
    }


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite"))
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "test-admin-secret")
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_RATE_LIMIT_RPS", "1000")
    monkeypatch.setenv("CLAW_RATE_LIMIT_BURST", "1000")
    from backend.admin_console import store as admin_store
    from backend import main as main_mod

    admin_store._store = None  # noqa: SLF001
    main_mod._rate_state.clear()  # noqa: SLF001
    from backend.main import app

    return TestClient(app)


def test_authorization_denies_anonymous_production_user(client: TestClient) -> None:
    res = client.get("/v1/workspace/qa-payment-bypass/authorization")
    assert res.status_code == 200
    assert res.json() == {"authorized": False, "reason": "not_authorized"}


def test_authorization_allowlisted_user_requires_principal(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CLAW_QA_PAYMENT_BYPASS_USER_IDS", "user-qa-1,user-qa-2")
    # Spoofable header alone is insufficient.
    spoof = client.get(
        "/v1/workspace/qa-payment-bypass/authorization",
        headers={"X-Claw-User-Id": "user-qa-1"},
    )
    assert spoof.status_code == 200
    assert spoof.json()["authorized"] is False

    res = client.get(
        "/v1/workspace/qa-payment-bypass/authorization",
        headers={
            "X-Claw-User-Id": "user-qa-1",
            "X-Claw-Test-Auth-User-Id": "user-qa-1",
        },
    )
    assert res.status_code == 200
    assert res.json() == {"authorized": True, "reason": "qa_allowlist"}


def test_authorization_qa_role_user_requires_principal(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CLAW_QA_PAYMENT_BYPASS_ROLE_USER_IDS", "role-user-1")
    res = client.get(
        "/v1/workspace/qa-payment-bypass/authorization",
        headers={
            "X-Claw-User-Id": "role-user-1",
            "X-Claw-Test-Auth-User-Id": "role-user-1",
        },
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
    secret_only = client.post(
        "/v1/workspace/qa-payment-bypass/session",
        json={"admin_secret": "test-admin-secret"},
    )
    assert secret_only.status_code in (401, 403)

    res = client.post(
        "/v1/workspace/qa-payment-bypass/session",
        headers=_ops_headers(),
        json={"admin_secret": "test-admin-secret"},
    )
    assert res.status_code == 200
    assert res.json() == {"ok": True}
    assert COOKIE_NAME in res.cookies

    auth = client.get("/v1/workspace/qa-payment-bypass/authorization")
    assert auth.status_code == 200
    assert auth.json() == {"authorized": True, "reason": "admin_session"}


@pytest.mark.parametrize("env", ["staging", "production", None, "   "])
def test_bootstrap_unavailable_outside_relaxed_env(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, env
) -> None:
    if env is None:
        monkeypatch.delenv("CLAW_ENVIRONMENT", raising=False)
    else:
        monkeypatch.setenv("CLAW_ENVIRONMENT", env)
    res = client.post(
        "/v1/workspace/qa-payment-bypass/session",
        headers=_ops_headers(),
        json={"admin_secret": "test-admin-secret"},
    )
    assert res.status_code == 404
    auth = client.get("/v1/workspace/qa-payment-bypass/authorization")
    assert auth.status_code == 200
    assert auth.json().get("authorized") is False


def test_bootstrap_sets_cross_origin_cookie_attributes(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Cookie attributes are only relevant when the relaxed bootstrap path is available.
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    res = client.post(
        "/v1/workspace/qa-payment-bypass/session",
        headers={**_ops_headers(), "Origin": "https://lawdog.me"},
        json={"admin_secret": "test-admin-secret"},
    )
    assert res.status_code == 200
    set_cookie = res.headers.get("set-cookie") or ""
    assert COOKIE_NAME in set_cookie
    assert "httponly" in set_cookie.lower()


def test_bootstrap_rejects_invalid_admin_secret(client: TestClient) -> None:
    res = client.post(
        "/v1/workspace/qa-payment-bypass/session",
        headers={
            **_ops_headers(secret="wrong-secret"),
        },
        json={"admin_secret": "wrong-secret"},
    )
    assert res.status_code in (401, 403)


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
