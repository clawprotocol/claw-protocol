from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from backend.billing import pricing
from backend.billing.subscription_authority import demo_expiry_iso
from backend.economics import events as econ_events
from backend.economics.store import EconomicsStore
from backend.payments.store import OnrampStore
from backend.treasury.treasury_store import TreasuryStore

_log = logging.getLogger(__name__)


def emit_stripe_checkout_subscription_ledger_events(
    *,
    economics: EconomicsStore,
    store: OnrampStore,
    treasury: TreasuryStore,
    payment_id: str,
    org_id: str,
    user_id: Optional[str],
    plan_code: str,
    was_existing: bool,
) -> None:
    """Emit purchase/renewal ledger events after subscription_authority has written state."""
    pricing.get_plan(plan_code)
    row = economics.get_subscription_by_org(org_id)
    if not row:
        return
    sub_id = str(row["id"])
    if was_existing:
        ev = econ_events.subscription_renewed(
            subscription_id=sub_id, org_id=org_id, payment_id=payment_id
        )
    else:
        ev = econ_events.subscription_purchased(
            subscription_id=sub_id, org_id=org_id, plan_code=plan_code
        )
    econ_events.emit_economics_event(
        ev,
        payment_id=payment_id,
        subject_ref=org_id,
        ledger_amount=None,
        store=store,
        treasury=treasury,
    )
    if not was_existing:
        try:
            from backend.integrations.hooks_emit import claw_emit_integration_event

            claw_emit_integration_event(
                org_id,
                "subscription.upgraded",
                "subscription",
                sub_id,
                {"plan_code": plan_code, "surface": "initial_purchase", "payment_id": payment_id},
            )
        except Exception:
            _log.exception("subscription.upgraded webhook failed org=%s", org_id)


def sync_subscription_from_payment(
    *,
    economics: EconomicsStore,
    store: OnrampStore,
    treasury: TreasuryStore,
    payment_id: str,
    org_id: str,
    user_id: Optional[str],
    plan_code: str,
    expires_at: Optional[str] = None,
    current_period_end: Optional[str] = None,
    stripe_subscription_id: Optional[str] = None,
    stripe_customer_id: Optional[str] = None,
    use_demo_expiry: bool = False,
) -> None:
    """
    Record subscription purchase or renewal from a payment idempotency key.

    Stripe checkout must pass ``expires_at`` / ``current_period_end`` from Stripe.
    Demo/dev activation sets ``use_demo_expiry=True`` for a fixed 30-day window.
    """
    pricing.get_plan(plan_code)
    existing = economics.get_subscription_by_org(org_id)
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    period_end = current_period_end or expires_at
    if existing is None:
        exp = period_end if period_end else (demo_expiry_iso(30) if use_demo_expiry else None)
        sub_id = str(uuid.uuid4())
        economics.insert_subscription(
            sub_id=sub_id,
            org_id=org_id,
            user_id=user_id,
            plan_code=plan_code,
            status="active",
            payment_id=payment_id,
            expires_at=exp,
            current_period_end=period_end or exp,
            stripe_subscription_id=stripe_subscription_id,
            stripe_customer_id=stripe_customer_id,
        )
        ev = econ_events.subscription_purchased(
            subscription_id=sub_id, org_id=org_id, plan_code=plan_code
        )
        econ_events.emit_economics_event(
            ev,
            payment_id=payment_id,
            subject_ref=org_id,
            ledger_amount=None,
            store=store,
            treasury=treasury,
        )
        try:
            from backend.integrations.hooks_emit import claw_emit_integration_event

            claw_emit_integration_event(
                org_id,
                "subscription.upgraded",
                "subscription",
                sub_id,
                {"plan_code": plan_code, "surface": "initial_purchase", "payment_id": payment_id},
            )
        except Exception:
            _log.exception("subscription.upgraded webhook failed org=%s", org_id)
        return
    sub_id = str(existing["id"])
    economics.upsert_subscription_authority(
        org_id=org_id,
        user_id=user_id or (str(existing.get("user_id") or "").strip() or None),
        plan_code=plan_code,
        status="active",
        expires_at=period_end or existing.get("expires_at"),
        current_period_end=period_end or existing.get("current_period_end"),
        canceled_at=None,
        stripe_subscription_id=stripe_subscription_id or existing.get("stripe_subscription_id"),
        stripe_customer_id=stripe_customer_id or existing.get("stripe_customer_id"),
        payment_id=payment_id,
        renewed_at=now,
    )
    ev = econ_events.subscription_renewed(
        subscription_id=sub_id, org_id=org_id, payment_id=payment_id
    )
    econ_events.emit_economics_event(
        ev,
        payment_id=payment_id,
        subject_ref=org_id,
        ledger_amount=None,
        store=store,
        treasury=treasury,
    )


def get_subscription_for_org(economics: EconomicsStore, org_id: str) -> Optional[dict]:
    return economics.get_subscription_by_org(org_id)
