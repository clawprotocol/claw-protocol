"""
Authorization for private ``/v1/proof/*`` surfaces.

Commercial mode requires a validated owner principal (or recipient token for
agreement-bound subjects) and server-side ownership binding. Subject ids from
the path are never trusted without that bind.
"""

from __future__ import annotations

from fastapi import HTTPException, Request

from backend.security.agreement_read_scope import assert_agreement_full_draft_read_allowed
from backend.security.commercial_auth import (
    commercial_mode_enforced,
    require_commercial_owner_principal,
)
from backend.security.request_identity import resolve_verified_subject_from_request
from backend.usage_economics.policy import require_claw_org_id_header
from backend.utils.enforce import resolve_subject_from_request


def resolve_proof_owner_subject(request: Request) -> str:
    """
    Stable owner subject for export/folder rows.

    Commercial: verified workspace subject (not spoofable org/wallet/IP headers alone).
    Legacy non-commercial: existing ``resolve_subject_from_request`` behavior.
    """
    if commercial_mode_enforced():
        require_commercial_owner_principal(request)
        return resolve_verified_subject_from_request(request)
    return resolve_subject_from_request(request)


def _deny_proof() -> None:
    raise HTTPException(
        status_code=403,
        detail={
            "code": "proof_access_denied",
            "message": "Not allowed to access this proof record.",
        },
    )


def require_proof_subject_access(
    request: Request,
    subject_type: str,
    subject_id: str,
) -> None:
    """
    Gate private proof status/details/export/upgrade for a path subject.

    - ``agreement``: full-draft read scope (owner + registry bind, or recipient token).
    - ``receipt``: delegates to ``require_vs01_receipt_access`` (document ownership /
      recipient party bind).
    - ``workspace``: verified subject must equal path subject id.
    """
    st = (subject_type or "").strip().lower()
    sid = (subject_id or "").strip()
    if not st or not sid:
        raise HTTPException(status_code=404, detail="proof_subject_not_found")

    commercial = commercial_mode_enforced()
    if not commercial:
        return

    if st == "agreement":
        assert_agreement_full_draft_read_allowed(request, sid)
        return

    if st == "workspace":
        require_commercial_owner_principal(request)
        verified = resolve_verified_subject_from_request(request)
        # Accept either bare org id or org: prefix forms.
        oid = require_claw_org_id_header(request).strip()
        allowed = {verified, oid, f"org:{oid}"}
        if sid not in allowed and sid.replace("org:", "") != oid:
            _deny_proof()
        return

    if st == "receipt":
        from backend.security.receipt_access import require_vs01_receipt_access

        try:
            require_vs01_receipt_access(request, sid)
        except HTTPException as exc:
            # Normalize missing receipts to access-denied under commercial mode
            # (avoid existence oracles via /v1/proof/receipt/{id}/…).
            if exc.status_code == 404:
                _deny_proof()
            raise
        return

    raise HTTPException(
        status_code=400,
        detail={"code": "unsupported_proof_subject", "message": f"Unknown subject_type: {st}"},
    )
