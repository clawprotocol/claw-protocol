"""HMAC-signed anonymous workspace session tokens (server-issued, stored as hash)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any, Dict

ANON_SESSION_COOKIE = "claw_anon_session"
ANON_SESSION_HEADER = "X-Claw-Anon-Session"


def _session_secret_bytes() -> bytes:
    raw = (
        os.getenv("CLAW_ANON_SESSION_SECRET", "").strip()
        or os.getenv("CLAW_ADMIN_SECRET", "").strip()
        or os.getenv("CLAW_RECIPIENT_ACCESS_TOKEN_SECRET", "").strip()
    )
    if not raw:
        return b""
    return raw.encode("utf-8")


def anonymous_session_ttl_seconds() -> int:
    raw = os.getenv("CLAW_ANON_SESSION_TTL_SECONDS", "").strip()
    try:
        n = int(raw)
        if n > 0:
            return n
    except ValueError:
        pass
    return 60 * 60 * 24 * 30  # 30 days


def _b64u_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64u_decode(seg: str) -> bytes:
    pad = "=" * ((4 - len(seg) % 4) % 4)
    return base64.urlsafe_b64decode((seg + pad).encode("ascii"))


def token_hash(token: str) -> str:
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


def mint_anonymous_session_token(*, session_id: str, org_id: str) -> str:
    secret = _session_secret_bytes()
    if not secret:
        raise RuntimeError("anonymous_session_secret_unconfigured")
    now = int(time.time())
    payload: Dict[str, Any] = {
        "sid": session_id,
        "org": org_id,
        "iat": now,
        "exp": now + anonymous_session_ttl_seconds(),
        "jti": secrets.token_hex(12),
    }
    body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    sig = hmac.new(secret, body, hashlib.sha256).digest()
    return f"{_b64u_encode(body)}.{_b64u_encode(sig)}"


def verify_anonymous_session_token(token: str) -> Dict[str, Any]:
    secret = _session_secret_bytes()
    if not secret:
        raise ValueError("anonymous_session_secret_unconfigured")
    parts = str(token or "").strip().split(".")
    if len(parts) != 2:
        raise ValueError("invalid_token_format")
    body = _b64u_decode(parts[0])
    sig = _b64u_decode(parts[1])
    expected = hmac.new(secret, body, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        raise ValueError("invalid_token_signature")
    payload = json.loads(body.decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("invalid_token_payload")
    exp = int(payload.get("exp") or 0)
    if int(time.time()) > exp:
        raise ValueError("token_expired")
    sid = str(payload.get("sid") or "").strip()
    org = str(payload.get("org") or "").strip()
    if not sid or not org.startswith("anon-"):
        raise ValueError("invalid_session_scope")
    return payload
