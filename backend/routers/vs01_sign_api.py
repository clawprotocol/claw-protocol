"""
VS01-B08: sign-session create (bind document + hash).

VS01-B10: complete-sign orchestration → receipt.v1 persist.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from backend.security.sensitive_mutation_authorization import (
    assert_sign_session_complete_allowed,
    assert_sign_session_create_allowed,
    private_json_response,
    raise_if_legacy_signing_sessions_disabled,
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
    raise_if_legacy_signing_sessions_disabled()
    did = (body.document_id or "").strip()
    assert_sign_session_create_allowed(request, document_id=did)
    try:
        row = signature_service.create_sign_session(
            document_id=did,
            content_sha256=body.content_sha256,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "document_not_found":
            raise HTTPException(status_code=404, detail="not_found") from exc
        if code in ("content_sha256_mismatch", "content_integrity_failed"):
            raise HTTPException(status_code=400, detail=code) from exc
        raise HTTPException(status_code=400, detail=code) from exc
    return private_json_response({"ok": True, "session": row})


@router.post("/{session_id}/complete")
def api_complete_sign(session_id: str, body: CompleteSignRequest, request: Request) -> Dict[str, Any]:
    raise_if_legacy_signing_sessions_disabled()
    ctx = assert_sign_session_complete_allowed(request, session_id)
    session = ctx["session"]
    document_id = session["document_id"]
    content_sha256 = session["content_sha256"]
    signed_at = body.signed_at or _utc_now_iso()
    protocol_version = body.protocol_version or _default_protocol_version()

    try:
        signature_service.claim_sign_session_for_completion(session_id)
    except ValueError as exc:
        code = str(exc)
        if code == "session_not_found":
            raise HTTPException(status_code=404, detail="not_found") from exc
        if code == "session_not_pending":
            raise HTTPException(status_code=409, detail="session_not_pending") from exc
        raise HTTPException(status_code=409, detail=code) from exc

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
        signature_service.abort_sign_session_completion_claim(session_id)
        code = str(exc)
        if code == "document_not_found":
            raise HTTPException(status_code=404, detail="not_found") from exc
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
        signature_service.abort_sign_session_completion_claim(session_id)
        raise HTTPException(status_code=500, detail="persist_failed") from exc
    except HTTPException:
        signature_service.abort_sign_session_completion_claim(session_id)
        raise
    except Exception:
        signature_service.abort_sign_session_completion_claim(session_id)
        raise

    return private_json_response(
        {
            "ok": True,
            "receipt_id": receipt["receipt_id"],
            "receipt_hash_sha256": receipt["receipt_hash_sha256"],
            "receipt": receipt,
        }
    )
