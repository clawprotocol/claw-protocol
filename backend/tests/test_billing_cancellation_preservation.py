"""Invoice events must not invent or clear scheduled cancellation."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from backend.affiliates.stripe_earnings_handlers import handle_subscription_updated
from backend.billing.billing_display import derive_billing_display_state
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
    eco = EconomicsStore(path=str(tmp_path / "economics.sqlite"))
    eco.init_schema()
    return eco


def _future_ts(days: int = 30) -> int:
    return int((datetime.now(timezone.utc) + timedelta(days=days)).timestamp())


def _active_sub(*, org_id: str, cancel_at_period_end: bool = False, sub_id: str = "sub_cancel") -> dict:
    return {
        "id": sub_id,
        "customer": "cus_cancel",
        "status": "active",
        "cancel_at_period_end": cancel_at_period_end,
        "current_period_end": _future_ts(12),
        "items": {"data": [{"price": {"recurring": {"interval": "month"}}}]},
        "metadata": {"org_id": org_id, "plan_code": "pro"},
    }


def _invoice(*, org_id: str, invoice_id: str, period_days: int = 40, subscription: str | dict = "sub_cancel") -> dict:
    end_ts = _future_ts(period_days)
    return {
        "id": invoice_id,
        "customer": "cus_cancel",
        "amount_paid": 2900,
        "subscription": subscription,
        "period_end": end_ts,
        "lines": {"data": [{"period": {"end": end_ts}}]},
        "metadata": {"org_id": org_id, "plan_code": "pro"},
    }


def test_invoice_without_cancel_instruction_preserves_scheduled_cancellation(
    economics_store: EconomicsStore,
) -> None:
    apply_stripe_subscription_object(
        economics_store,
        _active_sub(org_id="org-sched-cancel", cancel_at_period_end=True),
    )
    before = economics_store.get_subscription_by_org("org-sched-cancel")
    assert before is not None
    assert before["cancel_at_period_end"] in (1, True)
    assert derive_billing_display_state(before) == "scheduled_cancellation"
    assert is_subscription_entitled(before)

    invoice = _invoice(org_id="org-sched-cancel", invoice_id="in_no_cancel_instruction")
    assert "cancel_at_period_end" not in invoice
    result = apply_invoice_paid_subscription_renewal(economics_store, invoice)
    assert result.get("ok") is True
    after = economics_store.get_subscription_by_org("org-sched-cancel")
    assert after is not None
    assert after["cancel_at_period_end"] in (1, True)
    assert after["current_period_end"] == stripe_timestamp_to_iso(invoice["period_end"])
    assert derive_billing_display_state(after) == "scheduled_cancellation"
    assert is_subscription_entitled(after)
    assert after["status"] == "active"


def test_delayed_invoice_after_scheduled_cancel_does_not_clear_flag(
    economics_store: EconomicsStore,
) -> None:
    apply_stripe_subscription_object(
        economics_store,
        _active_sub(org_id="org-ooo-invoice", cancel_at_period_end=False),
    )
    handle_subscription_updated(
        economics_store,
        _active_sub(org_id="org-ooo-invoice", cancel_at_period_end=True),
    )
    row = economics_store.get_subscription_by_org("org-ooo-invoice")
    assert derive_billing_display_state(row) == "scheduled_cancellation"

    later_invoice = _invoice(org_id="org-ooo-invoice", invoice_id="in_delayed_after_cancel", period_days=45)
    apply_invoice_paid_subscription_renewal(economics_store, later_invoice)
    after = economics_store.get_subscription_by_org("org-ooo-invoice")
    assert after is not None
    assert after["cancel_at_period_end"] in (1, True)
    assert derive_billing_display_state(after) == "scheduled_cancellation"
    assert is_subscription_entitled(after)


def test_explicit_subscription_reversal_clears_cancellation(
    economics_store: EconomicsStore,
) -> None:
    apply_stripe_subscription_object(
        economics_store,
        _active_sub(org_id="org-reverse", cancel_at_period_end=True),
    )
    assert derive_billing_display_state(
        economics_store.get_subscription_by_org("org-reverse")
    ) == "scheduled_cancellation"
    handle_subscription_updated(
        economics_store,
        _active_sub(org_id="org-reverse", cancel_at_period_end=False),
    )
    after = economics_store.get_subscription_by_org("org-reverse")
    assert after is not None
    assert after["cancel_at_period_end"] in (0, False, None)
    assert derive_billing_display_state(after) == "active"
    assert is_subscription_entitled(after)


def test_delayed_invoice_after_reversal_does_not_rearm_cancellation(
    economics_store: EconomicsStore,
) -> None:
    apply_stripe_subscription_object(
        economics_store,
        _active_sub(org_id="org-reverse-invoice", cancel_at_period_end=True),
    )
    handle_subscription_updated(
        economics_store,
        _active_sub(org_id="org-reverse-invoice", cancel_at_period_end=False),
    )
    apply_invoice_paid_subscription_renewal(
        economics_store,
        _invoice(org_id="org-reverse-invoice", invoice_id="in_after_reverse", period_days=50),
    )
    after = economics_store.get_subscription_by_org("org-reverse-invoice")
    assert after is not None
    assert after["cancel_at_period_end"] in (0, False, None)
    assert derive_billing_display_state(after) == "active"
    assert is_subscription_entitled(after)


def test_expanded_subscription_on_invoice_is_authoritative(
    economics_store: EconomicsStore,
) -> None:
    apply_stripe_subscription_object(
        economics_store,
        _active_sub(org_id="org-expanded", cancel_at_period_end=True),
    )
    expanded = _active_sub(org_id="org-expanded", cancel_at_period_end=False)
    expanded["current_period_end"] = _future_ts(55)
    result = apply_invoice_paid_subscription_renewal(
        economics_store,
        _invoice(org_id="org-expanded", invoice_id="in_expanded", subscription=expanded),
    )
    assert result.get("source") == "expanded_subscription"
    after = economics_store.get_subscription_by_org("org-expanded")
    assert after is not None
    assert after["cancel_at_period_end"] in (0, False, None)
    assert derive_billing_display_state(after) == "active"
    assert is_subscription_entitled(after)
