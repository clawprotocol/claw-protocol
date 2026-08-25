"""
Commercial authentication / mode helpers.

Test-auth headers and unauthenticated dashboard access are allowed ONLY when
``CLAW_ENVIRONMENT`` is explicitly set to ``local``, ``dev``, or ``test``.

Unset, blank, malformed, or any other value is production-like (fail-closed).
Staging and production must never treat client-controlled org/dev headers as
proof of authentication.
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
    """True when commercial fail-closed auth rules apply."""
    if os.getenv("CLAW_COMMERCIAL_MODE", "").strip() == "1":
        return True
    return is_production_like_claw_environment()


def tokenless_signer_complete_allowed() -> bool:
    """
    Legacy tokenless VS01 completion — opt-in, noncommercial, relaxed env only.

    Impossible when CLAW_COMMERCIAL_MODE=1 or staging/production-like / unset env.
    """
    if commercial_mode_enforced():
        return False
    if not is_relaxed_claw_environment():
        return False
    return os.getenv("CLAW_ALLOW_TOKENLESS_SIGNER_COMPLETE", "").strip() == "1"


def test_auth_headers_allowed() -> bool:
    """X-Claw-Test-* headers only when CLAW_ENVIRONMENT is explicitly local/dev/test."""
    return is_relaxed_claw_environment()


def require_authenticated_dashboard_principal(request: Request) -> str:
    """
    Require a verified server-backed user id for authenticated dashboard APIs.

    Anonymous sessions and forged org headers are not sufficient.
    """
    from backend.security.request_identity import resolve_workspace_identity
    from backend.security.supabase_jwt import require_supabase_user_id

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
    # Commercial / production-like: never accept legacy org-header identity.
    if identity.kind == "legacy" and commercial_mode_enforced():
        raise HTTPException(
            status_code=401,
            detail={
                "code": "authenticated_session_required",
                "message": "Legacy org headers are not accepted in commercial mode.",
            },
        )
    return user_id


def require_commercial_owner_principal(request: Request) -> str:
    """
    Org header + validated principal for commercial owner reads/writes.

    In commercial/production-like mode, legacy org-header-only identity is rejected.
    """
    from backend.usage_economics.policy import require_claw_org_id_header

    require_claw_org_id_header(request)
    return require_authenticated_dashboard_principal(request)


def require_workspace_principal(request: Request) -> "WorkspaceIdentity":
    """
    Verified workspace principal: authenticated user OR valid anonymous session.

    Unlike require_commercial_owner_principal, this accepts anonymous sessions for
    guest flows (e.g. homepage→create parse). The caller must still verify the
    identity kind for feature gating (e.g. premium parse requires authenticated).

    Returns the WorkspaceIdentity for kind-aware downstream decisions.
    """
    from backend.security.request_identity import WorkspaceIdentity, resolve_workspace_identity
    from backend.usage_economics.policy import require_claw_org_id_header

    require_claw_org_id_header(request)
    identity = resolve_workspace_identity(request)
    if identity.kind == "legacy" and commercial_mode_enforced():
        raise HTTPException(
            status_code=401,
            detail={
                "code": "authenticated_session_required",
                "message": "Legacy org headers are not accepted in commercial mode.",
            },
        )
    return identity


def _is_demo_checkout_session(request: Request) -> bool:
    """
    Check if the request is from a demo checkout session (simulated POS).

    Demo checkout sessions are anonymous sessions that have completed the simulated
    payment flow on the frontend. They send X-Claw-Demo-Checkout-Receipt header with
    a receipt ID matching the format rcpt_<timestamp>_<random> (from buildSettlementReceipt).

    This allows demo/guest users to access Pro features after simulated payment.
    """
    receipt_id = (request.headers.get("X-Claw-Demo-Checkout-Receipt") or "").strip()
    if not receipt_id:
        return False
    if not receipt_id.startswith("rcpt_") or len(receipt_id) < 12:
        return False
    from backend.security.request_identity import resolve_workspace_identity
    from backend.usage_economics.policy import require_claw_org_id_header

    try:
        require_claw_org_id_header(request)
        identity = resolve_workspace_identity(request)
        return identity.kind == "anonymous"
    except HTTPException:
        return False


def require_paid_session_or_commercial_owner(request: Request) -> str:
    """
    Dashboard / workspace-index principal for the paying LawDog user.

    After TEST checkout the account is a demo session (anon org + receipt),
    not a Supabase JWT. Persist already trusts that principal; listing the
    same agreement on the existing dashboard must too. Anonymous-without-
    receipt still fails closed.
    """
    if _is_demo_checkout_session(request):
        from backend.security.request_identity import resolve_workspace_identity

        return resolve_workspace_identity(request).subject_ref
    return require_commercial_owner_principal(request)


def require_paid_pro_principal(request: Request) -> str:
    """
    Authenticated commercial owner with active Pro entitlement.

    Paid-beta contract: Genesis and authenticated-none must not invoke Pro
    premium-drafting routes (e.g. ``/premium-full-draft``).

    Demo checkout sessions (simulated POS) are granted temporary Pro access.
    """
    if _is_demo_checkout_session(request):
        from backend.security.request_identity import resolve_workspace_identity
        identity = resolve_workspace_identity(request)
        return identity.subject_ref

    user_id = require_commercial_owner_principal(request)
    from backend.usage_economics.commercial_entitlement import STATE_PRO, resolve_commercial_entitlement
    from backend.utils.enforce import resolve_subject_from_request

    subject = resolve_subject_from_request(request)
    decision = resolve_commercial_entitlement(subject)
    state = str(decision.get("state") or "").strip().lower()
    if state != STATE_PRO:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "premium_draft_requires_pro",
                "message": "Premium drafting requires an active LawDog Pro subscription.",
                "state": state or "none",
            },
        )
    return user_id


def require_org_matches_principal(request: Request, org_id: str) -> str:
    """
    Bind a path/body org_id to the verified principal's workspace.

    Returns authenticated user id.
    """
    from backend.security.supabase_jwt import require_supabase_user_id

    user_id = require_supabase_user_id(request)
    oid = (org_id or "").strip()
    if not oid:
        raise HTTPException(
            status_code=400,
            detail={"code": "org_id_required", "message": "Organization id is required."},
        )
    if commercial_mode_enforced() or oid.startswith("user-"):
        canonical = f"user-{user_id}"
        if oid != canonical:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "cross_org_denied",
                    "message": "Organization does not match authenticated principal.",
                },
            )
    elif is_production_like_claw_environment():
        raise HTTPException(
            status_code=401,
            detail={
                "code": "authenticated_session_required",
                "message": "Authenticated user workspace required.",
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
    return claw_environment() or "(unset)"
