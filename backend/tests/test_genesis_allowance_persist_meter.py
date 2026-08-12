"""Genesis affiliate status must not grant or consume buyer create quota.

Guest temp-draft rules and Pro finalize metering are covered in
``test_guest_genesis_pro_entitlement.py`` / commercial entitlement policy tests.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from backend.affiliates.genesis_referral_service import create_genesis_affiliate
from backend.main import app
from backend.usage_economics.commercial_entitlement import (
    AFFILIATE_STATUS_GENESIS,
    STATE_NONE,
    resolve_commercial_entitlement,
)
from backend.usage_economics.genesis_dog_entitlement import (
    GRANT_SOURCE_ADMIN,
    GenesisCreateGrantIssuanceRetired,
    get_entitlement,
    grant_entitlement,
)
from backend.usage_economics.store import UsageEconomicsStore


@pytest.fixture()
def isolated_env(tmp_path, monkeypatch: pytest.MonkeyPatch):
    from backend.admin_console import store as admin_store
    from backend.economics import store as eco_store
    from backend.usage_economics import store as ue_store

    eco_store.reset_economics_store_for_tests()
    ue_store._store = None
    admin_store.reset_admin_console_store_for_tests()

    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_STRICT_IN_DEV", "1")
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "admin-test-secret")
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")
    monkeypatch.setenv("CLAW_RATE_LIMIT_RPS", "1000")
    monkeypatch.setenv("CLAW_RATE_LIMIT_BURST", "1000")

    usage = UsageEconomicsStore(str(tmp_path / "usage.sqlite3"))
    usage.init_schema()
    ue_store._store = usage
    eco = eco_store.get_economics_store()
    eco.init_schema()

    client = TestClient(app)
    yield client, usage, eco

    eco_store.reset_economics_store_for_tests()
    ue_store._store = None
    admin_store.reset_admin_console_store_for_tests()


def _auth(uid: str) -> dict:
    return {"X-Claw-Test-Auth-User-Id": uid, "X-Claw-Org-Id": f"user-{uid}"}


def _admin() -> dict:
    return {
        "X-Claw-Test-Auth-User-Id": "ops_admin",
        "X-Claw-Test-Operator-Role": "support_operator",
        "x-claw-admin-secret": "admin-test-secret",
        "x-claw-admin-reason": "staging genesis affiliate contract",
        "x-request-id": "corr-genesis-meter",
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


def test_genesis_affiliate_does_not_grant_or_consume_create_quota(isolated_env):
    client, usage, eco = isolated_env
    uid = f"genesis-aff-{uuid.uuid4().hex[:8]}"
    subject = f"org:user-{uid}"
    create_genesis_affiliate(
        eco,
        user_id=uid,
        display_name="Affiliate Only",
        referral_code=f"AFF_{uid[:8].upper()}",
        affiliate_status="active",
    )

    decision = resolve_commercial_entitlement(subject)
    assert decision["state"] == STATE_NONE
    assert decision["affiliate_status"] == AFFILIATE_STATUS_GENESIS
    assert decision["can_create_persisted_agreement"] is False
    assert decision["agreement_allowance"] == 0
    assert decision.get("genesis_allowance") is None

    blocked = client.post("/api/agreements/draft", headers=_auth(uid), json=_draft_body("nope"))
    assert blocked.status_code == 403, blocked.text
    assert usage.agreements_created_this_utc_month(subject) == 0
    assert usage.list_agreement_ids_for_subject(subject) == []

    after = resolve_commercial_entitlement(subject)
    assert after["agreements_used"] == 0
    assert after["can_create_persisted_agreement"] is False
    assert after["affiliate_status"] == AFFILIATE_STATUS_GENESIS


def test_legacy_genesis_create_row_readable_but_does_not_meter_create(
    isolated_env, monkeypatch
):
    _client, usage, _eco = isolated_env
    uid = f"legacy-create-{uuid.uuid4().hex[:8]}"
    subject = f"org:user-{uid}"
    monkeypatch.setenv("CLAW_ALLOW_GENESIS_CREATE_GRANT_ISSUANCE", "1")
    grant_entitlement(user_id=uid, granted_by="migration-tool", grant_source=GRANT_SOURCE_ADMIN)
    monkeypatch.delenv("CLAW_ALLOW_GENESIS_CREATE_GRANT_ISSUANCE", raising=False)

    row = get_entitlement(uid)
    assert row is not None
    assert str(row.get("status") or "") == "active"

    decision = resolve_commercial_entitlement(subject)
    assert decision["state"] == STATE_NONE
    assert decision["can_create_persisted_agreement"] is False
    legacy = decision.get("legacy_genesis_create_grant") or {}
    assert legacy.get("present") is True
    assert legacy.get("create_granted") is False
    assert legacy.get("migration_required") is True
    assert usage.agreements_created_this_utc_month(subject) == 0


def test_admin_genesis_create_grant_returns_410_without_create_entitlement(isolated_env):
    client, _usage, eco = isolated_env
    uid = f"grant-410-{uuid.uuid4().hex[:8]}"
    subject = f"org:user-{uid}"
    create_genesis_affiliate(
        eco,
        user_id=uid,
        display_name="Grant Denied",
        referral_code=f"G410_{uid[:8].upper()}",
        affiliate_status="active",
    )

    grant = client.post(
        f"/v1/admin/users/{uid}/genesis-entitlement/grant",
        headers=_admin(),
        json={"reason": "must not create buyer entitlement"},
    )
    assert grant.status_code == 410, grant.text
    detail = grant.json().get("detail") or {}
    assert detail.get("code") == "genesis_create_grant_issuance_retired"
    assert get_entitlement(uid) is None

    with pytest.raises(GenesisCreateGrantIssuanceRetired):
        grant_entitlement(user_id=uid, granted_by="ops", grant_source=GRANT_SOURCE_ADMIN)

    decision = resolve_commercial_entitlement(subject)
    assert decision["state"] == STATE_NONE
    assert decision["affiliate_status"] == AFFILIATE_STATUS_GENESIS
    assert decision["can_create_persisted_agreement"] is False
    assert decision["agreement_allowance"] == 0
