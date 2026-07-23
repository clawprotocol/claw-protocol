"""
Stable inbound integration aliases — same auth as core APIs (``X-Claw-Org-Id`` + ownership checks).

These wrap existing handlers so automation can target ``/v1/integration/*`` without behavior drift.
"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Request

from backend.document_layout.review_manifest import enrich_analysis_for_api
from backend.document_layout.store import load_layout_analysis
from backend.routers.agreements_v2_api import (
    AgreementDraftCreate,
    _load_or_404,
    _public_lifecycle_label,
    create_agreement_draft,
    economics_overlay_for_agreement,
    post_agreement_review_sent,
)
from backend.routers.agreement_memory_api import MemorySearchBody, agreement_memory_search
from backend.routers.document_layout_api import (
    LayoutAnalyzeRequest,
    LayoutLocalizeRequest,
    api_layout_analyze,
    api_layout_localize,
)

router = APIRouter(prefix="/v1/integration", tags=["integration-hooks"])


@router.post("/agreements/draft")
def integration_create_agreement_draft(body: AgreementDraftCreate, request: Request) -> Dict[str, Any]:
    return create_agreement_draft(body, request)


@router.post("/documents/analyze")
def integration_document_analyze(body: LayoutAnalyzeRequest, request: Request) -> Dict[str, Any]:
    return api_layout_analyze(body, request)


@router.post("/layout/{analysis_id}/localize")
def integration_layout_localize(analysis_id: str, body: LayoutLocalizeRequest, request: Request) -> Dict[str, Any]:
    return api_layout_localize(analysis_id, body)


@router.get("/layout/{analysis_id}/fields")
def integration_layout_fields(analysis_id: str, request: Request) -> Dict[str, Any]:
    """Review-ready field map (candidates + manifest + downstream list)."""
    data = load_layout_analysis(analysis_id.strip())
    if not data:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="analysis_not_found")
    return {"ok": True, **enrich_analysis_for_api(data)}


@router.post("/agreements/{agreement_id}/send")
def integration_trigger_send(agreement_id: str, request: Request) -> Dict[str, Any]:
    """Marks review sent (simple product / workflow hook); same as ``POST /api/agreements/{id}/review-sent``."""
    return post_agreement_review_sent(agreement_id, request)


@router.post("/memory/search")
def integration_memory_search(body: MemorySearchBody, request: Request) -> Dict[str, Any]:
    """Semantic Agreement Memory search (same auth + tier gates as ``/api/agreement-memory/search``)."""
    return agreement_memory_search(body, request)


@router.get("/agreements/{agreement_id}/status")
def integration_agreement_status(agreement_id: str, request: Request) -> Dict[str, Any]:
    from backend.usage_economics.policy import assert_registered_owner_matches, require_claw_org_id_header

    require_claw_org_id_header(request)
    from backend.security.commercial_auth import require_commercial_owner_principal
    require_commercial_owner_principal(request)
    assert_registered_owner_matches(request, agreement_id)
    draft = _load_or_404(agreement_id)
    eco = economics_overlay_for_agreement(agreement_id)
    return {
        "ok": True,
        "schema": "claw.integration.agreement_status/v1",
        "agreement_id": agreement_id,
        "status": _public_lifecycle_label(draft, agreement_id),
        "title": draft.title,
        "updated_at": draft.updated_at,
        "review_sent_at": draft.review_sent_at,
        "economics": eco,
    }
