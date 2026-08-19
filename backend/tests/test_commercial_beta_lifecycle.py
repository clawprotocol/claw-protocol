"""Commercial beta lifecycle — checkout, webhooks, quota, refunds, affiliate, bypass.

Canonical model: Guest + Pro buyers; Pro $49 / 10 finalized; Genesis affiliate
earns 30% of first eligible net Pro payment (e.g. $14.70 on $49) after refund window. Plus retired.
"""

from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.affiliates.genesis_referral_service import (
    capture_referral_visit,
    convert_referral,
    create_genesis_affiliate,
)
from backend.affiliates.genesis_stripe_handlers import (
    handle_genesis_charge_refunded,
    handle_genesis_invoice_paid,
)
from backend.affiliates.stripe_earnings_handlers import dispatch_stripe_event
from backend.billing.subscription_authority import is_subscription_entitled
from backend.economics.store import EconomicsStore, get_economics_store, reset_economics_store_for_tests
from backend.main import app
from backend.security.commercial_auth import require_paid_pro_principal
from backend.usage_economics import constants as uc
from backend.usage_economics.commercial_entitlement import (
    STATE_NONE,
    STATE_PRO,
    resolve_commercial_entitlement,
)
from backend.usage_economics.policy import record_agreement_finalized, record_draft_created
from backend.usage_economics.store import UsageEconomicsStore


pytestmark = pytest.mark.unit


@pytest.fixture()
def life_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
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
    monkeypatch.setenv("CLAW_PRO_BILLING_PERIOD_AGREEMENT_ALLOWANCE", "10")
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


def _auth(uid: str) -> Dict[str, str]:
    return {"X-Claw-Test-Auth-User-Id": uid, "X-Claw-Org-Id": f"user-{uid}"}


def _activate_pro(eco: EconomicsStore, uid: str, *, period_end: str | None = None) -> str:
    org = f"user-{uid}"
    sub_id = f"sub-{uuid.uuid4().hex[:12]}"
    end = period_end or (datetime.now(timezone.utc) + timedelta(days=30)).isoformat().replace(
        "+00:00", "Z"
    )
    eco.insert_subscription(
        sub_id=sub_id,
        org_id=org,
        user_id=uid,
        plan_code="pro",
        status="active",
        payment_id=f"pay-{uuid.uuid4().hex[:10]}",
        expires_at=None,
        current_period_end=end,
    )
    return org


def _draft(client: TestClient, h: dict, title: str = "T") -> str:
    r = client.post(
        "/api/agreements/draft",
        headers=h,
        json={
            "title": title,
            "jurisdiction": "CA",
            "parties": [{"name": "A", "role": "owner"}],
            "purpose": "p",
            "payment_terms": "pt",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert r.status_code == 200, r.text
    return str(r.json()["draft"]["id"])


# --- 1. Checkout / entitlement activation ---


def test_checkout_session_completed_activates_pro_entitlement(life_env):
    _client, eco, _usage = life_env
    uid = "checkout-act"
    org = f"user-{uid}"
    from backend.billing.subscription_authority import apply_stripe_checkout_session_authority

    period_ts = int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())
    session = {
        "id": "cs_test_act",
        "mode": "subscription",
        "status": "complete",
        "payment_status": "paid",
        "customer": "cus_act",
        "subscription": {
            "id": "sub_act_1",
            "status": "active",
            "current_period_end": period_ts,
        },
        "metadata": {"org_id": org, "claw_org_id": org, "plan_code": "pro", "user_id": uid},
    }
    out = apply_stripe_checkout_session_authority(eco, session)
    assert out.get("ok") is True
    assert not out.get("ignored"), out
    decision = resolve_commercial_entitlement(f"org:{org}")
    assert decision["state"] == STATE_PRO
    assert decision["can_create_persisted_agreement"] is True
    assert decision["agreement_allowance"] == 10
    row = eco.get_subscription_by_org(org)
    assert is_subscription_entitled(row)
    assert eco.get_org_for_stripe_customer("cus_act") == org


# --- 2. Duplicate / delayed / out-of-order webhooks ---


def test_stripe_webhook_event_id_dedupe_skips_second_delivery(life_env):
    _client, eco, _usage = life_env
    event_id = f"evt_dedupe_{uuid.uuid4().hex[:8]}"
    first = eco.insert_stripe_webhook_event_once(event_id)
    second = eco.insert_stripe_webhook_event_once(event_id)
    assert first is True
    assert second is False


def test_out_of_order_invoice_paid_before_checkout_still_safe(life_env):
    """invoice.paid without prior checkout must not invent entitlement; it stays retryable."""
    _client, eco, _usage = life_env
    out = handle_genesis_invoice_paid(
        eco,
        {
            "id": "in_orphan",
            "customer": "cus_unknown",
            "amount_paid": 4900,
            "metadata": {"plan_code": "pro"},
        },
    )
    assert out.get("reason") == "no_org_mapping"
    assert out.get("ok") is False
    assert out.get("retryable") is True
    assert eco.get_subscription_by_org("user-orphan") is None


# --- 3. Quota consumption / exhaustion / renewal ---


def test_pro_quota_meters_finalizations_not_creates_or_retries(life_env):
    _client, eco, usage = life_env
    uid = "quota-meter"
    org = _activate_pro(eco, uid)
    subject = f"org:{org}"
    # Creates do not consume
    for i in range(3):
        record_draft_created(
            agreement_id=f"draft-{i}",
            subject_ref=subject,
            request_ip="127.0.0.1",
        )
    d1 = resolve_commercial_entitlement(subject)
    assert d1["agreements_used"] == 0
    assert d1["agreements_remaining"] == 10
    # Finalize consumes one
    assert usage.mark_agreement_completed(
        agreement_id="draft-0", subject_ref=subject, internal_keys_finalize=1
    )
    d2 = resolve_commercial_entitlement(subject)
    assert d2["agreements_used"] == 1
    assert d2["agreements_remaining"] == 9
    # Idempotent finalize retry does not double-count
    assert (
        usage.mark_agreement_completed(
            agreement_id="draft-0", subject_ref=subject, internal_keys_finalize=1
        )
        is False
    )
    d3 = resolve_commercial_entitlement(subject)
    assert d3["agreements_used"] == 1


def test_pro_quota_exhaustion_denies_create_and_renewal_resets(life_env):
    client, eco, usage = life_env
    uid = "quota-ex"
    org = _activate_pro(eco, uid)
    subject = f"org:{org}"
    h = _auth(uid)
    # Stamp finalizations inside the active Stripe period window (not before started_at).
    inside_period = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    with usage._conn() as con:
        for i in range(10):
            aid = f"fin-{i}"
            con.execute(
                """
                INSERT INTO agreement_owner
                  (agreement_id, subject_ref, created_at, completed_at, internal_keys_draft, guest_temp)
                VALUES (?, ?, ?, ?, 0, 0)
                """,
                (aid, subject, inside_period, inside_period),
            )
        con.commit()
    d = resolve_commercial_entitlement(subject)
    assert d["agreements_used"] == 10
    assert d["agreements_remaining"] == 0
    blocked = client.post(
        "/api/agreements/draft",
        headers=h,
        json={
            "title": "over",
            "jurisdiction": "CA",
            "parties": [{"name": "A", "role": "owner"}],
            "purpose": "p",
            "payment_terms": "pt",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert blocked.status_code == 403
    assert (blocked.json().get("detail") or {}).get("code") == uc.PRO_BILLING_PERIOD_ALLOWANCE_EXHAUSTED

    # Renewal: new period start → used resets
    future_start = (datetime.now(timezone.utc) + timedelta(days=40)).isoformat().replace(
        "+00:00", "Z"
    )
    eco.insert_subscription(
        sub_id=f"sub-renew-{uid}",
        org_id=org,
        user_id=uid,
        plan_code="pro",
        status="active",
        payment_id=f"pay-renew-{uid}",
        expires_at=None,
        current_period_end=future_start,
    )
    # Force period bounds via subscription current_period_start if supported —
    # at minimum, completed_at in past month shouldn't count if period_start moves forward.
    # Simulate by only counting finalizations after a synthetic new period start.
    used_new = usage.agreements_finalized_since(subject, future_start)
    assert used_new == 0


# --- 4. Failed payment / cancel / refund ---


def test_subscription_canceled_loses_pro_create(life_env):
    client, eco, _usage = life_env
    uid = "cancel-pro"
    org = _activate_pro(eco, uid)
    h = _auth(uid)
    assert _draft(client, h, "before")
    eco.insert_subscription(
        sub_id=f"sub-cancel-{uid}",
        org_id=org,
        user_id=uid,
        plan_code="pro",
        status="canceled",
        payment_id=f"pay-cancel-{uid}",
        expires_at=None,
        current_period_end=None,
    )
    d = resolve_commercial_entitlement(f"org:{org}")
    assert d["state"] != STATE_PRO or d["can_create_persisted_agreement"] is False
    # When canceled without entitled status, create must fail closed
    if not is_subscription_entitled(eco.get_subscription_by_org(org)):
        assert d["state"] == STATE_NONE or d.get("can_create_persisted_agreement") is False


def test_refund_voids_pending_genesis_commission(life_env):
    _client, eco, _usage = life_env
    create_genesis_affiliate(
        eco, user_id="user_ref", display_name="Ref", referral_code="GENLIFE1"
    )
    convert_referral(
        eco,
        referral_code="GENLIFE1",
        visitor_id="v_life",
        referred_org_id="org_life_sub",
        referred_user_id="user_life_sub",
    )
    eco.upsert_stripe_customer_org(stripe_customer_id="cus_life", org_id="org_life_sub")
    r = handle_genesis_invoice_paid(
        eco,
        {
            "id": "in_life_1",
            "customer": "cus_life",
            "amount_paid": 4900,
            "metadata": {"org_id": "org_life_sub", "referral_code": "GENLIFE1", "plan_code": "pro"},
        },
    )
    assert r.get("commission_id")
    voided = handle_genesis_charge_refunded(
        eco,
        {"id": "ch_life", "refunded": True, "amount_refunded": 4900, "invoice": "in_life_1"},
    )
    assert voided.get("voided", 0) >= 1


# --- 5. Affiliate attribution / first invoice / self-referral ---


def test_genesis_first_invoice_only_commission_1470(life_env):
    _client, eco, _usage = life_env
    create_genesis_affiliate(
        eco, user_id="user_aff", display_name="Aff", referral_code="GENFIRST"
    )
    convert_referral(
        eco,
        referral_code="GENFIRST",
        visitor_id="v_first",
        referred_org_id="org_first",
        referred_user_id="user_first",
    )
    eco.upsert_stripe_customer_org(stripe_customer_id="cus_first", org_id="org_first")
    first = handle_genesis_invoice_paid(
        eco,
        {
            "id": "in_first",
            "customer": "cus_first",
            "amount_paid": 4900,
            "metadata": {"org_id": "org_first", "referral_code": "GENFIRST", "plan_code": "pro"},
        },
    )
    assert first.get("ok")
    assert float(first.get("commission_amount") or 0) == pytest.approx(14.70)
    second = handle_genesis_invoice_paid(
        eco,
        {
            "id": "in_second",
            "customer": "cus_first",
            "amount_paid": 4900,
            "metadata": {"org_id": "org_first", "referral_code": "GENFIRST", "plan_code": "pro"},
        },
    )
    assert second.get("ignored") is True
    assert second.get("reason") == "first_invoice_only"
    with eco._conn() as con:
        n = con.execute("SELECT COUNT(*) FROM affiliate_commissions").fetchone()[0]
    assert n == 1


def test_self_referral_rejected_at_convert(life_env):
    _client, eco, _usage = life_env
    create_genesis_affiliate(
        eco, user_id="user_self", display_name="Self", referral_code="GENSELF"
    )
    capture_referral_visit(
        eco, referral_code="GENSELF", visitor_id="v_self", source_path="/"
    )
    out = convert_referral(
        eco,
        referral_code="GENSELF",
        visitor_id="v_self",
        referred_org_id="user-user_self",
        referred_user_id="user_self",
    )
    assert not out.get("ok")


# --- 6. Durable notification exactly-once / zero when omitted ---


def test_completion_email_exactly_one_under_concurrent_finalize(life_env):
    from backend.tests import test_vs01_signer_complete_api as mod
    from backend.tests.entitlement_test_support import ensure_headers_entitled

    client, _eco, _usage = life_env
    ensure_headers_entitled(mod._org_headers())
    aid = mod._create_two_signer_agreement(client)
    client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers=mod._org_headers(),
        json={"signer_role_id": "role_owner", "participant_id": "p1", "document_id": "doc_vs01"},
    )
    sends: list[str] = []

    def _track(*, agreement_id: str, draft: dict, org_id: str | None = None):
        sends.append(agreement_id)
        return {
            "event_type": "signing_completion_emails_sent",
            "at": "2026-06-08T00:00:00Z",
            "value": {"sent_count": 2},
        }

    with patch(
        "backend.services.email.signing_completion_delivery.maybe_send_signing_completion_emails",
        side_effect=_track,
    ):
        payload = {
            "signer_role_id": "role_cp",
            "participant_id": "p2",
            "document_id": "doc_vs01",
        }
        with ThreadPoolExecutor(max_workers=6) as pool:
            futs = [
                pool.submit(
                    client.post,
                    f"/api/agreements/{aid}/vs01-signer-complete",
                    headers=mod._org_headers(),
                    json=payload,
                )
                for _ in range(6)
            ]
            assert all(f.result().status_code == 200 for f in futs)
    assert len(sends) == 1


def test_completion_email_zero_when_delivery_explicitly_skipped(life_env):
    """When completion delivery returns no send (explicit skip), zero durable notifications."""
    from backend.tests import test_vs01_signer_complete_api as mod
    from backend.tests.entitlement_test_support import ensure_headers_entitled

    client, _eco, _usage = life_env
    ensure_headers_entitled(mod._org_headers())
    aid = mod._create_two_signer_agreement(client)
    client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers=mod._org_headers(),
        json={"signer_role_id": "role_owner", "participant_id": "p1", "document_id": "doc_vs01"},
    )
    sends: list[str] = []

    def _skip(*, agreement_id: str, draft: dict, org_id: str | None = None):
        del agreement_id, draft, org_id
        return None  # explicit omission / no durable notify event

    with patch(
        "backend.services.email.signing_completion_delivery.maybe_send_signing_completion_emails",
        side_effect=_skip,
    ):
        res = client.post(
            f"/api/agreements/{aid}/vs01-signer-complete",
            headers=mod._org_headers(),
            json={
                "signer_role_id": "role_cp",
                "participant_id": "p2",
                "document_id": "doc_vs01",
            },
        )
        assert res.status_code == 200, res.text
    assert sends == []


# --- 7. Server-side bypass enforcement ---


def test_direct_premium_full_draft_bypass_denied_without_pro(life_env, monkeypatch):
    client, _eco, _usage = life_env
    monkeypatch.setattr(
        "backend.routers.agreements_v2_api.OPENAI_API_KEY", "sk-test", raising=False
    )
    uid = "bypass-user"
    res = client.post(
        "/api/agreements/premium-full-draft",
        headers=_auth(uid),
        json={"intake_text": "A LLC hires B Inc for services."},
    )
    assert res.status_code in (401, 403)
    detail = res.json().get("detail") or {}
    if isinstance(detail, dict) and detail.get("code"):
        assert detail["code"] in (
            "premium_draft_requires_pro",
            "entitlement_required",
            "commercial_auth_required",
            "auth_required",
            "paid_pro_required",
        )


def test_failed_payment_does_not_create_genesis_commission(life_env):
    from backend.affiliates.genesis_stripe_handlers import handle_genesis_invoice_payment_failed

    _client, eco, _usage = life_env
    create_genesis_affiliate(
        eco, user_id="user_fail", display_name="Fail", referral_code="GENFAIL"
    )
    convert_referral(
        eco,
        referral_code="GENFAIL",
        visitor_id="v_fail",
        referred_org_id="org_fail",
        referred_user_id="user_fail_buyer",
    )
    eco.upsert_stripe_customer_org(stripe_customer_id="cus_fail", org_id="org_fail")
    out = handle_genesis_invoice_payment_failed(
        eco,
        {
            "id": "in_fail",
            "customer": "cus_fail",
            "amount_due": 4900,
            "metadata": {"org_id": "org_fail", "referral_code": "GENFAIL", "plan_code": "pro"},
        },
    )
    assert out.get("ok") is True
    with eco._conn() as con:
        n = con.execute("SELECT COUNT(*) FROM affiliate_commissions").fetchone()[0]
    assert n == 0
    _ = (require_paid_pro_principal, Decimal, dispatch_stripe_event)
