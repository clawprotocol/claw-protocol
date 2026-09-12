"""Billing display states — entitlement policy is unchanged."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.billing.billing_display import build_billing_status_payload, derive_billing_display_state
from backend.billing.subscription_authority import (
    billing_interval_from_stripe_subscription,
    is_subscription_entitled,
)


def _future() -> str:
    return (datetime.now(timezone.utc) + timedelta(days=20)).isoformat().replace("+00:00", "Z")


def _past() -> str:
    return (datetime.now(timezone.utc) - timedelta(days=2)).isoformat().replace("+00:00", "Z")


def test_empty_row_is_confirmed_no_subscription() -> None:
    assert derive_billing_display_state(None) == "no_subscription"
    assert is_subscription_entitled(None) is False


def test_active_entitled_row() -> None:
    row = {"status": "active", "plan_code": "pro", "current_period_end": _future(), "cancel_at_period_end": 0}
    assert derive_billing_display_state(row) == "active"
    assert is_subscription_entitled(row) is True


def test_scheduled_cancellation_stays_entitled() -> None:
    row = {
        "status": "active",
        "plan_code": "pro",
        "current_period_end": _future(),
        "cancel_at_period_end": 1,
    }
    assert derive_billing_display_state(row) == "scheduled_cancellation"
    assert is_subscription_entitled(row) is True


def test_expired_active_row_is_not_entitled() -> None:
    row = {"status": "active", "plan_code": "pro", "current_period_end": _past(), "cancel_at_period_end": 0}
    assert derive_billing_display_state(row) == "expired_canceled"
    assert is_subscription_entitled(row) is False


def test_canceled_and_past_due_states() -> None:
    canceled = {"status": "canceled", "plan_code": "pro", "current_period_end": _past()}
    past_due = {"status": "past_due", "plan_code": "pro", "current_period_end": _future()}
    assert derive_billing_display_state(canceled) == "expired_canceled"
    assert derive_billing_display_state(past_due) == "payment_problem"
    assert is_subscription_entitled(canceled) is False
    assert is_subscription_entitled(past_due) is False


def test_unknown_status_is_unavailable() -> None:
    row = {"status": "paused", "plan_code": "pro", "current_period_end": _future()}
    assert derive_billing_display_state(row) == "unavailable"
    assert is_subscription_entitled(row) is False


def test_payload_omits_customer_id_and_invented_cadence() -> None:
    payload = build_billing_status_payload(
        org_id="user-owner",
        row={"status": "active", "plan_code": "pro", "current_period_end": _future()},
        stripe_configured=True,
        stripe_customer_id="cus_secret",
    )
    assert payload["org_id"] == "user-owner"
    assert payload["display_state"] == "active"
    assert payload["billing_interval"] is None
    assert payload["has_stripe_customer"] is True
    assert payload["manage_available"] is True
    assert "stripe_customer_id" not in payload
    assert "cus_secret" not in str(payload)


def test_stripe_interval_is_authoritative_only() -> None:
    assert (
        billing_interval_from_stripe_subscription(
            {"items": {"data": [{"price": {"recurring": {"interval": "year"}}}]}}
        )
        == "year"
    )
    assert billing_interval_from_stripe_subscription({}) is None
