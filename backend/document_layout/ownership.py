"""
Server-side ownership binding for document-layout analysis records.

``owner_org_id`` is stamped only from a validated principal at analyze time.
Clients cannot supply or forge ownership via path/body/header.
"""

from __future__ import annotations

from typing import Any, Dict, Tuple

from fastapi import HTTPException, Request

from backend.document_layout.store import load_layout_analysis
from backend.security.commercial_auth import require_commercial_owner_principal
from backend.usage_economics.policy import require_claw_org_id_header

OWNER_ORG_FIELD = "owner_org_id"


def stamp_owner_org_id(payload: Dict[str, Any], org_id: str) -> Dict[str, Any]:
    """Attach server-derived owner org; overwrites any client-supplied value."""
    oid = (org_id or "").strip()
    if not oid:
        raise HTTPException(
            status_code=400,
            detail={"code": "org_id_required", "message": "Organization id is required."},
        )
    out = dict(payload)
    out[OWNER_ORG_FIELD] = oid
    return out


def require_layout_analysis_for_principal(
    request: Request,
    analysis_id: str,
) -> Tuple[str, Dict[str, Any]]:
    """
    Require validated commercial owner principal and bind analysis → principal org.

    Returns ``(owner_org_id, analysis_payload)``.

    Legacy analyses without ``owner_org_id`` fail closed — ownership is never inferred
    from the request org header (commercial or otherwise).
    """
    oid = require_claw_org_id_header(request).strip()
    require_commercial_owner_principal(request)

    aid = (analysis_id or "").strip()
    if not aid:
        raise HTTPException(status_code=404, detail="analysis_not_found")

    data = load_layout_analysis(aid)
    if not data:
        raise HTTPException(status_code=404, detail="analysis_not_found")

    owner = str(data.get(OWNER_ORG_FIELD) or "").strip()
    if not owner:
        # Never infer ownership from the request org header.
        raise HTTPException(
            status_code=403,
            detail={
                "code": "layout_ownership_unregistered",
                "message": (
                    "This layout analysis has no registered owning organization. "
                    "Re-run analysis while signed in, or contact support."
                ),
            },
        )

    if owner != oid:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "layout_org_mismatch",
                "message": "This layout analysis belongs to a different organization.",
            },
        )

    return oid, data
