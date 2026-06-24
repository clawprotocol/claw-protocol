"""Sync economics subscriptions from Stripe checkout / invoice events."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from backend.billing import subscriptions as subs
from backend.billing.pricing import get_plan
from backend.economics.store import EconomicsStore, get_economics_store
from backend.payments.store import OnrampStore, get_onramp_store
from backend.treasury.treasury_store import TreasuryStore, get_treasury_store

_log = logging.getLogger("claw.billing.stripe_subscription_sync")


def _metadata_org_id(obj: Dict[str, Any]) -> Optional[str]:
    md = obj.get("metadata") or {}
    if not isinstance(md, dict):
        return None
    oid = md.get("org_id") or md.get("claw_org_id")
    return str(oid).strip() if oid else None


def _metadata_user_id(obj: Dict[str, Any]) -> Optional[str]:
    md = obj.get("metadata") or {}
    if not isinstance(md, dict):
        return None
    uid = md.get("user_id")
    return str(uid).strip() if uid else None


def _metadata_plan_code(obj: Dict[str, Any], default: str = "pro") -> str:
    md = obj.get("metadata") or {}
    if isinstance(md, dict) and md.get("plan_code"):
        return str(md["plan_code"]).strip().lower()
    return default


def sync_subscription_from_stripe_checkout_session(
    economics: EconomicsStore,
    session: Dict[str, Any],
) -> Dict[str, Any]:
    """Activate org subscription from a paid Checkout Session (idempotent on session id)."""
    session_id = str(session.get("id") or "").strip()
    if not session_id:
        return {"ok": False, "error": "missing_session_id"}
    status = str(session.get("status") or "").strip().lower()
    payment_status = str(session.get("payment_status") or "").strip().lower()
    if status != "complete" or payment_status not in ("paid", "no_payment_required"):
        return {"ok": True, "ignored": True, "reason": "session_not_paid", "status": status}

    org_id = _metadata_org_id(session)
    if not org_id:
        return {"ok": False, "error": "missing_org_id"}

    plan_code = _metadata_plan_code(session)
    try:
        get_plan(plan_code)
    except Exception:
        plan_code = "pro"

    user_id = _metadata_user_id(session)
    customer_id = str(session.get("customer") or "").strip()
    if customer_id:
        economics.upsert_stripe_customer_org(stripe_customer_id=customer_id, org_id=org_id)

    sub_sid = session.get("subscription")
    stripe_sub_id = sub_sid.strip() if isinstance(sub_sid, str) and sub_sid.strip() else None
    if isinstance(sub_sid, dict):
        stripe_sub_id = str(sub_sid.get("id") or "").strip() or None
    if stripe_sub_id:
        economics.upsert_stripe_subscription_org(
            stripe_subscription_id=stripe_sub_id,
            org_id=org_id,
            plan_code=plan_code,
            status="active",
        )

    payment_id = f"stripe:checkout_session:{session_id}"
    store = get_onramp_store()
    treasury = get_treasury_store()
    subs.sync_subscription_from_payment(
        economics=economics,
        store=store,
        treasury=treasury,
        payment_id=payment_id,
        org_id=org_id,
        user_id=user_id,
        plan_code=plan_code,
    )
    _log.info("stripe_checkout_synced org=%s plan=%s session=%s", org_id, plan_code, session_id)
    return {"ok": True, "org_id": org_id, "plan_code": plan_code, "payment_id": payment_id}


def handle_checkout_session_completed(economics: EconomicsStore, session: Dict[str, Any]) -> Dict[str, Any]:
    economics.init_schema()
    return sync_subscription_from_stripe_checkout_session(economics, session)
