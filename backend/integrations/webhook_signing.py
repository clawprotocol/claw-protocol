from __future__ import annotations

import hashlib
import hmac
import time
from typing import Optional


def sign_webhook_body(secret: str, timestamp: str, body: bytes) -> str:
    """
    HMAC-SHA256 over ``timestamp + '.' + body``.
    Recipients verify with the same construction (use raw body bytes).
    """
    key = secret.strip().encode("utf-8")
    msg = timestamp.encode("utf-8") + b"." + body
    sig = hmac.new(key, msg, hashlib.sha256).hexdigest()
    return f"v1={sig}"


def verify_webhook_signature(secret: str, timestamp: str, body: bytes, signature_header: str) -> bool:
    expected = sign_webhook_body(secret, timestamp, body)
    return hmac.compare_digest(expected.strip(), (signature_header or "").strip())


def verify_webhook_signature_fresh(
    secret: str,
    timestamp: str,
    body: bytes,
    signature_header: str,
    *,
    max_age_seconds: int = 300,
    now_ts: Optional[float] = None,
) -> bool:
    """
    Same as ``verify_webhook_signature``, plus rejection when ``X-Claw-Webhook-Timestamp``
    is missing or skewed vs server time (default ±300s). Adjust ``max_age_seconds`` if needed.
    """
    try:
        ts = int((timestamp or "").strip())
    except ValueError:
        return False
    clock = float(now_ts if now_ts is not None else time.time())
    if abs(clock - float(ts)) > float(max_age_seconds):
        return False
    return verify_webhook_signature(secret, timestamp, body, signature_header)
