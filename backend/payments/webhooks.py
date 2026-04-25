from __future__ import annotations

import logging
import os
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

from backend.payments.adapters import coinbase_adapter, ramp_adapter
from backend.payments.service import settle_onramp_payment

router = APIRouter(tags=["payments-onramp"])
logger = logging.getLogger("claw.payments.webhook")


def _allow_unsigned_dev_webhooks() -> bool:
    return os.getenv("CLAW_PAYMENTS_WEBHOOK_DEV", "").strip() in ("1", "true", "yes")


@router.post("/webhook/coinbase")
async def webhook_coinbase(request: Request) -> Dict[str, Any]:
    raw = await request.body()
    sig = request.headers.get("X-Cc-Webhook-Signature") or request.headers.get(
        "X-Hub-Signature-256", ""
    )
    if not _allow_unsigned_dev_webhooks():
        if not coinbase_adapter.verify_webhook_signature(body=raw, signature_header=sig):
            raise HTTPException(status_code=401, detail="invalid_signature")
    try:
        body = coinbase_adapter.load_json_body(raw)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="invalid_json") from exc
    parsed = coinbase_adapter.parse_order_completed_payload(body)
    if not parsed:
        return {"ok": True, "ignored": True, "reason": "event_not_applicable"}
    provider_payment_id, org_id, amount_usd, tx_hash = parsed
    return settle_onramp_payment(
        provider="coinbase",
        provider_payment_id=provider_payment_id,
        org_id=org_id,
        amount_usd=amount_usd,
        tx_hash=tx_hash,
    )


@router.post("/webhook/ramp")
async def webhook_ramp(request: Request) -> Dict[str, Any]:
    raw = await request.body()
    sig = request.headers.get("X-Ramp-Webhook-Signature") or request.headers.get(
        "X-Signature", ""
    )
    if not _allow_unsigned_dev_webhooks():
        if not ramp_adapter.verify_webhook_signature(body=raw, signature_header=sig):
            raise HTTPException(status_code=401, detail="invalid_signature")
    try:
        body = ramp_adapter.load_json_body(raw)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="invalid_json") from exc
    parsed = ramp_adapter.parse_purchase_success(body)
    if not parsed:
        logger.info("ramp_webhook ignored event_not_applicable bytes=%s", len(raw))
        return {"ok": True, "ignored": True, "reason": "event_not_applicable"}
    provider_payment_id, org_id, amount_usd, tx_hash = parsed
    logger.info(
        "ramp_webhook settle_start org_id=%s provider_payment_id=%s",
        org_id,
        provider_payment_id,
    )
    result = settle_onramp_payment(
        provider="ramp",
        provider_payment_id=provider_payment_id,
        org_id=org_id,
        amount_usd=amount_usd,
        tx_hash=tx_hash,
    )
    logger.info(
        "ramp_webhook settle_done org_id=%s duplicate=%s ok=%s",
        org_id,
        result.get("duplicate"),
        result.get("ok"),
    )
    return result
