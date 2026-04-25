"""Record meaningful affiliate activity days (thin hooks from billing / attribution)."""
from __future__ import annotations

from typing import Optional

from backend.affiliates.gamification_events import emit_affiliate_gamification_event
from backend.affiliates.service import get_active_affiliate_for_org
from backend.economics.store import EconomicsStore, get_economics_store


def _emit_credit_confirmation(
    economics: EconomicsStore, org_id: str, *, affiliate_id_hint: Optional[str] = None
) -> None:
    """When referral credit moves pending → confirmed (activation or paid path)."""
    r = economics.confirm_attribution_credit_for_org(org_id)
    if not r or not r.get("changed"):
        return
    aid = str(r.get("affiliate_id") or affiliate_id_hint or "").strip()
    if not aid:
        active = get_active_affiliate_for_org(org_id, economics=economics)
        if active and active.get("affiliate"):
            aid = str(active["affiliate"]["id"])
    if not aid:
        return
    emit_affiliate_gamification_event(
        "affiliate_pending_credit_confirmed",
        affiliate_id=aid,
        org_id=org_id,
        attr_id=str(r.get("attr_id") or ""),
    )


def on_referred_org_usage_metered(org_id: str, created_at_iso: str) -> None:
    """Call after a usage event is written for org_id (first activation signal for referrals)."""
    oid = (org_id or "").strip()
    if not oid:
        return
    eco = get_economics_store()
    eco.init_schema()
    active = get_active_affiliate_for_org(oid, economics=eco)
    if not active or not active.get("affiliate"):
        return
    aid = str(active["affiliate"]["id"])
    eco.record_affiliate_gamification_day(aid, created_at_iso[:10], activation=True)
    _emit_credit_confirmation(eco, oid, affiliate_id_hint=aid)


def record_qualified_signup_day(
    affiliate_id: str, attributed_at_iso: str, economics: Optional[EconomicsStore] = None
) -> None:
    eco = economics or get_economics_store()
    eco.init_schema()
    eco.record_affiliate_gamification_day(
        affiliate_id, attributed_at_iso[:10], qualified_signup=True
    )


def record_conversion_day(
    affiliate_id: str, created_at_iso: str, economics: Optional[EconomicsStore] = None
) -> None:
    eco = economics or get_economics_store()
    eco.init_schema()
    eco.record_affiliate_gamification_day(
        affiliate_id, created_at_iso[:10], conversion=True
    )


def confirm_referral_credit_after_payment(*, org_id: str, economics: Optional[EconomicsStore] = None) -> None:
    """Paid conversion path: confirm attribution without waiting for usage metering."""
    eco = economics or get_economics_store()
    eco.init_schema()
    _emit_credit_confirmation(eco, (org_id or "").strip())
