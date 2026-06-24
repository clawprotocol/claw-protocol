"""Stripe Checkout Session creation via REST (no stripe SDK required)."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import httpx

from backend.billing.stripe_config import stripe_secret_key

_log = logging.getLogger("claw.billing.stripe_client")

STRIPE_API_BASE = "https://api.stripe.com/v1"


def _stripe_request(method: str, path: str, data: Dict[str, Any]) -> Dict[str, Any]:
    key = stripe_secret_key()
    if not key:
        raise RuntimeError("stripe_not_configured")
    url = f"{STRIPE_API_BASE}{path}"
    with httpx.Client(timeout=30.0) as client:
        res = client.request(method, url, data=data, auth=(key, ""))
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
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "mode": "subscription",
        "line_items[0][price]": price_id,
        "line_items[0][quantity]": "1",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "subscription_data[metadata][org_id]": metadata.get("org_id", ""),
        "subscription_data[metadata][claw_org_id]": metadata.get("claw_org_id", metadata.get("org_id", "")),
        "subscription_data[metadata][plan_code]": metadata.get("plan_code", "pro"),
    }
    if customer_email:
        payload["customer_email"] = customer_email
    for key, val in metadata.items():
        if key in ("org_id", "claw_org_id", "plan_code"):
            continue
        if val:
            payload[f"metadata[{key}]"] = str(val)[:500]
    return _stripe_request("POST", "/checkout/sessions", payload)


def retrieve_checkout_session(session_id: str) -> Dict[str, Any]:
    return _stripe_request("GET", f"/checkout/sessions/{session_id}", {})
