"""Server-authoritative commercial entitlement — Pro / Genesis / guest / none."""

from __future__ import annotations

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from backend.affiliates.genesis_referral_service import create_genesis_affiliate
from backend.economics.store import get_economics_store, reset_economics_store_for_tests
from backend.main import app
from backend.usage_economics import constants as uc
from backend.usage_economics.commercial_entitlement import (
    ENTITLEMENT_NONE,
    ENTITLEMENT_PAID_PRO,
    STATE_NONE,
    STATE_PRO,
    resolve_commercial_entitlement,
)
from backend.usage_economics.genesis_dog_entitlement import (
    GRANT_SOURCE_ADMIN,
    grant_entitlement,
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
    monkeypatch.setenv("CLAW_GENESIS_MONTHLY_AGREEMENT_ALLOWANCE", "3")
    monkeypatch.setenv("CLAW_PRO_BILLING_PERIOD_AGREEMENT_ALLOWANCE", "25")
    monkeypatch.setenv("CLAW_RATE_LIMIT_RPS", "1000")
    monkeypatch.setenv("CLAW_RATE_LIMIT_BURST", "1000")

    reset_economics_store_for_tests()
    eco = get_economics_store()
    eco.init_schema()
    usage = UsageEconomicsStore(str(tmp_path / "usage_eco.sqlite3"))
    usage.init_schema()
    ue_store._store = usage

    client = TestClient(app)
    yield client, eco, usage

    eco_store.reset_economics_store_for_tests()
    ue_store._store = None


def _auth(user_id: str) -> dict:
    return {"X-Claw-Test-Auth-User-Id": user_id, "X-Claw-Org-Id": f"user-{user_id}"}


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


def _activate_paid(eco, user_id: str) -> None:
    org = f"user-{user_id}"
    eco.insert_subscription(
        sub_id=f"sub-{uuid.uuid4().hex[:12]}",
        org_id=org,
        user_id=user_id,
        plan_code="pro",
        status="active",
        payment_id=f"pay-{uuid.uuid4().hex[:10]}",
        expires_at=None,
        current_period_end=None,
    )


def _make_genesis(eco, user_id: str, *, status: str = "active", code: str | None = None) -> None:
    create_genesis_affiliate(
        eco,
        user_id=user_id,
        display_name=f"Dog {user_id}",
        referral_code=code or f"GEN_{user_id[:8].upper()}",
        affiliate_status=status,
    )


def test_paid_user_creates_within_billing_period_allowance(isolated_entitlement_env):
    """Creates do not consume Pro quota — only successful finalizations do."""
    client, eco, _usage = isolated_entitlement_env
    uid = "paid-cap"
    _activate_paid(eco, uid)
    h = _auth(uid)
    for i in range(5):
        r = client.post("/api/agreements/draft", headers=h, json=_draft_body(f"P{i}"))
        assert r.status_code == 200, r.text
    summary = client.get("/api/agreements/usage/summary", headers=h)
    assert summary.status_code == 200
    body = summary.json()
    assert body["tier"] == "paid"
    assert body["state"] == STATE_PRO
    assert body["commercial"]["entitlement"] == ENTITLEMENT_PAID_PRO
    assert body["agreement_allowance"] == 25
    assert body["agreements_used"] == 0  # finalize meter, not create meter
    assert body["commercial"]["create_allowed"] is True
    assert (body.get("commercial") or {}).get("pro_allowance", {}).get("meter") == "finalized"


def test_active_genesis_affiliate_does_not_grant_create(isolated_entitlement_env):
    client, eco, _usage = isolated_entitlement_env
    uid = "genesis-ok"
    _make_genesis(eco, uid)
    h = _auth(uid)
    r = client.post("/api/agreements/draft", headers=h, json=_draft_body("G1"))
    assert r.status_code == 403, r.text
    summary = client.get("/api/agreements/usage/summary", headers=h).json()
    assert summary["commercial"]["entitlement"] == ENTITLEMENT_NONE
    assert summary["state"] == STATE_NONE
    assert summary["commercial"]["create_allowed"] is False
    assert summary["commercial"].get("affiliate_status") == "genesis"
    assert summary["commercial"]["genesis_allowance"] is None


def test_active_genesis_affiliate_create_denied_as_entitlement_required(isolated_entitlement_env):
    client, eco, _usage = isolated_entitlement_env
    uid = "genesis-cap"
    _make_genesis(eco, uid)
    h = _auth(uid)
    blocked = client.post("/api/agreements/draft", headers=h, json=_draft_body("G-over"))
    assert blocked.status_code == 403
    detail = blocked.json().get("detail") or {}
    assert detail.get("code") == uc.ENTITLEMENT_REQUIRED
    assert "Genesis" not in (detail.get("message") or "") or "affiliate" in (detail.get("message") or "").lower()
    # Message should point at Pro, not Genesis create allowance.
    assert "Pro" in (detail.get("message") or "")

    summary = client.get("/api/agreements/usage/summary", headers=h).json()
    assert summary["commercial"]["entitlement"] == ENTITLEMENT_NONE
    assert summary["commercial"]["create_allowed"] is False
    assert summary["commercial"]["reason"] == uc.ENTITLEMENT_REQUIRED


def test_pro_finalize_meter_idempotent_and_independent_of_affiliate(isolated_entitlement_env):
    from backend.usage_economics.policy import record_draft_created

    _client, eco, usage = isolated_entitlement_env
    uid = "pro-idem"
    subject = f"org:user-{uid}"
    _make_genesis(eco, uid)
    _activate_paid(eco, uid)
    aid = str(uuid.uuid4())
    record_draft_created(agreement_id=aid, subject_ref=subject, request_ip="127.0.0.1")
    record_draft_created(agreement_id=aid, subject_ref=subject, request_ip="127.0.0.1")
    assert usage.agreements_created_this_utc_month(subject) == 1
    d = resolve_commercial_entitlement(subject)
    assert d["state"] == STATE_PRO
    assert d["agreements_used"] == 0
    assert d.get("affiliate_status") == "genesis"


@pytest.mark.parametrize("status", ["paused", "revoked"])
def test_inactive_genesis_denied_complimentary_allowance(isolated_entitlement_env, status: str):
    client, eco, _usage = isolated_entitlement_env
    uid = f"genesis-{status}"
    _make_genesis(eco, uid, status=status, code=f"X{status[:4].upper()}")
    h = _auth(uid)
    summary = client.get("/api/agreements/usage/summary", headers=h).json()
    assert summary["commercial"]["entitlement"] in ("none", STATE_NONE)
    assert summary["state"] == STATE_NONE
    decision = resolve_commercial_entitlement(f"org:user-{uid}")
    assert decision["state"] == STATE_NONE
    assert decision["genesis_allowance"] is None


def test_ordinary_authenticated_user_has_no_free_tier(isolated_entitlement_env):
    """No recurring Free account — authenticated users need Pro."""
    client, eco, _usage = isolated_entitlement_env
    uid = "ordinary-none"
    h = _auth(uid)
    summary = client.get("/api/agreements/usage/summary", headers=h).json()
    assert summary["state"] == STATE_NONE
    assert summary["commercial"]["can_create_persisted_agreement"] is False
    blocked = client.post("/api/agreements/draft", headers=h, json=_draft_body("First"))
    assert blocked.status_code == 403
    detail = blocked.json().get("detail") or {}
    assert detail.get("code") == uc.ENTITLEMENT_REQUIRED


def test_admin_genesis_create_grant_issuance_retired(isolated_entitlement_env):
    from backend.usage_economics.genesis_dog_entitlement import GenesisCreateGrantIssuanceRetired

    uid = "admin-grant-user"
    with pytest.raises(GenesisCreateGrantIssuanceRetired):
        grant_entitlement(user_id=uid, granted_by="ops", grant_source=GRANT_SOURCE_ADMIN)
    d = resolve_commercial_entitlement(f"org:user-{uid}")
    assert d["state"] == STATE_NONE
    assert d["can_create_persisted_agreement"] is False


def test_paid_plus_genesis_prefers_paid(isolated_entitlement_env):
    client, eco, _usage = isolated_entitlement_env
    uid = "paid-and-genesis"
    _make_genesis(eco, uid)
    _activate_paid(eco, uid)
    h = _auth(uid)
    for i in range(4):
        assert client.post("/api/agreements/draft", headers=h, json=_draft_body(f"PG{i}")).status_code == 200
    summary = client.get("/api/agreements/usage/summary", headers=h).json()
    assert summary["commercial"]["entitlement"] == ENTITLEMENT_PAID_PRO
    assert summary["state"] == STATE_PRO
    assert summary["commercial"]["genesis_allowance"] is None


def test_forged_org_header_cannot_steal_genesis_allowance(isolated_entitlement_env):
    client, eco, _usage = isolated_entitlement_env
    _make_genesis(eco, "real-genesis-dog")
    forged = {
        "X-Claw-Test-Auth-User-Id": "ordinary-spoof",
        "X-Claw-Org-Id": "user-real-genesis-dog",
    }
    denied = client.post("/api/agreements/draft", headers=forged, json=_draft_body("steal"))
    assert denied.status_code in (401, 403)
    summary = client.get("/api/agreements/usage/summary", headers=forged)
    assert summary.status_code in (401, 403)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("", 5),
        ("0", 5),
        ("-1", 5),
        ("not-a-number", 5),
        ("101", 5),
        ("1", 1),
        ("100", 100),
        ("5", 5),
    ],
)
def test_genesis_allowance_env_bounds(monkeypatch: pytest.MonkeyPatch, raw: str, expected: int):
    from backend.usage_economics.commercial_entitlement import genesis_monthly_agreement_allowance

    if raw == "":
        monkeypatch.delenv("CLAW_GENESIS_MONTHLY_AGREEMENT_ALLOWANCE", raising=False)
    else:
        monkeypatch.setenv("CLAW_GENESIS_MONTHLY_AGREEMENT_ALLOWANCE", raw)
    assert genesis_monthly_agreement_allowance() == expected
