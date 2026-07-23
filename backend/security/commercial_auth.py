"""
Commercial authentication / mode helpers.

Test auth headers and unauthenticated dashboard access are allowed only in
explicit relaxed environments (local/dev/test). Staging and production must
never treat client-controlled org/dev headers as proof of authentication.
"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import HTTPException, Request

from backend.config.deployment_runtime import (
    claw_environment,
    is_production_like_claw_environment,
    is_relaxed_claw_environment,
)


def commercial_mode_enforced() -> bool:
    """True when commercial fail-closed auth rules apply (staging/prod and named commercial)."""
    if os.getenv("CLAW_COMMERCIAL_MODE", "").strip() == "1":
        return True
    return is_production_like_claw_environment()


def tokenless_signer_complete_allowed() -> bool:
    """
    Legacy tokenless VS01 completion — opt-in, noncommercial, relaxed env only.

    Impossible when CLAW_COMMERCIAL_MODE=1 or staging/production-like.
    """
    if commercial_mode_enforced():
        return False
    if not is_relaxed_claw_environment():
        return False
    return os.getenv("CLAW_ALLOW_TOKENLESS_SIGNER_COMPLETE", "").strip() == "1"


def test_auth_headers_allowed() -> bool:
    """X-Claw-Test-* headers only in local/dev/test — never staging/production."""
    return is_relaxed_claw_environment()


def require_authenticated_dashboard_principal(request: Request) -> str:
    """
    Require a verified server-backed user id for authenticated dashboard APIs.

    Anonymous sessions and forged org headers are not sufficient.
    """
    from backend.security.request_identity import resolve_workspace_identity
    from backend.security.supabase_jwt import require_supabase_user_id

    # Prefer explicit JWT / test-auth user id.
    user_id = require_supabase_user_id(request)
    identity = resolve_workspace_identity(request)
    if identity.kind == "anonymous":
        raise HTTPException(
            status_code=401,
            detail={
                "code": "authenticated_session_required",
                "message": "Sign in required for dashboard access.",
            },
        )
    if identity.kind == "authenticated" and identity.user_id and identity.user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "user_org_mismatch",
                "message": "Authenticated user does not match requested workspace.",
            },
        )
    if identity.kind == "legacy" and commercial_mode_enforced():
        raise HTTPException(
            status_code=401,
            detail={
                "code": "authenticated_session_required",
                "message": "Legacy org headers are not accepted in commercial mode.",
            },
        )
    return user_id


def correlation_id_from_request(request: Request) -> str:
    for key in ("x-request-id", "x-correlation-id", "x-claw-request-id"):
        v = (request.headers.get(key) or "").strip()
        if v:
            return v[:128]
    return ""


def env_label() -> str:
    return claw_environment()
