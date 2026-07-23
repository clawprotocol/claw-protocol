from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.llm_router import call_legal_llm
from backend.security.legacy_router_gate import deny_legacy_router_in_commercial
from backend.services import agreement_service


router = APIRouter(
    prefix="/v1/agreements",
    tags=["agreements"],
    dependencies=[Depends(deny_legacy_router_in_commercial)],
)


class PartyInput(BaseModel):
    party_id: Optional[str] = None
    name: str
    role: str
    contact: Optional[str] = None


class InclusionSettings(BaseModel):
    include_diffs_in_bundle: bool = True
    include_private_notes_in_bundle: bool = False


class EscrowReference(BaseModel):
    provider: str = "escrow.com"
    reference: str


class AnalysisInput(BaseModel):
    text: str
    opt_in_party_ids: List[str] = []
    include_in_bundle: bool = False
    disclaimer_required: bool = True


class AgreementCreateRequest(BaseModel):
    agreement_id: Optional[str] = None
    title: str
    parties: List[PartyInput]
    inclusion: InclusionSettings = InclusionSettings()
    escrow_reference: Optional[EscrowReference] = None
    analysis: Optional[AnalysisInput] = None
    created_at: str
    updated_at: str


class AgreementAddVersionRequest(BaseModel):
    packet: Dict[str, Any]
    author_party_id: str
    body_text: str
    created_at: str
    content_type: str
    notes: Optional[str] = None


class AgreementFinalizeRequest(BaseModel):
    packet: Dict[str, Any]
    finalized_at: str


class AgreementDraftParty(BaseModel):
    id: str
    name: str
    role: Optional[str] = "party"
    contact: Optional[str] = None


class AgreementDraftState(BaseModel):
    title: Optional[str] = None
    jurisdiction: Optional[str] = None
    parties: List[AgreementDraftParty] = []
    body_md: Optional[str] = None
    private_notes: Optional[str] = None


class AgreementChatTurnRequest(BaseModel):
    session_id: str
    user_message: str
    state: Optional[AgreementDraftState] = None


class AgreementChatTurnResponse(BaseModel):
    session_id: str
    assistant_message: str
    state: AgreementDraftState
    done: bool
    next_prompt: Optional[str] = None


def _strip_code_fences(text: str) -> str:
    s = (text or "").strip()
    if s.startswith("```"):
        lines = s.splitlines()
        if lines:
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        s = "\n".join(lines).strip()
    return s


def _extract_json_object(text: str) -> str:
    s = _strip_code_fences(text)
    if s.startswith("{") and s.endswith("}"):
        return s
    start = s.find("{")
    end = s.rfind("}")
    if start >= 0 and end > start:
        return s[start : end + 1]
    raise ValueError("no_json_object")


def _normalize_state(raw: Any) -> AgreementDraftState:
    if not isinstance(raw, dict):
        raw = {}
    parties_raw = raw.get("parties") if isinstance(raw.get("parties"), list) else []
    parties: List[AgreementDraftParty] = []
    for idx, p in enumerate(parties_raw):
        if not isinstance(p, dict):
            continue
        name = str(p.get("name") or "").strip()
        if not name:
            continue
        pid = str(p.get("id") or f"party_{idx + 1}").strip() or f"party_{idx + 1}"
        role = str(p.get("role") or "party").strip() or "party"
        contact = p.get("contact")
        parties.append(
            AgreementDraftParty(
                id=pid,
                name=name,
                role=role,
                contact=str(contact).strip() if isinstance(contact, str) and contact.strip() else None,
            )
        )
    return AgreementDraftState(
        title=str(raw.get("title")).strip() if isinstance(raw.get("title"), str) and raw.get("title").strip() else None,
        jurisdiction=(
            str(raw.get("jurisdiction")).strip().upper()
            if isinstance(raw.get("jurisdiction"), str) and raw.get("jurisdiction").strip()
            else None
        ),
        parties=parties,
        body_md=str(raw.get("body_md")).strip() if isinstance(raw.get("body_md"), str) and raw.get("body_md").strip() else None,
        private_notes=(
            str(raw.get("private_notes")).strip()
            if isinstance(raw.get("private_notes"), str) and raw.get("private_notes").strip()
            else None
        ),
    )


def _next_prompt_for(state: AgreementDraftState) -> Optional[str]:
    if not state.title:
        return "What is the agreement title?"
    if not state.jurisdiction:
        return "Which jurisdiction applies? (e.g., CA, NY, UK)"
    if len(state.parties) < 1:
        return "Who is Party A?"
    if len(state.parties) < 2:
        return "Who is Party B?"
    if not state.body_md:
        return "Paste the agreement text or describe what you want drafted."
    return None


@router.post("/chat", response_model=AgreementChatTurnResponse)
def api_agreement_chat_turn(body: AgreementChatTurnRequest) -> AgreementChatTurnResponse:
    current_state = body.state.model_dump() if body.state else AgreementDraftState().model_dump()
    system_prompt = """
You are CLAW Agreement Builder assistant.
Your job:
- Ask one concise question at a time to complete agreement draft intake.
- Update/normalize state from user message when possible.
- Be calm and professional.
- Never output markdown, explanations, or code fences.
- Output JSON ONLY with keys:
{
  "assistant_message": "string",
  "state": {
    "title": "string|null",
    "jurisdiction": "string|null",
    "parties": [{"id":"string","name":"string","role":"string","contact":"string|null"}],
    "body_md": "string|null",
    "private_notes": "string|null"
  },
  "done": true|false,
  "next_prompt": "string|null"
}
Done=true only when title, jurisdiction, at least two parties, and body_md are all present.
""".strip()

    user_payload = {
        "user_message": body.user_message,
        "current_state": current_state,
    }

    try:
        llm_text = call_legal_llm(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
            ],
            max_tokens=800,
            temperature=0.0,
        )
        parsed = json.loads(_extract_json_object(llm_text))
        assistant_message = str(parsed.get("assistant_message") or "").strip()
        next_state = _normalize_state(parsed.get("state"))
        done = bool(
            next_state.title
            and next_state.jurisdiction
            and len(next_state.parties) >= 2
            and next_state.body_md
        )
        next_prompt = str(parsed.get("next_prompt")).strip() if isinstance(parsed.get("next_prompt"), str) else None
        if not assistant_message:
            assistant_message = (
                "Great, I've updated your draft. "
                + ("You can now create the draft." if done else (_next_prompt_for(next_state) or "Please continue."))
            )
        if not next_prompt and not done:
            next_prompt = _next_prompt_for(next_state)
        return AgreementChatTurnResponse(
            session_id=body.session_id,
            assistant_message=assistant_message,
            state=next_state,
            done=done,
            next_prompt=next_prompt,
        )
    except Exception:
        fallback_state = _normalize_state(current_state)
        return AgreementChatTurnResponse(
            session_id=body.session_id,
            assistant_message="I hit a parsing issue. Please resend your last answer.",
            state=fallback_state,
            done=False,
            next_prompt=_next_prompt_for(fallback_state),
        )


@router.post("/create")
def api_agreement_create(body: AgreementCreateRequest) -> Dict[str, Any]:
    try:
        return agreement_service.create_agreement_packet(
            agreement_id=body.agreement_id,
            title=body.title,
            parties=[p.model_dump() for p in body.parties],
            inclusion=body.inclusion.model_dump(),
            escrow_reference=body.escrow_reference.model_dump() if body.escrow_reference else None,
            created_at=body.created_at,
            updated_at=body.updated_at,
            analysis=body.analysis.model_dump() if body.analysis else None,
        )
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"message": str(exc), "error_code": "AGREEMENT_INVALID"})


@router.post("/add_version")
def api_agreement_add_version(body: AgreementAddVersionRequest) -> Dict[str, Any]:
    try:
        return agreement_service.add_version(
            packet=body.packet,
            author_party_id=body.author_party_id,
            body_text=body.body_text,
            created_at=body.created_at,
            content_type=body.content_type,
            notes=body.notes,
        )
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"message": str(exc), "error_code": "AGREEMENT_INVALID"})


@router.post("/finalize")
def api_agreement_finalize(body: AgreementFinalizeRequest) -> Dict[str, Any]:
    try:
        return agreement_service.finalize_agreement(packet=body.packet, finalized_at=body.finalized_at)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"message": str(exc), "error_code": "AGREEMENT_INVALID"})
