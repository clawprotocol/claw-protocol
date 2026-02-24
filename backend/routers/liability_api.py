from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.services import liability_service


router = APIRouter(prefix="/v1/liability", tags=["liability"])


class AttestableFacts(BaseModel):
    freeform_text: str
    structured_fields: Optional[Dict[str, Any]] = None


class PublicLegalContext(BaseModel):
    freeform_text: str
    citations: Optional[List[str]] = None


class InclusionSettings(BaseModel):
    include_public_legal_context_in_bundle: bool = False
    include_private_notes_in_bundle: bool = False


class AuthorMetadata(BaseModel):
    name: str
    role: Optional[str] = ""


class LiabilityCreateRequest(BaseModel):
    attestable_facts: AttestableFacts
    public_legal_context: PublicLegalContext
    inclusion: InclusionSettings = InclusionSettings()
    private_notes: str = ""
    created_at: str
    updated_at: str
    author: AuthorMetadata


class LiabilityFinalizeRequest(BaseModel):
    packet: Dict[str, Any]
    finalized_at: str


@router.post("/create_or_update")
def api_liability_create_or_update(body: LiabilityCreateRequest) -> Dict[str, Any]:
    try:
        return liability_service.create_or_update_packet(
            attestable_facts=body.attestable_facts.model_dump(),
            public_legal_context=body.public_legal_context.model_dump(),
            inclusion=body.inclusion.model_dump(),
            private_notes=body.private_notes,
            created_at=body.created_at,
            updated_at=body.updated_at,
            author=body.author.model_dump(),
        )
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"message": str(exc), "error_code": "LIABILITY_INVALID"})


@router.post("/finalize")
def api_liability_finalize(body: LiabilityFinalizeRequest) -> Dict[str, Any]:
    try:
        return liability_service.finalize_packet(
            packet=body.packet,
            finalized_at=body.finalized_at,
        )
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"message": str(exc), "error_code": "LIABILITY_INVALID"})
