"""Stripe billing webhooks → affiliate earnings ledger (async source of truth)."""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

from backend.affiliates.stripe_earnings_handlers import dispatch_stripe_event
from backend.affiliates.stripe_webhook_verify import stripe_webhook_secret, verify_stripe_signature
from backend.economics.store import get_economics_store

router = APIRouter(tags=["payments-stripe"])
_log = logging.getLogger("claw.payments.stripe_webhook")


def _dev_bypass_signature() -> bool:
    return os.getenv("CLAW_STRIPE_WEBHOOK_DEV_UNSIGNED", "").strip().lower() in ("1", "true", "yes")


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request) -> Dict[str, Any]:
    raw = await request.body()
    secret = stripe_webhook_secret()
    sig = request.headers.get("Stripe-Signature") or ""

    if not _dev_bypass_signature():
        if not secret:
            raise HTTPException(status_code=503, detail="stripe_webhook_not_configured")
        if not verify_stripe_signature(payload=raw, sig_header=sig, secret=secret):
            raise HTTPException(status_code=401, detail="invalid_signature")

    try:
        event = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="invalid_json") from exc

    event_id = str(event.get("id") or "").strip()
    eco = get_economics_store()
    eco.init_schema()
    if event_id and not eco.insert_stripe_webhook_event_once(event_id):
        return {"ok": True, "duplicate": True, "event_id": event_id}

    result = dispatch_stripe_event(eco, event)
    _log.info("stripe_webhook type=%s result=%s", event.get("type"), result)
    return {"ok": True, "event_id": event_id or None, "result": result}
