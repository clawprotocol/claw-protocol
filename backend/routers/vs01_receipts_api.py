"""
VS01-B11: GET persisted receipt.

VS01-B12: verification bundle zip download.
"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Response

from backend.services import document_service, receipt_service
from backend.utils.vs01_verification_bundle import build_verification_bundle_zip_bytes

router = APIRouter(prefix="/v1/receipts", tags=["receipts"])


@router.get("/{receipt_id}")
def api_get_receipt(receipt_id: str) -> Dict[str, Any]:
    rec = receipt_service.get_receipt(receipt_id)
    if not rec:
        raise HTTPException(status_code=404, detail="receipt_not_found")
    return {"ok": True, "receipt": rec}


@router.get("/{receipt_id}/bundle")
def api_get_receipt_bundle(receipt_id: str) -> Response:
    rec = receipt_service.get_receipt(receipt_id)
    if not rec:
        raise HTTPException(status_code=404, detail="receipt_not_found")

    doc_id = rec.get("document_id")
    if not isinstance(doc_id, str) or not doc_id:
        raise HTTPException(status_code=400, detail="receipt_missing_document_id")

    raw = document_service.get_document_bytes(doc_id)
    if raw is None:
        raise HTTPException(status_code=404, detail="document_not_found")

    try:
        zip_bytes, _manifest = build_verification_bundle_zip_bytes(
            receipt=rec,
            document_bytes=raw,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "document_hash_mismatch":
            raise HTTPException(status_code=400, detail=code) from exc
        raise HTTPException(status_code=400, detail=code) from exc

    filename = f"claw-bundle-{receipt_id[:16]}.zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
