"""
Advanced Work Product — assistive drafting only; never proof/receipt/canonical.

Org routes require ``X-Claw-Org-Id`` matching path ``org_id``.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from backend.advanced_work_product.entitlements import awp_tier_for_org
from backend.advanced_work_product.generate import generate_document_body
from backend.advanced_work_product.grounding import assess_source_material_strength
from backend.advanced_work_product.refine import REFINE_MODE_INSTRUCTIONS, refine_section_content
from backend.advanced_work_product.store import get_awp_store
from backend.advanced_work_product.templates import (
    TEMPLATES,
    allowed_types_for_tier,
    template_for,
)
from backend.agreement_memory.access import AgreementMemoryTier, agreement_memory_tier_for_subject
from backend.usage_economics.policy import require_claw_org_id_header
from backend.utils.enforce import resolve_subject_from_request

router = APIRouter(
    prefix="/v1/orgs/{org_id}/advanced-work-product",
    tags=["advanced-work-product"],
)

SCHEMA_VERSION = "claw.advanced_work_product/v2"


def _require_org_match(request: Request, org_id_path: str) -> str:
    oid = require_claw_org_id_header(request).strip()
    if oid != (org_id_path or "").strip():
        raise HTTPException(
            status_code=403,
            detail={"code": "org_mismatch", "message": "X-Claw-Org-Id must match this org path."},
        )
    return oid


def _ai_class_from_memory_tier(tier: AgreementMemoryTier) -> str:
    return "premium" if tier == "full" else "basic"


class SourceItem(BaseModel):
    id: str = Field(..., min_length=1, max_length=256)
    kind: Literal[
        "agreement",
        "draft",
        "signed_record",
        "upload",
        "memory_result",
        "timeline",
        "document_analysis",
        "field_review",
        "workspace_context",
        "other",
    ] = "other"
    label: str = Field(..., max_length=512)
    excerpt: Optional[str] = Field(default=None, max_length=50000)


class CreateDraftBody(BaseModel):
    output_type: str = Field(..., min_length=3, max_length=64)
    title: Optional[str] = Field(default=None, max_length=500)
    user_instructions: Optional[str] = Field(default=None, max_length=8000)
    audience: Optional[str] = Field(default=None, max_length=2000)
    objective: Optional[str] = Field(default=None, max_length=4000)
    use_workspace_context: bool = False
    sources: List[SourceItem] = Field(default_factory=list)


class PatchDraftBody(BaseModel):
    title: Optional[str] = Field(default=None, max_length=500)
    sections: Optional[Dict[str, str]] = None
    section_grounding: Optional[Dict[str, List[str]]] = None
    section_metadata: Optional[Dict[str, Dict[str, Any]]] = None
    section_metadata_merge: bool = True
    caveats: Optional[str] = Field(default=None, max_length=12000)


class PreflightBody(BaseModel):
    use_workspace_context: bool = False
    sources: List[SourceItem] = Field(default_factory=list)


class RefineSectionBody(BaseModel):
    section_key: str = Field(..., min_length=1, max_length=128)
    mode: str = Field(..., min_length=3, max_length=64)


@router.post("/preflight")
def awp_preflight(org_id: str, request: Request, body: PreflightBody) -> Dict[str, Any]:
    _require_org_match(request, org_id)
    if awp_tier_for_org(org_id.strip()) == "none":
        raise HTTPException(status_code=403, detail={"code": "awp_locked", "message": "Upgrade to use Advanced Work Product."})
    src_list = [s.model_dump() for s in body.sources]
    strength = assess_source_material_strength(src_list, use_workspace_context=body.use_workspace_context)
    return {"ok": True, "schema": SCHEMA_VERSION, "material_assessment": strength}


@router.get("/meta")
def get_awp_meta(org_id: str, request: Request) -> Dict[str, Any]:
    _require_org_match(request, org_id)
    tier = awp_tier_for_org(org_id.strip())
    allowed = allowed_types_for_tier(tier)
    allow_set = set(allowed)
    templates_out = [
        {
            "id": t["id"],
            "label": t["label"],
            "description": t["description"],
            "sections": t["sections"],
        }
        for k, t in TEMPLATES.items()
        if k in allow_set
    ]
    return {
        "ok": True,
        "schema": SCHEMA_VERSION,
        "entitlement_tier": tier,
        "allowed_output_types": allowed,
        "templates": templates_out,
        "disclaimer": (
            "Outputs are assistive drafts only. They are not verifier proofs, receipts, or signed artifacts."
        ),
    }


@router.get("/drafts")
def list_drafts(org_id: str, request: Request) -> Dict[str, Any]:
    oid = _require_org_match(request, org_id)
    if awp_tier_for_org(oid) == "none":
        raise HTTPException(status_code=403, detail={"code": "awp_locked", "message": "Upgrade to use Advanced Work Product."})
    store = get_awp_store()
    store.init_schema()
    rows = store.list_for_org(oid)
    return {"ok": True, "schema": SCHEMA_VERSION, "drafts": rows}


@router.post("/drafts")
def create_draft(org_id: str, request: Request, body: CreateDraftBody) -> Dict[str, Any]:
    oid = _require_org_match(request, org_id)
    ent = awp_tier_for_org(oid)
    if ent == "none":
        raise HTTPException(status_code=403, detail={"code": "awp_locked", "message": "Upgrade to use Advanced Work Product."})
    ot = (body.output_type or "").strip().lower().replace("-", "_")
    allowed = allowed_types_for_tier(ent)
    if ot not in allowed:
        raise HTTPException(
            status_code=403,
            detail={"code": "awp_type_not_entitled", "message": "This output type requires a higher plan.", "type": ot},
        )
    try:
        template_for(ot)
    except ValueError:
        raise HTTPException(status_code=400, detail="unknown output_type")

    subj = resolve_subject_from_request(request)
    mem_tier: AgreementMemoryTier = agreement_memory_tier_for_subject(subj) if subj else "none"
    ai_class = _ai_class_from_memory_tier(mem_tier)

    src_list = [s.model_dump() for s in body.sources]
    material_assessment = assess_source_material_strength(
        src_list, use_workspace_context=body.use_workspace_context
    )
    sections, grounding, section_metadata, caveats, model_used, used_llm = generate_document_body(
        output_type=ot,
        audience=body.audience,
        objective=body.objective,
        user_instructions=body.user_instructions,
        sources=src_list,
        use_workspace_context=body.use_workspace_context,
        ai_model_class=ai_class,
    )

    title = body.title
    if not title:
        t = TEMPLATES.get(ot)
        title = (t or {}).get("label", ot) if t else ot
        tk = sections.get("title")
        if tk and str(tk).strip():
            title = str(tk).strip()[:500]

    store = get_awp_store()
    store.init_schema()
    doc_id = store.insert(
        org_id=oid,
        output_type=ot,
        title=title,
        user_instructions=body.user_instructions,
        audience=body.audience,
        objective=body.objective,
        use_workspace_context=body.use_workspace_context,
        sources=src_list,
        sections=sections,
        section_grounding=grounding,
        section_metadata=section_metadata,
        caveats=caveats,
        generation_model=model_used,
    )
    row = store.get(oid, doc_id)
    return {
        "ok": True,
        "schema": SCHEMA_VERSION,
        "document": _serialize_doc(row),
        "generation": {"used_llm": used_llm, "model": model_used},
        "material_assessment": material_assessment,
    }


@router.get("/drafts/{doc_id}")
def get_draft(org_id: str, doc_id: str, request: Request) -> Dict[str, Any]:
    oid = _require_org_match(request, org_id)
    if awp_tier_for_org(oid) == "none":
        raise HTTPException(status_code=403, detail={"code": "awp_locked"})
    store = get_awp_store()
    store.init_schema()
    row = store.get(oid, doc_id)
    if not row:
        raise HTTPException(status_code=404, detail="not_found")
    return {"ok": True, "schema": SCHEMA_VERSION, "document": _serialize_doc(row)}


@router.patch("/drafts/{doc_id}")
def patch_draft(org_id: str, doc_id: str, request: Request, body: PatchDraftBody) -> Dict[str, Any]:
    oid = _require_org_match(request, org_id)
    if awp_tier_for_org(oid) == "none":
        raise HTTPException(status_code=403, detail={"code": "awp_locked"})
    store = get_awp_store()
    store.init_schema()
    row = store.get(oid, doc_id)
    if not row:
        raise HTTPException(status_code=404, detail="not_found")
    ok = store.update_document(
        org_id=oid,
        doc_id=doc_id,
        sections=body.sections,
        section_grounding=body.section_grounding,
        section_metadata=body.section_metadata,
        section_metadata_merge=body.section_metadata_merge,
        title=body.title,
        caveats=body.caveats,
    )
    if not ok:
        raise HTTPException(status_code=500, detail="update_failed")
    return {"ok": True, "schema": SCHEMA_VERSION, "document": _serialize_doc(store.get(oid, doc_id))}


@router.post("/drafts/{doc_id}/refine-section")
def refine_section(
    org_id: str, doc_id: str, request: Request, body: RefineSectionBody
) -> Dict[str, Any]:
    oid = _require_org_match(request, org_id)
    if awp_tier_for_org(oid) == "none":
        raise HTTPException(status_code=403, detail={"code": "awp_locked"})
    mode_key = (body.mode or "").strip().lower()
    if mode_key not in REFINE_MODE_INSTRUCTIONS:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "invalid_refine_mode",
                "allowed": sorted(REFINE_MODE_INSTRUCTIONS.keys()),
            },
        )

    store = get_awp_store()
    store.init_schema()
    row = store.get(oid, doc_id)
    if not row:
        raise HTTPException(status_code=404, detail="not_found")

    sections = json.loads(str(row.get("sections_json") or "{}"))
    if not isinstance(sections, dict) or body.section_key not in sections:
        raise HTTPException(status_code=400, detail="unknown_section_key")

    tmpl = template_for(str(row.get("output_type") or ""))
    label = body.section_key.replace("_", " ")
    for ent in tmpl.get("sections") or []:
        if ent.get("key") == body.section_key:
            label = str(ent.get("label") or label)
            break

    sources = json.loads(str(row.get("sources_json") or "[]"))
    if not isinstance(sources, list):
        sources = []

    subj = resolve_subject_from_request(request)
    mem_tier: AgreementMemoryTier = agreement_memory_tier_for_subject(subj) if subj else "none"
    ai_class = _ai_class_from_memory_tier(mem_tier)

    new_text, meta_patch, model_used, used_llm = refine_section_content(
        mode=mode_key,
        section_key=body.section_key,
        section_label=label,
        section_text=str(sections.get(body.section_key) or ""),
        output_type=str(row.get("output_type") or ""),
        sources=sources,
        ai_model_class=ai_class,
    )

    sections[body.section_key] = new_text
    ok = store.update_document(
        org_id=oid,
        doc_id=doc_id,
        sections=sections,
        section_metadata={body.section_key: meta_patch},
        section_metadata_merge=True,
    )
    if not ok:
        raise HTTPException(status_code=500, detail="update_failed")
    return {
        "ok": True,
        "schema": SCHEMA_VERSION,
        "document": _serialize_doc(store.get(oid, doc_id)),
        "refinement": {"used_llm": used_llm, "model": model_used, "mode": mode_key},
    }


def _safe_section_metadata(raw: Any) -> Dict[str, Any]:
    try:
        sm = json.loads(str(raw or "{}"))
        return sm if isinstance(sm, dict) else {}
    except json.JSONDecodeError:
        return {}


def _serialize_doc(row: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not row:
        return {}
    return {
        "id": row["id"],
        "org_id": row["org_id"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "output_type": row["output_type"],
        "title": row["title"],
        "user_instructions": row["user_instructions"],
        "audience": row["audience"],
        "objective": row["objective"],
        "use_workspace_context": bool(row.get("use_workspace_context")),
        "sources": json.loads(str(row.get("sources_json") or "[]")),
        "sections": json.loads(str(row.get("sections_json") or "{}")),
        "section_grounding": json.loads(str(row.get("section_grounding_json") or "{}")),
        "section_metadata": _safe_section_metadata(row.get("section_metadata_json")),
        "caveats": row.get("caveats"),
        "generation_model": row.get("generation_model"),
        "is_assistive": bool(row.get("is_assistive")),
        "disclaimer_version": row.get("disclaimer_version"),
    }
