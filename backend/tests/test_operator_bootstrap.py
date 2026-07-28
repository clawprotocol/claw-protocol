"""One-shot staging operator bootstrap — adversarial fail-closed coverage."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.auth_fixtures import (
    configure_production_like_jwt,
    mint_es256_supabase_jwt,
    owner_headers_production_like,
)


BOOTSTRAP_PATH = "/v1/admin/operators/bootstrap"
ADMIN_SECRET = "staging-bootstrap-admin-secret"


@pytest.fixture()
def staging_bootstrap_env(tmp_path, monkeypatch: pytest.MonkeyPatch):
    from backend.admin_console import store as admin_store
    from backend.economics import store as eco_store

    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.setenv("CLAW_ALLOW_OPERATOR_BOOTSTRAP", "1")
    monkeypatch.setenv("CLAW_ADMIN_SECRET", ADMIN_SECRET)
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin_console.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_RATE_LIMIT_RPS", "1000")
    monkeypatch.setenv("CLAW_RATE_LIMIT_BURST", "1000")
    configure_production_like_jwt(monkeypatch)

    admin_store.reset_admin_console_store_for_tests()
    eco_store.reset_economics_store_for_tests()
    client = TestClient(app)
    yield client
    admin_store.reset_admin_console_store_for_tests()
    eco_store.reset_economics_store_for_tests()


def _auth_headers(user_id: str = "bootstrap-op-1") -> dict:
    h = owner_headers_production_like(user_id=user_id)
    h["x-claw-admin-secret"] = ADMIN_SECRET
    return h


def test_bootstrap_disabled_without_flag(staging_bootstrap_env, monkeypatch: pytest.MonkeyPatch):
    client = staging_bootstrap_env
    monkeypatch.delenv("CLAW_ALLOW_OPERATOR_BOOTSTRAP", raising=False)
    r = client.post(
        BOOTSTRAP_PATH,
        headers=_auth_headers(),
        json={"reason": "staging first operator"},
    )
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "operator_bootstrap_disabled"


@pytest.mark.parametrize("env", ["", "local", "test", "dev", "production", "prod", "qa"])
def test_bootstrap_disabled_outside_exact_staging(
    staging_bootstrap_env, monkeypatch: pytest.MonkeyPatch, env: str
):
    client = staging_bootstrap_env
    if env == "":
        monkeypatch.delenv("CLAW_ENVIRONMENT", raising=False)
    else:
        monkeypatch.setenv("CLAW_ENVIRONMENT", env)
    r = client.post(
        BOOTSTRAP_PATH,
        headers=_auth_headers(),
        json={"reason": "staging first operator"},
    )
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "operator_bootstrap_disabled"


def test_bootstrap_conflict_when_active_operator_exists(staging_bootstrap_env):
    client = staging_bootstrap_env
    from backend.admin_console.store import get_admin_console_store

    store = get_admin_console_store()
    store.touch_admin_user(admin_user_id="already-there", email=None, role="support_operator")
    r = client.post(
        BOOTSTRAP_PATH,
        headers=_auth_headers("new-bootstrap-user"),
        json={"reason": "should conflict"},
    )
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "operator_bootstrap_already_done"


def test_bootstrap_missing_jwt_denied(staging_bootstrap_env):
    client = staging_bootstrap_env
    r = client.post(
        BOOTSTRAP_PATH,
        headers={"x-claw-admin-secret": ADMIN_SECRET},
        json={"reason": "staging first operator"},
    )
    assert r.status_code == 401


def test_bootstrap_invalid_jwt_denied(staging_bootstrap_env):
    client = staging_bootstrap_env
    r = client.post(
        BOOTSTRAP_PATH,
        headers={
            "Authorization": "Bearer not.a.jwt",
            "x-claw-admin-secret": ADMIN_SECRET,
        },
        json={"reason": "staging first operator"},
    )
    assert r.status_code == 401


def test_bootstrap_test_auth_unavailable_in_staging(staging_bootstrap_env):
    client = staging_bootstrap_env
    r = client.post(
        BOOTSTRAP_PATH,
        headers={
            "X-Claw-Test-Auth-User-Id": "test-op",
            "X-Claw-Test-Operator-Role": "admin",
            "x-claw-admin-secret": ADMIN_SECRET,
        },
        json={"reason": "must not use test auth"},
    )
    assert r.status_code == 401


def test_bootstrap_bad_secret_denied(staging_bootstrap_env):
    client = staging_bootstrap_env
    h = owner_headers_production_like(user_id="bootstrap-op-1")
    h["x-claw-admin-secret"] = "wrong-secret"
    r = client.post(BOOTSTRAP_PATH, headers=h, json={"reason": "staging first operator"})
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "forbidden"


def test_bootstrap_short_reason_denied(staging_bootstrap_env):
    client = staging_bootstrap_env
    r = client.post(
        BOOTSTRAP_PATH,
        headers=_auth_headers(),
        json={"reason": "ab"},
    )
    assert r.status_code == 422  # pydantic min_length


def test_bootstrap_rejects_spoofed_target_user_id(staging_bootstrap_env):
    client = staging_bootstrap_env
    r = client.post(
        BOOTSTRAP_PATH,
        headers=_auth_headers("jwt-sub-user"),
        json={"reason": "spoof attempt", "user_id": "attacker-chosen-id"},
    )
    assert r.status_code == 422
    # Ensure no operator was created for either id.
    from backend.admin_console.store import get_admin_console_store

    store = get_admin_console_store()
    assert store.get_admin_user("attacker-chosen-id") is None
    assert store.get_admin_user("jwt-sub-user") is None


def test_bootstrap_rejects_role_escalation_parameter(staging_bootstrap_env):
    client = staging_bootstrap_env
    r = client.post(
        BOOTSTRAP_PATH,
        headers=_auth_headers(),
        json={"reason": "escalate", "role": "admin"},
    )
    assert r.status_code == 422
    from backend.admin_console.store import get_admin_console_store

    assert get_admin_console_store().count_active_operators() == 0


def test_operators_me_capability_without_admin_secret(staging_bootstrap_env):
    """Nav capability probe: JWT + registry only — no secret, no mutate grant."""
    client = staging_bootstrap_env
    uid = "staging-first-op"
    token = mint_es256_supabase_jwt(uid)
    denied = client.get(
        "/v1/admin/operators/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert denied.status_code == 200, denied.text
    assert denied.json()["authorized"] is False

    boot = client.post(
        BOOTSTRAP_PATH,
        headers=_auth_headers(uid),
        json={"reason": "staging first support operator bootstrap"},
    )
    assert boot.status_code == 200, boot.text

    allowed = client.get(
        "/v1/admin/operators/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert allowed.status_code == 200, allowed.text
    body = allowed.json()
    assert body["authorized"] is True
    assert body["role"] == "support_operator"
    assert body["user_id"] == uid

    # Capability probe must not grant Genesis Dog customer access.
    from backend.usage_economics.genesis_dog_entitlement import get_entitlement

    assert get_entitlement(uid) is None


def test_bootstrap_success_then_genesis_ops_read(staging_bootstrap_env):
    client = staging_bootstrap_env
    uid = "staging-first-op"
    r = client.post(
        BOOTSTRAP_PATH,
        headers=_auth_headers(uid),
        json={"reason": "staging first support operator bootstrap"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["user_id"] == uid
    assert body["role"] == "support_operator"
    assert body["audit_id"]
    assert "admin_secret" not in str(body).lower()

    from backend.admin_console.store import get_admin_console_store

    store = get_admin_console_store()
    row = store.get_admin_user(uid)
    assert row is not None
    assert row["role"] == "support_operator"
    assert int(row["is_active"]) == 1
    audits = store.list_admin_action_audit(limit=10)
    assert any(a.get("action_type") == "operator_bootstrap" and a.get("id") == body["audit_id"] for a in audits)

    # Bootstrap must not invent agreement ownership or grant customer Genesis Dog access.
    from backend.usage_economics import store as ue_store
    from backend.usage_economics.commercial_entitlement import resolve_commercial_entitlement
    from backend.usage_economics.genesis_dog_entitlement import get_entitlement
    from backend.usage_economics.store import get_usage_economics_store

    ue_store._store = None
    subject = f"org:user-{uid}"
    usage = get_usage_economics_store()
    usage.init_schema()
    assert usage.count_completed_agreements(subject) == 0
    assert usage.count_incomplete_agreements(subject) == 0
    assert get_entitlement(uid) is None
    decision = resolve_commercial_entitlement(subject)
    assert decision["state"] == "none"
    assert decision["can_create_persisted_agreement"] is False
    assert decision["grant_source"] == "none"

    # Second bootstrap must fail closed.
    r2 = client.post(
        BOOTSTRAP_PATH,
        headers=_auth_headers("another-user"),
        json={"reason": "second bootstrap blocked"},
    )
    assert r2.status_code == 409
    assert r2.json()["detail"]["code"] == "operator_bootstrap_already_done"

    # Authorized Genesis ops read with JWT + secret + reason.
    token = mint_es256_supabase_jwt(uid)
    ops = client.get(
        "/v1/genesis-referral/ops/summary",
        headers={
            "Authorization": f"Bearer {token}",
            "x-claw-admin-secret": ADMIN_SECRET,
            "x-claw-admin-reason": "post-bootstrap genesis ops summary",
        },
    )
    assert ops.status_code == 200, ops.text
