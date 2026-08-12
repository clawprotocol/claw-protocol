"""Stripe Checkout Session metadata helpers (Genesis Referral Access)."""

from __future__ import annotations

from typing import Dict, Optional

from backend.affiliates.genesis_referral_service import build_stripe_checkout_metadata


def lawdog_pro_checkout_metadata(
    *,
    org_id: str,
    referral_code: Optional[str] = None,
    visitor_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Dict[str, str]:
    """Metadata for LawDog Pro ($49/mo) checkout — attach to session, customer, and subscription."""
    return build_stripe_checkout_metadata(
        org_id=org_id,
        referral_code=referral_code,
        visitor_id=visitor_id,
        user_id=user_id,
        plan_code="pro",
    )
