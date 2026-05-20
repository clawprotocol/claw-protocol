"""
Genesis Referral Access — business logic for capture, conversion, and Stripe metadata.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from backend.economics.genesis_referral_store import (
    convert_referral_attribution,
    get_active_attribution_for_org,
    get_genesis_affiliate_by_code,
    normalize_referral_code,
    record_referral_capture,
    upsert_genesis_affiliate,
)
from backend.economics.store import EconomicsStore

_log = logging.getLogger("claw.genesis_referral")


def build_stripe_checkout_metadata(
    *,
    org_id: str,
    referral_code: Optional[str] = None,
    visitor_id: Optional[str] = None,
    user_id: Optional[str] = None,
    plan_code: str = "pro",
) -> Dict[str, str]:
    """Metadata for Stripe Checkout Session, Customer, and Subscription."""
    md: Dict[str, str] = {
        "org_id": org_id.strip(),
        "claw_org_id": org_id.strip(),
        "plan_code": plan_code,
    }
    if referral_code:
        md["referral_code"] = normalize_referral_code(referral_code)
    if visitor_id:
        md["visitor_id"] = visitor_id.strip()[:128]
    if user_id:
        md["user_id"] = user_id.strip()[:128]
    return md


def capture_referral_visit(
    economics: EconomicsStore,
    *,
    referral_code: str,
    visitor_id: str,
    source_path: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    economics.init_schema()
    code = normalize_referral_code(referral_code)
    if not code:
        return {"ok": False, "error": "invalid_referral_code"}
    with economics._conn() as con:
        aff = get_genesis_affiliate_by_code(con, code)
        if not aff:
            return {"ok": False, "error": "unknown_referral_code"}
        if str(aff.get("affiliate_status") or "") != "active":
            return {"ok": False, "error": "affiliate_not_active"}
        row = record_referral_capture(
            con,
            referral_code=code,
            referrer_user_id=str(aff["user_id"]),
            visitor_id=visitor_id,
            source_path=source_path,
            metadata=metadata,
        )
        con.commit()
    return {"ok": True, "attribution": row, "referrer_user_id": aff["user_id"]}


def convert_referral(
    economics: EconomicsStore,
    *,
    referral_code: str,
    visitor_id: str,
    referred_org_id: Optional[str] = None,
    referred_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    economics.init_schema()
    code = normalize_referral_code(referral_code)
    if not code or not (visitor_id or "").strip():
        return {"ok": False, "error": "missing_fields"}
    with economics._conn() as con:
        aff = get_genesis_affiliate_by_code(con, code)
        if not aff:
            return {"ok": False, "error": "unknown_referral_code"}
        if str(aff.get("affiliate_status") or "") != "active":
            return {"ok": False, "error": "affiliate_not_active"}
        if referred_user_id and str(aff["user_id"]).strip() == str(referred_user_id).strip():
            return {"ok": False, "error": "self_referral", "blocked": True}
        row = convert_referral_attribution(
            con,
            visitor_id=visitor_id,
            referral_code=code,
            referred_org_id=referred_org_id,
            referred_user_id=referred_user_id,
        )
        con.commit()
    if not row:
        return {"ok": False, "error": "conversion_failed"}
    if row.get("self_referral"):
        return {"ok": False, "error": "self_referral", "blocked": True}
    return {"ok": True, "attribution": row}


def resolve_genesis_commission_context(
    economics: EconomicsStore,
    *,
    org_id: str,
    invoice_metadata: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Resolve referrer + rate for a paid Pro invoice."""
    economics.init_schema()
    md = invoice_metadata if isinstance(invoice_metadata, dict) else {}
    referral_code = normalize_referral_code(str(md.get("referral_code") or ""))
    md_user = str(md.get("user_id") or "").strip() or None
    with economics._conn() as con:
        attr = get_active_attribution_for_org(con, org_id)
        if not referral_code and attr:
            referral_code = normalize_referral_code(str(attr.get("referral_code") or ""))
        if not referral_code:
            return None
        aff = get_genesis_affiliate_by_code(con, referral_code)
        if not aff:
            return None
        if str(aff.get("affiliate_status") or "") != "active":
            return None
        referrer_user_id = str(aff["user_id"]).strip()
        referred_user_id = (attr or {}).get("referred_user_id")
        if not referred_user_id and md_user:
            referred_user_id = md_user
        if referred_user_id and str(referred_user_id).strip() == referrer_user_id:
            return None
        if referrer_user_id == org_id.strip():
            return None
        rate = float(aff.get("payout_rate") or 0.30)
        return {
            "affiliate": aff,
            "referral_code": referral_code,
            "referrer_user_id": referrer_user_id,
            "referred_user_id": referred_user_id,
            "commission_rate": rate,
            "attribution": attr,
        }


def create_genesis_affiliate(
    economics: EconomicsStore,
    *,
    user_id: str,
    display_name: str,
    referral_code: str,
    community_slug: Optional[str] = None,
    affiliate_status: str = "active",
    payout_rate: float = 0.30,
) -> Dict[str, Any]:
    economics.init_schema()
    with economics._conn() as con:
        row = upsert_genesis_affiliate(
            con,
            user_id=user_id,
            display_name=display_name,
            referral_code=referral_code,
            community_slug=community_slug,
            affiliate_status=affiliate_status,
            payout_rate=payout_rate,
        )
        con.commit()
    return {"ok": True, "affiliate": row}
