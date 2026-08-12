"""Pro UTC calendar-month quota (monthly+annual) and Genesis annual first-payment commission."""

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
from backend.economics.store import EconomicsStore
from backend.usage_economics import commercial_entitlement as ce
from backend.usage_economics import constants as uc
from backend.usage_economics.commercial_entitlement import STATE_PRO, resolve_commercial_entitlement
from backend.usage_economics.store import UsageEconomicsStore

# Capture before any test monkeypatch so re-freezes never recurse into a prior pin.
_REAL_UTC_MONTH_PERIOD_BOUNDS = ce.utc_month_period_bounds


@pytest.fixture()
def env(tmp_path, monkeypatch):
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


def _activate(eco: EconomicsStore, uid: str, *, annual: bool) -> str:
    org = f"org-{uid}"
    days = 365 if annual else 30
    end = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat().replace("+00:00", "Z")
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
    return org


def _insert_finalized(usage: UsageEconomicsStore, subject: str, completed_at: str, n: int, prefix: str) -> None:
    with usage._conn() as con:
        for i in range(n):
            con.execute(
                """
                INSERT INTO agreement_owner
                  (agreement_id, subject_ref, created_at, completed_at, internal_keys_draft, guest_temp)
                VALUES (?, ?, ?, ?, 0, 0)
                """,
                (f"{prefix}-{i}", subject, completed_at, completed_at),
            )
        con.commit()


def _freeze_quota_month(monkeypatch, freeze: datetime) -> None:
    """Pin UTC month bounds using the real implementation (safe to call repeatedly)."""

    def _pinned(now=None):  # noqa: ARG001
        return _REAL_UTC_MONTH_PERIOD_BOUNDS(freeze)

    monkeypatch.setattr(ce, "utc_month_period_bounds", _pinned)


def test_plan_annual_usd_is_490():
    assert get_plan("pro")["monthly_usd"] == Decimal("49.00")
    assert get_plan("pro")["annual_usd"] == Decimal("490.00")


def test_utc_month_bounds_are_half_open():
    start, end = ce.utc_month_period_bounds(datetime(2026, 1, 15, tzinfo=timezone.utc))
    assert start == "2026-01-01T00:00:00+00:00".replace("+00:00", "Z") or start.startswith("2026-01-01T00:00:00")
    assert end.startswith("2026-02-01T00:00:00")


def test_monthly_ten_block_eleventh(env, monkeypatch):
    eco, usage = env
    freeze = datetime(2026, 3, 10, 12, 0, 0, tzinfo=timezone.utc)
    _freeze_quota_month(monkeypatch, freeze)
    org = _activate(eco, "m10", annual=False)
    subject = f"org:{org}"
    _insert_finalized(usage, subject, freeze.isoformat().replace("+00:00", "Z"), 10, "m")
    d = resolve_commercial_entitlement(subject)
    assert d["state"] == STATE_PRO
    assert d["agreements_used"] == 10
    assert d["agreements_remaining"] == 0
    assert d["can_create_persisted_agreement"] is False


def test_annual_identical_ten_per_month(env, monkeypatch):
    eco, usage = env
    freeze = datetime(2026, 3, 10, 12, 0, 0, tzinfo=timezone.utc)
    _freeze_quota_month(monkeypatch, freeze)
    # Annual Stripe period ends far in the future — must not become unlimited or future-dated.
    org = _activate(eco, "a10", annual=True)
    subject = f"org:{org}"
    d0 = resolve_commercial_entitlement(subject)
    assert d0["pro_allowance"]["window"] == "utc_calendar_month"
    assert d0["pro_allowance"]["period_start"].startswith("2026-03-01")
    assert d0["pro_allowance"]["resets_at"].startswith("2026-04-01")
    assert d0["agreements_remaining"] == 10
    _insert_finalized(usage, subject, freeze.isoformat().replace("+00:00", "Z"), 10, "a")
    d = resolve_commercial_entitlement(subject)
    assert d["agreements_remaining"] == 0
    assert d["can_create_persisted_agreement"] is False


def test_annual_use_in_first_and_middle_months_counts(env, monkeypatch):
    eco, usage = env
    org = _activate(eco, "amid", annual=True)
    subject = f"org:{org}"

    jan = datetime(2026, 1, 5, tzinfo=timezone.utc)
    _freeze_quota_month(monkeypatch, jan)
    _insert_finalized(usage, subject, "2026-01-05T12:00:00Z", 3, "jan")
    assert resolve_commercial_entitlement(subject)["agreements_used"] == 3

    jun = datetime(2026, 6, 15, tzinfo=timezone.utc)
    _freeze_quota_month(monkeypatch, jun)
    _insert_finalized(usage, subject, "2026-06-15T12:00:00Z", 4, "jun")
    d = resolve_commercial_entitlement(subject)
    assert d["agreements_used"] == 4
    assert d["agreements_remaining"] == 6
    # January finals are outside June window
    assert usage.agreements_finalized_in_period(subject, "2026-06-01T00:00:00Z", "2026-07-01T00:00:00Z") == 4


def test_december_january_rollover(env, monkeypatch):
    eco, usage = env
    org = _activate(eco, "ye", annual=False)
    subject = f"org:{org}"
    dec = datetime(2026, 12, 20, tzinfo=timezone.utc)
    _freeze_quota_month(monkeypatch, dec)
    _insert_finalized(usage, subject, "2026-12-20T10:00:00Z", 10, "dec")
    assert resolve_commercial_entitlement(subject)["agreements_remaining"] == 0

    jan = datetime(2027, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    _freeze_quota_month(monkeypatch, jan)
    d = resolve_commercial_entitlement(subject)
    assert d["agreements_used"] == 0
    assert d["agreements_remaining"] == 10
    assert d["pro_allowance"]["period_start"].startswith("2027-01-01")


def test_leap_day_february_boundary(env, monkeypatch):
    eco, usage = env
    org = _activate(eco, "leap", annual=True)
    subject = f"org:{org}"
    feb = datetime(2028, 2, 29, 15, 0, 0, tzinfo=timezone.utc)
    start, end = ce.utc_month_period_bounds(feb)
    assert start.startswith("2028-02-01")
    assert end.startswith("2028-03-01")
    _freeze_quota_month(monkeypatch, feb)
    _insert_finalized(usage, subject, "2028-02-29T15:00:00Z", 1, "leap")
    assert resolve_commercial_entitlement(subject)["agreements_used"] == 1


def test_half_open_boundary_inclusion(env, monkeypatch):
    eco, usage = env
    org = _activate(eco, "bound", annual=False)
    subject = f"org:{org}"
    mar = datetime(2026, 3, 15, tzinfo=timezone.utc)
    _freeze_quota_month(monkeypatch, mar)
    with usage._conn() as con:
        con.execute(
            """
            INSERT INTO agreement_owner
              (agreement_id, subject_ref, created_at, completed_at, internal_keys_draft, guest_temp)
            VALUES (?, ?, ?, ?, 0, 0)
            """,
            ("at-start", subject, "2026-03-01T00:00:00Z", "2026-03-01T00:00:00Z"),
        )
        con.execute(
            """
            INSERT INTO agreement_owner
              (agreement_id, subject_ref, created_at, completed_at, internal_keys_draft, guest_temp)
            VALUES (?, ?, ?, ?, 0, 0)
            """,
            ("at-end", subject, "2026-04-01T00:00:00Z", "2026-04-01T00:00:00Z"),
        )
        con.commit()
    d = resolve_commercial_entitlement(subject)
    assert d["agreements_used"] == 1  # start included; next-month boundary excluded


def test_failed_and_duplicate_do_not_consume(env, monkeypatch):
    eco, usage = env
    # Use the real current UTC month so mark_agreement_completed()'s now() lands in-window.
    _freeze_quota_month(monkeypatch, datetime.now(timezone.utc))
    org = _activate(eco, "dup", annual=False)
    subject = f"org:{org}"
    usage.try_insert_agreement_owner_with_monthly_cap(
        agreement_id="only-one",
        subject_ref=subject,
        internal_keys_draft=0,
        monthly_cap=None,
        period_start_iso="",
        guest_temp=False,
    )
    assert usage.mark_agreement_completed(
        agreement_id="only-one", subject_ref=subject, internal_keys_finalize=1
    )
    assert (
        usage.mark_agreement_completed(
            agreement_id="only-one", subject_ref=subject, internal_keys_finalize=1
        )
        is False
    )
    # Incomplete / not completed does not count
    usage.try_insert_agreement_owner_with_monthly_cap(
        agreement_id="draft-only",
        subject_ref=subject,
        internal_keys_draft=0,
        monthly_cap=None,
        period_start_iso="",
        guest_temp=False,
    )
    d = resolve_commercial_entitlement(subject)
    assert d["agreements_used"] == 1


def test_cancel_at_period_end_keeps_monthly_quota_window(env, monkeypatch):
    eco, _usage = env
    freeze = datetime(2026, 5, 10, tzinfo=timezone.utc)
    _freeze_quota_month(monkeypatch, freeze)
    uid = "cancel"
    org = f"org-{uid}"
    # Access remains through a still-future Stripe period end; quota stays UTC-month.
    still_entitled_end = (datetime.now(timezone.utc) + timedelta(days=20)).isoformat().replace(
        "+00:00", "Z"
    )
    eco.insert_subscription(
        sub_id=f"sub-{uid}",
        org_id=org,
        user_id=uid,
        plan_code="pro",
        status="active",
        payment_id=f"pay-{uid}",
        expires_at=None,
        current_period_end=still_entitled_end,
        canceled_at=None,
    )
    subject = f"org:{org}"
    d = resolve_commercial_entitlement(subject)
    assert d["state"] == STATE_PRO
    assert d["pro_allowance"]["window"] == "utc_calendar_month"
    assert d["pro_allowance"]["period_start"].startswith("2026-05-01")
    assert d["agreements_remaining"] == 10


def test_annual_not_future_dated_or_unlimited(env, monkeypatch):
    eco, usage = env
    freeze = datetime(2026, 7, 1, tzinfo=timezone.utc)
    _freeze_quota_month(monkeypatch, freeze)
    org = _activate(eco, "nofuture", annual=True)
    subject = f"org:{org}"
    d = resolve_commercial_entitlement(subject)
    start = d["pro_allowance"]["period_start"]
    end = d["pro_allowance"]["period_end"]
    assert start.startswith("2026-07-01")
    assert end.startswith("2026-08-01")
    # Must not span the annual year
    assert "2027-" not in end
    assert d["agreement_allowance"] == 10


def test_genesis_annual_490_produces_147(env):
    eco, _usage = env
    create_genesis_affiliate(eco, user_id="affa", display_name="A", referral_code="GA49")
    convert_referral(
        eco,
        referral_code="GA49",
        visitor_id="va49",
        referred_org_id="orga49",
        referred_user_id="ua49",
    )
    eco.upsert_stripe_customer_org(stripe_customer_id="cusa49", org_id="orga49")
    r = handle_genesis_invoice_paid(
        eco,
        {
            "id": "in_a490",
            "customer": "cusa49",
            "amount_paid": 49000,
            "total_excluding_tax": 49000,
            "metadata": {"org_id": "orga49", "referral_code": "GA49", "plan_code": "pro"},
        },
    )
    assert r.get("ok")
    assert float(r.get("commission_amount") or 0) == pytest.approx(147.00)


def test_genesis_large_net_4900_and_49000_usd(env):
    assert eligible_net_payment_cents({"amount_paid": 4900, "total_excluding_tax": 4900}) == 4900
    assert eligible_net_payment_cents({"amount_paid": 49000, "total_excluding_tax": 49000}) == 49000
    eco, _ = env
    create_genesis_affiliate(eco, user_id="affb", display_name="B", referral_code="GBIG")
    convert_referral(
        eco,
        referral_code="GBIG",
        visitor_id="vbig",
        referred_org_id="orgbig",
        referred_user_id="ubig",
    )
    eco.upsert_stripe_customer_org(stripe_customer_id="cusbig", org_id="orgbig")
    # $4,900 net → $1,470 commission
    r = handle_genesis_invoice_paid(
        eco,
        {
            "id": "in_big",
            "customer": "cusbig",
            "amount_paid": 490_000,
            "total_excluding_tax": 490_000,
            "metadata": {"org_id": "orgbig", "referral_code": "GBIG", "plan_code": "pro"},
        },
    )
    assert float(r.get("commission_amount") or 0) == pytest.approx(1470.00)

    create_genesis_affiliate(eco, user_id="affc", display_name="C", referral_code="GHIUGE")
    convert_referral(
        eco,
        referral_code="GHIUGE",
        visitor_id="vhuge",
        referred_org_id="orghuge",
        referred_user_id="uhuge",
    )
    eco.upsert_stripe_customer_org(stripe_customer_id="cushuge", org_id="orghuge")
    # $49,000 net → $14,700 commission
    r2 = handle_genesis_invoice_paid(
        eco,
        {
            "id": "in_huge",
            "customer": "cushuge",
            "amount_paid": 4_900_000,
            "total_excluding_tax": 4_900_000,
            "metadata": {"org_id": "orghuge", "referral_code": "GHIUGE", "plan_code": "pro"},
        },
    )
    assert float(r2.get("commission_amount") or 0) == pytest.approx(14700.00)


def test_annual_discount_and_tax_exclusion(env):
    eco, _ = env
    create_genesis_affiliate(eco, user_id="afft", display_name="T", referral_code="GTAX")
    convert_referral(
        eco,
        referral_code="GTAX",
        visitor_id="vtax",
        referred_org_id="orgtax",
        referred_user_id="utax",
    )
    eco.upsert_stripe_customer_org(stripe_customer_id="custax", org_id="orgtax")
    # $490 list, $50 discount → $440 net excl tax; tax $40 should not increase commission base
    r = handle_genesis_invoice_paid(
        eco,
        {
            "id": "in_tax",
            "customer": "custax",
            "amount_paid": 48000,
            "total_excluding_tax": 44000,
            "tax": 4000,
            "metadata": {"org_id": "orgtax", "referral_code": "GTAX", "plan_code": "pro"},
        },
    )
    assert float(r.get("commission_amount") or 0) == pytest.approx(132.00)


def test_annual_duplicate_and_renewal_no_second_commission(env):
    eco, _ = env
    create_genesis_affiliate(eco, user_id="affd", display_name="D", referral_code="GDUP")
    convert_referral(
        eco,
        referral_code="GDUP",
        visitor_id="vdup",
        referred_org_id="orgdup",
        referred_user_id="udup",
    )
    eco.upsert_stripe_customer_org(stripe_customer_id="cusdup", org_id="orgdup")
    first = {
        "id": "in_dup1",
        "customer": "cusdup",
        "amount_paid": 49000,
        "total_excluding_tax": 49000,
        "metadata": {"org_id": "orgdup", "referral_code": "GDUP", "plan_code": "pro"},
    }
    assert handle_genesis_invoice_paid(eco, first).get("ok")
    dup = handle_genesis_invoice_paid(eco, dict(first))  # same invoice id
    assert dup.get("duplicate") is True
    renewal = handle_genesis_invoice_paid(
        eco,
        {
            "id": "in_dup2",
            "customer": "cusdup",
            "amount_paid": 49000,
            "total_excluding_tax": 49000,
            "billing_reason": "subscription_cycle",
            "metadata": {"org_id": "orgdup", "referral_code": "GDUP", "plan_code": "pro"},
        },
    )
    assert renewal.get("ignored") is True
    assert renewal.get("reason") == "first_invoice_only"
