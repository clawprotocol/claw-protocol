"""Stripe webhook signature verification (no stripe-sdk dependency)."""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from typing import Optional


def stripe_webhook_secret() -> str:
    return os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()


def verify_stripe_signature(*, payload: bytes, sig_header: str, secret: str, tolerance_sec: int = 300) -> bool:
    """
    Verifies ``Stripe-Signature`` header (``t=timestamp,v1=signature``).
    """
    if not secret or not sig_header or not payload:
        return False
    parts = [p.strip() for p in sig_header.split(",")]
    ts: Optional[str] = None
    v1_sigs: list[str] = []
    for p in parts:
        if p.startswith("t="):
            ts = p[2:]
        elif p.startswith("v1="):
            v1_sigs.append(p[3:])
    if not ts or not v1_sigs:
        return False
    try:
        t_int = int(ts)
    except ValueError:
        return False
    if abs(int(time.time()) - t_int) > tolerance_sec:
        return False
    signed = f"{ts}.{payload.decode('utf-8')}".encode("utf-8")
    mac = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(mac, s) for s in v1_sigs)
