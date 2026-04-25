from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from backend.billing import pricing
from backend.economics import events as econ_events
from backend.economics.store import EconomicsStore
from backend.payments.store import OnrampStore
from backend.treasury.treasury_store import TreasuryStore

_log = logging.getLogger(__name__)


def _expiry_iso(days: int = 30) -> str:
    d = datetime.now(timezone.utc) + timedelta(days=days)
    return d.isoformat().replace("+00:00", "Z")


def sync_subscription_from_payment(
    *,
    economics: EconomicsStore,
    store: OnrampStore,
    treasury: TreasuryStore,
    payment_id: str,
    org_id: str,
    user_id: Optional[str],
    plan_code: str,
) -> None:
    pricing.get_plan(plan_code)
    existing = economics.get_subscription_by_org(org_id)
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    if existing is None:
        sub_id = str(uuid.uuid4())
        economics.insert_subscription(
            sub_id=sub_id,
            org_id=org_id,
            user_id=user_id,
            plan_code=plan_code,
            status="active",
            payment_id=payment_id,
            expires_at=_expiry_iso(30),
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
    economics.renew_subscription_payment(
        org_id=org_id, payment_id=payment_id, renewed_at=now
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
