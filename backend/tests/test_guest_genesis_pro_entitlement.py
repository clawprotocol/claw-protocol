"""Guest | Pro buyers; Genesis affiliate status is not a create entitlement."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from backend.affiliates.genesis_referral_service import create_genesis_affiliate
from backend.economics.store import get_economics_store, reset_economics_store_for_tests
from backend.main import app
from backend.usage_economics.commercial_entitlement import (
    AFFILIATE_STATUS_GENESIS,
    STATE_GUEST,
    STATE_NONE,
    STATE_PRO,
    resolve_commercial_entitlement,
)
from backend.usage_economics.genesis_dog_entitlement import (
    GenesisCreateGrantIssuanceRetired,
    get_entitlement,
    grant_entitlement,
    resolve_genesis_dog_access,
)
from backend.usage_economics.store import UsageEconomicsStore


@pytest.fixture()
def isolated_entitlement_env(tmp_path, monkeypatch: pytest.MonkeyPatch):
    from backend.economics import store as eco_store
    from backend.usage_economics import store as ue_store
    from backend import main as main_mod

    eco_store.reset_economics_store_for_tests()
    ue_store._store = None
    main_mod._rate_state.clear()  # noqa: SLF001

    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage_eco.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_STRICT_IN_DEV", "1")
    monkeypatch.setenv("CLAW_PRO_BILLING_PERIOD_AGREEMENT_ALLOWANCE", "25")
    monkeypatch.setenv("CLAW_RATE_LIMIT_RPS", "1000")
    monkeypatch.setenv("CLAW_RATE_LIMIT_BURST", "1000")
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "test-admin-secret")
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")

    from backend.admin_console import store as admin_store

    reset_economics_store_for_tests()
    eco = get_economics_store()
    eco.init_schema()
    usage = UsageEconomicsStore(str(tmp_path / "usage_eco.sqlite3"))
    usage.init_schema()
    ue_store._store = usage
    admin_store._store = None

    client = TestClient(app)
    yield client, eco, usage

    eco_store.reset_economics_store_for_tests()
    ue_store._store = None
    admin_store._store = None


def _auth(user_id: str) -> dict:
    return {"X-Claw-Test-Auth-User-Id": user_id, "X-Claw-Org-Id": f"user-{user_id}"}


def _admin_headers(user_id: str = "ops-admin") -> dict:
    return {
        **_auth(user_id),
        "X-Claw-Test-Operator-Role": "support_operator",
        "x-claw-admin-secret": "test-admin-secret",
        "x-claw-admin-reason": "genesis entitlement test",
        "x-request-id": "corr-genesis-entitlement-test",
    }


def _draft_body(title: str = "T") -> dict:
    return {
        "title": title,
        "jurisdiction": "CA",
        "parties": [{"name": "A", "role": "owner"}],
        "purpose": "p",
        "payment_terms": "pt",
        "duration": None,
        "due_date": None,
        "effective_date": None,
    }


def _activate_paid(eco, uid: str) -> None:
    eco.insert_subscription(
        sub_id=f"sub-{uuid.uuid4().hex[:12]}",
        org_id=f"user-{uid}",
        user_id=uid,
        plan_code="pro",
        status="active",
        payment_id=f"pay-{uuid.uuid4().hex[:10]}",
        expires_at=None,
        current_period_end=(datetime.now(timezone.utc) + timedelta(days=30))
        .isoformat()
        .replace("+00:00", "Z"),
    )


def test_guest_temp_draft_only(isolated_entitlement_env):
    _client, _eco, _usage = isolated_entitlement_env
    decision = resolve_commercial_entitlement(f"org:anon-{uuid.uuid4().hex[:8]}")
    assert decision["state"] == STATE_GUEST
    assert decision["can_create_persisted_agreement"] is False
    assert decision["can_save_guest_draft"] is True


def test_authenticated_none_cannot_create_without_pro(isolated_entitlement_env):
    client, _eco, _usage = isolated_entitlement_env
    uid = "auth-none"
    blocked = client.post("/api/agreements/draft", headers=_auth(uid), json=_draft_body("Nope"))
    assert blocked.status_code == 403
    d = resolve_commercial_entitlement(f"org:user-{uid}")
    assert d["state"] == STATE_NONE
    assert d["can_create_persisted_agreement"] is False
    assert d.get("affiliate_status") == "none"


def test_admin_genesis_create_grant_issuance_retired(isolated_entitlement_env):
    client, _eco, _usage = isolated_entitlement_env
    uid = "grant-retired"
    res = client.post(
        f"/v1/admin/users/{uid}/genesis-entitlement/grant",
        headers=_admin_headers(),
        json={"reason": "should_fail"},
    )
    assert res.status_code == 410
    assert res.json()["detail"]["code"] == "genesis_create_grant_issuance_retired"
    with pytest.raises(GenesisCreateGrantIssuanceRetired):
        grant_entitlement(user_id=uid, granted_by="test")
    assert get_entitlement(uid) is None
    active, _src, row = resolve_genesis_dog_access(uid)
    assert active is False
    assert row is None


def test_affiliate_does_not_grant_buyer_create(isolated_entitlement_env):
    _client, eco, _usage = isolated_entitlement_env
    uid = "aff-only"
    create_genesis_affiliate(
        eco,
        user_id=uid,
        display_name="Dog",
        referral_code=f"GEN_{uid[:8].upper()}",
        affiliate_status="active",
    )
    d = resolve_commercial_entitlement(f"org:user-{uid}")
    assert d["state"] == STATE_NONE
    assert d["can_create_persisted_agreement"] is False
    assert d["affiliate_status"] == AFFILIATE_STATUS_GENESIS
    active, _src, _row = resolve_genesis_dog_access(uid)
    assert active is False


def test_legacy_genesis_row_readable_but_no_create(isolated_entitlement_env, monkeypatch):
    monkeypatch.setenv("CLAW_ALLOW_GENESIS_CREATE_GRANT_ISSUANCE", "1")
    uid = "legacy-row"
    grant_entitlement(user_id=uid, granted_by="migration-tool")
    monkeypatch.delenv("CLAW_ALLOW_GENESIS_CREATE_GRANT_ISSUANCE", raising=False)
    row = get_entitlement(uid)
    assert row is not None
    d = resolve_commercial_entitlement(f"org:user-{uid}")
    assert d["state"] == STATE_NONE
    assert d["can_create_persisted_agreement"] is False
    legacy = d.get("legacy_genesis_create_grant") or {}
    assert legacy.get("present") is True
    assert legacy.get("create_granted") is False
    assert legacy.get("migration_required") is True


def test_pro_stripe_finalize_meter(isolated_entitlement_env):
    client, eco, usage = isolated_entitlement_env
    uid = "pro-cap"
    _activate_paid(eco, uid)
    h = _auth(uid)
    subject = f"org:user-{uid}"
    decision = resolve_commercial_entitlement(subject)
    assert decision["state"] == STATE_PRO
    assert decision["agreement_allowance"] == 25
    for i in range(3):
        assert client.post("/api/agreements/draft", headers=h, json=_draft_body(f"P{i}")).status_code == 200
    summary = client.get("/api/agreements/usage/summary", headers=h).json()
    assert summary["state"] == STATE_PRO
    assert summary["agreements_used"] == 0
    assert summary["commercial"]["pro_allowance"].get("meter") == "finalized"
    for i in range(3):
        aid = f"fin-pro-{i}"
        usage.try_insert_agreement_owner_with_monthly_cap(
            agreement_id=aid,
            subject_ref=subject,
            internal_keys_draft=0,
            monthly_cap=None,
            period_start_iso="",
            guest_temp=False,
        )
        assert usage.mark_agreement_completed(
            agreement_id=aid, subject_ref=subject, internal_keys_finalize=1
        )
    summary2 = client.get("/api/agreements/usage/summary", headers=h).json()
    assert summary2["agreements_used"] == 3
    assert summary2["agreements_remaining"] == 22
