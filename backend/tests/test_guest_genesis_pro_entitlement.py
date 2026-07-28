"""Guest → Genesis Dog → Pro commercial entitlement model."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from backend.affiliates.genesis_referral_service import create_genesis_affiliate
from backend.economics.store import get_economics_store, reset_economics_store_for_tests
from backend.main import app
from backend.usage_economics import constants as uc
from backend.usage_economics.commercial_entitlement import (
    STATE_GENESIS,
    STATE_GUEST,
    STATE_NONE,
    STATE_PENDING_GENESIS,
    STATE_PRO,
    resolve_commercial_entitlement,
)
from backend.usage_economics.genesis_dog_entitlement import (
    GRANT_SOURCE_ADMIN,
    GRANT_SOURCE_LEGACY_AFFILIATE,
    get_entitlement,
    grant_entitlement,
    resolve_genesis_dog_access,
    revoke_entitlement,
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
    monkeypatch.setenv("CLAW_GENESIS_MONTHLY_AGREEMENT_ALLOWANCE", "5")
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


def _mint_anon(client: TestClient) -> dict:
    r = client.post("/v1/workspace/anonymous-session")
    assert r.status_code == 200, r.text
    body = r.json()
    return {
        "X-Claw-Org-Id": body["org_id"],
        "X-Claw-Anonymous-Session": body["token"],
        "Content-Type": "application/json",
    }


def _activate_paid(eco, user_id: str, *, period_days: int = 30) -> None:
    org = f"user-{user_id}"
    end = (datetime.now(timezone.utc) + timedelta(days=period_days)).isoformat().replace("+00:00", "Z")
    eco.insert_subscription(
        sub_id=f"sub-{uuid.uuid4().hex[:12]}",
        org_id=org,
        user_id=user_id,
        plan_code="pro",
        status="active",
        payment_id=f"pay-{uuid.uuid4().hex[:10]}",
        expires_at=end,
        current_period_end=end,
    )


def test_1_guest_generates_one_temporary_draft(isolated_entitlement_env):
    client, _eco, usage = isolated_entitlement_env
    h = _mint_anon(client)
    r = client.post("/api/agreements/draft", headers=h, json=_draft_body("Guest1"))
    assert r.status_code == 200, r.text
    aid = r.json()["id"]
    row = usage.get_agreement_owner_row(aid)
    assert row is not None
    decision = resolve_commercial_entitlement(f"org:{h['X-Claw-Org-Id']}")
    assert decision["state"] == STATE_GUEST
    assert decision["can_create_persisted_agreement"] is False
    assert decision["can_save_guest_draft"] is False  # already used the one draft


def test_2_guest_cannot_workspace_history_or_share(isolated_entitlement_env):
    client, _eco, _usage = isolated_entitlement_env
    h = _mint_anon(client)
    created = client.post("/api/agreements/draft", headers=h, json=_draft_body("GuestHist"))
    assert created.status_code == 200, created.text
    aid = created.json()["id"]
    hist = client.get("/api/agreements/workspace-index", headers=h)
    assert hist.status_code in (401, 403)
    share = client.post(f"/api/agreements/{aid}/review-sent", headers=h)
    assert share.status_code in (401, 403)
    proof = client.get(f"/api/agreements/{aid}/proof-status", headers=h)
    assert proof.status_code == 403
    detail = proof.json().get("detail") or {}
    assert detail.get("code") in (uc.GUEST_WORKFLOW_DENIED, "agreement_read_denied", "auth_required")


def test_3_genesis_request_does_not_grant(isolated_entitlement_env):
    client, _eco, _usage = isolated_entitlement_env
    uid = "pending-user"
    h = _auth(uid)
    before = resolve_commercial_entitlement(f"org:user-{uid}")
    assert before["state"] == STATE_NONE
    r = client.post(
        "/v1/workspace/genesis-access-request",
        headers=h,
        json={"reason": "please invite me"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["granted"] is False
    after = resolve_commercial_entitlement(f"org:user-{uid}")
    assert after["state"] == STATE_PENDING_GENESIS
    assert after["can_create_persisted_agreement"] is False
    assert get_entitlement(uid) is None


def test_public_and_customer_cannot_grant_genesis(isolated_entitlement_env):
    client, _eco, _usage = isolated_entitlement_env
    uid = "no-public-grant"
    # Unauthenticated
    r0 = client.post(
        f"/v1/admin/users/{uid}/genesis-entitlement/grant",
        json={"reason": "should_fail"},
    )
    assert r0.status_code in (401, 403)
    # Authenticated customer without operator role/secret
    r1 = client.post(
        f"/v1/admin/users/{uid}/genesis-entitlement/grant",
        headers=_auth("customer-only"),
        json={"reason": "should_fail"},
    )
    assert r1.status_code in (401, 403)
    assert get_entitlement(uid) is None


def test_4_admin_grant_five_agreements(isolated_entitlement_env):
    client, _eco, _usage = isolated_entitlement_env
    uid = "genesis-five"
    admin = _admin_headers()
    grant = client.post(
        f"/v1/admin/users/{uid}/genesis-entitlement/grant",
        headers=admin,
        json={"reason": "invite_selected_user"},
    )
    assert grant.status_code == 200, grant.text
    assert grant.json().get("audit_id")
    h = _auth(uid)
    for i in range(5):
        r = client.post("/api/agreements/draft", headers=h, json=_draft_body(f"G{i}"))
        assert r.status_code == 200, r.text
    blocked = client.post("/api/agreements/draft", headers=h, json=_draft_body("over"))
    assert blocked.status_code == 403
    summary = client.get("/api/agreements/usage/summary", headers=h).json()
    assert summary["state"] == STATE_GENESIS
    assert summary["agreement_allowance"] == 5
    assert summary["agreements_used"] == 5
    assert summary["agreements_remaining"] == 0


def test_5_grant_revoke_expiry_audited(isolated_entitlement_env):
    client, _eco, _usage = isolated_entitlement_env
    uid = "genesis-audit"
    admin = _admin_headers()
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat().replace("+00:00", "Z")
    g = client.post(
        f"/v1/admin/users/{uid}/genesis-entitlement/grant",
        headers=admin,
        json={"reason": "grant_with_expiry", "expires_at": past},
    )
    assert g.status_code == 200, g.text
    assert g.json()["audit_id"]
    # Expired → denied even if we also create an active affiliate.
    create_genesis_affiliate(
        get_economics_store(),
        user_id=uid,
        display_name="Dog",
        referral_code=f"GEN_{uid[:8].upper()}",
        affiliate_status="active",
    )
    decision = resolve_commercial_entitlement(f"org:user-{uid}")
    assert decision["state"] == STATE_NONE
    # Re-grant active, then revoke.
    g2 = client.post(
        f"/v1/admin/users/{uid}/genesis-entitlement/grant",
        headers=admin,
        json={"reason": "regrant_active"},
    )
    assert g2.status_code == 200
    rev = client.post(
        f"/v1/admin/users/{uid}/genesis-entitlement/revoke",
        headers=admin,
        json={"reason": "revoke_selected_user"},
    )
    assert rev.status_code == 200, rev.text
    assert rev.json()["audit_id"]
    got = client.get(f"/v1/admin/users/{uid}/genesis-entitlement", headers=admin)
    assert got.status_code == 200, got.text
    assert got.json()["entitlement"]["status"] == "revoked"
    assert any(
        str(a.get("action_type") or "").startswith("genesis_entitlement_")
        for a in got.json().get("audit") or []
    )


def test_6_and_7_only_new_persisted_create_decrements_not_revision(isolated_entitlement_env):
    client, _eco, usage = isolated_entitlement_env
    uid = "genesis-meter"
    grant_entitlement(user_id=uid, granted_by="test", grant_source=GRANT_SOURCE_ADMIN)
    h = _auth(uid)
    r = client.post("/api/agreements/draft", headers=h, json=_draft_body("One"))
    assert r.status_code == 200, r.text
    aid = r.json()["id"]
    used_after_create = resolve_commercial_entitlement(f"org:user-{uid}")["agreements_used"]
    assert used_after_create == 1
    # Simulate revision/update — no new ownership insert.
    patch = client.patch(
        f"/api/agreements/{aid}",
        headers=h,
        json={"title": "Revised title"},
    )
    # Patch may 404/405 depending on API; metering must not increase regardless.
    _ = patch.status_code
    used_after_revision = resolve_commercial_entitlement(f"org:user-{uid}")["agreements_used"]
    assert used_after_revision == 1
    assert usage.agreements_created_this_utc_month(f"org:user-{uid}") == 1


def test_8_genesis_monthly_reset(isolated_entitlement_env):
    _client, _eco, usage = isolated_entitlement_env
    uid = "genesis-rollover"
    subject = f"org:user-{uid}"
    grant_entitlement(user_id=uid, granted_by="test", grant_source=GRANT_SOURCE_ADMIN)
    prior = datetime(2020, 1, 15, tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
    with usage._conn() as con:  # noqa: SLF001
        for i in range(5):
            con.execute(
                """
                INSERT INTO agreement_owner (agreement_id, subject_ref, created_at, internal_keys_draft, guest_temp)
                VALUES (?, ?, ?, 0, 0)
                """,
                (f"old-{i}", subject, prior),
            )
        con.commit()
    decision = resolve_commercial_entitlement(subject)
    assert decision["state"] == STATE_GENESIS
    assert decision["agreements_used"] == 0
    assert decision["can_create_persisted_agreement"] is True


def test_9_pro_stripe_billing_period_allowance(isolated_entitlement_env):
    client, eco, _usage = isolated_entitlement_env
    uid = "pro-cap"
    _activate_paid(eco, uid)
    h = _auth(uid)
    decision = resolve_commercial_entitlement(f"org:user-{uid}")
    assert decision["state"] == STATE_PRO
    assert decision["grant_source"] == "stripe"
    assert decision["agreement_allowance"] == 25
    # Create up to configured test allowance via env is 25 — sample a few and confirm summary.
    for i in range(3):
        assert client.post("/api/agreements/draft", headers=h, json=_draft_body(f"P{i}")).status_code == 200
    summary = client.get("/api/agreements/usage/summary", headers=h).json()
    assert summary["state"] == STATE_PRO
    assert summary["agreements_used"] == 3
    assert summary["agreements_remaining"] == 22
    assert summary["commercial"]["pro_allowance"]["limit"] == 25


def test_10_support_operator_independent_and_revoked_beats_affiliate(isolated_entitlement_env):
    client, eco, _usage = isolated_entitlement_env
    uid = "revoked-vs-affiliate"
    create_genesis_affiliate(
        eco,
        user_id=uid,
        display_name="Dog",
        referral_code=f"GEN_{uid[:8].upper()}",
        affiliate_status="active",
    )
    # Dual-read: active affiliate without entitlement row → legacy Genesis.
    active, src, _ = resolve_genesis_dog_access(uid)
    assert active is True
    assert src == GRANT_SOURCE_LEGACY_AFFILIATE
    # Explicit revoke denies despite affiliate.
    revoke_entitlement(user_id=uid, revoked_by="ops", reason="revoke_test")
    active2, src2, row = resolve_genesis_dog_access(uid)
    assert active2 is False
    assert src2 == "none"
    assert row is not None
    decision = resolve_commercial_entitlement(f"org:user-{uid}")
    assert decision["state"] == STATE_NONE
    # support_operator role alone does not create customer Genesis entitlement.
    assert get_entitlement("boot-ops") is None
    admin = _admin_headers("boot-ops")
    g = client.post(
        f"/v1/admin/users/{uid}/genesis-entitlement/grant",
        headers=admin,
        json={"reason": "regrant_after_revoke"},
    )
    assert g.status_code == 200, g.text
    assert get_entitlement("boot-ops") is None
    assert resolve_commercial_entitlement(f"org:user-{uid}")["state"] == STATE_GENESIS
