"""
VS01-B07: sign-packet preparation for draft → sign.

VS01-B08: optional sign-session rows (filesystem) binding document_id + hash.

Builds sign_packet.v1 bound to stored document hash; delegates normalization
and digest to backend.proof.sign_packet.
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional

from backend.proof.sign_packet import (
    SIGN_PACKET_SCHEMA_VERSION,
    normalize_sign_packet,
    sign_packet_digest_sha256,
    validate_sha256_hex,
)
from backend.services import document_service


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sign_sessions_root() -> Path:
    return Path(
        os.getenv("CLAW_SIGN_SESSIONS_DIR", "artifacts/sign_sessions")
    ).expanduser().resolve()


def _session_dir(session_id: str) -> Path:
    if not session_id or "/" in session_id or ".." in session_id:
        raise ValueError("invalid_session_id")
    return sign_sessions_root() / session_id


def create_sign_session(*, document_id: str, content_sha256: str) -> Dict[str, Any]:
    """
    Bind document_id to expected content_sha256 before complete-sign.

    Raises:
      ValueError: document_not_found, content_sha256_mismatch, content_integrity_failed
    """
    meta = document_service.get_document_meta(document_id)
    if not meta:
        raise ValueError("document_not_found")
    expected = validate_sha256_hex("content_sha256", content_sha256)
    stored = meta.get("content_sha256")
    if not isinstance(stored, str) or stored != expected:
        raise ValueError("content_sha256_mismatch")
    if not document_service.verify_content_sha256(document_id, expected):
        raise ValueError("content_integrity_failed")

    session_id = f"sess_{uuid.uuid4().hex}"
    root = _session_dir(session_id)
    root.mkdir(parents=True, exist_ok=False)
    row: Dict[str, Any] = {
        "session_id": session_id,
        "document_id": document_id,
        "content_sha256": expected,
        "status": "pending",
        "created_at": _utc_now_iso(),
        "receipt_id": None,
    }
    (root / "session.json").write_text(
        json.dumps(row, sort_keys=True, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )
    return row


def get_sign_session(session_id: str) -> Optional[Dict[str, Any]]:
    try:
        d = _session_dir(session_id)
    except ValueError:
        return None
    path = d / "session.json"
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def mark_sign_session_completed(*, session_id: str, receipt_id: str) -> None:
    """Set session status to completed and attach receipt_id. Raises if not pending."""
    session = get_sign_session(session_id)
    if not session:
        raise ValueError("session_not_found")
    if session.get("status") != "pending":
        raise ValueError("session_not_pending")
    session["status"] = "completed"
    session["receipt_id"] = receipt_id
    session["completed_at"] = _utc_now_iso()
    root = _session_dir(session_id)
    (root / "session.json").write_text(
        json.dumps(session, sort_keys=True, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )


def prepare_sign_packet(
    *,
    document_id: str,
    signer_ref: str,
    intent: str,
    signed_at: str,
    field_manifest: List[Mapping[str, Any]],
    client_manifest_sha256: Optional[str] = None,
    content_sha256_claim: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Assemble sign_packet.v1 using the stored document hash.

    If content_sha256_claim is set, it must match the stored document hash
    (client binding check). Otherwise the stored hash is used as source of truth.

    Returns:
      sign_packet: normalized dict (canonical field order / manifest sort)
      sign_packet_digest_sha256: hex digest per RECEIPT_SCHEMAS

    Raises:
      ValueError: document_not_found, content_sha256_mismatch, or proof validation errors
    """
    meta = document_service.get_document_meta(document_id)
    if not meta:
        raise ValueError("document_not_found")

    stored = meta.get("content_sha256")
    if not isinstance(stored, str) or len(stored) != 64:
        raise ValueError("corrupt_document_meta")

    if not document_service.verify_content_sha256(document_id, stored):
        raise ValueError("content_integrity_failed")

    if content_sha256_claim is not None:
        claimed = validate_sha256_hex("content_sha256_claim", content_sha256_claim)
        if claimed != stored:
            raise ValueError("content_sha256_mismatch")

    packet: Dict[str, Any] = {
        "schema_version": SIGN_PACKET_SCHEMA_VERSION,
        "document_id": document_id,
        "document_content_sha256": stored,
        "signer_ref": signer_ref,
        "intent": intent,
        "signed_at": signed_at,
        "field_manifest": list(field_manifest),
    }
    if client_manifest_sha256 is not None:
        packet["client_manifest_sha256"] = client_manifest_sha256

    normalized = normalize_sign_packet(packet)
    digest = sign_packet_digest_sha256(packet)
    return {
        "sign_packet": normalized,
        "sign_packet_digest_sha256": digest,
    }
