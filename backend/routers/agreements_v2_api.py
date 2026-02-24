from __future__ import annotations

import html
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.llm_router import call_legal_llm
from backend.services.agreement_draft_store import load_draft, save_draft
from backend.utils.canon_json import canon_json_bytes


router = APIRouter(prefix="/api/agreements", tags=["agreements-v2"])


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class AgreementParty(BaseModel):
    name: str
    role: str


class VersionSnapshot(BaseModel):
    version: int
    created_at: str
    note: Optional[str] = None


class AuditEvent(BaseModel):
    event_type: Literal["created", "field_updated", "rendered", "export_docx"]
    at: str
    field: Optional[str] = None
    value: Optional[Any] = None


class AgreementDraftCreate(BaseModel):
    title: str = ""
    jurisdiction: str = ""
    parties: List[AgreementParty] = Field(default_factory=list)
    purpose: str = ""
    payment_terms: str = ""
    duration: Optional[str] = None
    due_date: Optional[str] = None
    effective_date: Optional[str] = None


class AgreementDraft(AgreementDraftCreate):
    id: str
    created_at: str
    updated_at: str
    versions: List[VersionSnapshot] = Field(default_factory=list)
    audit_log: List[AuditEvent] = Field(default_factory=list)


class AgreementFieldUpdateRequest(BaseModel):
    field: str
    value: Any


class AgreementParseRequest(BaseModel):
    intake_text: str


class AgreementParseResponse(BaseModel):
    draft: AgreementDraftCreate


class AgreementRenderResponse(BaseModel):
    id: str
    rendered_html: str


def canonicalize_agreement(draft: Dict[str, Any]) -> str:
    return canon_json_bytes(draft).decode("utf-8")


def _extract_json_object(text: str) -> Dict[str, Any]:
    raw = (text or "").strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        if lines:
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        raw = "\n".join(lines).strip()
    if not raw.startswith("{") or not raw.endswith("}"):
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            raw = raw[start : end + 1]
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("invalid_json_object")
    return parsed


def _normalize_parsed_draft(raw: Dict[str, Any]) -> AgreementDraftCreate:
    parties_in = raw.get("parties") if isinstance(raw.get("parties"), list) else []
    parties: List[AgreementParty] = []
    for p in parties_in:
        if not isinstance(p, dict):
            continue
        name = str(p.get("name") or "").strip()
        role = str(p.get("role") or "party").strip() or "party"
        if name:
            parties.append(AgreementParty(name=name, role=role))
    due_date = str(raw.get("due_date") or "").strip() or None
    duration = str(raw.get("duration") or "").strip() or None
    if due_date and not duration:
        duration = f"until {due_date}"
    jurisdiction = str(raw.get("jurisdiction") or "").strip() or "TBD"
    effective_date = str(raw.get("effective_date") or "").strip() or None
    return AgreementDraftCreate(
        title=str(raw.get("title") or "").strip(),
        jurisdiction=jurisdiction,
        parties=parties,
        purpose=str(raw.get("purpose") or "").strip(),
        payment_terms=str(raw.get("payment_terms") or "").strip(),
        duration=duration,
        due_date=due_date,
        effective_date=effective_date,
    )


def _heuristic_parse_intake(intake_text: str) -> AgreementDraftCreate:
    t = (intake_text or "").strip()
    title = ""
    jurisdiction = "TBD"
    purpose = t
    payment_terms = ""
    duration = None
    due_date = None
    effective_date = None

    between_match = re.search(r"between\s+(.+?)\s+and\s+(.+?)(?:\.|,|$)", t, re.I)
    parties: List[AgreementParty] = []
    if between_match:
        p1 = between_match.group(1).strip(" ,.")
        p2 = between_match.group(2).strip(" ,.")
        if p1:
            parties.append(AgreementParty(name=p1, role="party_a"))
        if p2:
            parties.append(AgreementParty(name=p2, role="party_b"))
    for rx in [
        r"(?:agreement title is|title is|title:)\s*([^.,\n]+)",
        r"(?:called)\s+([^.,\n]+agreement)",
    ]:
        m = re.search(rx, t, re.I)
        if m:
            title = m.group(1).strip(" \"'")
            break
    if not title:
        title = "Agreement Draft"
    j = re.search(r"(?:in|under)\s+([A-Za-z][A-Za-z\s]{1,30})", t, re.I)
    if j:
        jurisdiction = j.group(1).strip(" ,.")
    money_terms = re.findall(r"\$[\d,]+(?:\s*(?:per|\/)\s*(?:week|month|year))?", t, re.I)
    if money_terms:
        payment_terms = "; ".join(money_terms)
    due_match = re.search(r"(?:due|by)\s+([A-Za-z]+\s+\d{1,2},\s*\d{4})", t, re.I)
    if due_match:
        due_date = due_match.group(1).strip()
        duration = f"until {due_date}"
    return AgreementDraftCreate(
        title=title,
        jurisdiction=jurisdiction,
        parties=parties,
        purpose=purpose,
        payment_terms=payment_terms,
        duration=duration,
        due_date=due_date,
        effective_date=effective_date,
    )


def _render_html(draft: AgreementDraft) -> str:
    title = html.escape((draft.title or "").strip() or "Untitled Agreement")
    jurisdiction = html.escape((draft.jurisdiction or "").strip() or "TBD")
    effective_date = html.escape((draft.effective_date or "").strip() or "TBD")
    purpose = html.escape((draft.purpose or "").strip() or "TBD")
    payment_terms = html.escape((draft.payment_terms or "").strip() or "TBD")
    duration = html.escape((draft.duration or "").strip() or "TBD")
    due_date = html.escape((draft.due_date or "").strip() or "TBD")
    parties_items = "".join(
        f"<li><strong>{html.escape((p.name or '').strip() or 'Party')}</strong> - {html.escape((p.role or 'party').strip())}</li>"
        for p in (draft.parties or [])
    )
    if not parties_items:
        parties_items = "<li>TBD</li>"
    return (
        f"<article>"
        f"<h1>{title}</h1>"
        f"<p><strong>Jurisdiction:</strong> {jurisdiction}</p>"
        f"<p><strong>Effective Date:</strong> {effective_date}</p>"
        f"<h2>Parties</h2><ul>{parties_items}</ul>"
        f"<h2>Terms</h2>"
        f"<p><strong>Purpose:</strong> {purpose}</p>"
        f"<p><strong>Payment Terms:</strong> {payment_terms}</p>"
        f"<p><strong>Duration:</strong> {duration}</p>"
        f"<p><strong>Due Date:</strong> {due_date}</p>"
        f"<h2>Governing Law</h2>"
        f"<p>This Agreement is governed by the laws of {jurisdiction}, without regard to conflict of law principles.</p>"
        f"</article>"
    )


def _load_or_404(agreement_id: str) -> AgreementDraft:
    try:
        raw = load_draft(agreement_id)
        return AgreementDraft.model_validate(raw)
    except KeyError:
        raise HTTPException(status_code=404, detail="agreement_not_found")


@router.post("/parse", response_model=AgreementParseResponse)
def parse_agreement_intake(body: AgreementParseRequest) -> AgreementParseResponse:
    system_prompt = (
        "You are a structured agreement intake assistant for CLAW.\n"
        "Extract agreement details from the user's intake.\n"
        "Return ONLY strict JSON matching this schema:\n"
        '{ "title":"", "jurisdiction":"", "parties":[{"name":"","role":""}], "purpose":"", "payment_terms":"", "duration":null, "due_date":null, "effective_date":null }\n'
        "Rules:\n"
        "- If due_date exists and duration missing, set duration = \"until <due_date>\".\n"
        "- If effective_date missing, set null.\n"
        "- If jurisdiction is ambiguous, default to \"TBD\".\n"
        "- Do not add commentary. Do not wrap in markdown. Only JSON."
    )
    try:
        llm_text = call_legal_llm(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": body.intake_text},
            ],
            max_tokens=350,
            temperature=0.0,
        )
        parsed = _extract_json_object(llm_text)
        return AgreementParseResponse(draft=_normalize_parsed_draft(parsed))
    except Exception:
        return AgreementParseResponse(draft=_heuristic_parse_intake(body.intake_text))


@router.post("/draft")
def create_agreement_draft(body: AgreementDraftCreate) -> Dict[str, Any]:
    now = _utc_now_iso()
    agreement_id = str(uuid.uuid4())
    draft = AgreementDraft(
        id=agreement_id,
        title=body.title,
        jurisdiction=body.jurisdiction,
        parties=body.parties,
        purpose=body.purpose,
        payment_terms=body.payment_terms,
        duration=body.duration,
        due_date=body.due_date,
        effective_date=body.effective_date,
        created_at=now,
        updated_at=now,
        versions=[],
        audit_log=[AuditEvent(event_type="created", at=now)],
    )
    save_draft(draft.model_dump())
    return {"id": agreement_id, "draft": draft.model_dump(), "canonical_json": canonicalize_agreement(draft.model_dump())}


@router.get("/{agreement_id}")
def get_agreement_draft(agreement_id: str) -> Dict[str, Any]:
    draft = _load_or_404(agreement_id)
    return {"id": agreement_id, "draft": draft.model_dump()}


@router.post("/{agreement_id}/update-field")
def update_agreement_field(agreement_id: str, body: AgreementFieldUpdateRequest) -> Dict[str, Any]:
    draft = _load_or_404(agreement_id)
    if not body.field:
        raise HTTPException(status_code=400, detail="field_required")
    if body.field not in {
        "title",
        "jurisdiction",
        "parties",
        "purpose",
        "payment_terms",
        "duration",
        "due_date",
        "effective_date",
    }:
        raise HTTPException(status_code=400, detail="unsupported_field")

    next_data = draft.model_dump()
    if body.field == "parties":
        parties: List[AgreementParty] = []
        if isinstance(body.value, list):
            for p in body.value:
                if not isinstance(p, dict):
                    continue
                name = str(p.get("name") or "").strip()
                role = str(p.get("role") or "party").strip() or "party"
                if name:
                    parties.append(AgreementParty(name=name, role=role))
        next_data["parties"] = [p.model_dump() for p in parties]
    else:
        if body.value is None:
            next_data[body.field] = None
        else:
            next_data[body.field] = str(body.value).strip()
    now = _utc_now_iso()
    next_data["updated_at"] = now
    audit_log = list(next_data.get("audit_log") or [])
    audit_log.append(
        AuditEvent(
            event_type="field_updated",
            at=now,
            field=body.field,
            value=next_data.get(body.field),
        ).model_dump()
    )
    next_data["audit_log"] = audit_log
    next_draft = AgreementDraft.model_validate(next_data)
    save_draft(next_draft.model_dump())
    return {"id": agreement_id, "draft": next_draft.model_dump(), "canonical_json": canonicalize_agreement(next_draft.model_dump())}


@router.post("/{agreement_id}/render", response_model=AgreementRenderResponse)
def render_agreement(agreement_id: str) -> AgreementRenderResponse:
    draft = _load_or_404(agreement_id)
    next_data = draft.model_dump()
    now = _utc_now_iso()
    next_data["updated_at"] = now
    audit_log = list(next_data.get("audit_log") or [])
    audit_log.append(AuditEvent(event_type="rendered", at=now).model_dump())
    next_data["audit_log"] = audit_log
    next_draft = AgreementDraft.model_validate(next_data)
    save_draft(next_draft.model_dump())
    rendered_html = _render_html(next_draft)
    return AgreementRenderResponse(id=agreement_id, rendered_html=rendered_html)


@router.post("/{agreement_id}/export-docx")
def export_agreement_docx(agreement_id: str) -> Dict[str, Any]:
    draft = _load_or_404(agreement_id)
    next_data = draft.model_dump()
    now = _utc_now_iso()
    next_data["updated_at"] = now
    audit_log = list(next_data.get("audit_log") or [])
    audit_log.append(AuditEvent(event_type="export_docx", at=now).model_dump())
    next_data["audit_log"] = audit_log
    next_draft = AgreementDraft.model_validate(next_data)
    save_draft(next_draft.model_dump())
    return {
        "id": agreement_id,
        "status": "stub",
        "message": "DOCX export pipeline not yet enabled in this build.",
        "download_path": None,
    }
