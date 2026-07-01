"""Sync economics subscriptions from Stripe checkout / invoice events."""

from __future__ import annotations

import logging
from typing import Any, Dict

from backend.billing import subscriptions as subs
from backend.billing.subscription_authority import apply_stripe_checkout_session_authority
from backend.economics.store import EconomicsStore, get_economics_store
from backend.payments.store import get_onramp_store
from backend.treasury.treasury_store import get_treasury_store

_log = logging.getLogger("claw.billing.stripe_subscription_sync")


def sync_subscription_from_stripe_checkout_session(
    economics: EconomicsStore,
    session: Dict[str, Any],
) -> Dict[str, Any]:
    """Activate org subscription from a paid Checkout Session (idempotent on session id)."""
    org_id_hint = None
    md = session.get("metadata") or {}
    if isinstance(md, dict):
        org_id_hint = md.get("org_id") or md.get("claw_org_id")
        if org_id_hint:
            org_id_hint = str(org_id_hint).strip()

    had_subscription = bool(
        org_id_hint and economics.get_subscription_by_org(org_id_hint) is not None
    )

    authority = apply_stripe_checkout_session_authority(economics, session)
    if not authority.get("ok") or authority.get("ignored"):
        return authority

    org_id = str(authority.get("org_id") or org_id_hint or "").strip()
    if not org_id:
        return {"ok": False, "error": "missing_org_id_after_authority"}

    payment_id = str(
        authority.get("payment_id") or f"stripe:checkout_session:{session.get('id', '')}"
    ).strip()
    plan_code = str(authority.get("plan_code") or "pro")
    md_plan = md.get("plan_code") if isinstance(md, dict) else None
    if md_plan:
        plan_code = str(md_plan).strip().lower()

    user_id = None
    if isinstance(md, dict) and md.get("user_id"):
        user_id = str(md["user_id"]).strip()

    subs.emit_stripe_checkout_subscription_ledger_events(
        economics=economics,
        store=get_onramp_store(),
        treasury=get_treasury_store(),
        payment_id=payment_id,
        org_id=org_id,
        user_id=user_id,
        plan_code=plan_code,
        was_existing=had_subscription,
    )
    _log.info(
        "stripe_checkout_synced org=%s plan=%s payment_id=%s source=%s",
        org_id,
        plan_code,
        payment_id,
        authority.get("source", "subscription_object"),
    )
    return {
        "ok": True,
        "org_id": org_id,
        "plan_code": plan_code,
        "payment_id": payment_id,
        "authority": authority,
    }


def handle_checkout_session_completed(economics: EconomicsStore, session: Dict[str, Any]) -> Dict[str, Any]:
    economics.init_schema()
    return sync_subscription_from_stripe_checkout_session(economics, session)
