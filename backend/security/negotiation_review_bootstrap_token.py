"""Negotiation-review bootstrap tokens (fragment transport, one-time exchange)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any, Dict, List, Tuple

NEGOTIATION_REVIEW_BOOTSTRAP_TOKEN_VERSION = 1
NEGOTIATION_REVIEW_BOOTSTRAP_PURPOSE = "review_bootstrap"
NEGOTIATION_REVIEW_BOOTSTRAP_MODE = "review"
DEFAULT_REVIEW_BOOTSTRAP_TTL_SECONDS = 7 * 24 * 3600


def _b64u_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64u_decode(seg: str) -> bytes:
    pad = "=" * ((4 - len(seg) % 4) % 4)
    return base64.urlsafe_b64decode((seg + pad).encode("ascii"))


def token_fingerprint(token: str) -> str:
    raw = (token or "").strip()
    if not raw:
        return ""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def jti_fingerprint(jti: str) -> str:
    raw = (jti or "").strip()
    if not raw:
        return ""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def mint_negotiation_review_bootstrap_token(
    *,
    secret: bytes,
    agreement_id: str,
    locked_version_id: str,
    party_id: str,
    role: str,
    content_sha256: str,
    ttl_seconds: int = DEFAULT_REVIEW_BOOTSTRAP_TTL_SECONDS,
) -> Tuple[str, str, int]:
    """Mint a scoped review bootstrap token. Returns (token, jti, exp). Never log the token."""
    now = int(time.time())
    jti = secrets.token_hex(16)
    exp = now + max(60, int(ttl_seconds))
    bound_content = (content_sha256 or "").strip()
    if not bound_content:
        raise ValueError("content_sha256_required")
    payload: Dict[str, Any] = {
        "tv": NEGOTIATION_REVIEW_BOOTSTRAP_TOKEN_VERSION,
        "aid": agreement_id,
        "v": locked_version_id,
        "pid": party_id[:128],
        "r": role[:32],
        "ch": bound_content[:128],
        "m": NEGOTIATION_REVIEW_BOOTSTRAP_MODE,
        "pur": NEGOTIATION_REVIEW_BOOTSTRAP_PURPOSE,
        "iat": now,
        "exp": exp,
        "jti": jti,
    }
    body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    sig = hmac.new(secret, body, hashlib.sha256).digest()
    token = f"{_b64u_encode(body)}.{_b64u_encode(sig)}"
    return token, jti, exp


def verify_negotiation_review_bootstrap_token(*, token: str, secret: bytes) -> Dict[str, Any]:
    """Verify format, signature, purpose, mode, and expiry."""
    parts: List[str] = str(token or "").strip().split(".")
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

    if int(payload.get("tv") or 0) != NEGOTIATION_REVIEW_BOOTSTRAP_TOKEN_VERSION:
        raise ValueError("invalid_token_version")
    if _clean(payload.get("pur")) != NEGOTIATION_REVIEW_BOOTSTRAP_PURPOSE:
        raise ValueError("invalid_token_purpose")
    if _clean(payload.get("m")) != NEGOTIATION_REVIEW_BOOTSTRAP_MODE:
        raise ValueError("invalid_token_mode")

    exp = int(payload.get("exp") or 0)
    if int(time.time()) > exp:
        raise ValueError("token_expired")

    return payload


def _clean(value: Any) -> str:
    return str(value or "").strip()
