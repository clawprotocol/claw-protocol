"""
GTM Security Slice 3 — production containment for legacy VS01 signing mutations.

Policy (production-like environments):
- ``POST /v1/documents/{id}/sign-prep``: exact verified owner only; recipient tokens and
  bootstrap session cookies are rejected; authorization precedes byte load.
- ``POST /v1/sign-sessions`` and ``POST /v1/sign-sessions/{id}/complete``: fail closed with
  ``legacy_signing_session_deferred_until_3c2c`` — no filesystem session lifecycle in production.

Relaxed local/dev/test may retain the legacy filesystem sign-session path for deterministic
unit tests only; that path is not production-authoritative.
"""

from __future__ import annotations

import os
from typing import Any, Dict

from fastapi import HTTPException, Request

from backend.security.agreement_read_scope import recipient_access_token_from_request
from backend.security.recipient_bootstrap_session_cookie import read_recipient_session_cookie
from backend.security.sensitive_read_authorization import (
    _OWNER_IDENTITY_UNVERIFIED,
    _SENSITIVE_NOT_FOUND,
    assert_owner_document_read_allowed,
    private_cache_headers,
    private_json_response,
    resolve_verified_owner_identity,
)
from backend.services import signature_service

LEGACY_SIGNING_DEFERRED_DETAIL = "legacy_signing_session_deferred_until_3c2c"
LEGACY_SIGNING_DEFERRED_STATUS = 409

_LEGACY_SIGNING_DEFERRED = HTTPException(
    status_code=LEGACY_SIGNING_DEFERRED_STATUS,
    detail=LEGACY_SIGNING_DEFERRED_DETAIL,
)


def is_explicit_legacy_signing_relaxed_environment() -> bool:
    """
    Security boundary for unsafe legacy signing compatibility.

    This is deliberately not a general environment-label helper. Only exact raw
    ``CLAW_ENVIRONMENT`` values local/dev/test relax containment; unset, empty,
    normalized-looking, malformed, and every other value fail closed.
    """
    return os.environ.get("CLAW_ENVIRONMENT") in ("local", "dev", "test")


def raise_if_legacy_signing_sessions_disabled() -> None:
    """Fail closed before any legacy sign-session create/complete side effect."""
    if not is_explicit_legacy_signing_relaxed_environment():
        raise _LEGACY_SIGNING_DEFERRED


def assert_document_sign_prep_allowed(request: Request, document_id: str) -> Dict[str, Any]:
    """
    Require exact verified owner authority before sign-prep byte loading.

    Recipient access tokens (review or sign mode) and recipient bootstrap session cookies
    cannot authorize legacy sign preparation. Outside exact local/dev/test, broad platform
    environment defaults or normalization cannot admit a forged legacy org identity.
    """
    if recipient_access_token_from_request(request):
        raise _SENSITIVE_NOT_FOUND
    if read_recipient_session_cookie(request):
        raise _SENSITIVE_NOT_FOUND
    if not is_explicit_legacy_signing_relaxed_environment():
        identity = resolve_verified_owner_identity(request)
        if identity.kind == "legacy":
            raise _OWNER_IDENTITY_UNVERIFIED
    return assert_owner_document_read_allowed(request, document_id)


def assert_sign_session_create_allowed(request: Request, *, document_id: str) -> Dict[str, Any]:
    raise_if_legacy_signing_sessions_disabled()
    return assert_document_sign_prep_allowed(request, document_id)


def assert_sign_session_complete_allowed(request: Request, session_id: str) -> Dict[str, Any]:
    """
    Authorize completion against the session's bound document in relaxed environments only.

    Production-like environments fail closed before loading session state or mutable content.
    """
    raise_if_legacy_signing_sessions_disabled()

    sid = (session_id or "").strip()
    if not sid:
        raise _SENSITIVE_NOT_FOUND
    session = signature_service.get_sign_session(sid)
    if not session:
        raise _SENSITIVE_NOT_FOUND
    document_id = str(session.get("document_id") or "").strip()
    if not document_id:
        raise _SENSITIVE_NOT_FOUND
    ctx = assert_document_sign_prep_allowed(request, document_id)
    return {**ctx, "session": session}


__all__ = [
    "LEGACY_SIGNING_DEFERRED_DETAIL",
    "LEGACY_SIGNING_DEFERRED_STATUS",
    "assert_document_sign_prep_allowed",
    "assert_sign_session_complete_allowed",
    "assert_sign_session_create_allowed",
    "is_explicit_legacy_signing_relaxed_environment",
    "private_cache_headers",
    "private_json_response",
    "raise_if_legacy_signing_sessions_disabled",
]
