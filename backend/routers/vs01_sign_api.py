"""
VS01-B08: sign-session create (bind document + hash).

VS01-B10: complete-sign orchestration → receipt.v1 persist.

Commercial mode: create/complete require document owner principal or a
recipient sign token bound to the document's agreement/party.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from backend.security.vs01_document_ownership import (
    require_vs01_document_access,
    require_vs01_sign_session_access,
)
from backend.services import receipt_service, signature_service

router = APIRouter(prefix="/v1/sign-sessions", tags=["sign-sessions"])


def _default_protocol_version() -> str:
    return os.getenv("CLAW_PROTOCOL_VERSION", "claw-v1")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class CreateSignSessionRequest(BaseModel):
    document_id: str = Field(..., min_length=1)
    content_sha256: str = Field(..., min_length=64, max_length=64)


class FieldManifestItem(BaseModel):
    field_id: str
    page_index: int = Field(ge=0)
    x: float
    y: float
    w: float
    h: float


class CompleteSignRequest(BaseModel):
    signer_ref: str = Field(..., min_length=1)
    intent: str = Field(..., min_length=1)
    signed_at: Optional[str] = Field(
        default=None,
        description="UTC Z timestamp; if omitted, server time is used.",
    )
    field_manifest: List[FieldManifestItem] = Field(..., min_length=1)
    client_manifest_sha256: Optional[str] = None
    protocol_version: Optional[str] = Field(
        default=None,
        description="Defaults to CLAW_PROTOCOL_VERSION or claw-v1.",
    )


@router.post("")
def api_create_sign_session(body: CreateSignSessionRequest, request: Request) -> Dict[str, Any]:
    require_vs01_document_access(
        request,
        body.document_id,
        allow_recipient_modes=("sign",),
    )
    try:
        row = signature_service.create_sign_session(
            document_id=body.document_id,
            content_sha256=body.content_sha256,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "document_not_found":
            raise HTTPException(status_code=404, detail=code) from exc
        if code in ("content_sha256_mismatch", "content_integrity_failed"):
            raise HTTPException(status_code=400, detail=code) from exc
        raise HTTPException(status_code=400, detail=code) from exc
    return {"ok": True, "session": row}


@router.post("/{session_id}/complete")
def api_complete_sign(
    session_id: str, body: CompleteSignRequest, request: Request
) -> Dict[str, Any]:
    session = signature_service.get_sign_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session_not_found")
    if session.get("status") != "pending":
        raise HTTPException(status_code=409, detail="session_not_pending")

    require_vs01_sign_session_access(
        request,
        session,
        allow_recipient_modes=("sign",),
    )

    document_id = session["document_id"]
    content_sha256 = session["content_sha256"]
    signed_at = body.signed_at or _utc_now_iso()
    protocol_version = body.protocol_version or _default_protocol_version()

    try:
        prep = signature_service.prepare_sign_packet(
            document_id=document_id,
            signer_ref=body.signer_ref,
            intent=body.intent,
            signed_at=signed_at,
            field_manifest=[m.model_dump() for m in body.field_manifest],
            client_manifest_sha256=body.client_manifest_sha256,
            content_sha256_claim=content_sha256,
        )
        receipt = receipt_service.issue_and_persist_receipt(
            sign_packet=prep["sign_packet"],
            protocol_version=protocol_version,
        )
        signature_service.mark_sign_session_completed(
            session_id=session_id,
            receipt_id=receipt["receipt_id"],
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
        if code == "session_not_pending":
            raise HTTPException(status_code=409, detail=code) from exc
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_sign_packet", "message": code},
        ) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail="persist_failed") from exc

    return {
        "ok": True,
        "receipt_id": receipt["receipt_id"],
        "receipt_hash_sha256": receipt["receipt_hash_sha256"],
        "receipt": receipt,
    }
