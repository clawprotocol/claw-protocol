"""Public compliance endpoints: disclosure registry and acknowledgement logging."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from backend.compliance.acknowledgement_store import get_acknowledgement_store
from backend.compliance.disclosure_registry import get_disclosure_record, list_disclosures
from backend.compliance.product_legal_assent_store import get_product_legal_assent_store

router = APIRouter(prefix="/v1/compliance", tags=["compliance"])


@router.get("/disclosures")
async def get_disclosures() -> Dict[str, Any]:
    """Active disclosure keys and hashed payloads for client consent alignment."""
    return {"disclosures": list_disclosures()}


class AcknowledgementIn(BaseModel):
    disclosure_key: str = Field(..., min_length=1, max_length=128)
    disclosure_version: str = Field(..., min_length=1, max_length=64)
    disclosure_hash: str = Field(..., min_length=64, max_length=64, description="Must match server GET /disclosures")
    org_id: Optional[str] = Field(None, max_length=256)
    user_ref: Optional[str] = Field(None, max_length=256)
    subject_type: Optional[str] = Field(None, max_length=64)
    subject_id: Optional[str] = Field(None, max_length=256)


@router.post("/acknowledgements")
async def post_acknowledgement(
    request: Request,
    body: AcknowledgementIn,
    user_agent: Optional[str] = Header(None, alias="User-Agent"),
) -> Dict[str, Any]:
    record = get_disclosure_record(body.disclosure_key)
    if not record:
        raise HTTPException(status_code=400, detail="unknown_disclosure_key")

    if str(record.get("version") or "") != body.disclosure_version:
        raise HTTPException(status_code=400, detail="disclosure_version_mismatch")

    if str(record.get("content_sha256") or "") != body.disclosure_hash:
        raise HTTPException(status_code=400, detail="disclosure_hash_mismatch")

    client_host = None
    if request.client:
        client_host = request.client.host

    store = get_acknowledgement_store()
    ack_id = store.record_acknowledgement(
        disclosure_key=body.disclosure_key,
        disclosure_version=body.disclosure_version,
        disclosure_hash=body.disclosure_hash,
        org_id=body.org_id,
        user_ref=body.user_ref,
        subject_type=body.subject_type,
        subject_id=body.subject_id,
        client_ip=client_host,
        user_agent=user_agent,
        meta={"path": str(request.url.path)},
    )
    return {"ok": True, "acknowledgement_id": ack_id}


class ProductSignupLegalAssentIn(BaseModel):
    assent_timestamp_iso: str = Field(..., min_length=1, max_length=64)
    terms_version_id: str = Field(..., min_length=1, max_length=128)
    privacy_version_id: str = Field(..., min_length=1, max_length=128)
    legal_ack_version: int = Field(..., ge=1, le=256)
    user_ref: Optional[str] = Field(None, max_length=256)
    org_id: Optional[str] = Field(None, max_length=256)
    authenticated_user_id: Optional[str] = Field(None, max_length=256)
    client_assent_id: str = Field(..., min_length=8, max_length=128)
    auth_path: str = Field(..., min_length=1, max_length=32)
    meta: Optional[Dict[str, Any]] = None


@router.post("/product-signup-assent")
async def post_product_signup_legal_assent(
    request: Request,
    body: ProductSignupLegalAssentIn,
    user_agent: Optional[str] = Header(None, alias="User-Agent"),
) -> Dict[str, Any]:
    """Persist Terms + Privacy assent at signup (server source of truth; client may mirror)."""
    client_host = None
    if request.client:
        client_host = request.client.host

    meta_out: Dict[str, Any] = dict(body.meta or {})
    meta_out["request_path"] = str(request.url.path)

    store = get_product_legal_assent_store()
    assent_id = store.record_assent(
        assent_timestamp_iso=body.assent_timestamp_iso,
        terms_version_id=body.terms_version_id,
        privacy_version_id=body.privacy_version_id,
        legal_ack_version=body.legal_ack_version,
        user_ref=body.user_ref,
        org_id=body.org_id,
        authenticated_user_id=body.authenticated_user_id,
        client_assent_id=body.client_assent_id,
        auth_path=body.auth_path,
        client_ip=client_host,
        user_agent=user_agent,
        meta=meta_out,
    )
    return {"ok": True, "assent_id": assent_id}
