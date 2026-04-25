from __future__ import annotations

import hashlib
import hmac
import json
import os
from decimal import Decimal
from typing import Any, Dict, Optional, Tuple


def webhook_secret() -> str:
    return os.getenv("COINBASE_ONRAMP_WEBHOOK_SECRET", "").strip()


def verify_webhook_signature(*, body: bytes, signature_header: str) -> bool:
    """
    Verify Coinbase Onramp / Commerce-style HMAC-SHA256 hex digest (configurable).

    Header name is handled by the router (e.g. ``X-Cc-Webhook-Signature``).
    If ``COINBASE_ONRAMP_WEBHOOK_SECRET`` is unset, verification returns False (production-safe).
    """
    secret = webhook_secret()
    if not secret or not signature_header:
        return False
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    try:
        return hmac.compare_digest(expected.lower(), signature_header.strip().lower())
    except Exception:
        return False


def create_order_stub(*, org_id: str, amount_usd: Decimal) -> Dict[str, Any]:
    """Placeholder create-order; returns deterministic shape for UI (no network)."""
    return {
        "amount_usd": str(amount_usd.quantize(Decimal("0.01"))),
        "order_kind": "coinbase_onramp_stub",
        "org_id": org_id,
    }


def parse_order_completed_payload(body: Dict[str, Any]) -> Optional[Tuple[str, str, Decimal, str]]:
    """
    Map Coinbase-style webhook JSON → (provider_payment_id, org_id, amount_usd, tx_hash).

    Accepts test/minimal shape::
      {\"event\":\"order_completed\",\"order_id\":\"...\",\"org_id\":\"...\",\"amount_usd\":\"100.00\",\"tx_hash\":\"0xabc\"}
    """
    evt = (body.get("event") or body.get("type") or "").strip()
    if evt.lower() not in ("order_completed", "order.completed", "charge:confirmed"):
        return None
    order_id = str(body.get("order_id") or body.get("id") or "").strip()
    org_id = str(body.get("org_id") or body.get("metadata", {}).get("org_id") or "").strip()
    raw_amt = body.get("amount_usd") or body.get("pricing", {}).get("amount")
    if raw_amt is None:
        return None
    amount = Decimal(str(raw_amt))
    tx_hash = str(body.get("tx_hash") or body.get("transaction_hash") or body.get("hash") or "").strip()
    if not order_id or not org_id or not tx_hash:
        return None
    return (order_id, org_id, amount, tx_hash)


def load_json_body(raw: bytes) -> Dict[str, Any]:
    return json.loads(raw.decode("utf-8"))
