"""
Server-side ownership / recipient binding for VS01 documents and sign sessions.

``owner_org_id`` is stamped only from a validated principal at finalize time.
Clients cannot forge ownership via path, body, or org header alone.
"""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional, Tuple

from fastapi import HTTPException, Request

from backend.security.agreement_read_scope import (
    recipient_access_token_from_request,
    validate_recipient_access_token_for_agreement,
)
from backend.security.commercial_auth import (
    commercial_mode_enforced,
    require_commercial_owner_principal,
)
from backend.config.agreement_signing_token import (
    SigningTokenSecretMissingInProductionError,
    resolve_signing_token_secret_raw,
)
from backend.services import document_service
from backend.usage_economics.policy import require_claw_org_id_header

OWNER_ORG_FIELD = "owner_org_id"
AGREEMENT_ID_FIELD = "agreement_id"
BOUND_PARTY_FIELD = "bound_party_id"

AccessKind = Literal["owner", "recipient", "legacy"]


def stamp_owner_org_id(meta: Dict[str, Any], org_id: str) -> Dict[str, Any]:
    """Attach server-derived owner org; overwrites any client-supplied value."""
    oid = (org_id or "").strip()
    if not oid:
        raise HTTPException(
            status_code=400,
            detail={"code": "org_id_required", "message": "Organization id is required."},
        )
    out = dict(meta)
    out[OWNER_ORG_FIELD] = oid
    return out


def _deny_unregistered() -> None:
    raise HTTPException(
        status_code=403,
        detail={
            "code": "document_ownership_unregistered",
            "message": (
                "This document has no registered owning organization. "
                "Re-finalize while signed in, or contact support."
            ),
        },
    )


def _deny_org_mismatch() -> None:
    raise HTTPException(
        status_code=403,
        detail={
            "code": "document_org_mismatch",
            "message": "This document belongs to a different organization.",
        },
    )


def _deny_party_mismatch() -> None:
    raise HTTPException(
        status_code=403,
        detail={
            "code": "document_party_mismatch",
            "message": "This document is not assigned to the recipient on this link.",
        },
    )


def require_vs01_document_finalize_principal(request: Request) -> str:
    """
    Owner-only finalize. In commercial mode requires validated principal + org header.
    Returns owner org id (may be empty only in non-commercial legacy).
    """
    if not commercial_mode_enforced():
        try:
            return require_claw_org_id_header(request).strip()
        except HTTPException:
            return ""
    require_commercial_owner_principal(request)
    return require_claw_org_id_header(request).strip()


def require_vs01_document_access(
    request: Request,
    document_id: str,
    *,
    allow_recipient_modes: Tuple[str, ...] = ("sign", "review"),
) -> Tuple[AccessKind, Dict[str, Any], Optional[Dict[str, Any]]]:
    """
    Bind access to a VS01 document.

    Returns ``(kind, meta, recipient_token_claims_or_none)``.

    Commercial mode: owner principal + ``owner_org_id`` bind, or recipient token
    bound to ``agreement_id`` (and ``bound_party_id`` when present). Missing
    ``owner_org_id`` fails closed for the owner path; recipient path requires
    ``agreement_id`` on the document.

    Non-commercial: legacy permissive when no token/principal (local/dev suites).
    """
    did = (document_id or "").strip()
    if not did:
        raise HTTPException(status_code=404, detail="document_not_found")

    meta = document_service.get_document_meta(did)
    if not meta:
        raise HTTPException(status_code=404, detail="document_not_found")

    commercial = commercial_mode_enforced()
    tok = recipient_access_token_from_request(request)

    if tok:
        aid = str(meta.get(AGREEMENT_ID_FIELD) or "").strip()
        if not aid:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "document_recipient_unbound",
                    "message": "This document is not linked to a recipient agreement.",
                },
            )
        try:
            secret_raw = resolve_signing_token_secret_raw()
        except SigningTokenSecretMissingInProductionError as e:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "signing_token_secret_not_configured",
                    "message": str(e),
                },
            ) from e
        claims = validate_recipient_access_token_for_agreement(
            token=tok,
            path_agreement_id=aid,
            query_agreement_id=None,
            secret_raw=secret_raw,
            consume_single_use=False,
            log_validation=False,
        )
        mode = str(claims.get("mode") or "")
        if mode not in allow_recipient_modes:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "recipient_token_mode_not_allowed",
                    "message": "This action requires a different recipient link (review vs sign).",
                },
            )
        bound_party = str(meta.get(BOUND_PARTY_FIELD) or "").strip()
        tok_pid = str(claims.get("recipient_party_id") or "").strip()
        if bound_party and tok_pid and bound_party != tok_pid:
            _deny_party_mismatch()
        if bound_party and not tok_pid:
            _deny_party_mismatch()
        return "recipient", meta, claims

    if not commercial:
        return "legacy", meta, None

    require_commercial_owner_principal(request)
    oid = require_claw_org_id_header(request).strip()
    owner = str(meta.get(OWNER_ORG_FIELD) or "").strip()
    if not owner:
        _deny_unregistered()
    if owner != oid:
        _deny_org_mismatch()
    return "owner", meta, None


def require_vs01_sign_session_access(
    request: Request,
    session: Dict[str, Any],
    *,
    allow_recipient_modes: Tuple[str, ...] = ("sign",),
) -> Tuple[AccessKind, Dict[str, Any], Optional[Dict[str, Any]]]:
    """Bind sign-session ops to the session's document ownership / recipient token."""
    doc_id = str(session.get("document_id") or "").strip()
    if not doc_id:
        raise HTTPException(status_code=404, detail="session_not_found")
    return require_vs01_document_access(
        request,
        doc_id,
        allow_recipient_modes=allow_recipient_modes,
    )
