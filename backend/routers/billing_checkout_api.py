"""Billing checkout session API — Stripe Checkout for LawDog Pro."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from backend.billing.stripe_config import (
    is_stripe_checkout_configured,
    stripe_price_pro_annual,
    stripe_price_pro_monthly,
)
from backend.billing.checkout_intent_store import (
    CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
    assert_create_flow_checkout_intent_for_verify,
    create_create_flow_checkout_intent,
)
from backend.billing.stripe_client import create_checkout_session, retrieve_checkout_session
from backend.billing.stripe_subscription_sync import sync_subscription_from_stripe_checkout_session
from backend.billing.subscription_authority import is_subscription_entitled
from backend.economics.store import get_economics_store
from backend.payments.stripe_checkout_helpers import lawdog_pro_checkout_metadata
from backend.security.safe_redirect import is_allowlisted_internal_path, resolve_safe_redirect_path
from backend.security.workspace_identity import assert_agreement_accessible, require_verified_org_id
from backend.security.supabase_jwt import extract_bearer_token, verify_supabase_access_token
from backend.usage_economics.policy import SUBSCRIPTION_REQUIRED_DETAIL

router = APIRouter(prefix="/v1/billing", tags=["billing-checkout"])
_log = logging.getLogger("claw.billing.checkout_api")

_CHECKOUT_VERIFY_FAILED = {
    "code": "checkout_verification_failed",
    "message": "Checkout could not be verified for this workspace.",
}


class CheckoutSessionIn(BaseModel):
    agreement_id: str = Field(..., min_length=1, max_length=256)
    cadence: str = Field(default="monthly")
    return_to: str = Field(default="/app/create")
    customer_email: Optional[str] = Field(default=None, max_length=256)
    referral_code: Optional[str] = Field(default=None, max_length=64)
    visitor_id: Optional[str] = Field(default=None, max_length=128)


class VerifyCheckoutSessionIn(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=256)


def _app_origin() -> str:
    return os.getenv("LAWDOG_APP_ORIGIN", os.getenv("VITE_LAWDOG_APP_ORIGIN", "http://localhost:5173")).rstrip("/")


def _price_for_cadence(cadence: str) -> str:
    c = (cadence or "monthly").strip().lower()
    if c == "annual" and stripe_price_pro_annual():
        return stripe_price_pro_annual()
    return stripe_price_pro_monthly()


def _checkout_user_id(request: Request) -> Optional[str]:
    token = extract_bearer_token(request)
    if not token:
        return None
    try:
        return str(verify_supabase_access_token(token).get("sub") or "").strip() or None
    except ValueError:
        return None


def _checkout_request_user_id(request: Request) -> Optional[str]:
    bearer_uid = _checkout_user_id(request)
    if bearer_uid:
        return bearer_uid
    from backend.security.supabase_jwt import _test_auth_user_id

    return _test_auth_user_id(request)


@router.post("/checkout-session")
async def post_checkout_session(request: Request, body: CheckoutSessionIn) -> Dict[str, Any]:
    if not is_stripe_checkout_configured():
        raise HTTPException(status_code=503, detail="stripe_checkout_not_configured")

    agreement_id = body.agreement_id.strip()
    checkout_intent_id: Optional[str] = None
    if agreement_id == CREATE_FLOW_CHECKOUT_AGREEMENT_ID:
        org_id = require_verified_org_id(request)
        intent = create_create_flow_checkout_intent(
            org_id=org_id,
            user_id=_checkout_request_user_id(request),
        )
        checkout_intent_id = str(intent.get("intent_id") or "").strip() or None
    else:
        _, org_id = assert_agreement_accessible(request, agreement_id)
    return_to = resolve_safe_redirect_path(body.return_to.strip() or "/app/create", "/app/create")
    if not is_allowlisted_internal_path(return_to):
        return_to = "/app/create"

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
        user_id=_checkout_request_user_id(request),
    )
    metadata["agreement_id"] = agreement_id
    if checkout_intent_id:
        metadata["checkout_intent_id"] = checkout_intent_id

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
    return {"ok": True, "session_id": session_id, "checkout_url": checkout_url, "org_id": org_id}


@router.post("/verify-checkout-session")
async def post_verify_checkout_session(request: Request, body: VerifyCheckoutSessionIn) -> Dict[str, Any]:
    if not is_stripe_checkout_configured():
        raise HTTPException(status_code=503, detail="stripe_checkout_not_configured")

    session_id = body.session_id.strip()
    org_id = require_verified_org_id(request)
    try:
        session = retrieve_checkout_session(session_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    md = session.get("metadata") if isinstance(session.get("metadata"), dict) else {}
    session_org = (md.get("org_id") or md.get("claw_org_id") or "").strip() if isinstance(md, dict) else ""
    if not session_org:
        raise HTTPException(status_code=403, detail=dict(_CHECKOUT_VERIFY_FAILED))
    if session_org != org_id:
        raise HTTPException(status_code=403, detail=dict(_CHECKOUT_VERIFY_FAILED))

    session_agreement = str(md.get("agreement_id") or "").strip()
    checkout_intent_id = str(md.get("checkout_intent_id") or "").strip()
    if session_agreement == CREATE_FLOW_CHECKOUT_AGREEMENT_ID:
        if not checkout_intent_id:
            raise HTTPException(status_code=403, detail=dict(_CHECKOUT_VERIFY_FAILED))
        assert_create_flow_checkout_intent_for_verify(
            intent_id=checkout_intent_id,
            org_id=org_id,
            request_user_id=_checkout_request_user_id(request),
            stripe_session_id=session_id,
        )
    elif session_agreement:
        assert_agreement_accessible(request, session_agreement)

    checkout_user = str(md.get("user_id") or "").strip()
    request_user = _checkout_request_user_id(request)
    if checkout_user and request_user and checkout_user != request_user:
        raise HTTPException(status_code=403, detail=dict(_CHECKOUT_VERIFY_FAILED))

    status = str(session.get("status") or "").strip().lower()
    payment_status = str(session.get("payment_status") or "").strip().lower()
    if status != "complete" or payment_status not in ("paid", "no_payment_required"):
        raise HTTPException(status_code=403, detail=dict(_CHECKOUT_VERIFY_FAILED))

    eco = get_economics_store()
    result = sync_subscription_from_stripe_checkout_session(eco, session)
    if not result.get("ok"):
        raise HTTPException(status_code=403, detail=dict(_CHECKOUT_VERIFY_FAILED))
    if result.get("ignored"):
        raise HTTPException(status_code=403, detail=dict(_CHECKOUT_VERIFY_FAILED))

    sub = eco.get_subscription_by_org(org_id)
    if not is_subscription_entitled(sub):
        raise HTTPException(status_code=403, detail=dict(SUBSCRIPTION_REQUIRED_DETAIL))
    return {"ok": True, "sync": result, "subscription": sub}
