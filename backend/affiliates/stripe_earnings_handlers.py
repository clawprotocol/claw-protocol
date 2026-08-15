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
from backend.billing.subscription_authority import (
    apply_invoice_paid_subscription_renewal,
    _subscription_id_from_invoice,
    apply_stripe_subscription_object,
)
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
    Sync canonical subscription renewal, then create affiliate earning when eligible.
    Idempotent on Stripe invoice id for earnings.
    """
    economics.init_schema()
    subscription_sync = apply_invoice_paid_subscription_renewal(economics, invoice)
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
        return {
            **subscription_sync,
            "ok": False,
            "ignored": True,
            "retryable": True,
            "reason": "no_org_mapping",
        }

    amount_cents = int(invoice.get("amount_paid") or 0)
    if amount_cents <= 0:
        return {**subscription_sync, "ok": True, "ignored": True, "reason": "zero_amount"}

    stripe_sub_id = _subscription_id_from_invoice(invoice)

    if stripe_sub_id and not economics.subscription_qualifies_for_affiliate_earning(stripe_sub_id):
        _log.info("invoice.paid skip: subscription not qualifying sub=%s", stripe_sub_id)
        return {
            **subscription_sync,
            "ok": True,
            "ignored": True,
            "reason": "subscription_inactive",
        }

    # Genesis affiliate_commissions ledger is commercial SoT — do not double-pay via legacy earnings.
    try:
        from backend.affiliates.genesis_referral_service import resolve_genesis_commission_context

        md = invoice.get("metadata") if isinstance(invoice.get("metadata"), dict) else {}
        if resolve_genesis_commission_context(economics, org_id=org_id, invoice_metadata=md):
            return {
                **subscription_sync,
                "ok": True,
                "ignored": True,
                "reason": "genesis_ledger_authoritative",
            }
    except Exception:
        _log.exception("genesis attribution probe failed org=%s", org_id)

    active = affiliate_service.get_active_affiliate_for_org(org_id, economics=economics)
    if not active or not active.get("affiliate"):
        return {**subscription_sync, "ok": True, "ignored": True, "reason": "no_attribution"}
    aff_row = active["affiliate"]
    aff_id = str(aff_row["id"])
    owner = (aff_row.get("owner_org_id") or "").strip()
    if owner and owner == org_id:
        _log.info("invoice.paid skip: self_referral org=%s", org_id)
        return {**subscription_sync, "ok": True, "ignored": True, "reason": "self_referral"}

    attr = active.get("attribution") or {}
    if str(attr.get("momentum_credit_state") or "") == "excluded":
        return {**subscription_sync, "ok": True, "ignored": True, "reason": "attribution_excluded"}

    sub_row = economics.get_subscription_by_org(org_id)
    plan_code = str(sub_row.get("plan_code") or "pro") if sub_row else "pro"
    link = economics.get_stripe_subscription_org(stripe_sub_id) if stripe_sub_id else None
    if link and link.get("plan_code"):
        plan_code = str(link["plan_code"])

    if not pricing.affiliate_eligible_for_plan(plan_code):
        return {**subscription_sync, "ok": True, "ignored": True, "reason": "plan_not_eligible"}

    # Idempotent retry of the same invoice before first-invoice gate.
    try:
        with economics._conn() as con:
            existing = con.execute(
                """
                SELECT id FROM affiliate_earnings
                WHERE idempotency_key = ? OR invoice_id = ?
                LIMIT 1
                """,
                (idem, inv_id),
            ).fetchone()
            if existing:
                return {
                    **subscription_sync,
                    "ok": True,
                    "duplicate": True,
                    "earning_id": str(existing[0]),
                    "invoice_id": inv_id,
                }
    except Exception:
        _log.exception("duplicate earning probe failed invoice=%s", inv_id)

    # Canonical: first successfully settled Pro invoice only (not recurring cycles).
    billing_reason = str(invoice.get("billing_reason") or "")
    if billing_reason == "subscription_cycle":
        return {
            **subscription_sync,
            "ok": True,
            "ignored": True,
            "reason": "first_invoice_only",
        }
    prior_earnings = 0
    try:
        with economics._conn() as con:
            prior_earnings = int(
                con.execute(
                    """
                    SELECT COUNT(*) FROM affiliate_earnings
                    WHERE referred_org_id = ?
                      AND COALESCE(status, '') NOT IN (
                        'voided', 'reversed', 'refunded', 'cancelled', 'canceled'
                      )
                    """,
                    (org_id,),
                ).fetchone()[0]
            )
    except Exception:
        _log.exception("prior earning count failed org=%s", org_id)
    if prior_earnings > 0:
        return {
            **subscription_sync,
            "ok": True,
            "ignored": True,
            "reason": "first_invoice_only",
        }

    bps = pricing.affiliate_bps_for_plan(plan_code)
    if bps <= 0:
        return {**subscription_sync, "ok": True, "ignored": True, "reason": "zero_bps"}

    basis = (Decimal(amount_cents) / Decimal(100)).quantize(Decimal("0.01"))
    payout_amt = (basis * Decimal(bps) / Decimal("10000")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    if payout_amt <= 0:
        return {**subscription_sync, "ok": True, "ignored": True, "reason": "zero_payout"}

    earning_type = "initial"

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
        return {**subscription_sync, "ok": True, "duplicate": True, "invoice_id": inv_id}

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
    return {
        **subscription_sync,
        "ok": True,
        "earning_id": earning_id,
        "invoice_id": inv_id,
    }


def handle_subscription_updated(economics: EconomicsStore, sub: Dict[str, Any]) -> Dict[str, Any]:
    economics.init_schema()
    authority = apply_stripe_subscription_object(economics, sub)
    if not authority.get("ok"):
        return authority
    if authority.get("ignored"):
        return authority
    sid = str(sub.get("id") or "").strip()
    status = str(sub.get("status") or "unknown")
    if status in ("canceled", "unpaid", "incomplete_expired"):
        n = economics.cancel_affiliate_earnings_for_stripe_subscription(
            sid, reason="subscription_inactive"
        )
        return {**authority, "cancelled_earnings": n}
    return authority


def handle_subscription_created(economics: EconomicsStore, sub: Dict[str, Any]) -> Dict[str, Any]:
    return handle_subscription_updated(economics, sub)


def handle_subscription_deleted(economics: EconomicsStore, sub: Dict[str, Any]) -> Dict[str, Any]:
    economics.init_schema()
    sid = str(sub.get("id") or "").strip()
    if not sid:
        return {"ok": False, "error": "missing_subscription_id"}
    deleted = dict(sub)
    deleted["status"] = "canceled"
    authority = apply_stripe_subscription_object(economics, deleted)
    n = economics.cancel_affiliate_earnings_for_stripe_subscription(sid, reason="subscription_deleted")
    return {**authority, "cancelled_earnings": n}


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
    if etype == "checkout.session.completed":
        from backend.billing.stripe_subscription_sync import handle_checkout_session_completed

        checkout_result = handle_checkout_session_completed(economics, data)
        return {**checkout_result, "genesis": genesis_result}
    if etype == "invoice.paid":
        legacy = handle_invoice_paid(economics, data)
        return {**legacy, "genesis": genesis_result}
    if etype == "customer.subscription.created":
        return handle_subscription_created(economics, data)
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
