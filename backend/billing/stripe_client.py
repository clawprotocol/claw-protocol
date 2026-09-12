"""Stripe Checkout Session creation via REST (no stripe SDK required)."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import httpx

from backend.billing.stripe_config import stripe_secret_key

_log = logging.getLogger("claw.billing.stripe_client")

STRIPE_API_BASE = "https://api.stripe.com/v1"


def _stripe_request(
    method: str,
    path: str,
    data: Dict[str, Any],
    *,
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    key = stripe_secret_key()
    if not key:
        raise RuntimeError("stripe_not_configured")
    url = f"{STRIPE_API_BASE}{path}"
    headers: Dict[str, str] = {}
    if idempotency_key:
        headers["Idempotency-Key"] = str(idempotency_key).strip()[:255]
    with httpx.Client(timeout=30.0) as client:
        if method.upper() == "GET":
            res = client.request(
                method,
                url,
                params=data or None,
                auth=(key, ""),
                headers=headers or None,
            )
        else:
            res = client.request(
                method,
                url,
                data=data,
                auth=(key, ""),
                headers=headers or None,
            )
    if res.status_code >= 400:
        _log.warning("stripe_api_error path=%s status=%s body=%s", path, res.status_code, res.text[:500])
        raise RuntimeError(f"stripe_api_{res.status_code}")
    return res.json()


def create_checkout_session(
    *,
    price_id: str,
    success_url: str,
    cancel_url: str,
    customer_email: Optional[str] = None,
    metadata: Dict[str, str],
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "mode": "subscription",
        "line_items[0][price]": price_id,
        "line_items[0][quantity]": "1",
        "success_url": success_url,
        "cancel_url": cancel_url,
    }
    if customer_email:
        payload["customer_email"] = customer_email

    # Checkout.session.completed webhooks commonly deliver `subscription` as an ID
    # string, not an expanded object. Authority must live on Session metadata as
    # well as Subscription metadata so org mapping does not require a retrieve.
    org_id = str(metadata.get("org_id") or metadata.get("claw_org_id") or "").strip()
    claw_org_id = str(metadata.get("claw_org_id") or org_id).strip()
    plan_code = str(metadata.get("plan_code") or "pro").strip() or "pro"
    merged: Dict[str, str] = {}
    for key, val in metadata.items():
        if val is None:
            continue
        text = str(val).strip()
        if text:
            merged[str(key)] = text[:500]
    if org_id:
        merged["org_id"] = org_id[:500]
        merged["claw_org_id"] = claw_org_id[:500]
    merged["plan_code"] = plan_code[:500]
    user_id = str(metadata.get("user_id") or "").strip()
    if user_id:
        merged["user_id"] = user_id[:500]
    for key, val in merged.items():
        payload[f"metadata[{key}]"] = val
        payload[f"subscription_data[metadata][{key}]"] = val
    return _stripe_request(
        "POST",
        "/checkout/sessions",
        payload,
        idempotency_key=(idempotency_key or "").strip() or None,
    )


def retrieve_checkout_session(session_id: str) -> Dict[str, Any]:
    """Retrieve a Checkout Session with the Subscription expanded for period dates."""
    return _stripe_request(
        "GET",
        f"/checkout/sessions/{session_id}",
        {"expand[]": "subscription"},
    )


def retrieve_subscription(subscription_id: str) -> Dict[str, Any]:
    sid = (subscription_id or "").strip()
    if not sid:
        raise RuntimeError("missing_subscription_id")
    return _stripe_request("GET", f"/subscriptions/{sid}", {})


def create_billing_portal_session(*, customer_id: str, return_url: str) -> Dict[str, Any]:
    """Create a Stripe Customer Portal session for a server-derived customer only."""
    cid = (customer_id or "").strip()
    if not cid:
        raise RuntimeError("missing_stripe_customer")
    dest = (return_url or "").strip()
    if not dest:
        raise RuntimeError("missing_portal_return_url")
    return _stripe_request(
        "POST",
        "/billing_portal/sessions",
        {
            "customer": cid,
            "return_url": dest,
        },
    )
