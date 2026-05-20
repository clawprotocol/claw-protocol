"""
Stripe webhook → affiliate_earnings ledger transitions.

Org resolution: set ``metadata.org_id`` on Stripe Customer (or Invoice) in Checkout,
and/or upsert via ``EconomicsStore.upsert_stripe_customer_org`` when linking accounts.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, Optional

from backend.affiliates import operator_alerts as op_alerts
from backend.affiliates import service as affiliate_service
from backend.billing import pricing
from backend.economics import config as econ_config
from backend.economics.store import EconomicsStore

_log = logging.getLogger("claw.affiliates.stripe_earnings")

# Stripe risk_score on Charge outcome; above → risk_hold (earning stays pending until manual clear).
_RISK_HOLD_THRESHOLD = int(__import__("os").getenv("CLAW_STRIPE_RISK_SCORE_HOLD", "62"))


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _unlock_at_iso() -> str:
    d = datetime.now(timezone.utc) + timedelta(days=econ_config.affiliate_stripe_hold_days())
    return d.isoformat().replace("+00:00", "Z")


def _metadata_org_id(obj: Dict[str, Any]) -> Optional[str]:
    md = obj.get("metadata") or {}
    if not isinstance(md, dict):
        return None
    oid = md.get("org_id") or md.get("claw_org_id")
    return str(oid).strip() if oid else None


def handle_invoice_paid(economics: EconomicsStore, invoice: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create a pending affiliate earning when invoice is paid, attribution exists, and plan is eligible.
    Idempotent on Stripe invoice id.
    """
    economics.init_schema()
    inv_id = str(invoice.get("id") or "").strip()
    if not inv_id:
        return {"ok": False, "error": "missing_invoice_id"}
    idem = f"stripe:invoice:{inv_id}"
    customer_id = str(invoice.get("customer") or "").strip()
    org_id = _metadata_org_id(invoice)
    if not org_id and customer_id:
        org_id = economics.get_org_for_stripe_customer(customer_id)
    if not org_id:
        _log.info("invoice.paid skip: no org_id invoice=%s", inv_id)
        return {"ok": True, "ignored": True, "reason": "no_org_mapping"}

    amount_cents = int(invoice.get("amount_paid") or 0)
    if amount_cents <= 0:
        return {"ok": True, "ignored": True, "reason": "zero_amount"}

    sub_sid = invoice.get("subscription")
    stripe_sub_id: Optional[str] = None
    if isinstance(sub_sid, str) and sub_sid.strip():
        stripe_sub_id = sub_sid.strip()
    elif isinstance(sub_sid, dict):
        stripe_sub_id = str(sub_sid.get("id") or "").strip() or None

    if stripe_sub_id and not economics.subscription_qualifies_for_affiliate_earning(stripe_sub_id):
        _log.info("invoice.paid skip: subscription not qualifying sub=%s", stripe_sub_id)
        return {"ok": True, "ignored": True, "reason": "subscription_inactive"}

    active = affiliate_service.get_active_affiliate_for_org(org_id, economics=economics)
    if not active or not active.get("affiliate"):
        return {"ok": True, "ignored": True, "reason": "no_attribution"}
    aff_row = active["affiliate"]
    aff_id = str(aff_row["id"])
    owner = (aff_row.get("owner_org_id") or "").strip()
    if owner and owner == org_id:
        _log.info("invoice.paid skip: self_referral org=%s", org_id)
        return {"ok": True, "ignored": True, "reason": "self_referral"}

    attr = active.get("attribution") or {}
    if str(attr.get("momentum_credit_state") or "") == "excluded":
        return {"ok": True, "ignored": True, "reason": "attribution_excluded"}

    sub_row = economics.get_subscription_by_org(org_id)
    plan_code = str(sub_row.get("plan_code") or "starter") if sub_row else "starter"
    link = economics.get_stripe_subscription_org(stripe_sub_id) if stripe_sub_id else None
    if link and link.get("plan_code"):
        plan_code = str(link["plan_code"])

    if not pricing.affiliate_eligible_for_plan(plan_code):
        return {"ok": True, "ignored": True, "reason": "plan_not_eligible"}

    bps = pricing.affiliate_bps_for_plan(plan_code)
    if bps <= 0:
        return {"ok": True, "ignored": True, "reason": "zero_bps"}

    basis = (Decimal(amount_cents) / Decimal(100)).quantize(Decimal("0.01"))
    payout_amt = (basis * Decimal(bps) / Decimal("10000")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    if payout_amt <= 0:
        return {"ok": True, "ignored": True, "reason": "zero_payout"}

    billing_reason = str(invoice.get("billing_reason") or "")
    earning_type = "recurring" if billing_reason == "subscription_cycle" else "initial"

    ch = invoice.get("charge")
    charge_id = ch.strip() if isinstance(ch, str) and ch.strip() else None
    if isinstance(ch, dict):
        charge_id = str(ch.get("id") or "").strip() or None

    pi = invoice.get("payment_intent")
    pi_id = pi.strip() if isinstance(pi, str) and pi.strip() else None
    if isinstance(pi, dict):
        pi_id = str(pi.get("id") or "").strip() or None

    risk_hold = 0
    fraud_snap: Optional[float] = None
    if isinstance(ch, dict):
        outcome = ch.get("outcome") or {}
        if isinstance(outcome, dict) and outcome.get("risk_score") is not None:
            try:
                rs = float(outcome["risk_score"])
                fraud_snap = rs
                if rs >= float(_RISK_HOLD_THRESHOLD):
                    risk_hold = 1
            except (TypeError, ValueError):
                pass

    internal_sub_id = str(sub_row["id"]) if sub_row and sub_row.get("id") else None
    earning_id = str(uuid.uuid4())
    unlock = _unlock_at_iso()
    notes = "risk_hold" if risk_hold else None

    inserted = economics.insert_affiliate_earning(
        earning_id=earning_id,
        affiliate_id=aff_id,
        referred_org_id=org_id,
        referred_user_id=str(attr.get("user_id") or "").strip() or None,
        internal_subscription_id=internal_sub_id,
        stripe_subscription_id=stripe_sub_id,
        invoice_id=inv_id,
        charge_id=charge_id,
        payment_intent_id=pi_id,
        internal_payment_id=None,
        amount_usd=float(payout_amt),
        rate_bps=int(bps),
        earning_type=earning_type,
        status="pending",
        unlock_at=unlock,
        fraud_score_snapshot=fraud_snap,
        notes=notes,
        idempotency_key=idem,
        risk_hold=risk_hold,
    )
    if not inserted:
        return {"ok": True, "duplicate": True, "invoice_id": inv_id}

    try:
        from backend.affiliates import trust_ledger as _trust

        ref_code = str(aff_row.get("affiliate_code") or "").strip() or aff_id
        gross_usd = float((Decimal(amount_cents) / Decimal(100)).quantize(Decimal("0.01")))
        _trust.record_commission_earned_from_stripe(
            economics,
            earning_id=earning_id,
            affiliate_id=aff_id,
            referral_code=ref_code,
            referred_org_id=org_id,
            gross_revenue_usd=gross_usd,
            commission_usd=float(payout_amt),
            invoice_id=inv_id,
        )
    except Exception:
        _log.exception("trust_ledger mirror failed earning_id=%s", earning_id)

    _log.info(
        "invoice.paid earning created id=%s affiliate=%s org=%s usd=%s type=%s",
        earning_id,
        aff_id,
        org_id,
        payout_amt,
        earning_type,
    )
    op_alerts.emit_operator_alert_safe(
        op_alerts.AFFILIATE_EARNING_CREATED,
        {
            "earning_id": earning_id,
            "affiliate_id": aff_id,
            "amount_usd": round(float(payout_amt), 2),
            "earning_type": earning_type,
            "invoice_id": inv_id,
        },
        economics=economics,
    )
    return {"ok": True, "earning_id": earning_id, "invoice_id": inv_id}


def handle_subscription_updated(economics: EconomicsStore, sub: Dict[str, Any]) -> Dict[str, Any]:
    economics.init_schema()
    sid = str(sub.get("id") or "").strip()
    if not sid:
        return {"ok": False, "error": "missing_subscription_id"}
    org_id = _metadata_org_id(sub) or economics.get_org_for_stripe_customer(
        str(sub.get("customer") or "").strip()
    )
    if not org_id:
        return {"ok": True, "ignored": True, "reason": "no_org_mapping"}
    status = str(sub.get("status") or "unknown")
    plan_code = None
    items = sub.get("items", {})
    if isinstance(items, dict):
        data = items.get("data") or []
        if data and isinstance(data[0], dict):
            price = (data[0].get("price") or {}).get("metadata") or {}
            if isinstance(price, dict) and price.get("plan_code"):
                plan_code = str(price["plan_code"]).strip()
    economics.upsert_stripe_subscription_org(
        stripe_subscription_id=sid,
        org_id=org_id,
        plan_code=plan_code,
        status=status,
    )
    if status in ("canceled", "unpaid", "incomplete_expired"):
        n = economics.cancel_affiliate_earnings_for_stripe_subscription(
            sid, reason="subscription_inactive"
        )
        return {"ok": True, "subscription_id": sid, "cancelled_earnings": n}
    return {"ok": True, "subscription_id": sid, "status": status}


def handle_subscription_deleted(economics: EconomicsStore, sub: Dict[str, Any]) -> Dict[str, Any]:
    economics.init_schema()
    sid = str(sub.get("id") or "").strip()
    if not sid:
        return {"ok": False, "error": "missing_subscription_id"}
    cust = str(sub.get("customer") or "").strip()
    org_id = _metadata_org_id(sub) or (
        economics.get_org_for_stripe_customer(cust) if cust else None
    )
    if org_id:
        economics.upsert_stripe_subscription_org(
            stripe_subscription_id=sid,
            org_id=org_id,
            plan_code=None,
            status="canceled",
        )
    n = economics.cancel_affiliate_earnings_for_stripe_subscription(sid, reason="subscription_deleted")
    return {"ok": True, "subscription_id": sid, "cancelled_earnings": n}


def handle_charge_dispute_created(economics: EconomicsStore, dispute: Dict[str, Any]) -> Dict[str, Any]:
    economics.init_schema()
    ch = str(dispute.get("charge") or "").strip()
    if not ch:
        return {"ok": False, "error": "missing_charge"}
    r = economics.cancel_affiliate_earnings_for_charge(
        ch, reason="disputed", touch_paid_as_recovery=True
    )
    try:
        from backend.affiliates import trust_ledger as _trust

        _trust.emit_reversals_for_cancelled_charge(economics, ch)
    except Exception:
        _log.exception("trust_ledger reversal mirror failed charge=%s", ch)
    return {"ok": True, "charge_id": ch, **r}


def handle_charge_refunded(economics: EconomicsStore, charge: Dict[str, Any]) -> Dict[str, Any]:
    economics.init_schema()
    cid = str(charge.get("id") or "").strip()
    if not cid:
        return {"ok": False, "error": "missing_charge_id"}
    refunded = charge.get("refunded")
    amount_refunded = int(charge.get("amount_refunded") or 0)
    if not refunded and amount_refunded <= 0:
        return {"ok": True, "ignored": True}
    r = economics.cancel_affiliate_earnings_for_charge(
        cid, reason="refunded", touch_paid_as_recovery=False
    )
    try:
        from backend.affiliates import trust_ledger as _trust

        _trust.emit_reversals_for_cancelled_charge(economics, cid)
    except Exception:
        _log.exception("trust_ledger reversal mirror failed charge=%s", cid)
    return {"ok": True, "charge_id": cid, **r}


def dispatch_stripe_event(economics: EconomicsStore, event: Dict[str, Any]) -> Dict[str, Any]:
    etype = str(event.get("type") or "")
    data = (event.get("data") or {}).get("object")
    if not isinstance(data, dict):
        return {"ok": False, "error": "bad_event_payload"}
    genesis_result: Dict[str, Any] = {}
    try:
        from backend.affiliates.genesis_stripe_handlers import dispatch_genesis_stripe_side_effect

        genesis_result = dispatch_genesis_stripe_side_effect(economics, etype, data)
    except Exception:
        _log.exception("genesis_stripe_side_effect failed type=%s", etype)
    if etype == "invoice.paid":
        legacy = handle_invoice_paid(economics, data)
        return {**legacy, "genesis": genesis_result}
    if etype == "customer.subscription.updated":
        return handle_subscription_updated(economics, data)
    if etype == "customer.subscription.deleted":
        return handle_subscription_deleted(economics, data)
    if etype == "charge.dispute.created":
        return handle_charge_dispute_created(economics, data)
    if etype == "charge.refunded":
        legacy = handle_charge_refunded(economics, data)
        return {**legacy, "genesis": genesis_result}
    if genesis_result and not genesis_result.get("ignored"):
        return genesis_result
    return {"ok": True, "ignored": True, "reason": "event_type_not_handled", "type": etype}
