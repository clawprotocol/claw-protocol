"""Verify Supabase Auth JWT — user id derived server-side only."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request


def supabase_jwt_secret() -> str:
    return (
        os.getenv("SUPABASE_JWT_SECRET", "").strip()
        or os.getenv("CLAW_SUPABASE_JWT_SECRET", "").strip()
    )


def supabase_jwt_issuer() -> str:
    return (
        os.getenv("SUPABASE_JWT_ISSUER", "").strip()
        or os.getenv("CLAW_SUPABASE_JWT_ISSUER", "").strip()
    )


def supabase_jwt_audience() -> str:
    return (
        os.getenv("SUPABASE_JWT_AUDIENCE", "").strip()
        or os.getenv("CLAW_SUPABASE_JWT_AUDIENCE", "").strip()
        or "authenticated"
    )


def supabase_auth_configured() -> bool:
    return bool(supabase_jwt_secret())


def _b64u_decode(seg: str) -> bytes:
    pad = "=" * ((4 - len(seg) % 4) % 4)
    return base64.urlsafe_b64decode((seg + pad).encode("ascii"))


def verify_supabase_access_token(token: str) -> Dict[str, Any]:
    """
    Validate Supabase access token (HS256 shared secret).

    Always requires: HS256, valid signature, non-empty sub, non-empty exp in future.
    Production-like / commercial: also requires configured issuer match and audience match.
    """
    from backend.security.commercial_auth import commercial_mode_enforced, is_production_like_claw_environment

    secret = supabase_jwt_secret()
    if not secret:
        raise ValueError("supabase_jwt_not_configured")
    parts = str(token or "").strip().split(".")
    if len(parts) != 3:
        raise ValueError("invalid_jwt_format")
    header = json.loads(_b64u_decode(parts[0]))
    alg = str(header.get("alg") or "").strip()
    # Reject algorithm confusion (none, RS256 when we expect HS256, etc.).
    if alg != "HS256":
        raise ValueError("unsupported_jwt_alg")
    signing_input = f"{parts[0]}.{parts[1]}".encode("utf-8")
    sig = _b64u_decode(parts[2])
    expected = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        raise ValueError("invalid_jwt_signature")
    payload = json.loads(_b64u_decode(parts[1]))
    if not isinstance(payload, dict):
        raise ValueError("invalid_jwt_payload")

    exp_raw = payload.get("exp")
    if exp_raw is None or exp_raw == "" or exp_raw == 0:
        raise ValueError("jwt_exp_required")
    try:
        exp = int(exp_raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("jwt_exp_invalid") from exc
    if int(time.time()) > exp:
        raise ValueError("jwt_expired")

    sub = str(payload.get("sub") or "").strip()
    if not sub:
        raise ValueError("missing_sub")

    strict_claims = commercial_mode_enforced() or is_production_like_claw_environment()
    if strict_claims:
        iss_required = supabase_jwt_issuer()
        if not iss_required:
            raise ValueError("supabase_jwt_issuer_not_configured")
        iss = str(payload.get("iss") or "").strip()
        if iss != iss_required:
            raise ValueError("jwt_iss_mismatch")
        aud_required = supabase_jwt_audience()
        aud = payload.get("aud")
        if isinstance(aud, list):
            aud_ok = aud_required in [str(x).strip() for x in aud]
        else:
            aud_ok = str(aud or "").strip() == aud_required
        if not aud_ok:
            raise ValueError("jwt_aud_mismatch")

    return payload


def extract_bearer_token(request: Request) -> Optional[str]:
    auth = (request.headers.get("authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return None


def _test_auth_user_id(request: Request) -> Optional[str]:
    """
    Test auth header — only when CLAW_ENVIRONMENT is explicitly local/dev/test.

    Impossible when unset, blank, staging, qa, preview, production, or commercial.
    """
    from backend.security.commercial_auth import test_auth_headers_allowed

    if not test_auth_headers_allowed():
        return None
    uid = (request.headers.get("X-Claw-Test-Auth-User-Id") or "").strip()
    return uid or None


def require_supabase_user_id(request: Request) -> str:
    """Return verified Supabase user id or raise 401."""
    token = extract_bearer_token(request)
    if token:
        try:
            claims = verify_supabase_access_token(token)
            return str(claims["sub"]).strip()
        except ValueError as exc:
            raise HTTPException(
                status_code=401,
                detail={"code": "invalid_auth_token", "message": str(exc)},
            ) from exc
    test_uid = _test_auth_user_id(request)
    if test_uid:
        return test_uid
    raise HTTPException(
        status_code=401,
        detail={"code": "auth_required", "message": "Supabase JWT or test auth header required."},
    )
