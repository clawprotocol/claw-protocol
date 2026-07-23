"""
VS01-B11: GET persisted receipt.

VS01-B12: verification bundle zip download.

Commercial mode: owner principal + document ownership bind, or recipient token
bound to the document's agreement/party. Path receipt ids alone are insufficient.
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request, Response

from backend.config.storage_runtime import cache_verification_bundles_enabled, unified_artifact_store_enabled
from backend.security.receipt_access import require_vs01_receipt_access
from backend.services import document_service
from backend.storage.artifact_repository import get_artifact_repository
from backend.utils.vs01_verification_bundle import build_verification_bundle_zip_bytes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/receipts", tags=["receipts"])

_MSG_RECEIPT_NOT_FOUND = (
    "This receipt was not found. Contact the sender if you believe this is an error."
)
_MSG_DOCUMENT_UNAVAILABLE = (
    "This file isn't available right now. Try again shortly. "
    "Contact the sender if the issue persists."
)
_MSG_BUNDLE_UNAVAILABLE = (
    "This verification bundle isn't available right now. Try again shortly. "
    "Contact the sender if the issue persists."
)


def _bundle_cache_get(receipt_id: str) -> bytes | None:
    if not unified_artifact_store_enabled() or not cache_verification_bundles_enabled():
        return None
    try:
        raw = get_artifact_repository().get_bytes_by_logical_ref(
            artifact_type="vs01_verification_bundle", logical_ref=receipt_id
        )
    except NotImplementedError:
        logger.warning("verification bundle cache read skipped: blob backend not implemented")
        return None
    return raw


def _bundle_cache_put(receipt_id: str, zip_bytes: bytes) -> None:
    if not unified_artifact_store_enabled() or not cache_verification_bundles_enabled():
        return
    try:
        get_artifact_repository().put_artifact(
            artifact_type="vs01_verification_bundle",
            logical_ref=receipt_id,
            data=zip_bytes,
            content_type="application/zip",
            visibility="private",
            metadata={"schema": "vs01.verification_bundle.v1"},
        )
    except NotImplementedError:
        logger.warning("verification bundle cache write skipped: blob backend not implemented")


@router.get("/{receipt_id}")
def api_get_receipt(receipt_id: str, request: Request) -> Dict[str, Any]:
    try:
        rec = require_vs01_receipt_access(request, receipt_id)
    except HTTPException as exc:
        if exc.status_code == 404:
            raise HTTPException(status_code=404, detail=_MSG_RECEIPT_NOT_FOUND) from exc
        raise
    return {"ok": True, "receipt": rec}


@router.get("/{receipt_id}/bundle")
def api_get_receipt_bundle(receipt_id: str, request: Request) -> Response:
    try:
        rec = require_vs01_receipt_access(request, receipt_id)
    except HTTPException as exc:
        if exc.status_code == 404:
            raise HTTPException(status_code=404, detail=_MSG_RECEIPT_NOT_FOUND) from exc
        raise

    doc_id = rec.get("document_id")
    if not isinstance(doc_id, str) or not doc_id:
        raise HTTPException(
            status_code=400,
            detail="This bundle could not be built because receipt data is incomplete.",
        )

    cached = _bundle_cache_get(receipt_id)
    if cached:
        filename = f"claw-bundle-{receipt_id[:16]}.zip"
        return Response(
            content=cached,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    try:
        raw = document_service.get_document_bytes(doc_id)
    except NotImplementedError:
        logger.warning("VS01 bundle: blob get_bytes not implemented for configured backend")
        raise HTTPException(status_code=503, detail=_MSG_DOCUMENT_UNAVAILABLE) from None
    if raw is None:
        logger.info("VS01 bundle: document bytes missing for document_id=%s", doc_id)
        raise HTTPException(status_code=404, detail=_MSG_DOCUMENT_UNAVAILABLE)

    try:
        zip_bytes, _manifest = build_verification_bundle_zip_bytes(
            receipt=rec,
            document_bytes=raw,
        )
    except ValueError as exc:
        code = str(exc)
        logger.info("VS01 bundle build failed: %s", code)
        if code == "document_hash_mismatch":
            raise HTTPException(
                status_code=400,
                detail="This bundle could not be built because the stored document no longer matches the receipt.",
            ) from exc
        raise HTTPException(status_code=400, detail=_MSG_BUNDLE_UNAVAILABLE) from exc
    except Exception:
        logger.exception("VS01 bundle build unexpected error")
        raise HTTPException(status_code=503, detail=_MSG_BUNDLE_UNAVAILABLE) from None

    _bundle_cache_put(receipt_id, zip_bytes)

    filename = f"claw-bundle-{receipt_id[:16]}.zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
