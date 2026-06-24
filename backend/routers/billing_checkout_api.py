"""Billing checkout session API — Stripe Checkout for LawDog Pro."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.billing.stripe_config import (
    is_stripe_checkout_configured,
    stripe_price_pro_annual,
    stripe_price_pro_monthly,
)
from backend.billing.stripe_client import create_checkout_session, retrieve_checkout_session
from backend.billing.stripe_subscription_sync import sync_subscription_from_stripe_checkout_session
from backend.economics.store import get_economics_store
from backend.payments.stripe_checkout_helpers import lawdog_pro_checkout_metadata

router = APIRouter(prefix="/v1/billing", tags=["billing-checkout"])
_log = logging.getLogger("claw.billing.checkout_api")


class CheckoutSessionIn(BaseModel):
    org_id: str = Field(..., min_length=1, max_length=128)
    agreement_id: str = Field(..., min_length=1, max_length=256)
    cadence: str = Field(default="monthly")
    return_to: str = Field(default="/app/create")
    user_id: Optional[str] = Field(default=None, max_length=128)
    customer_email: Optional[str] = Field(default=None, max_length=256)
    referral_code: Optional[str] = Field(default=None, max_length=64)
    visitor_id: Optional[str] = Field(default=None, max_length=128)


class VerifyCheckoutSessionIn(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=256)
    org_id: str = Field(..., min_length=1, max_length=128)


def _app_origin() -> str:
    return os.getenv("LAWDOG_APP_ORIGIN", os.getenv("VITE_LAWDOG_APP_ORIGIN", "http://localhost:5173")).rstrip("/")


def _price_for_cadence(cadence: str) -> str:
    c = (cadence or "monthly").strip().lower()
    if c == "annual" and stripe_price_pro_annual():
        return stripe_price_pro_annual()
    return stripe_price_pro_monthly()


@router.post("/checkout-session")
async def post_checkout_session(body: CheckoutSessionIn) -> Dict[str, Any]:
    if not is_stripe_checkout_configured():
        raise HTTPException(status_code=503, detail="stripe_checkout_not_configured")

    org_id = body.org_id.strip()
    agreement_id = body.agreement_id.strip()
    return_to = body.return_to.strip() or "/app/create"
    if not return_to.startswith("/"):
        return_to = f"/{return_to}"

    success_sep = "&" if "?" in return_to else "?"
    success_url = (
        f"{_app_origin()}{return_to}{success_sep}"
        f"premiumCompletion=1&checkout_session_id={{CHECKOUT_SESSION_ID}}"
    )
    cancel_url = f"{_app_origin()}/app/checkout/{agreement_id}"

    metadata = lawdog_pro_checkout_metadata(
        org_id=org_id,
        referral_code=body.referral_code,
        visitor_id=body.visitor_id,
        user_id=body.user_id,
    )
    metadata["agreement_id"] = agreement_id

    try:
        session = create_checkout_session(
            price_id=_price_for_cadence(body.cadence),
            success_url=success_url,
            cancel_url=cancel_url,
            customer_email=body.customer_email,
            metadata=metadata,
        )
    except RuntimeError as exc:
        _log.exception("checkout_session_create_failed org=%s", org_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    session_id = str(session.get("id") or "")
    checkout_url = str(session.get("url") or "")
    if not session_id or not checkout_url:
        raise HTTPException(status_code=502, detail="stripe_session_incomplete")
    return {"ok": True, "session_id": session_id, "checkout_url": checkout_url}


@router.post("/verify-checkout-session")
async def post_verify_checkout_session(body: VerifyCheckoutSessionIn) -> Dict[str, Any]:
    if not is_stripe_checkout_configured():
        raise HTTPException(status_code=503, detail="stripe_checkout_not_configured")

    session_id = body.session_id.strip()
    org_id = body.org_id.strip()
    try:
        session = retrieve_checkout_session(session_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    session_org = (session.get("metadata") or {}).get("org_id") or (session.get("metadata") or {}).get("claw_org_id")
    if session_org and str(session_org).strip() != org_id:
        raise HTTPException(status_code=403, detail="org_mismatch")

    eco = get_economics_store()
    result = sync_subscription_from_stripe_checkout_session(eco, session)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error") or "verify_failed")
    sub = eco.get_subscription_by_org(org_id)
    return {"ok": True, "sync": result, "subscription": sub}
