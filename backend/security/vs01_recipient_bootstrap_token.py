"""Phase 3C1B backend-only recipient bootstrap tokens (narrow scope, fragment transport)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any, Dict, List, Literal, Tuple

RecipientMode = Literal["sign", "review"]
RecipientRole = Literal["recipient", "reviewer", "signer"]

VS01_RECIPIENT_BOOTSTRAP_TOKEN_VERSION = 1
DEFAULT_BOOTSTRAP_TTL_SECONDS = 7 * 24 * 3600


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


def email_fingerprint(email: str) -> str:
    normalized = (email or "").strip().lower()
    if not normalized or "@" not in normalized:
        return ""
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def mint_vs01_recipient_bootstrap_token(
    *,
    secret: bytes,
    agreement_id: str,
    accepted_version_id: str,
    accepted_corpus_sha256: str,
    packet_revision: str,
    frozen_authority_material_hash: str,
    signer_record_id: str,
    party_id: str,
    locked_version_id: str,
    ttl_seconds: int = DEFAULT_BOOTSTRAP_TTL_SECONDS,
) -> Tuple[str, str, int]:
    """Mint a scoped bootstrap token. Returns (token, jti, exp). Never log the token."""
    now = int(time.time())
    jti = secrets.token_hex(16)
    exp = now + max(60, int(ttl_seconds))
    payload: Dict[str, Any] = {
        "tv": VS01_RECIPIENT_BOOTSTRAP_TOKEN_VERSION,
        "aid": agreement_id,
        "av": accepted_version_id,
        "ach": accepted_corpus_sha256.lower(),
        "pr": packet_revision,
        "fah": frozen_authority_material_hash.lower(),
        "srid": signer_record_id,
        "pid": party_id[:128],
        "v": locked_version_id,
        "m": "sign",
        "r": "signer",
        "iat": now,
        "exp": exp,
        "jti": jti,
    }
    body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    sig = hmac.new(secret, body, hashlib.sha256).digest()
    token = f"{_b64u_encode(body)}.{_b64u_encode(sig)}"
    return token, jti, exp


def verify_vs01_recipient_bootstrap_token(*, token: str, secret: bytes) -> Dict[str, Any]:
    """Verify format, signature, and expiry. Phase 3C2 will consume these tokens."""
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
