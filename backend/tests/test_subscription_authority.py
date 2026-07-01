"""Canonical subscription authority — Stripe lifecycle and entitlement."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from backend.affiliates.stripe_earnings_handlers import (
    dispatch_stripe_event,
    handle_subscription_deleted,
    handle_subscription_updated,
)
from backend.billing.subscription_authority import (
    apply_invoice_paid_subscription_renewal,
    apply_stripe_subscription_object,
    is_subscription_entitled,
    stripe_timestamp_to_iso,
)
from backend.economics.store import EconomicsStore, reset_economics_store_for_tests


@pytest.fixture()
def economics_store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> EconomicsStore:
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite"))
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite"))
    reset_economics_store_for_tests()
    from backend.payments.store import reset_onramp_store_for_tests
    import backend.treasury.treasury_store as treasury_mod

    reset_onramp_store_for_tests()
    treasury_mod._store = None
    eco = EconomicsStore(path=str(tmp_path / "economics.sqlite"))
    eco.init_schema()
    return eco


def _future_ts(days: int = 30) -> int:
    return int((datetime.now(timezone.utc) + timedelta(days=days)).timestamp())


def _stripe_sub(*, org_id: str, status: str = "active", sub_id: str = "sub_test") -> dict:
    return {
        "id": sub_id,
        "customer": "cus_test",
        "status": status,
        "current_period_end": _future_ts(30),
        "metadata": {"org_id": org_id, "plan_code": "pro"},
    }


def test_stripe_timestamp_to_iso() -> None:
    iso = stripe_timestamp_to_iso(_future_ts(1))
    assert iso is not None
    assert iso.endswith("Z")


def test_checkout_subscription_authority_sets_period_end(economics_store: EconomicsStore) -> None:
    r = apply_stripe_subscription_object(
        economics_store,
        _stripe_sub(org_id="org-auth-1"),
        payment_id="stripe:checkout_session:cs_1",
    )
    assert r.get("ok") is True
    row = economics_store.get_subscription_by_org("org-auth-1")
    assert row is not None
    assert row["status"] == "active"
    assert row["stripe_subscription_id"] == "sub_test"
    assert row["stripe_customer_id"] == "cus_test"
    assert row["current_period_end"]
    assert row["expires_at"] == row["current_period_end"]
    assert is_subscription_entitled(row)


def test_subscription_updated_cancel_syncs_subscriptions_table(
    economics_store: EconomicsStore,
) -> None:
    apply_stripe_subscription_object(economics_store, _stripe_sub(org_id="org-cancel"))
    canceled = _stripe_sub(org_id="org-cancel", status="canceled")
    canceled["canceled_at"] = int(datetime.now(timezone.utc).timestamp())
    r = handle_subscription_updated(economics_store, canceled)
    assert r.get("ok") is True
    row = economics_store.get_subscription_by_org("org-cancel")
    assert row is not None
    assert row["status"] == "canceled"
    assert row["canceled_at"]
    assert not is_subscription_entitled(row)


def test_subscription_deleted_marks_canceled(economics_store: EconomicsStore) -> None:
    apply_stripe_subscription_object(economics_store, _stripe_sub(org_id="org-del", sub_id="sub_del"))
    r = handle_subscription_deleted(economics_store, {"id": "sub_del", "customer": "cus_test"})
    assert r.get("ok") is True
    row = economics_store.get_subscription_by_org("org-del")
    assert row is not None
    assert row["status"] == "canceled"


def test_invoice_paid_extends_period_end(economics_store: EconomicsStore) -> None:
    economics_store.upsert_stripe_customer_org(stripe_customer_id="cus_inv", org_id="org-inv")
    economics_store.upsert_stripe_subscription_org(
        stripe_subscription_id="sub_inv",
        org_id="org-inv",
        plan_code="pro",
        status="active",
    )
    end_ts = _future_ts(45)
    inv = {
        "id": "in_test",
        "customer": "cus_inv",
        "amount_paid": 2900,
        "subscription": "sub_inv",
        "period_end": end_ts,
        "metadata": {"org_id": "org-inv"},
    }
    r = apply_invoice_paid_subscription_renewal(economics_store, inv)
    assert r.get("ok") is True
    row = economics_store.get_subscription_by_org("org-inv")
    assert row is not None
    assert row["current_period_end"] == stripe_timestamp_to_iso(end_ts)
    assert is_subscription_entitled(row)


def test_entitlement_expires_after_period_end(economics_store: EconomicsStore) -> None:
    past = int((datetime.now(timezone.utc) - timedelta(hours=1)).timestamp())
    sub = _stripe_sub(org_id="org-expired")
    sub["current_period_end"] = past
    apply_stripe_subscription_object(economics_store, sub)
    row = economics_store.get_subscription_by_org("org-expired")
    assert row is not None
    assert not is_subscription_entitled(row)


def test_dispatch_checkout_session_completed_writes_authority(
    economics_store: EconomicsStore,
) -> None:
    event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_dispatch_1",
                "status": "complete",
                "payment_status": "paid",
                "customer": "cus_dispatch",
                "subscription": "sub_dispatch",
                "metadata": {
                    "org_id": "org-dispatch",
                    "plan_code": "pro",
                    "user_id": "user-dispatch",
                },
            }
        },
    }
    r = dispatch_stripe_event(economics_store, event)
    assert r.get("ok") is True
    row = economics_store.get_subscription_by_org("org-dispatch")
    assert row is not None
    assert row["status"] == "active"
    assert row["stripe_subscription_id"] == "sub_dispatch"
    assert row["stripe_customer_id"] == "cus_dispatch"
    assert row["plan_code"] == "pro"


def test_invoice_paid_syncs_subscription_before_affiliate_earning(
    economics_store: EconomicsStore,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from backend.affiliates import service as affiliate_service
    from backend.affiliates.stripe_earnings_handlers import handle_invoice_paid
    from backend.payments.store import OnrampStore
    from backend.treasury.treasury_store import TreasuryStore

    monkeypatch.setenv("CLAW_AFFILIATE_STRIPE_HOLD_DAYS", "7")
    o = OnrampStore(str(tmp_path / "onramp.sqlite"))
    t = TreasuryStore(str(tmp_path / "treasury.sqlite"))
    cr = affiliate_service.create_affiliate(
        affiliate_code="AUD",
        wallet_address="0xcccccccccccccccccccccccccccccccccccccccc",
        economics=economics_store,
    )
    assert cr["ok"]
    affiliate_service.attribute_affiliate(
        org_id="org-inv-aff",
        affiliate_code="AUD",
        attribution_type="stripe",
        store=o,
        treasury=t,
        economics=economics_store,
        emit_event=False,
    )
    economics_store.upsert_stripe_customer_org(stripe_customer_id="cus_invaff", org_id="org-inv-aff")
    end_ts = _future_ts(60)
    inv = {
        "id": "in_inv_aff",
        "customer": "cus_invaff",
        "amount_paid": 2900,
        "billing_reason": "subscription_cycle",
        "metadata": {"org_id": "org-inv-aff"},
        "subscription": "sub_invaff",
        "period_end": end_ts,
        "charge": None,
        "payment_intent": None,
    }
    r = handle_invoice_paid(economics_store, inv)
    assert r.get("ok") is True
    assert r.get("earning_id")
    row = economics_store.get_subscription_by_org("org-inv-aff")
    assert row is not None
    assert row["current_period_end"] == stripe_timestamp_to_iso(end_ts)
    assert row["stripe_subscription_id"] == "sub_invaff"
    assert is_subscription_entitled(row)


def test_dispatch_handles_subscription_created(economics_store: EconomicsStore) -> None:
    event = {
        "type": "customer.subscription.created",
        "data": {"object": _stripe_sub(org_id="org-created", sub_id="sub_created")},
    }
    r = dispatch_stripe_event(economics_store, event)
    assert r.get("ok") is True
    row = economics_store.get_subscription_by_org("org-created")
    assert row is not None
    assert row["stripe_subscription_id"] == "sub_created"
