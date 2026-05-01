"""
VS01-B05: finalized document bytes.

Primary path: ``ArtifactRepository`` + ``BlobStore`` (configurable backend).
Legacy path: optional mirror under ``CLAW_DOCUMENTS_DIR`` for transitional tooling.

Set ``CLAW_UNIFIED_ARTIFACT_STORE=0`` to force filesystem-only layout (legacy).
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from backend.config.storage_runtime import unified_artifact_store_enabled

log = logging.getLogger(__name__)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def documents_root() -> Path:
    return Path(os.getenv("CLAW_DOCUMENTS_DIR", "artifacts/documents")).expanduser().resolve()


def _legacy_mirror_enabled() -> bool:
    return os.getenv("CLAW_VS01_LEGACY_FILE_MIRROR", "1").strip().lower() in ("1", "true", "yes")


def _doc_dir(document_id: str) -> Path:
    if not document_id or "/" in document_id or ".." in document_id:
        raise ValueError("invalid_document_id")
    return documents_root() / document_id


def _write_legacy_layout(document_id: str, content: bytes, meta: Dict[str, Any]) -> None:
    root = _doc_dir(document_id)
    root.mkdir(parents=True, exist_ok=True)
    (root / "body.bin").write_bytes(content)
    (root / "meta.json").write_text(
        json.dumps(meta, sort_keys=True, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )


def _read_legacy_meta(document_id: str) -> Optional[Dict[str, Any]]:
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


def _read_legacy_body(document_id: str) -> Optional[bytes]:
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


def finalize_document(
    content: bytes,
    *,
    content_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Write finalized bytes and return stable identifiers (``document_id``, ``content_sha256``, ...).
    """
    if not content:
        raise ValueError("empty_document")

    content_sha256 = hashlib.sha256(content).hexdigest()
    document_id = f"doc_{uuid.uuid4().hex}"
    ct = content_type or "application/octet-stream"
    meta: Dict[str, Any] = {
        "document_id": document_id,
        "content_sha256": content_sha256,
        "created_at": _utc_now_iso(),
        "size_bytes": len(content),
        "content_type": ct,
    }

    try:
        documents_root().mkdir(parents=True, exist_ok=True)
    except OSError:
        pass

    if unified_artifact_store_enabled():
        try:
            from backend.storage.artifact_repository import get_artifact_repository

            repo = get_artifact_repository()
            repo.init_schema()
            repo.put_artifact(
                artifact_type="vs01_document",
                logical_ref=document_id,
                data=content,
                content_type=ct,
                visibility="downloadable",
                metadata={"role": "signed_document_body"},
            )
            meta_json = json.dumps(
                meta, sort_keys=True, separators=(",", ":"), ensure_ascii=False
            ).encode("utf-8")
            repo.put_artifact(
                artifact_type="vs01_document_meta",
                logical_ref=document_id,
                data=meta_json,
                content_type="application/json",
                visibility="private",
                metadata={"role": "signed_document_meta"},
            )
            if _legacy_mirror_enabled():
                try:
                    _write_legacy_layout(document_id, content, meta)
                except FileExistsError:
                    pass
            return meta
        except NotImplementedError as exc:
            log.warning(
                "finalize_document: unified artifact store unavailable (%s: %s); using legacy layout only",
                type(exc).__name__,
                str(exc)[:300],
            )
        except OSError as exc:
            log.warning(
                "finalize_document: unified store write failed (%s: %s); using legacy layout only",
                type(exc).__name__,
                str(exc)[:300],
            )
        except Exception as exc:
            log.warning(
                "finalize_document: unified artifact path failed (%s: %s); using legacy layout only",
                type(exc).__name__,
                str(exc)[:500],
                exc_info=True,
            )

    _write_legacy_layout(document_id, content, meta)
    return meta


def get_document_meta(document_id: str) -> Optional[Dict[str, Any]]:
    if unified_artifact_store_enabled():
        from backend.storage.artifact_repository import get_artifact_repository

        repo = get_artifact_repository()
        raw = repo.get_bytes_by_logical_ref(
            artifact_type="vs01_document_meta", logical_ref=document_id
        )
        if raw:
            try:
                parsed = json.loads(raw.decode("utf-8"))
                if isinstance(parsed, dict):
                    return parsed
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass
    return _read_legacy_meta(document_id)


def get_document_bytes(document_id: str) -> Optional[bytes]:
    if unified_artifact_store_enabled():
        from backend.storage.artifact_repository import get_artifact_repository

        b = get_artifact_repository().get_bytes_by_logical_ref(
            artifact_type="vs01_document", logical_ref=document_id
        )
        if b is not None:
            return b
    return _read_legacy_body(document_id)


def verify_content_sha256(document_id: str, claimed_sha256: str) -> bool:
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
