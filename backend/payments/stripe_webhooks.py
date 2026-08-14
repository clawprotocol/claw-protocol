"""Stripe billing webhooks → affiliate earnings ledger (async source of truth)."""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

from backend.affiliates.stripe_earnings_handlers import dispatch_stripe_event
from backend.affiliates.stripe_webhook_verify import stripe_webhook_secret, verify_stripe_signature
from backend.config.deployment_runtime import is_relaxed_claw_environment
from backend.economics.store import get_economics_store

router = APIRouter(tags=["payments-stripe"])
_log = logging.getLogger("claw.payments.stripe_webhook")

_TRANSIENT_AUTHORITY_REASONS = frozenset({"no_org_mapping"})
_TRANSIENT_AUTHORITY_ERRORS = frozenset({"missing_org_id", "missing_org_id_after_authority"})


def _is_transient_authority_failure(result: Dict[str, Any]) -> bool:
    if not isinstance(result, dict):
        return False
    if str(result.get("reason") or "") in _TRANSIENT_AUTHORITY_REASONS:
        return True
    if str(result.get("error") or "") in _TRANSIENT_AUTHORITY_ERRORS:
        return True
    return False


def _dev_bypass_signature() -> bool:
    """
    Unsigned webhook body (no Stripe-Signature) is allowed only in local/dev/test when
    CLAW_STRIPE_WEBHOOK_DEV_UNSIGNED is truthy. Staging, production, and other envs always
    require STRIPE_WEBHOOK_SECRET + valid signature.
    """
    if not is_relaxed_claw_environment():
        return False
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
    # Idempotent at event-id boundary (Stripe retries). Handlers must also idempotency-key writes.
    claimed = False
    if event_id:
        if not eco.insert_stripe_webhook_event_once(event_id):
            _log.info("stripe_webhook duplicate event_id=%s type=%s", event_id, event.get("type"))
            return {"ok": True, "duplicate": True, "event_id": event_id}
        claimed = True

    result = dispatch_stripe_event(eco, event)
    # Log type + ok/ignored keys only — never log full invoice bodies or customer PII.
    summary = {k: result.get(k) for k in ("ok", "ignored", "duplicate", "reason", "error") if k in result}
    _log.info("stripe_webhook type=%s event_id=%s summary=%s", event.get("type"), event_id, summary)
    if _is_transient_authority_failure(result):
        if claimed:
            eco.delete_stripe_webhook_event(event_id)
        raise HTTPException(status_code=503, detail="stripe_authority_not_ready")
    return {"ok": True, "event_id": event_id or None, "result": result}
