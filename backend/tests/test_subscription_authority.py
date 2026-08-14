"""Canonical subscription authority — Stripe lifecycle and entitlement."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

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
        "amount_paid": 4900,
        "billing_reason": "subscription_create",
        "metadata": {"org_id": "org-inv-aff", "plan_code": "pro"},
        "subscription": "sub_invaff",
        "period_end": end_ts,
        "charge": None,
        "payment_intent": None,
    }
    r = handle_invoice_paid(economics_store, inv)
    assert r.get("ok") is True
    assert r.get("earning_id"), r
    row = economics_store.get_subscription_by_org("org-inv-aff")
    assert row is not None
    assert row["current_period_end"] == stripe_timestamp_to_iso(end_ts)
    assert row["stripe_subscription_id"] == "sub_invaff"
    assert is_subscription_entitled(row)
    # Renewal cycles sync entitlement but must not mint a second legacy earning.
    cycle_end = _future_ts(90)
    r_cycle = handle_invoice_paid(
        economics_store,
        {
            **inv,
            "id": "in_inv_aff_cycle",
            "billing_reason": "subscription_cycle",
            "period_end": cycle_end,
        },
    )
    assert r_cycle.get("ok") is True
    assert r_cycle.get("ignored") is True
    assert r_cycle.get("reason") == "first_invoice_only"
    assert r_cycle.get("earning_id") is None
    row2 = economics_store.get_subscription_by_org("org-inv-aff")
    assert row2 is not None
    assert row2["current_period_end"] == stripe_timestamp_to_iso(cycle_end)
    assert is_subscription_entitled(row2)


def test_string_subscription_id_checkout_writes_customer_and_subscription_maps(
    economics_store: EconomicsStore,
) -> None:
    """Real Stripe webhooks often send subscription as an ID string, not an object."""
    event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_string_sub",
                "status": "complete",
                "payment_status": "paid",
                "customer": "cus_string_sub",
                "subscription": "sub_string_sub",
                "metadata": {
                    "org_id": "org-string-sub",
                    "claw_org_id": "org-string-sub",
                    "plan_code": "pro",
                    "user_id": "user-string-sub",
                },
            }
        },
    }
    r = dispatch_stripe_event(economics_store, event)
    assert r.get("ok") is True
    assert not r.get("ignored"), r
    assert economics_store.get_org_for_stripe_customer("cus_string_sub") == "org-string-sub"
    link = economics_store.get_stripe_subscription_org("sub_string_sub")
    assert link is not None
    assert link["org_id"] == "org-string-sub"
    row = economics_store.get_subscription_by_org("org-string-sub")
    assert row is not None
    assert row["status"] == "active"
    assert row["plan_code"] == "pro"
    assert row["stripe_subscription_id"] == "sub_string_sub"
    assert row["stripe_customer_id"] == "cus_string_sub"
    assert is_subscription_entitled(row)


def test_invoice_before_checkout_is_retryable_then_succeeds_after_authority(
    economics_store: EconomicsStore,
) -> None:
    invoice = {
        "id": "in_before_cs",
        "customer": "cus_order",
        "amount_paid": 4900,
        "subscription": "sub_order",
        "period_end": _future_ts(30),
        "metadata": {"plan_code": "pro"},
    }
    first = apply_invoice_paid_subscription_renewal(economics_store, invoice)
    assert first.get("ok") is False
    assert first.get("reason") == "no_org_mapping"
    assert first.get("retryable") is True
    assert economics_store.get_org_for_stripe_customer("cus_order") is None
    assert economics_store.get_subscription_by_org("org-order") is None

    checkout = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_order",
                "status": "complete",
                "payment_status": "paid",
                "customer": "cus_order",
                "subscription": "sub_order",
                "metadata": {
                    "org_id": "org-order",
                    "claw_org_id": "org-order",
                    "plan_code": "pro",
                    "user_id": "user-order",
                },
            }
        },
    }
    activated = dispatch_stripe_event(economics_store, checkout)
    assert activated.get("ok") is True
    assert economics_store.get_org_for_stripe_customer("cus_order") == "org-order"
    assert is_subscription_entitled(economics_store.get_subscription_by_org("org-order"))

    later = apply_invoice_paid_subscription_renewal(economics_store, invoice)
    assert later.get("ok") is True
    assert later.get("reason") != "no_org_mapping"
    assert later.get("org_id") == "org-order"
    row = economics_store.get_subscription_by_org("org-order")
    assert row is not None
    assert row["stripe_subscription_id"] == "sub_order"
    assert is_subscription_entitled(row)


def test_duplicate_checkout_dispatch_does_not_duplicate_entitlement(
    economics_store: EconomicsStore,
) -> None:
    event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_dup_auth",
                "status": "complete",
                "payment_status": "paid",
                "customer": "cus_dup_auth",
                "subscription": "sub_dup_auth",
                "metadata": {
                    "org_id": "org-dup-auth",
                    "claw_org_id": "org-dup-auth",
                    "plan_code": "pro",
                    "user_id": "user-dup-auth",
                },
            }
        },
    }
    first = dispatch_stripe_event(economics_store, event)
    second = dispatch_stripe_event(economics_store, event)
    assert first.get("ok") is True
    assert second.get("ok") is True
    row = economics_store.get_subscription_by_org("org-dup-auth")
    assert row is not None
    assert is_subscription_entitled(row)
    with economics_store._conn() as con:
        n = con.execute(
            "SELECT COUNT(*) AS c FROM subscriptions WHERE org_id = ?",
            ("org-dup-auth",),
        ).fetchone()
    assert int(n["c"] if n["c"] is not None else n[0]) == 1


def test_webhook_http_invoice_before_checkout_retries_then_dedupes(
    economics_store: EconomicsStore,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_STRIPE_WEBHOOK_DEV_UNSIGNED", "1")
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    from backend.payments.stripe_webhooks import router as stripe_webhook_router

    app = FastAPI()
    app.include_router(stripe_webhook_router)
    client = TestClient(app)

    invoice_event = {
        "id": "evt_http_inv_early",
        "type": "invoice.paid",
        "data": {
            "object": {
                "id": "in_http_early",
                "customer": "cus_http_auth",
                "amount_paid": 4900,
                "subscription": "sub_http_auth",
                "period_end": _future_ts(30),
                "metadata": {},
            }
        },
    }
    early = client.post(
        "/webhook/stripe",
        content=json.dumps(invoice_event),
        headers={"Content-Type": "application/json"},
    )
    assert early.status_code == 503
    assert early.json().get("detail") == "stripe_authority_not_ready"
    assert economics_store.insert_stripe_webhook_event_once("evt_http_inv_early") is True
    assert economics_store.delete_stripe_webhook_event("evt_http_inv_early") is True

    checkout_event = {
        "id": "evt_http_cs",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_http_auth",
                "status": "complete",
                "payment_status": "paid",
                "customer": "cus_http_auth",
                "subscription": "sub_http_auth",
                "metadata": {
                    "org_id": "org-http-auth",
                    "claw_org_id": "org-http-auth",
                    "plan_code": "pro",
                    "user_id": "user-http-auth",
                },
            }
        },
    }
    activated = client.post(
        "/webhook/stripe",
        content=json.dumps(checkout_event),
        headers={"Content-Type": "application/json"},
    )
    assert activated.status_code == 200
    assert activated.json().get("ok") is True
    assert activated.json().get("duplicate") is not True
    assert is_subscription_entitled(economics_store.get_subscription_by_org("org-http-auth"))

    dup_checkout = client.post(
        "/webhook/stripe",
        content=json.dumps(checkout_event),
        headers={"Content-Type": "application/json"},
    )
    assert dup_checkout.status_code == 200
    assert dup_checkout.json().get("duplicate") is True

    later = client.post(
        "/webhook/stripe",
        content=json.dumps(invoice_event),
        headers={"Content-Type": "application/json"},
    )
    assert later.status_code == 200, later.text
    assert later.json().get("ok") is True
    assert later.json().get("result", {}).get("reason") != "no_org_mapping"

    dup_invoice = client.post(
        "/webhook/stripe",
        content=json.dumps(invoice_event),
        headers={"Content-Type": "application/json"},
    )
    assert dup_invoice.status_code == 200
    assert dup_invoice.json().get("duplicate") is True
    with economics_store._conn() as con:
        n = con.execute(
            "SELECT COUNT(*) AS c FROM subscriptions WHERE org_id = ?",
            ("org-http-auth",),
        ).fetchone()
    assert int(n["c"] if n["c"] is not None else n[0]) == 1


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
