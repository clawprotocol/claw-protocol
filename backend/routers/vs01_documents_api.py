"""
VS01-B06: minimal HTTP surface for document finalize and sign preparation.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from backend.services import document_service, signature_service

router = APIRouter(prefix="/v1/documents", tags=["documents"])


class FinalizeDocumentRequest(BaseModel):
    """Finalize agreement bytes (base64) after client-side draft."""

    content_base64: str = Field(..., min_length=1)
    content_type: Optional[str] = Field(
        default=None,
        description="Optional MIME hint; stored for metadata only.",
    )


class FieldManifestItem(BaseModel):
    field_id: str
    page_index: int = Field(ge=0)
    x: float
    y: float
    w: float
    h: float


class SignPrepareRequest(BaseModel):
    signer_ref: str = Field(..., min_length=1)
    intent: str = Field(..., min_length=1)
    signed_at: str = Field(..., min_length=1)
    field_manifest: List[FieldManifestItem] = Field(..., min_length=1)
    client_manifest_sha256: Optional[str] = None
    content_sha256: Optional[str] = Field(
        default=None,
        description="If set, must match stored document hash (binding check).",
    )


@router.post("")
def api_finalize_document(body: FinalizeDocumentRequest) -> Dict[str, Any]:
    import base64

    try:
        raw = base64.b64decode(body.content_base64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="invalid_base64") from exc

    try:
        meta = document_service.finalize_document(
            raw, content_type=body.content_type
        )
    except ValueError as exc:
        code = str(exc)
        if code == "empty_document":
            raise HTTPException(status_code=400, detail=code) from exc
        raise HTTPException(status_code=500, detail=code) from exc

    return {"ok": True, **meta}


@router.get("/{document_id}")
def api_get_document(document_id: str) -> Dict[str, Any]:
    meta = document_service.get_document_meta(document_id)
    if not meta:
        raise HTTPException(status_code=404, detail="document_not_found")
    return {"ok": True, "document": meta}


@router.get("/{document_id}/content")
def api_get_document_content(document_id: str) -> Response:
    raw = document_service.get_document_bytes(document_id)
    if raw is None:
        raise HTTPException(status_code=404, detail="document_not_found")
    meta = document_service.get_document_meta(document_id) or {}
    ct = meta.get("content_type") or "application/octet-stream"
    return Response(content=raw, media_type=str(ct))


@router.post("/{document_id}/sign-prep")
def api_sign_prepare(document_id: str, body: SignPrepareRequest) -> Dict[str, Any]:
    try:
        result = signature_service.prepare_sign_packet(
            document_id=document_id,
            signer_ref=body.signer_ref,
            intent=body.intent,
            signed_at=body.signed_at,
            field_manifest=[m.model_dump() for m in body.field_manifest],
            client_manifest_sha256=body.client_manifest_sha256,
            content_sha256_claim=body.content_sha256,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "document_not_found":
            raise HTTPException(status_code=404, detail=code) from exc
        if code in (
            "content_sha256_mismatch",
            "content_integrity_failed",
            "corrupt_document_meta",
        ):
            raise HTTPException(status_code=400, detail=code) from exc
        # normalize_sign_packet validation
        raise HTTPException(status_code=400, detail={"error": "invalid_sign_packet", "message": code}) from exc

    return {"ok": True, **result}
