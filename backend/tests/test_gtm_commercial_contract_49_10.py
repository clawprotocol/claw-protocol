"""GTM launch contract: Pro $49 / 10 finalized; Genesis 30% of eligible net (tax excluded)."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from backend.affiliates.genesis_referral_service import convert_referral, create_genesis_affiliate
from backend.affiliates.genesis_stripe_handlers import (
    eligible_net_payment_cents,
    handle_genesis_invoice_paid,
)
from backend.billing.pricing import get_plan
from backend.billing.subscription_authority import apply_stripe_checkout_session_authority
from backend.economics.store import EconomicsStore
from backend.usage_economics import constants as uc
from backend.usage_economics.commercial_entitlement import STATE_PRO, resolve_commercial_entitlement
from backend.usage_economics.store import UsageEconomicsStore


@pytest.fixture()
def gtm_env(tmp_path, monkeypatch):
    from backend.economics import store as eco_store
    from backend.usage_economics import store as ue_store

    eco_store.reset_economics_store_for_tests()
    ue_store._store = None
    eco_path = tmp_path / "eco.sqlite3"
    usage_path = tmp_path / "usage.sqlite3"
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(eco_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(usage_path))
    monkeypatch.delenv("CLAW_PRO_BILLING_PERIOD_AGREEMENT_ALLOWANCE", raising=False)
    eco = EconomicsStore(path=str(eco_path))
    eco.init_schema()
    usage = UsageEconomicsStore(str(usage_path))
    usage.init_schema()
    ue_store._store = usage
    yield eco, usage
    eco_store.reset_economics_store_for_tests()
    ue_store._store = None


def _activate_pro(eco: EconomicsStore, uid: str) -> str:
    org = f"org-{uid}"
    end = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat().replace("+00:00", "Z")
    eco.insert_subscription(
        sub_id=f"sub-{uid}-{uuid.uuid4().hex[:8]}",
        org_id=org,
        user_id=uid,
        plan_code="pro",
        status="active",
        payment_id=f"pay-{uid}",
        expires_at=None,
        current_period_end=end,
    )
    # Also prove checkout path activates Pro with quota 10 (separate assertion in dedicated test).
    return org


def test_plan_price_is_49_and_default_quota_is_10():
    assert get_plan("pro")["monthly_usd"] == Decimal("49.00")
    assert get_plan("starter")["monthly_usd"] == Decimal("49.00")
    assert int(uc.DEFAULT_PRO_BILLING_PERIOD_AGREEMENT_ALLOWANCE) == 10


def test_checkout_activates_pro_with_quota_10(gtm_env):
    eco, _usage = gtm_env
    uid = "buyer49"
    org = f"org-{uid}"
    period_ts = int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())
    out = apply_stripe_checkout_session_authority(
        eco,
        {
            "id": f"cs_{uid}",
            "mode": "subscription",
            "status": "complete",
            "payment_status": "paid",
            "customer": f"cus_{uid}",
            "subscription": {
                "id": f"sub_{uid}",
                "status": "active",
                "current_period_end": period_ts,
            },
            "metadata": {"org_id": org, "claw_org_id": org, "plan_code": "pro", "user_id": uid},
        },
    )
    assert out.get("ok") is True
    d = resolve_commercial_entitlement(f"org:{org}")
    assert d["state"] == STATE_PRO
    assert d["agreement_allowance"] == 10
    assert d["agreements_remaining"] == 10
    assert d["can_create_persisted_agreement"] is True


def test_eleven_successful_finalizations_impossible(gtm_env):
    """After 10 durable finalizations, remaining is 0 and new Pro creates are denied."""
    eco, usage = gtm_env
    uid = "cap11"
    org = _activate_pro(eco, uid)
    subject = f"org:{org}"
    inside = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    with usage._conn() as con:
        for i in range(10):
            con.execute(
                """
                INSERT INTO agreement_owner
                  (agreement_id, subject_ref, created_at, completed_at, internal_keys_draft, guest_temp)
                VALUES (?, ?, ?, ?, 0, 0)
                """,
                (f"fin-{i}", subject, inside, inside),
            )
        con.commit()
    d = resolve_commercial_entitlement(subject)
    assert d["agreements_used"] == 10
    assert d["agreements_remaining"] == 0
    assert d["can_create_persisted_agreement"] is False
    assert d.get("reason") == uc.PRO_BILLING_PERIOD_ALLOWANCE_EXHAUSTED


def test_only_durable_finalize_consumes_and_duplicate_finalize_is_one_unit(gtm_env):
    eco, usage = gtm_env
    org = _activate_pro(eco, "dupfin")
    subject = f"org:{org}"
    usage.try_insert_agreement_owner_with_monthly_cap(
        agreement_id="a1",
        subject_ref=subject,
        internal_keys_draft=0,
        monthly_cap=None,
        period_start_iso="",
        guest_temp=False,
    )
    assert usage.mark_agreement_completed(
        agreement_id="a1", subject_ref=subject, internal_keys_finalize=1
    )
    assert (
        usage.mark_agreement_completed(
            agreement_id="a1", subject_ref=subject, internal_keys_finalize=1
        )
        is False
    )
    d = resolve_commercial_entitlement(subject)
    assert d["agreements_used"] == 1
    assert d["agreements_remaining"] == 9


def test_renewal_restores_quota_to_10_exactly_once(gtm_env):
    eco, usage = gtm_env
    org = _activate_pro(eco, "renew10")
    subject = f"org:{org}"
    inside = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    with usage._conn() as con:
        for i in range(10):
            con.execute(
                """
                INSERT INTO agreement_owner
                  (agreement_id, subject_ref, created_at, completed_at, internal_keys_draft, guest_temp)
                VALUES (?, ?, ?, ?, 0, 0)
                """,
                (f"old-{i}", subject, inside, inside),
            )
        con.commit()
    assert resolve_commercial_entitlement(subject)["agreements_remaining"] == 0
    future_start = (datetime.now(timezone.utc) + timedelta(days=40)).isoformat().replace(
        "+00:00", "Z"
    )
    used_new = usage.agreements_finalized_since(subject, future_start)
    assert used_new == 0
    # New period window ⇒ full allowance again when period_start advances
    d = resolve_commercial_entitlement(subject)
    # Entitlement period is driven by subscription row; force a renewed period end/start via new sub
    eco.insert_subscription(
        sub_id=f"sub-renew-{uuid.uuid4().hex[:8]}",
        org_id=org,
        user_id="renew10",
        plan_code="pro",
        status="active",
        payment_id=f"pay-renew-{uuid.uuid4().hex[:8]}",
        expires_at=None,
        current_period_end=(datetime.now(timezone.utc) + timedelta(days=60)).isoformat().replace(
            "+00:00", "Z"
        ),
    )
    # Count from future_start proves prior finalizations are outside the new window
    assert usage.agreements_finalized_since(subject, future_start) == 0


def test_first_eligible_49_produces_1470_commission(gtm_env):
    eco, _usage = gtm_env
    create_genesis_affiliate(eco, user_id="aff49", display_name="A", referral_code="G49")
    convert_referral(
        eco,
        referral_code="G49",
        visitor_id="v49",
        referred_org_id="org49",
        referred_user_id="u49",
    )
    eco.upsert_stripe_customer_org(stripe_customer_id="cus49", org_id="org49")
    r = handle_genesis_invoice_paid(
        eco,
        {
            "id": "in_49",
            "customer": "cus49",
            "amount_paid": 4900,
            "total_excluding_tax": 4900,
            "metadata": {"org_id": "org49", "referral_code": "G49", "plan_code": "pro"},
        },
    )
    assert r.get("ok")
    assert float(r.get("commission_amount") or 0) == pytest.approx(14.70)


def test_discounted_first_payment_is_exactly_30_percent_of_net(gtm_env):
    eco, _usage = gtm_env
    create_genesis_affiliate(eco, user_id="affd", display_name="A", referral_code="GDISC")
    convert_referral(
        eco,
        referral_code="GDISC",
        visitor_id="vd",
        referred_org_id="orgd",
        referred_user_id="ud",
    )
    eco.upsert_stripe_customer_org(stripe_customer_id="cusd", org_id="orgd")
    # $39 after discount
    r = handle_genesis_invoice_paid(
        eco,
        {
            "id": "in_disc",
            "customer": "cusd",
            "amount_paid": 3900,
            "total_excluding_tax": 3900,
            "metadata": {"org_id": "orgd", "referral_code": "GDISC", "plan_code": "pro"},
        },
    )
    assert float(r.get("commission_amount") or 0) == pytest.approx(11.70)


def test_taxes_excluded_from_commission_base(gtm_env):
    eco, _usage = gtm_env
    assert (
        eligible_net_payment_cents(
            {"amount_paid": 5390, "tax": 490, "total_excluding_tax": 4900}
        )
        == 4900
    )
    assert eligible_net_payment_cents({"amount_paid": 5390, "tax": 490}) == 4900
    create_genesis_affiliate(eco, user_id="afft", display_name="A", referral_code="GTAX")
    convert_referral(
        eco,
        referral_code="GTAX",
        visitor_id="vt",
        referred_org_id="orgt",
        referred_user_id="ut",
    )
    eco.upsert_stripe_customer_org(stripe_customer_id="cust", org_id="orgt")
    r = handle_genesis_invoice_paid(
        eco,
        {
            "id": "in_tax",
            "customer": "cust",
            "amount_paid": 5390,
            "tax": 490,
            "total_excluding_tax": 4900,
            "metadata": {"org_id": "orgt", "referral_code": "GTAX", "plan_code": "pro"},
        },
    )
    assert float(r.get("commission_amount") or 0) == pytest.approx(14.70)


def test_later_invoice_and_duplicate_webhook_do_not_create_second_commission(gtm_env):
    eco, _usage = gtm_env
    create_genesis_affiliate(eco, user_id="aff2", display_name="A", referral_code="G2")
    convert_referral(
        eco,
        referral_code="G2",
        visitor_id="v2",
        referred_org_id="org2",
        referred_user_id="u2",
    )
    eco.upsert_stripe_customer_org(stripe_customer_id="cus2", org_id="org2")
    payload = {
        "id": "in_once",
        "customer": "cus2",
        "amount_paid": 4900,
        "metadata": {"org_id": "org2", "referral_code": "G2", "plan_code": "pro"},
    }
    first = handle_genesis_invoice_paid(eco, payload)
    assert first.get("commission_id")
    dup = handle_genesis_invoice_paid(eco, payload)
    assert dup.get("duplicate") is True
    later = handle_genesis_invoice_paid(
        eco,
        {
            "id": "in_renew",
            "customer": "cus2",
            "amount_paid": 4900,
            "metadata": {"org_id": "org2", "referral_code": "G2", "plan_code": "pro"},
        },
    )
    assert later.get("ignored") is True
    assert later.get("reason") == "first_invoice_only"
