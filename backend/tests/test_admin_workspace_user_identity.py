"""Admin Console workspace identity — bind → search by email → grant Genesis Dog."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.conftest_auth_security import make_test_auth_headers
from backend.usage_economics.commercial_entitlement import STATE_GENESIS


@pytest.fixture()
def isolated_identity_env(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_STRICT_IN_DEV", "1")
    monkeypatch.setenv("CLAW_GENESIS_MONTHLY_AGREEMENT_ALLOWANCE", "5")
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "admin-test-secret")
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")
    monkeypatch.setenv("CLAW_RATE_LIMIT_RPS", "1000")
    monkeypatch.setenv("CLAW_RATE_LIMIT_BURST", "1000")

    from backend.admin_console import store as admin_store
    from backend.economics import store as eco_store
    from backend.usage_economics import store as usage_store

    eco_store.reset_economics_store_for_tests()
    usage_store._store = None
    admin_store.reset_admin_console_store_for_tests()

    client = TestClient(app)
    yield client

    eco_store.reset_economics_store_for_tests()
    usage_store._store = None
    admin_store.reset_admin_console_store_for_tests()


def _admin_headers(*, reason: str = "staging acceptance grant") -> dict[str, str]:
    return {
        "X-Claw-Test-Auth-User-Id": "ops_admin",
        "X-Claw-Test-Operator-Role": "support_operator",
        "x-claw-admin-secret": "admin-test-secret",
        "x-claw-admin-reason": reason,
        "x-request-id": "corr-identity-e2e",
    }


def test_bind_persist_identity_admin_search_grant_genesis_e2e(isolated_identity_env):
    """
    Authenticate a fresh user → admin search by exact email (plus-alias) →
    grant Genesis Dog → user refresh sees Genesis Dog 5/5.
    """
    client = isolated_identity_env
    uid = f"uid-identity-{uuid.uuid4().hex[:10]}"
    email = "founder+staging@gmail.com"
    display_name = "Staging Founder"

    bind = client.post(
        "/v1/workspace/bind-user-org",
        headers=make_test_auth_headers(uid),
        json={
            "user_id": uid,
            "email": email,
            "display_name": display_name,
            "claim_method": "session_restore",
        },
    )
    assert bind.status_code == 200, bind.text
    assert bind.json()["org_id"] == f"user-{uid}"

    from backend.admin_console.store import get_admin_console_store

    stored = get_admin_console_store().get_workspace_user_identity(uid)
    assert stored is not None
    assert stored["email"] == email
    assert stored["display_name"] == display_name
    assert stored["org_id"] == f"user-{uid}"

    users_res = client.get("/v1/admin/users", headers=_admin_headers())
    assert users_res.status_code == 200, users_res.text
    users = users_res.json().get("users") or []
    match = [u for u in users if str(u.get("email") or "").lower() == email.lower()]
    assert len(match) == 1, users
    row = match[0]
    assert row["user_id"] == uid
    assert row["email"] == email
    assert row["display_name"] == display_name
    assert row["org_id"] == f"org:user-{uid}"
    assert "purpose" not in row
    assert "access_token" not in row
    assert "parties" not in row

    # Exact email search (including plus-alias) — mirrors Admin Console client filter.
    exact = [
        u
        for u in users
        if str(u.get("email") or "").strip().lower() == email.strip().lower()
    ]
    assert exact == match
    assert not any(
        str(u.get("email") or "").strip().lower() == "founder@gmail.com" for u in users
    )

    grant = client.post(
        f"/v1/admin/users/{uid}/genesis-entitlement/grant",
        headers=_admin_headers(reason="staging acceptance grant for plus-alias"),
        json={"reason": "staging acceptance grant for plus-alias"},
    )
    assert grant.status_code == 200, grant.text
    assert grant.json().get("ok") is True
    assert grant.json().get("audit_id")

    # User refreshes entitlement summary — Genesis Dog 5/5.
    summary = client.get(
        "/api/agreements/usage/summary",
        headers={
            **make_test_auth_headers(uid),
            "X-Claw-Org-Id": f"user-{uid}",
        },
    )
    assert summary.status_code == 200, summary.text
    body = summary.json()
    assert body["state"] == STATE_GENESIS
    assert body["agreement_allowance"] == 5
    assert body["agreements_used"] == 0
    assert body["agreements_remaining"] == 5


def test_bind_identity_backfill_on_repeat_session(isolated_identity_env):
    """Repeat bind with JWT/session identity backfills email for an existing opaque subject."""
    client = isolated_identity_env
    uid = f"uid-backfill-{uuid.uuid4().hex[:10]}"
    org_ref = f"org:user-{uid}"

    from backend.usage_economics.store import get_usage_economics_store

    ustore = get_usage_economics_store()
    ustore.init_schema()
    ustore.incr_ai_calls(org_ref, 1)

    # First admin list: opaque — no email yet.
    before = client.get("/v1/admin/users", headers=_admin_headers())
    assert before.status_code == 200
    opaque = [u for u in (before.json().get("users") or []) if u.get("user_id") == uid]
    assert opaque
    assert not opaque[0].get("email")

    email = "cryptocurated21+rc@gmail.com"
    bind = client.post(
        "/v1/workspace/bind-user-org",
        headers=make_test_auth_headers(uid),
        json={
            "user_id": uid,
            "email": email,
            "display_name": "Crypto Curated",
            "claim_method": "session_restore",
        },
    )
    assert bind.status_code == 200, bind.text

    after = client.get("/v1/admin/users", headers=_admin_headers())
    assert after.status_code == 200
    found = [u for u in (after.json().get("users") or []) if u.get("user_id") == uid]
    assert len(found) == 1
    assert found[0]["email"] == email
    assert found[0]["display_name"] == "Crypto Curated"
