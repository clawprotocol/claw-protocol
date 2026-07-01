"""Short-lived HMAC-signed httpOnly session for internal QA payment bypass bootstrap."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any, Dict

COOKIE_NAME = "claw_qa_payment_bypass_session"
DEFAULT_TTL_SECONDS = 30 * 60


def _b64u_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64u_decode(seg: str) -> bytes:
    pad = "=" * ((4 - len(seg) % 4) % 4)
    return base64.urlsafe_b64decode((seg + pad).encode("ascii"))


def session_secret_bytes() -> bytes:
    dedicated = os.getenv("CLAW_QA_PAYMENT_BYPASS_SESSION_SECRET", "").strip()
    if dedicated:
        return dedicated.encode("utf-8")
    admin = os.getenv("CLAW_ADMIN_SECRET", "").strip()
    if admin:
        return admin.encode("utf-8")
    return b""


def session_ttl_seconds() -> int:
    raw = os.getenv("CLAW_QA_PAYMENT_BYPASS_SESSION_TTL_SECONDS", "").strip()
    if not raw:
        return DEFAULT_TTL_SECONDS
    try:
        return max(60, int(raw))
    except ValueError:
        return DEFAULT_TTL_SECONDS


def mint_qa_payment_bypass_session(*, secret: bytes, ttl_seconds: int | None = None) -> str:
    now = int(time.time())
    ttl = ttl_seconds if ttl_seconds is not None else session_ttl_seconds()
    if ttl < 0:
        exp = now + ttl
    else:
        exp = now + max(60, int(ttl))
    payload: Dict[str, Any] = {
        "kind": "qa_admin",
        "iat": now,
        "exp": exp,
        "jti": secrets.token_hex(16),
    }
    body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    sig = hmac.new(secret, body, hashlib.sha256).digest()
    return f"{_b64u_encode(body)}.{_b64u_encode(sig)}"


def verify_qa_payment_bypass_session(*, token: str, secret: bytes) -> Dict[str, Any]:
    parts = str(token or "").strip().split(".")
    if len(parts) != 2:
        raise ValueError("invalid_session_format")

    body = _b64u_decode(parts[0])
    sig = _b64u_decode(parts[1])
    expected = hmac.new(secret, body, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        raise ValueError("invalid_session_signature")

    payload = json.loads(body.decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("invalid_session_payload")
    if str(payload.get("kind") or "") != "qa_admin":
        raise ValueError("invalid_session_kind")

    exp = int(payload.get("exp") or 0)
    if int(time.time()) > exp:
        raise ValueError("session_expired")

    return payload
