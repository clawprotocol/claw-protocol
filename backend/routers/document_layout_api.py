"""
Document spatial intelligence API — layout analysis & localization.

Separate from proof receipts, hashes, and signed artifacts.
All analysis access requires a validated commercial owner principal and
server-stamped ``owner_org_id`` binding (never inferred from client headers).
"""
from __future__ import annotations

import base64
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from backend.document_layout.events import emit_document_layout_event
from backend.document_layout.confidence_policy import localization_guidance_summary, matches_need_localization_review
from backend.document_layout.localize import localize_query
from backend.document_layout.ownership import (
    require_layout_analysis_for_principal,
    stamp_owner_org_id,
)
from backend.document_layout.pipeline import run_layout_analysis
from backend.document_layout.review_manifest import (
    apply_review_actions,
    enrich_analysis_for_api,
    persist_analysis,
)
from backend.document_layout.signing_prep import build_signing_prep_response
from backend.document_layout.store import save_layout_analysis
from backend.services import document_service
from backend.usage_economics.policy import require_claw_org_id_header

router = APIRouter(prefix="/v1/document-layout", tags=["document-layout"])
_log = logging.getLogger(__name__)


class LayoutAnalyzeOptions(BaseModel):
    prefer_ocr: bool = Field(default=False, description="Run OCR when native text is empty (requires Tesseract).")
    assistive_llm: bool = Field(default=True, description="Re-label candidates with LLM (no geometry from model).")
    persist: bool = Field(default=True, description="Save review JSON under CLAW_LAYOUT_ANALYSIS_DIR.")


class LayoutAnalyzeRequest(BaseModel):
    document_id: Optional[str] = Field(default=None, description="Use bytes from finalized VS01 document store.")
    content_base64: Optional[str] = Field(default=None, description="Raw document bytes if not using document_id.")
    content_type: Optional[str] = Field(default=None, description="MIME hint (e.g. application/pdf, image/png).")
    options: LayoutAnalyzeOptions = Field(default_factory=LayoutAnalyzeOptions)


class LayoutLocalizeRequest(BaseModel):
    query: str = Field(..., min_length=1, description='e.g. "find signature line", "find all fillable blanks".')


@router.post("/analyze")
def api_layout_analyze(body: LayoutAnalyzeRequest, request: Request) -> Dict[str, Any]:
    from backend.security.commercial_auth import require_commercial_owner_principal

    org_for_hooks = require_claw_org_id_header(request)
    require_commercial_owner_principal(request)
    if body.document_id and body.content_base64:
        raise HTTPException(status_code=400, detail="use_either_document_id_or_content_not_both")

    raw: Optional[bytes] = None
    ct = body.content_type
    if body.document_id:
        # Bind document → owner/recipient before loading bytes (never IDOR via document_id).
        from backend.security.vs01_document_ownership import require_vs01_document_access

        did = body.document_id.strip()
        require_vs01_document_access(request, did, allow_recipient_modes=("sign", "review"))
        raw = document_service.get_document_bytes(did)
        if raw is None:
            raise HTTPException(status_code=404, detail="document_not_found")
        if not ct:
            meta = document_service.get_document_meta(did) or {}
            ct = str(meta.get("content_type") or "application/pdf")
    elif body.content_base64:
        try:
            raw = base64.b64decode(body.content_base64, validate=True)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="invalid_base64") from exc
    else:
        raise HTTPException(status_code=400, detail="document_id_or_content_required")

    try:
        payload = run_layout_analysis(
            raw,
            content_type=ct,
            document_id=body.document_id.strip() if body.document_id else None,
            prefer_ocr=body.options.prefer_ocr,
            assistive_llm=body.options.assistive_llm,
            persist=body.options.persist,
        )
    except ValueError as exc:
        if str(exc) == "empty_document":
            raise HTTPException(status_code=400, detail="empty_document") from exc
        if str(exc) == "unsupported_document_format":
            raise HTTPException(status_code=400, detail="unsupported_document_format") from exc
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        _log.exception("layout_analyze_failed")
        raise HTTPException(status_code=500, detail="layout_analyze_failed") from None

    # Server-derived ownership only — never trust client body/path/header spoof of owner.
    payload = stamp_owner_org_id(payload, org_for_hooks)
    analysis_id = str(payload.get("analysis_id") or "").strip()
    if body.options.persist and analysis_id:
        save_layout_analysis(analysis_id, payload)

    _log.info(
        "layout_analyze_ok analysis_id=%s pages=%s candidates=%s owner_org=%s",
        payload.get("analysis_id"),
        payload.get("page_count"),
        len(payload.get("field_candidates") or []),
        org_for_hooks,
    )
    try:
        from backend.integrations.hooks_emit import claw_emit_integration_event

        if analysis_id:
            claw_emit_integration_event(
                org_for_hooks,
                "document.analysis.completed",
                "document_layout_analysis",
                analysis_id,
                {
                    "page_count": payload.get("page_count"),
                    "candidate_total": len(payload.get("field_candidates") or []),
                    "document_id_ref": payload.get("document_id_ref"),
                },
            )
    except Exception:
        pass
    return {"ok": True, **payload}


@router.get("/analysis/{analysis_id}")
def api_get_layout_analysis(analysis_id: str, request: Request) -> Dict[str, Any]:
    _oid, data = require_layout_analysis_for_principal(request, analysis_id)
    enriched = enrich_analysis_for_api(data)
    rows = enriched.get("field_candidates_enriched") or []
    layout_confidence_summary = {
        "policy_version": 1,
        "low_confidence_count": sum(1 for r in rows if r.get("confidence_band") == "low"),
        "critical_review_required_count": sum(
            1 for r in rows if r.get("critical_field") and r.get("review_required")
        ),
        "auto_usable_count": sum(1 for r in rows if r.get("auto_usable")),
        "ambiguous_overlap_count": sum(1 for r in rows if r.get("ambiguous_overlap")),
    }
    return {"ok": True, "layout_confidence_summary": layout_confidence_summary, **enriched}


@router.get("/analysis/{analysis_id}/signing-prep")
def api_signing_prep(analysis_id: str, request: Request) -> Dict[str, Any]:
    """Placement overlay for a future signing workflow — does not alter source document or proof stores."""
    _oid, data = require_layout_analysis_for_principal(request, analysis_id)
    aid = analysis_id.strip()
    return build_signing_prep_response(data, analysis_id=aid)


class ReviewActionItem(BaseModel):
    action: str = Field(..., min_length=1)
    candidate_id: Optional[str] = None
    manual_field_id: Optional[str] = None
    field_type: Optional[str] = None
    label: Optional[str] = None
    page_number: Optional[int] = Field(default=None, ge=1)
    bbox_normalized: Optional[Dict[str, Any]] = None
    acknowledge_low_confidence: Optional[bool] = Field(
        default=None,
        description="Required when confirming critical fields (signature, date, name, initials) below placement threshold.",
    )
    signer_role: Optional[str] = Field(
        default=None,
        description="Optional future-facing role: signer, counterparty, sender, recipient, unknown.",
    )


class ReviewManifestPutBody(BaseModel):
    actions: List[ReviewActionItem] = Field(default_factory=list)


@router.post("/analysis/{analysis_id}/field-review/open")
def api_field_review_open(analysis_id: str, request: Request) -> Dict[str, Any]:
    _oid, _data = require_layout_analysis_for_principal(request, analysis_id)
    aid = analysis_id.strip()
    emit_document_layout_event("field_review_opened", analysis_id=aid)
    return {"ok": True, "analysis_id": aid}


@router.put("/analysis/{analysis_id}/review-manifest")
def api_put_review_manifest(analysis_id: str, body: ReviewManifestPutBody, request: Request) -> Dict[str, Any]:
    org_for_hooks, data = require_layout_analysis_for_principal(request, analysis_id)
    aid = analysis_id.strip()

    def _emit(event: str, **kwargs: Any) -> None:
        emit_document_layout_event(event, analysis_id=aid, **kwargs)

    try:
        actions = [a.model_dump(exclude_none=True) for a in body.actions]
        apply_review_actions(data, actions, emit=_emit)
    except ValueError as exc:
        code = str(exc)
        if code == "low_confidence_critical_ack_required":
            raise HTTPException(
                status_code=400,
                detail={
                    "code": code,
                    "message": (
                        "This signature, date, legal name, or initials region was detected below our "
                        "confidence threshold. Confirm the placement on the document, check the "
                        "acknowledgement box, and try again."
                    ),
                },
            ) from exc
        raise HTTPException(status_code=400, detail=code) from exc

    # Preserve ownership stamp across manifest mutations.
    data = stamp_owner_org_id(data, org_for_hooks)
    persist_analysis(aid, data)
    try:
        from backend.integrations.hooks_emit import claw_emit_integration_event

        claw_emit_integration_event(
            org_for_hooks,
            "field.review.completed",
            "document_layout_analysis",
            aid,
            {"action_count": len(body.actions), "review_state": "manifest_saved"},
        )
    except Exception:
        pass
    return {"ok": True, **enrich_analysis_for_api(data)}


@router.post("/analysis/{analysis_id}/localize")
def api_layout_localize(
    analysis_id: str,
    body: LayoutLocalizeRequest,
    request: Request,
) -> Dict[str, Any]:
    _oid, data = require_layout_analysis_for_principal(request, analysis_id)
    aid = analysis_id.strip()

    emit_document_layout_event(
        "field_localization_requested",
        analysis_id=aid,
        query_len=len(body.query.strip()),
    )
    matches = localize_query(body.query, data)
    review_needed = matches_need_localization_review(matches)
    if review_needed:
        emit_document_layout_event(
            "field_localization_review_needed",
            analysis_id=aid,
            reason="weak_or_empty_matches",
        )

    return {
        "ok": True,
        "analysis_id": aid,
        "query": body.query.strip(),
        "matches": matches,
        "review_recommended": review_needed,
        "localization_guidance": localization_guidance_summary(matches),
    }
