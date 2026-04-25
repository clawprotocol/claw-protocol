"""
Affiliate Trust Ledger v1 — append-only events + dashboard aggregates.

Money-of-record for commissions remains ``affiliate_earnings``; this module mirrors
lifecycle signals into ``affiliate_ledger_events`` for affiliate-facing clarity.
"""

from __future__ import annotations

import hashlib
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from backend.economics import config as econ_config
from backend.economics.store import EconomicsStore, _utc_now


def _customer_ref_hash(org_id: str) -> str:
    salt = os.getenv("CLAW_AFFILIATE_TRUST_CUSTOMER_HASH_SALT", "").strip() or "unset_change_me"
    raw = f"{salt}:{(org_id or '').strip()}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:40]


def _next_payout_friday_end_utc(now: datetime) -> datetime:
    """End of calendar day UTC for the next Friday (payout cadence anchor)."""
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    d = now.astimezone(timezone.utc)
    days_until_friday = (4 - d.weekday()) % 7
    if days_until_friday == 0:
        target = d.date()
    else:
        target = (d + timedelta(days=days_until_friday)).date()
    return datetime(
        target.year, target.month, target.day, 23, 59, 59, 999000, tzinfo=timezone.utc
    )


def _week_start_monday_utc(now: datetime) -> datetime:
    d = now.astimezone(timezone.utc)
    monday = d.date() - timedelta(days=d.weekday())
    return datetime(monday.year, monday.month, monday.day, 0, 0, 0, 0, tzinfo=timezone.utc)


def record_click_attributed(
    economics: EconomicsStore,
    *,
    referral_code: str,
    idempotency_key: str,
    customer_ref_hash: Optional[str] = None,
    agreement_id: Optional[str] = None,
) -> Dict[str, Any]:
    code = (referral_code or "").strip().lower()
    if len(code) < 2:
        return {"ok": False, "error": "invalid_code"}
    eco = economics
    eco.init_schema()
    aff = eco.get_affiliate_by_code(code)
    if not aff:
        return {"ok": False, "error": "unknown_affiliate"}
    aid = str(aff["id"])
    ref_slug = str(aff.get("affiliate_code") or code)
    inserted = eco.insert_trust_ledger_event(
        event_id=str(uuid.uuid4()),
        created_at=_utc_now(),
        affiliate_id=aid,
        referral_code=ref_slug,
        event_type="click_attributed",
        customer_ref_hash=customer_ref_hash,
        agreement_id=agreement_id,
        gross_revenue_usd=None,
        commission_amount_usd=0.0,
        status="posted",
        payout_batch_id=None,
        proof_id=None,
        idempotency_key=(idempotency_key or "").strip() or None,
        meta_json=None,
    )
    return {"ok": True, "recorded": bool(inserted)}


def record_signup_attributed(
    economics: EconomicsStore,
    *,
    affiliate_id: str,
    referral_code: str,
    attribution_id: str,
    org_id: str,
) -> None:
    economics.init_schema()
    economics.insert_trust_ledger_event(
        event_id=str(uuid.uuid4()),
        created_at=_utc_now(),
        affiliate_id=affiliate_id,
        referral_code=referral_code,
        event_type="signup_attributed",
        customer_ref_hash=_customer_ref_hash(org_id),
        agreement_id=None,
        gross_revenue_usd=None,
        commission_amount_usd=0.0,
        status="posted",
        payout_batch_id=None,
        proof_id=attribution_id,
        idempotency_key=f"signup:{attribution_id}",
        meta_json=None,
    )


def record_commission_earned_from_stripe(
    economics: EconomicsStore,
    *,
    earning_id: str,
    affiliate_id: str,
    referral_code: str,
    referred_org_id: str,
    gross_revenue_usd: float,
    commission_usd: float,
    invoice_id: Optional[str],
) -> None:
    economics.init_schema()
    economics.insert_trust_ledger_event(
        event_id=str(uuid.uuid4()),
        created_at=_utc_now(),
        affiliate_id=affiliate_id,
        referral_code=referral_code,
        event_type="payment_cleared",
        customer_ref_hash=_customer_ref_hash(referred_org_id),
        agreement_id=None,
        gross_revenue_usd=gross_revenue_usd,
        commission_amount_usd=0.0,
        status="posted",
        payout_batch_id=None,
        proof_id=invoice_id,
        idempotency_key=f"payment_cleared:{earning_id}",
        meta_json={"earning_id": earning_id},
    )
    economics.insert_trust_ledger_event(
        event_id=str(uuid.uuid4()),
        created_at=_utc_now(),
        affiliate_id=affiliate_id,
        referral_code=referral_code,
        event_type="commission_earned",
        customer_ref_hash=_customer_ref_hash(referred_org_id),
        agreement_id=None,
        gross_revenue_usd=gross_revenue_usd,
        commission_amount_usd=float(commission_usd),
        status="posted",
        payout_batch_id=None,
        proof_id=earning_id,
        idempotency_key=f"commission_earned:{earning_id}",
        meta_json={"invoice_id": invoice_id},
    )


def record_payout_sent(
    economics: EconomicsStore,
    *,
    affiliate_id: str,
    referral_code: str,
    batch_id: str,
    amount_usd: float,
    tx_hash: str,
) -> None:
    economics.init_schema()
    economics.insert_trust_ledger_event(
        event_id=str(uuid.uuid4()),
        created_at=_utc_now(),
        affiliate_id=affiliate_id,
        referral_code=referral_code,
        event_type="payout_sent",
        customer_ref_hash=None,
        agreement_id=None,
        gross_revenue_usd=None,
        commission_amount_usd=abs(float(amount_usd)),
        status="posted",
        payout_batch_id=batch_id,
        proof_id=(tx_hash or "").strip() or None,
        idempotency_key=f"payout_sent:{batch_id}",
        meta_json={"batch_id": batch_id},
    )


def record_rollover(
    economics: EconomicsStore,
    *,
    affiliate_id: str,
    referral_code: str,
    carry_usd: float,
    week_key: str,
) -> bool:
    economics.init_schema()
    return economics.insert_trust_ledger_event(
        event_id=str(uuid.uuid4()),
        created_at=_utc_now(),
        affiliate_id=affiliate_id,
        referral_code=referral_code,
        event_type="rollover",
        customer_ref_hash=None,
        agreement_id=None,
        gross_revenue_usd=None,
        commission_amount_usd=0.0,
        status="posted",
        payout_batch_id=None,
        proof_id=None,
        idempotency_key=f"rollover:{affiliate_id}:{week_key}",
        meta_json={"carry_usd": carry_usd, "week_key": week_key},
    )


def record_reversal_for_earning(
    economics: EconomicsStore,
    *,
    affiliate_id: str,
    referral_code: str,
    earning_id: str,
    amount_usd: float,
    reason: str,
) -> bool:
    economics.init_schema()
    return economics.insert_trust_ledger_event(
        event_id=str(uuid.uuid4()),
        created_at=_utc_now(),
        affiliate_id=affiliate_id,
        referral_code=referral_code,
        event_type="reversal",
        customer_ref_hash=None,
        agreement_id=None,
        gross_revenue_usd=None,
        commission_amount_usd=-abs(float(amount_usd)),
        status="posted",
        payout_batch_id=None,
        proof_id=earning_id,
        idempotency_key=f"reversal:{earning_id}",
        meta_json={"reason": reason},
    )


def emit_reversals_for_cancelled_charge(economics: EconomicsStore, charge_id: str) -> int:
    economics.init_schema()
    rows = economics.list_cancelled_earnings_rows_for_charge(charge_id)
    n = 0
    for r in rows:
        aid = str(r.get("affiliate_id") or "")
        eid = str(r.get("id") or "")
        amt = float(r.get("amount_usd") or 0)
        if not aid or not eid or amt <= 0:
            continue
        aff = economics.get_affiliate(aid)
        if not aff:
            continue
        code = str(aff.get("affiliate_code") or "").strip() or aid
        if record_reversal_for_earning(
            economics,
            affiliate_id=aid,
            referral_code=code,
            earning_id=eid,
            amount_usd=amt,
            reason=str(r.get("cancellation_reason") or "cancelled"),
        ):
            n += 1
    return n


def build_trust_dashboard(
    economics: EconomicsStore,
    *,
    affiliate_id: str,
    referral_code: str,
) -> Dict[str, Any]:
    economics.init_schema()
    now = datetime.now(timezone.utc)
    week_start = _week_start_monday_utc(now)
    week_start_iso = week_start.isoformat().replace("+00:00", "Z")
    threshold = float(econ_config.affiliate_payout_threshold_usd())
    ledger = economics.affiliate_earnings_usd_summary(affiliate_id)
    pending = float(ledger.get("pending_usd") or 0)
    payable = float(ledger.get("payable_usd") or 0)
    paid = float(ledger.get("paid_usd") or 0)
    unpaid_total = round(pending + payable, 2)
    eligible = unpaid_total >= threshold - 1e-9
    rolling = round(unpaid_total, 2) if not eligible and unpaid_total > 0 else 0.0
    pending_week = round(economics.sum_trust_commission_earned_since(affiliate_id, week_start_iso), 2)
    clicks = economics.count_trust_ledger_events(affiliate_id, "click_attributed")
    signups = economics.count_trust_ledger_events(affiliate_id, "signup_attributed")
    conversions = economics.count_trust_ledger_events(affiliate_id, "commission_earned")
    latest = economics.get_latest_completed_affiliate_payout(affiliate_id)
    next_friday = _next_payout_friday_end_utc(now)
    rows = economics.list_trust_ledger_events_for_affiliate(affiliate_id, limit=25)
    activity: List[Dict[str, Any]] = []
    for r in rows:
        activity.append(
            {
                "at": r.get("created_at"),
                "type": r.get("event_type"),
                "commission_usd": round(float(r.get("commission_amount_usd") or 0), 4),
                "gross_usd": (
                    round(float(r["gross_revenue_usd"]), 2)
                    if r.get("gross_revenue_usd") is not None
                    else None
                ),
                "status": r.get("status"),
                "batch_id": r.get("payout_batch_id"),
            }
        )
    return {
        "referral_code": referral_code,
        "clicks": int(clicks),
        "signups": int(signups),
        "conversions": int(conversions),
        "pending_this_week_usd": pending_week,
        "unpaid_total_usd": unpaid_total,
        "eligible_next_payout": bool(eligible),
        "rolling_forward_usd": rolling,
        "payout_threshold_usd": threshold,
        "payout_weekday": "friday",
        "next_payout_window_end_at": next_friday.isoformat().replace("+00:00", "Z"),
        "last_payout_at": (latest or {}).get("paid_at") or (latest or {}).get("created_at"),
        "lifetime_paid_usd": round(paid, 2),
        "earnings_pending_usd": round(pending, 2),
        "earnings_payable_usd": round(payable, 2),
        "recent_activity": activity,
    }


def run_friday_rollover_pass(
    economics: EconomicsStore, *, as_of: Optional[datetime] = None
) -> Dict[str, Any]:
    """
    Operator-triggered: emit rollover ledger rows for affiliates under threshold (idempotent per ISO week).
    """
    economics.init_schema()
    dt = as_of or datetime.now(timezone.utc)
    iso_week = dt.isocalendar()
    week_key = f"{iso_week[0]}-W{iso_week[1]:02d}"
    threshold = float(econ_config.affiliate_payout_threshold_usd())
    created = 0
    scanned = 0
    for row in economics.iter_affiliate_ids_for_trust_rollover():
        scanned += 1
        aid = str(row.get("id") or "")
        code = str(row.get("affiliate_code") or "").strip()
        if not aid or not code:
            continue
        summary = economics.affiliate_earnings_usd_summary(aid)
        pending = float(summary.get("pending_usd") or 0)
        payable = float(summary.get("payable_usd") or 0)
        total = pending + payable
        if total <= 0:
            continue
        if total >= threshold - 1e-9:
            continue
        if record_rollover(
            economics,
            affiliate_id=aid,
            referral_code=code,
            carry_usd=round(total, 2),
            week_key=week_key,
        ):
            created += 1
    return {"ok": True, "week_key": week_key, "rollovers_recorded": created, "affiliates_scanned": scanned}
