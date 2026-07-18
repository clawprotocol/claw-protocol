"""
Centralized read authorization for sensitive VS01 document, receipt, proof, and layout data.

Always enforced (no UUID-only or legacy anonymous bypass). Reuses existing authority:
owner workspace (verified anon/user only in production-like envs), recipient access token
with activation document binding, recipient bootstrap session with exact document binding,
and stored owner_subject for unlinked artifacts (relaxed environments only).
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from backend.config.agreement_signing_token import (
    SigningTokenSecretMissingInProductionError,
    resolve_signing_token_secret_raw,
)
from backend.config.deployment_runtime import is_production_like_claw_environment
from backend.document_layout.store import load_layout_analysis
from backend.security.agreement_read_scope import (
    recipient_access_token_from_request,
    validate_recipient_access_token_for_agreement,
)
from backend.security.recipient_bootstrap_session_cookie import read_recipient_session_cookie
from backend.security.request_identity import WorkspaceIdentity, resolve_workspace_identity
from backend.services import document_service, receipt_service
from backend.services.vs01_recipient_bootstrap_exchange import (
    RecipientBootstrapExchangeError,
    load_revalidated_recipient_session,
)
from backend.usage_economics.policy import (
    _raw_org_id_from_request,
    require_claw_org_id_header,
    workspace_lists_agreement_for_subject,
)

_SENSITIVE_NOT_FOUND = HTTPException(status_code=404, detail="not_found")

_ORG_HEADER_REQUIRED = HTTPException(
    status_code=401,
    detail={
        "code": "org_header_required",
        "message": "X-Claw-Org-Id header is required.",
    },
)

_OWNER_IDENTITY_UNVERIFIED = HTTPException(
    status_code=403,
    detail={
        "code": "owner_identity_unverified",
        "message": "Verified workspace identity is required for owner-private access.",
    },
)


def private_cache_headers() -> Dict[str, str]:
    return {"Cache-Control": "no-store, private"}


def private_json_response(content: Dict[str, Any], *, status_code: int = 200) -> JSONResponse:
    return JSONResponse(content=content, status_code=status_code, headers=private_cache_headers())


def resolve_verified_owner_identity(request: Request) -> WorkspaceIdentity:
    """Require a cryptographically/session-verified owner identity."""
    if not _raw_org_id_from_request(request):
        raise _ORG_HEADER_REQUIRED
    require_claw_org_id_header(request)
    identity = resolve_workspace_identity(request)
    if is_production_like_claw_environment() and identity.kind == "legacy":
        raise _OWNER_IDENTITY_UNVERIFIED
    return identity


def resolve_verified_owner_subject_for_sensitive_read(request: Request) -> str:
    return resolve_verified_owner_identity(request).subject_ref


def resolve_verified_owner_subject_for_sensitive_write(request: Request) -> Optional[str]:
    """
    Write-time owner attribution.

    Production-like environments require verified anon/user identity and always return
    a subject_ref. Relaxed environments may return None when no org header is present.
    """
    if is_production_like_claw_environment():
        return resolve_verified_owner_identity(request).subject_ref
    if not _raw_org_id_from_request(request):
        return None
    try:
        require_claw_org_id_header(request)
        return resolve_workspace_identity(request).subject_ref
    except HTTPException:
        return None


def assert_verified_owner_for_sensitive_write(request: Request) -> str:
    """Require verified owner identity before creating owner-private artifacts."""
    if is_production_like_claw_environment():
        return resolve_verified_owner_identity(request).subject_ref
    return resolve_verified_owner_subject_for_sensitive_write(request) or ""


def resolve_verified_owner_subject(request: Request) -> Optional[str]:
    """Backward-compatible alias for relaxed write attribution."""
    return resolve_verified_owner_subject_for_sensitive_write(request)


def resolve_document_read_context(document_id: str) -> Optional[Dict[str, Any]]:
    did = (document_id or "").strip()
    if not did:
        return None
    meta = document_service.get_document_meta(did)
    if not meta:
        return None
    aid = str(meta.get("agreement_id") or "").strip() or None
    owner = str(meta.get("owner_subject") or "").strip() or None
    return {
        "document_id": did,
        "agreement_id": aid,
        "owner_subject": owner,
    }


def resolve_receipt_read_context(receipt_id: str) -> Optional[Dict[str, Any]]:
    rid = (receipt_id or "").strip()
    if not rid:
        return None
    rec = receipt_service.get_receipt(rid)
    if not rec:
        return None
    doc_id = str(rec.get("document_id") or "").strip() or None
    ctx = resolve_document_read_context(doc_id) if doc_id else None
    return {
        "receipt_id": rid,
        "document_id": doc_id,
        "agreement_id": (ctx or {}).get("agreement_id"),
        "owner_subject": (ctx or {}).get("owner_subject"),
    }


def resolve_layout_analysis_read_context(analysis_id: str) -> Optional[Dict[str, Any]]:
    aid_key = (analysis_id or "").strip()
    if not aid_key:
        return None
    data = load_layout_analysis(aid_key)
    if not data:
        return None
    doc_ref = str(data.get("document_id_ref") or "").strip() or None
    agreement_id: Optional[str] = None
    owner_subject = str(data.get("owner_subject") or "").strip() or None
    if doc_ref:
        doc_ctx = resolve_document_read_context(doc_ref)
        if doc_ctx:
            agreement_id = doc_ctx.get("agreement_id")
            if not owner_subject:
                owner_subject = doc_ctx.get("owner_subject")
    return {
        "analysis_id": aid_key,
        "document_id": doc_ref,
        "agreement_id": agreement_id,
        "owner_subject": owner_subject,
    }


def _activation_document_id_for_agreement(agreement_id: str) -> Optional[str]:
    from backend.services.agreement_draft_store import load_draft
    from backend.services.vs01_signing_packet_activation import (
        VS01_SIGNING_PACKET_ACTIVATION_FIELD,
        has_active_signing_packet_activation,
    )

    aid = (agreement_id or "").strip()
    if not aid:
        return None
    try:
        draft = load_draft(aid)
    except Exception:
        return None
    if not has_active_signing_packet_activation(draft):
        return None
    stored = draft.get(VS01_SIGNING_PACKET_ACTIVATION_FIELD)
    if not isinstance(stored, dict):
        return None
    did = str(stored.get("document_id") or "").strip()
    return did or None


def _assert_recipient_token_document_binding(*, agreement_id: str, document_id: str) -> None:
    """
    Recipient access tokens are agreement-scoped only. Document reads require an exact
    backend-authoritative activation document binding; absent activation fails closed.
    """
    did = (document_id or "").strip()
    if not did:
        raise _SENSITIVE_NOT_FOUND
    activation_doc = _activation_document_id_for_agreement(agreement_id)
    if not activation_doc or activation_doc != did:
        raise _SENSITIVE_NOT_FOUND


def _assert_recipient_session_read(
    request: Request,
    *,
    agreement_id: str,
    document_id: Optional[str],
) -> bool:
    session_secret = read_recipient_session_cookie(request)
    if not session_secret:
        return False
    did = (document_id or "").strip()
    if not did:
        return False
    try:
        session, _, _ = load_revalidated_recipient_session(
            session_secret=session_secret,
            touch_seen=False,
        )
    except RecipientBootstrapExchangeError:
        raise _SENSITIVE_NOT_FOUND from None
    sess_aid = str(session.get("agreement_id") or "").strip()
    if not sess_aid or sess_aid != agreement_id:
        raise _SENSITIVE_NOT_FOUND
    sess_doc = str(session.get("document_id") or "").strip()
    if not sess_doc or sess_doc != did:
        raise _SENSITIVE_NOT_FOUND
    return True


def assert_sensitive_read_allowed(
    request: Request,
    *,
    agreement_id: Optional[str] = None,
    document_id: Optional[str] = None,
    owner_subject: Optional[str] = None,
) -> None:
    """
    Require owner workspace, validated recipient token with activation document binding,
    or revalidated recipient session with exact document binding.
    Cross-tenant and unknown resources use uniform 404 responses.
    """
    aid = (agreement_id or "").strip() or None
    did = (document_id or "").strip() or None
    owner = (owner_subject or "").strip() or None

    tok = recipient_access_token_from_request(request)
    if tok:
        if not aid or not did:
            raise _SENSITIVE_NOT_FOUND
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
        try:
            validate_recipient_access_token_for_agreement(
                token=tok,
                path_agreement_id=aid,
                query_agreement_id=None,
                secret_raw=secret_raw,
                consume_single_use=False,
                log_validation=False,
            )
        except HTTPException:
            raise _SENSITIVE_NOT_FOUND from None
        _assert_recipient_token_document_binding(agreement_id=aid, document_id=did)
        return

    if aid and did and _assert_recipient_session_read(
        request,
        agreement_id=aid,
        document_id=did,
    ):
        return

    if aid:
        subject = resolve_verified_owner_subject_for_sensitive_read(request)
        if not workspace_lists_agreement_for_subject(aid, subject):
            raise _SENSITIVE_NOT_FOUND
        return

    if owner:
        subject = resolve_verified_owner_subject_for_sensitive_read(request)
        if subject != owner:
            raise _SENSITIVE_NOT_FOUND
        return

    if not _raw_org_id_from_request(request):
        raise _ORG_HEADER_REQUIRED
    raise _SENSITIVE_NOT_FOUND


def assert_document_read_allowed(request: Request, document_id: str) -> Dict[str, Any]:
    ctx = resolve_document_read_context(document_id)
    if not ctx:
        raise _SENSITIVE_NOT_FOUND
    assert_sensitive_read_allowed(
        request,
        agreement_id=ctx.get("agreement_id"),
        document_id=ctx.get("document_id"),
        owner_subject=ctx.get("owner_subject"),
    )
    return ctx


def assert_owner_document_read_allowed(request: Request, document_id: str) -> Dict[str, Any]:
    """
    Owner-workspace document authorization for mutating layout analysis.

    Recipient access tokens and bootstrap session cookies are rejected even when
    document read paths would otherwise accept them.
    """
    if recipient_access_token_from_request(request):
        raise _SENSITIVE_NOT_FOUND
    if read_recipient_session_cookie(request):
        raise _SENSITIVE_NOT_FOUND

    ctx = resolve_document_read_context(document_id)
    if not ctx:
        raise _SENSITIVE_NOT_FOUND

    aid = ctx.get("agreement_id")
    owner = ctx.get("owner_subject")

    if aid:
        subject = resolve_verified_owner_subject_for_sensitive_read(request)
        if not workspace_lists_agreement_for_subject(aid, subject):
            raise _SENSITIVE_NOT_FOUND
        return ctx

    if owner:
        subject = resolve_verified_owner_subject_for_sensitive_read(request)
        if subject != owner:
            raise _SENSITIVE_NOT_FOUND
        return ctx

    if not _raw_org_id_from_request(request):
        raise _ORG_HEADER_REQUIRED
    raise _SENSITIVE_NOT_FOUND


def assert_receipt_read_allowed(request: Request, receipt_id: str) -> Dict[str, Any]:
    ctx = resolve_receipt_read_context(receipt_id)
    if not ctx:
        raise _SENSITIVE_NOT_FOUND
    assert_sensitive_read_allowed(
        request,
        agreement_id=ctx.get("agreement_id"),
        document_id=ctx.get("document_id"),
        owner_subject=ctx.get("owner_subject"),
    )
    return ctx


def assert_layout_analysis_read_allowed(request: Request, analysis_id: str) -> Dict[str, Any]:
    ctx = resolve_layout_analysis_read_context(analysis_id)
    if not ctx:
        raise _SENSITIVE_NOT_FOUND
    assert_sensitive_read_allowed(
        request,
        agreement_id=ctx.get("agreement_id"),
        document_id=ctx.get("document_id"),
        owner_subject=ctx.get("owner_subject"),
    )
    return ctx


def assert_agreement_proof_status_read_allowed(request: Request, agreement_id: str) -> None:
    """Owner-only proof ladder metadata for an agreement workspace."""
    aid = (agreement_id or "").strip()
    if not aid:
        raise _SENSITIVE_NOT_FOUND
    subject = resolve_verified_owner_subject_for_sensitive_read(request)
    if not workspace_lists_agreement_for_subject(aid, subject):
        raise _SENSITIVE_NOT_FOUND
