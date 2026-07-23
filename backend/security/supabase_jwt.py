"""Verify Supabase Auth JWT (HS256) — user id derived server-side only."""

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


def supabase_auth_configured() -> bool:
    return bool(supabase_jwt_secret())


def _b64u_decode(seg: str) -> bytes:
    pad = "=" * ((4 - len(seg) % 4) % 4)
    return base64.urlsafe_b64decode((seg + pad).encode("ascii"))


def verify_supabase_access_token(token: str) -> Dict[str, Any]:
    secret = supabase_jwt_secret()
    if not secret:
        raise ValueError("supabase_jwt_not_configured")
    parts = str(token or "").strip().split(".")
    if len(parts) != 3:
        raise ValueError("invalid_jwt_format")
    header = json.loads(_b64u_decode(parts[0]))
    if str(header.get("alg") or "") != "HS256":
        raise ValueError("unsupported_jwt_alg")
    signing_input = f"{parts[0]}.{parts[1]}".encode("utf-8")
    sig = _b64u_decode(parts[2])
    expected = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        raise ValueError("invalid_jwt_signature")
    payload = json.loads(_b64u_decode(parts[1]))
    if not isinstance(payload, dict):
        raise ValueError("invalid_jwt_payload")
    exp = int(payload.get("exp") or 0)
    if exp and int(time.time()) > exp:
        raise ValueError("jwt_expired")
    sub = str(payload.get("sub") or "").strip()
    if not sub:
        raise ValueError("missing_sub")
    return payload


def extract_bearer_token(request: Request) -> Optional[str]:
    auth = (request.headers.get("authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return None


def _test_auth_user_id(request: Request) -> Optional[str]:
    """
    Test auth header — local/dev/test only.

    Impossible in staging, qa, preview, review, production (commercial fail-closed).
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
    env = os.getenv("CLAW_ENVIRONMENT", "local").strip().lower()
    if env in ("production", "prod"):
        raise HTTPException(
            status_code=401,
            detail={"code": "auth_required", "message": "Sign-in required."},
        )
    raise HTTPException(
        status_code=401,
        detail={"code": "auth_required", "message": "Supabase JWT or test auth header required."},
    )
