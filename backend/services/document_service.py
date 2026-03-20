"""
VS01-B05: minimal document store for agreement finalize → sign flow.

Persists finalized document bytes under a configurable directory (default
artifacts/documents/). No DB. Explicit TODO: retention, authz, virus scan.
"""
from __future__ import annotations

import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def documents_root() -> Path:
    return Path(os.getenv("CLAW_DOCUMENTS_DIR", "artifacts/documents")).expanduser().resolve()


def _doc_dir(document_id: str) -> Path:
    # document_id is controlled by us (uuid); still reject traversal
    if not document_id or "/" in document_id or ".." in document_id:
        raise ValueError("invalid_document_id")
    return documents_root() / document_id


def finalize_document(
    content: bytes,
    *,
    content_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Write finalized bytes and return stable identifiers.

    Returns:
      document_id, content_sha256 (lowercase hex), created_at, size_bytes, content_type
    """
    if not content:
        raise ValueError("empty_document")

    content_sha256 = hashlib.sha256(content).hexdigest()
    document_id = f"doc_{uuid.uuid4().hex}"
    root = _doc_dir(document_id)
    root.mkdir(parents=True, exist_ok=False)

    body_path = root / "body.bin"
    body_path.write_bytes(content)

    meta: Dict[str, Any] = {
        "document_id": document_id,
        "content_sha256": content_sha256,
        "created_at": _utc_now_iso(),
        "size_bytes": len(content),
        "content_type": content_type or "application/octet-stream",
    }
    (root / "meta.json").write_text(
        json.dumps(meta, sort_keys=True, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )
    return meta


def get_document_meta(document_id: str) -> Optional[Dict[str, Any]]:
    """Load meta.json for document_id, or None if missing."""
    try:
        d = _doc_dir(document_id)
    except ValueError:
        return None
    meta_path = d / "meta.json"
    if not meta_path.is_file():
        return None
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def get_document_bytes(document_id: str) -> Optional[bytes]:
    """Return stored body bytes or None if not found."""
    try:
        d = _doc_dir(document_id)
    except ValueError:
        return None
    body = d / "body.bin"
    if not body.is_file():
        return None
    try:
        return body.read_bytes()
    except OSError:
        return None


def verify_content_sha256(document_id: str, claimed_sha256: str) -> bool:
    """
    Return True if claimed_sha256 (hex) matches stored meta and on-disk body.

    TODO: streaming hash for very large bodies if needed.
    """
    meta = get_document_meta(document_id)
    if not meta:
        return False
    try:
        from backend.proof.sign_packet import validate_sha256_hex

        want = validate_sha256_hex("claimed", claimed_sha256)
    except ValueError:
        return False
    if meta.get("content_sha256") != want:
        return False
    raw = get_document_bytes(document_id)
    if raw is None:
        return False
    actual = hashlib.sha256(raw).hexdigest()
    return actual == want
