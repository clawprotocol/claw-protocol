"""Billing checkout session API — Stripe Checkout for LawDog Pro."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from backend.billing.billing_display import build_billing_status_payload
from backend.billing.stripe_config import (
    is_stripe_checkout_configured,
    is_stripe_portal_configured,
    stripe_price_pro_annual,
    stripe_price_pro_monthly,
)
from backend.billing.checkout_app_origin import (
    build_checkout_cancel_url,
    build_checkout_success_url,
    build_portal_return_url,
)
from backend.billing.checkout_attempts import (
    normalize_checkout_cadence,
    reuse_or_create_checkout_session,
)
from backend.billing.stripe_client import (
    create_billing_portal_session,
    create_checkout_session,
    expire_checkout_session,
    retrieve_checkout_session,
)
from backend.billing.stripe_subscription_sync import sync_subscription_from_stripe_checkout_session
from backend.billing.subscription_authority import is_subscription_entitled
from backend.economics.store import get_economics_store
from backend.payments.stripe_checkout_helpers import lawdog_pro_checkout_metadata
from backend.security.workspace_identity import assert_agreement_accessible, require_verified_org_id
from backend.security.supabase_jwt import extract_bearer_token, verify_supabase_access_token

router = APIRouter(prefix="/v1/billing", tags=["billing-checkout"])
_log = logging.getLogger("claw.billing.checkout_api")

# Frontend create-flow sentinel — no workspace row exists yet (anonymous → Pro).
CREATE_FLOW_CHECKOUT_AGREEMENT_ID = "__claw_create_checkout__"


class CheckoutSessionIn(BaseModel):
    agreement_id: str = Field(..., min_length=1, max_length=256)
    cadence: str = Field(default="monthly")
    return_to: str = Field(default="/app/create")
    customer_email: Optional[str] = Field(default=None, max_length=256)
    referral_code: Optional[str] = Field(default=None, max_length=64)
    visitor_id: Optional[str] = Field(default=None, max_length=128)


class VerifyCheckoutSessionIn(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=256)


_CALLER_CUSTOMER_KEYS = frozenset({"customer_id", "customer", "stripe_customer_id", "cus"})


def _reject_caller_customer_identity(payload: Optional[Dict[str, Any]]) -> None:
    if not payload:
        return
    for key in payload:
        if str(key).strip().lower() in _CALLER_CUSTOMER_KEYS:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "caller_customer_rejected",
                    "message": "Caller-supplied customer identity is not accepted.",
                },
            )


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


@router.post("/checkout-session")
async def post_checkout_session(request: Request, body: CheckoutSessionIn) -> Dict[str, Any]:
    if not is_stripe_checkout_configured():
        raise HTTPException(status_code=503, detail="stripe_checkout_not_configured")

    agreement_id = body.agreement_id.strip()
    if agreement_id == CREATE_FLOW_CHECKOUT_AGREEMENT_ID:
        org_id = require_verified_org_id(request)
    else:
        _, org_id = assert_agreement_accessible(request, agreement_id)
    eco = get_economics_store()
    eco.init_schema()
    existing = eco.get_subscription_by_org(org_id)
    if is_subscription_entitled(existing):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "already_subscribed",
                "message": "This workspace already has an active subscription.",
            },
        )
    success_url = build_checkout_success_url(return_to=body.return_to.strip() or "/app/create")
    cancel_url = build_checkout_cancel_url(agreement_id=agreement_id)

    metadata = lawdog_pro_checkout_metadata(
        org_id=org_id,
        referral_code=body.referral_code,
        visitor_id=body.visitor_id,
        user_id=_checkout_user_id(request),
    )
    metadata["agreement_id"] = agreement_id
    cadence = normalize_checkout_cadence(body.cadence)

    try:
        session = reuse_or_create_checkout_session(
            eco=eco,
            org_id=org_id,
            user_id=_checkout_user_id(request),
            agreement_id=agreement_id,
            cadence=cadence,
            return_to=body.return_to.strip() or "/app/create",
            price_id=_price_for_cadence(cadence),
            success_url=success_url,
            cancel_url=cancel_url,
            customer_email=body.customer_email,
            metadata=metadata,
            create_session=create_checkout_session,
            retrieve_session=retrieve_checkout_session,
            expire_session=expire_checkout_session,
            sync_session=sync_subscription_from_stripe_checkout_session,
        )
    except RuntimeError as exc:
        _log.exception("checkout_session_create_failed org=%s", org_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    kind = str(session.get("kind") or "session")
    if kind == "already_subscribed":
        raise HTTPException(
            status_code=409,
            detail={
                "code": "already_subscribed",
                "message": "This workspace already has an active subscription.",
                "session_id": session.get("session_id"),
            },
        )
    if kind == "processing":
        raise HTTPException(
            status_code=409,
            detail={
                "code": "payment_processing",
                "message": "Your payment is being processed. Do not pay again.",
                "session_id": session.get("session_id"),
            },
        )
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

    session_org = (session.get("metadata") or {}).get("org_id") or (session.get("metadata") or {}).get("claw_org_id")
    if session_org and str(session_org).strip() != org_id:
        raise HTTPException(status_code=403, detail="org_mismatch")
    session_agreement = str((session.get("metadata") or {}).get("agreement_id") or "").strip()
    if session_agreement and session_agreement != CREATE_FLOW_CHECKOUT_AGREEMENT_ID:
        assert_agreement_accessible(request, session_agreement)

    eco = get_economics_store()
    result = sync_subscription_from_stripe_checkout_session(eco, session)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error") or "verify_failed")
    sub = eco.get_subscription_by_org(org_id)
    return {"ok": True, "sync": result, "subscription": sub}


@router.get("/status")
async def get_billing_status(request: Request) -> Dict[str, Any]:
    """Org-scoped subscription display. Org comes from the verified principal only."""
    org_id = require_verified_org_id(request)
    eco = get_economics_store()
    eco.init_schema()
    row = eco.get_subscription_by_org(org_id)
    customer_id = eco.get_stripe_customer_id_for_org(org_id)
    return build_billing_status_payload(
        org_id=org_id,
        row=row,
        stripe_configured=is_stripe_portal_configured(),
        stripe_customer_id=customer_id,
    )


@router.post("/portal-session")
async def post_portal_session(request: Request) -> Dict[str, Any]:
    raw: Dict[str, Any] = {}
    try:
        parsed = await request.json()
        if isinstance(parsed, dict):
            raw = parsed
    except Exception:
        raw = {}
    _reject_caller_customer_identity(raw)
    _reject_caller_customer_identity({key: request.query_params.get(key) for key in request.query_params})
    org_id = require_verified_org_id(request)
    if not is_stripe_portal_configured():
        raise HTTPException(
            status_code=503,
            detail={
                "code": "stripe_portal_not_configured",
                "message": "Billing management is not configured in this environment.",
            },
        )
    eco = get_economics_store()
    eco.init_schema()
    customer_id = eco.get_stripe_customer_id_for_org(org_id)
    if not customer_id:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "no_stripe_customer",
                "message": "No billing customer is on file for this workspace.",
            },
        )
    return_to = str(raw.get("return_to") or "/app/billing").strip() or "/app/billing"
    return_url = build_portal_return_url(return_to=return_to)
    try:
        session = create_billing_portal_session(customer_id=customer_id, return_url=return_url)
    except RuntimeError as exc:
        _log.exception("portal_session_create_failed org=%s", org_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    portal_url = str(session.get("url") or "").strip()
    session_id = str(session.get("id") or "").strip()
    if not portal_url or not session_id:
        raise HTTPException(status_code=502, detail="stripe_portal_incomplete")
    return {
        "ok": True,
        "session_id": session_id,
        "portal_url": portal_url,
        "org_id": org_id,
        "return_url": return_url,
    }
