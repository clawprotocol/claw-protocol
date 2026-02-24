from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.services import esign_service


router = APIRouter(prefix="/v1/esign", tags=["esign"])


class SignerInput(BaseModel):
    name: str
    email: str
    role: str
    signer_id: Optional[str] = None


class ESignCreateRequest(BaseModel):
    document_base64: Optional[str] = None
    document_sha256: Optional[str] = None
    title: str
    mime: str
    size: int
    signers: List[SignerInput]
    created_at: str


class ESignSignRequest(BaseModel):
    packet: Dict[str, Any]
    signer_id: str
    signed_at: str
    method: str
    typed_name: Optional[str] = None


class ESignFinalizeRequest(BaseModel):
    packet: Dict[str, Any]
    finalized_at: str


@router.post("/create")
def api_esign_create(body: ESignCreateRequest) -> Dict[str, Any]:
    try:
        return esign_service.create_packet(
            document_base64=body.document_base64,
            document_sha256=body.document_sha256,
            title=body.title,
            mime=body.mime,
            size=body.size,
            signers=[s.model_dump() for s in body.signers],
            created_at=body.created_at,
        )
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"message": str(exc), "error_code": "ESIGN_INVALID"})


@router.post("/sign")
def api_esign_sign(body: ESignSignRequest) -> Dict[str, Any]:
    try:
        return esign_service.sign_packet(
            packet=body.packet,
            signer_id=body.signer_id,
            signed_at=body.signed_at,
            method=body.method,
            typed_name=body.typed_name,
        )
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"message": str(exc), "error_code": "ESIGN_INVALID"})


@router.post("/finalize")
def api_esign_finalize(body: ESignFinalizeRequest) -> Dict[str, Any]:
    try:
        return esign_service.finalize_packet(packet=body.packet, finalized_at=body.finalized_at)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"message": str(exc), "error_code": "ESIGN_INVALID"})
