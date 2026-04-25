from __future__ import annotations

import hashlib
import hmac
import json
import os
from decimal import Decimal
from typing import Any, Dict, Optional, Tuple


def webhook_secret() -> str:
    return os.getenv("RAMP_WEBHOOK_SECRET", "").strip()


def verify_webhook_signature(*, body: bytes, signature_header: str) -> bool:
    secret = webhook_secret()
    if not secret or not signature_header:
        return False
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    try:
        return hmac.compare_digest(expected, signature_header.strip())
    except Exception:
        return False


def parse_purchase_success(body: Dict[str, Any]) -> Optional[Tuple[str, str, Decimal, str]]:
    """
    Map Ramp PURCHASE_SUCCESS-style payload.

    Minimal test shape::
      {\"type\":\"PURCHASE_SUCCESS\",\"purchaseId\":\"...\",\"orgId\":\"...\",\"amountUsd\":\"50.00\",\"txHash\":\"0xab\"}
    """
    typ = (body.get("type") or "").strip().upper()
    if typ != "PURCHASE_SUCCESS":
        return None
    pid = str(body.get("purchaseId") or body.get("id") or "").strip()
    org_id = str(body.get("orgId") or body.get("org_id") or "").strip()
    amt_raw = body.get("amountUsd") or body.get("amount_usd")
    tx_hash = str(body.get("txHash") or body.get("tx_hash") or "").strip()
    if not pid or not org_id or amt_raw is None or not tx_hash:
        return None
    return (pid, org_id, Decimal(str(amt_raw)), tx_hash)


def load_json_body(raw: bytes) -> Dict[str, Any]:
    return json.loads(raw.decode("utf-8"))
