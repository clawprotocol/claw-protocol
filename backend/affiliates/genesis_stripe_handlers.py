"""
Stripe invoice.paid / charge.refunded → Genesis affiliate_commissions ledger.
"""

from __future__ import annotations

import logging
import uuid
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, Optional

from backend.affiliates.genesis_referral_service import resolve_genesis_commission_context
from backend.economics.genesis_referral_store import (
    count_non_voided_commissions_for_referred_org,
    insert_affiliate_commission,
    void_commissions_for_invoice,
)
from backend.economics.store import EconomicsStore

_log = logging.getLogger("claw.genesis_referral.stripe")

_PRO_PLAN_CODES = frozenset({"pro", "lawdog_pro", "premium"})


def _metadata_org_id(obj: Dict[str, Any]) -> Optional[str]:
    md = obj.get("metadata") or {}
    if not isinstance(md, dict):
        return None
    oid = md.get("org_id") or md.get("claw_org_id")
    return str(oid).strip() if oid else None


def _metadata_plan_code(obj: Dict[str, Any]) -> Optional[str]:
    md = obj.get("metadata") or {}
    if not isinstance(md, dict):
        return None
    pc = md.get("plan_code")
    return str(pc).strip().lower() if pc else None


def _invoice_period(invoice: Dict[str, Any]) -> tuple[Optional[str], Optional[str]]:
    lines = invoice.get("lines") or {}
    data = lines.get("data") if isinstance(lines, dict) else None
    if not data or not isinstance(data[0], dict):
        return None, None
    period = (data[0].get("period") or {}) if isinstance(data[0], dict) else {}
    if not isinstance(period, dict):
        return None, None
    start = period.get("start")
    end = period.get("end")
    def _ts(v: Any) -> Optional[str]:
        if v is None:
            return None
        try:
            from datetime import datetime, timezone
            return datetime.fromtimestamp(int(v), tz=timezone.utc).isoformat().replace("+00:00", "Z")
        except (TypeError, ValueError):
            return None
    return _ts(start), _ts(end)


def handle_genesis_invoice_paid(economics: EconomicsStore, invoice: Dict[str, Any]) -> Dict[str, Any]:
    economics.init_schema()
    inv_id = str(invoice.get("id") or "").strip()
    if not inv_id:
        return {"ok": False, "error": "missing_invoice_id"}

    amount_cents = int(invoice.get("amount_paid") or 0)
    if amount_cents <= 0:
        return {"ok": True, "ignored": True, "reason": "zero_amount"}

    org_id = _metadata_org_id(invoice)
    customer_id = str(invoice.get("customer") or "").strip() or None
    if not org_id and customer_id:
        org_id = economics.get_org_for_stripe_customer(customer_id)
    if not org_id:
        return {"ok": True, "ignored": True, "reason": "no_org_mapping"}

    plan_code = _metadata_plan_code(invoice)
    link_sub = invoice.get("subscription")
    stripe_sub_id: Optional[str] = None
    if isinstance(link_sub, str) and link_sub.strip():
        stripe_sub_id = link_sub.strip()
    elif isinstance(link_sub, dict):
        stripe_sub_id = str(link_sub.get("id") or "").strip() or None

    if not plan_code and stripe_sub_id:
        link = economics.get_stripe_subscription_org(stripe_sub_id)
        if link and link.get("plan_code"):
            plan_code = str(link["plan_code"]).strip().lower()
    sub_row = economics.get_subscription_by_org(org_id)
    if not plan_code and sub_row:
        plan_code = str(sub_row.get("plan_code") or "").strip().lower()

    if plan_code and plan_code not in _PRO_PLAN_CODES:
        return {"ok": True, "ignored": True, "reason": "not_pro_plan"}

    md = invoice.get("metadata") if isinstance(invoice.get("metadata"), dict) else {}
    ctx = resolve_genesis_commission_context(economics, org_id=org_id, invoice_metadata=md)
    if not ctx:
        return {"ok": True, "ignored": True, "reason": "no_genesis_attribution"}

    # Idempotent retry of the same invoice must surface as duplicate before first-invoice gate.
    idem_key = f"genesis:invoice:{inv_id}"
    with economics._conn() as con:
        existing = con.execute(
            "SELECT id FROM affiliate_commissions WHERE idempotency_key = ? OR stripe_invoice_id = ?",
            (idem_key, inv_id),
        ).fetchone()
        if existing:
            return {"ok": True, "duplicate": True, "commission_id": str(existing[0])}
        prior = count_non_voided_commissions_for_referred_org(con, org_id)
    if prior > 0:
        return {"ok": True, "ignored": True, "reason": "first_invoice_only"}

    rate = Decimal(str(ctx["commission_rate"]))
    gross = (Decimal(amount_cents) / Decimal(100)).quantize(Decimal("0.01"))
    commission = (gross * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if commission <= 0:
        return {"ok": True, "ignored": True, "reason": "zero_commission"}

    period_start, period_end = _invoice_period(invoice)
    referred_user_id = ctx.get("referred_user_id")
    if referred_user_id:
        referred_user_id = str(referred_user_id).strip() or None

    with economics._conn() as con:
        inserted, comm_id = insert_affiliate_commission(
            con,
            referrer_user_id=str(ctx["referrer_user_id"]),
            referred_org_id=org_id,
            stripe_invoice_id=inv_id,
            gross_amount=gross,
            commission_rate=rate,
            commission_amount=commission,
            status="pending",
            referred_user_id=referred_user_id,
            stripe_customer_id=customer_id,
            stripe_subscription_id=stripe_sub_id,
            period_start=period_start,
            period_end=period_end,
            idempotency_key=idem_key,
        )
        con.commit()

    if not inserted:
        return {"ok": True, "duplicate": True, "commission_id": comm_id}

    _log.info(
        "genesis commission created id=%s referrer=%s org=%s usd=%s rate=%s",
        comm_id,
        ctx["referrer_user_id"],
        org_id,
        commission,
        rate,
    )
    return {"ok": True, "commission_id": comm_id, "commission_amount": float(commission)}


def handle_genesis_charge_refunded(economics: EconomicsStore, charge: Dict[str, Any]) -> Dict[str, Any]:
    economics.init_schema()
    cid = str(charge.get("id") or "").strip()
    if not cid:
        return {"ok": False, "error": "missing_charge_id"}
    refunded = charge.get("refunded")
    amount_refunded = int(charge.get("amount_refunded") or 0)
    if not refunded and amount_refunded <= 0:
        return {"ok": True, "ignored": True}

    inv_id = charge.get("invoice")
    if isinstance(inv_id, dict):
        inv_id = str(inv_id.get("id") or "").strip()
    inv_id = str(inv_id or "").strip()
    if not inv_id:
        return {"ok": True, "ignored": True, "reason": "no_invoice_on_charge"}

    with economics._conn() as con:
        n = void_commissions_for_invoice(con, inv_id, reason="refunded")
        con.commit()
    return {"ok": True, "voided": n, "invoice_id": inv_id}


def handle_genesis_invoice_payment_failed(
    economics: EconomicsStore, invoice: Dict[str, Any]
) -> Dict[str, Any]:
    """Skip commission creation on failed payments."""
    return {"ok": True, "ignored": True, "reason": "payment_failed"}


def dispatch_genesis_stripe_side_effect(
    economics: EconomicsStore, event_type: str, data: Dict[str, Any]
) -> Dict[str, Any]:
    if event_type == "invoice.paid":
        return handle_genesis_invoice_paid(economics, data)
    if event_type == "charge.refunded":
        return handle_genesis_charge_refunded(economics, data)
    if event_type in ("invoice.payment_failed", "invoice.marked_uncollectible"):
        return handle_genesis_invoice_payment_failed(economics, data)
    return {"ok": True, "ignored": True, "reason": "genesis_event_not_handled"}
