"""
Authorization for raw receipt and verification-bundle downloads.

Commercial mode never authorizes from receipt/usage id, org header, wallet/IP
subject, or client-supplied agreement id alone. Ownership is bound through
server-stamped document/usage metadata or agreement registry links.
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException, Request

from backend.security.agreement_read_scope import (
    assert_agreement_full_draft_read_allowed,
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
from backend.security.vs01_document_ownership import (
    OWNER_ORG_FIELD,
    require_vs01_document_access,
)
from backend.services import receipt_service
from backend.usage_economics.policy import require_claw_org_id_header


def _deny(code: str = "receipt_access_denied") -> None:
    raise HTTPException(
        status_code=403,
        detail={
            "code": code,
            "message": "Not allowed to access this receipt.",
        },
    )


def _deny_unregistered() -> None:
    raise HTTPException(
        status_code=403,
        detail={
            "code": "receipt_ownership_unregistered",
            "message": (
                "This receipt has no registered owning organization. "
                "Access is denied in commercial mode."
            ),
        },
    )


def require_vs01_receipt_access(
    request: Request,
    receipt_id: str,
    *,
    allow_recipient_modes: Tuple[str, ...] = ("sign", "review"),
) -> Dict[str, Any]:
    """
    Gate VS01 filesystem receipts (``/v1/receipts/{id}`` and ``…/bundle``).

    Prefer binding through the receipt's ``document_id`` → document ownership /
    recipient party scope. Legacy receipts with neither document bind nor
    ``owner_org_id`` fail closed in commercial mode.
    """
    rid = (receipt_id or "").strip()
    if not rid:
        raise HTTPException(status_code=404, detail="receipt_not_found")

    rec = receipt_service.get_receipt(rid)
    if not rec:
        raise HTTPException(status_code=404, detail="receipt_not_found")

    doc_id = str(rec.get("document_id") or "").strip()
    if doc_id:
        require_vs01_document_access(
            request,
            doc_id,
            allow_recipient_modes=allow_recipient_modes,
        )
        return rec

    commercial = commercial_mode_enforced()
    if not commercial:
        return rec

    tok = recipient_access_token_from_request(request)
    aid = str(rec.get("agreement_id") or "").strip()
    if tok:
        if not aid:
            _deny("receipt_recipient_unbound")
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
            _deny("recipient_token_mode_not_allowed")
        return rec

    require_commercial_owner_principal(request)
    oid = require_claw_org_id_header(request).strip()
    owner = str(rec.get(OWNER_ORG_FIELD) or "").strip()
    if not owner:
        _deny_unregistered()
    if owner != oid:
        _deny("receipt_org_mismatch")
    return rec


def require_usage_receipt_access(request: Request, usage_event_id: str) -> Dict[str, Any]:
    """
    Gate economics usage receipt/bundle downloads.

    Always requires a commercial owner principal; binds path usage id to the
    usage_event's stored ``org_id`` (never inferred from headers alone).
    """
    from backend.economics.store import get_economics_store

    uid = (usage_event_id or "").strip()
    if not uid:
        raise HTTPException(status_code=404, detail="usage_event not found")

    require_commercial_owner_principal(request)
    oid = require_claw_org_id_header(request).strip()

    eco = get_economics_store()
    eco.init_schema()
    row = eco.get_usage_event(uid)
    if not row:
        # Avoid confirming foreign usage ids under commercial mode.
        if commercial_mode_enforced():
            _deny("usage_receipt_access_denied")
        raise HTTPException(status_code=404, detail="usage_event not found")

    owner_org = str(row.get("org_id") or "").strip()
    if not owner_org:
        _deny_unregistered()
    if owner_org != oid:
        _deny("usage_receipt_org_mismatch")
    return dict(row)


def require_timeline_receipt_access(
    request: Request,
    receipt_id: str,
    *,
    store: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Gate legacy timeline-store receipt GETs.

    ``timeline_id`` of form ``agreement:{id}`` uses agreement read-scope.
    Other timeline receipts fail closed in commercial mode (no forgeable owner).
    """
    from backend.utils.timeline_store import TimelineStore

    rid = (receipt_id or "").strip()
    if not rid:
        raise HTTPException(status_code=404, detail="receipt_not_found")

    ts = store or TimelineStore()
    try:
        rec = ts.get_receipt(rid)
    except KeyError:
        if commercial_mode_enforced():
            _deny("receipt_access_denied")
        raise HTTPException(status_code=404, detail="receipt_not_found") from None

    if not commercial_mode_enforced():
        return rec

    tid = str(rec.get("timeline_id") or "").strip()
    if tid.startswith("agreement:"):
        aid = tid.split(":", 1)[1].strip()
        if not aid:
            _deny_unregistered()
        assert_agreement_full_draft_read_allowed(request, aid)
        return rec

    # No server-side org bind for generic timeline receipts in commercial mode.
    _deny_unregistered()
    return rec  # pragma: no cover
