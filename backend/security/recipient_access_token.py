"""HMAC-signed, expiring tokens for production-safe recipient / signer deep links."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any, Dict, List, Literal, Optional

RecipientMode = Literal["sign", "review"]
RecipientRole = Literal["recipient", "reviewer", "signer"]

# Shared UX copy for recipient-facing errors (API returns structured JSON; SPA shows this verbatim).
RECIPIENT_LINK_INVALID_OR_EXPIRED = (
    "This link is invalid or expired. Request a new link from the sender."
)


def _b64u_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64u_decode(seg: str) -> bytes:
    pad = "=" * ((4 - len(seg) % 4) % 4)
    return base64.urlsafe_b64decode((seg + pad).encode("ascii"))


def mint_recipient_access_token(
    *,
    secret: bytes,
    agreement_id: str,
    locked_version_id: str,
    mode: RecipientMode,
    role: RecipientRole,
    ttl_seconds: int,
    recipient_subject: Optional[str] = None,
    recipient_party_id: Optional[str] = None,
    inviter_display_name: Optional[str] = None,
    single_use: bool = False,
) -> str:
    now = int(time.time())
    payload: Dict[str, Any] = {
        "aid": agreement_id,
        "v": locked_version_id,
        "m": mode,
        "r": role,
        "iat": now,
        "exp": now + max(60, int(ttl_seconds)),
        "jti": secrets.token_hex(16),
    }
    if recipient_subject:
        payload["sub"] = str(recipient_subject)[:512]
    pid = (recipient_party_id or "").strip()
    if pid:
        payload["pid"] = pid[:128]
    inv = (inviter_display_name or "").strip()
    if inv:
        payload["inv"] = inv[:256]
    if single_use:
        payload["su"] = 1

    body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    sig = hmac.new(secret, body, hashlib.sha256).digest()
    return f"{_b64u_encode(body)}.{_b64u_encode(sig)}"


def verify_recipient_access_token(*, token: str, secret: bytes) -> Dict[str, Any]:
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

    exp = int(payload.get("exp") or 0)
    if int(time.time()) > exp:
        raise ValueError("token_expired")

    return payload
