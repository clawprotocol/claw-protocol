"""Safe VS01 document content loading for GET /v1/documents/{id}/content."""

from __future__ import annotations

import logging
import traceback
from typing import Any, Dict, Optional, Tuple

from backend.services import document_service

_log = logging.getLogger("claw.vs01_document_content")


def _log_stage(
    *,
    document_id: str,
    stage: str,
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    parts = [
        "[vs01-document-content-stage]",
        f"document_id={document_id or 'unknown'}",
        f"stage={stage}",
    ]
    if extra:
        for key, value in extra.items():
            parts.append(f"{key}={value}")
    _log.info(" ".join(parts))


def _safe_meta(document_id: str) -> Dict[str, Any]:
    try:
        meta = document_service.get_document_meta(document_id)
    except Exception as exc:
        _log.error(
            "[vs01-document-content-error] document_id=%s exception_type=%s exception_message=%s "
            "stage=load_meta traceback=%s",
            document_id,
            type(exc).__name__,
            str(exc)[:500],
            traceback.format_exc(),
        )
        return {}
    return meta if isinstance(meta, dict) else {}


def _safe_bytes(document_id: str) -> Optional[bytes]:
    try:
        raw = document_service.get_document_bytes(document_id)
    except Exception as exc:
        _log.error(
            "[vs01-document-content-error] document_id=%s exception_type=%s exception_message=%s "
            "stage=load_bytes traceback=%s",
            document_id,
            type(exc).__name__,
            str(exc)[:500],
            traceback.format_exc(),
        )
        return None
    return raw if isinstance(raw, (bytes, bytearray)) else None


def load_document_content(document_id: str) -> Tuple[Optional[bytes], Dict[str, Any]]:
    """
    Load finalized VS01 document bytes + metadata.

    Never raises — callers map ``None`` bytes to 404/JSON error responses.
    """
    did = (document_id or "").strip()
    _log_stage(document_id=did, stage="load_meta")
    meta = _safe_meta(did)
    agreement_id = str(meta.get("agreement_id") or "").strip() or None
    _log_stage(
        document_id=did,
        stage="load_bytes",
        extra={
            "agreement_id": agreement_id or "",
            "meta_keys": ",".join(sorted(str(k) for k in meta.keys())[:20]),
            "content_type": str(meta.get("content_type") or ""),
        },
    )
    raw = _safe_bytes(did)
    if raw is not None:
        _log_stage(
            document_id=did,
            stage="load_ok",
            extra={"size_bytes": len(raw), "agreement_id": agreement_id or ""},
        )
    else:
        _log_stage(
            document_id=did,
            stage="load_missing",
            extra={"agreement_id": agreement_id or ""},
        )
    return raw, meta


def content_type_for_meta(meta: Dict[str, Any]) -> str:
    ct = meta.get("content_type")
    if isinstance(ct, str) and ct.strip():
        return ct.strip()
    return "application/pdf"
