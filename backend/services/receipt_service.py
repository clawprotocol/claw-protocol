"""
VS01-B09: receipt.v1 assembly + persistence.

Primary: ``ArtifactRepository``; optional legacy mirror under ``CLAW_RECEIPTS_DIR``.
"""
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

from backend.config.storage_runtime import unified_artifact_store_enabled
from backend.proof.receipt import build_receipt_body_and_hash
from backend.proof.sign_packet import normalize_sign_packet, sign_packet_digest_sha256


def receipts_root() -> Path:
    return Path(os.getenv("CLAW_RECEIPTS_DIR", "artifacts/receipts")).expanduser().resolve()


def _legacy_mirror_enabled() -> bool:
    return os.getenv("CLAW_VS01_LEGACY_FILE_MIRROR", "1").strip().lower() in ("1", "true", "yes")


def _receipt_dir(receipt_id: str) -> Path:
    if not receipt_id or "/" in receipt_id or ".." in receipt_id:
        raise ValueError("invalid_receipt_id")
    return receipts_root() / receipt_id


def _write_legacy_receipt(receipt: Dict[str, Any]) -> None:
    rid = receipt.get("receipt_id")
    if not isinstance(rid, str) or not rid:
        raise ValueError("receipt missing receipt_id")
    root = _receipt_dir(rid)
    root.mkdir(parents=True, exist_ok=False)
    payload = json.dumps(
        receipt,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    (root / "receipt.json").write_text(payload, encoding="utf-8")


def issue_receipt(
    *,
    sign_packet: Mapping[str, Any],
    protocol_version: str,
    receipt_id: Optional[str] = None,
) -> Dict[str, Any]:
    normalized = normalize_sign_packet(sign_packet)
    digest = sign_packet_digest_sha256(sign_packet)
    body, receipt_hash = build_receipt_body_and_hash(
        protocol_version=protocol_version,
        document_id=normalized["document_id"],
        document_content_sha256=normalized["document_content_sha256"],
        sign_packet=normalized,
        sign_packet_digest_sha256=digest,
    )
    rid = receipt_id or f"rcpt_{uuid.uuid4().hex}"
    out: Dict[str, Any] = dict(body)
    out["receipt_id"] = rid
    out["receipt_hash_sha256"] = receipt_hash
    return out


def persist_receipt(receipt: Dict[str, Any]) -> None:
    rid = receipt.get("receipt_id")
    if not isinstance(rid, str) or not rid:
        raise ValueError("receipt missing receipt_id")
    payload = json.dumps(
        receipt,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")

    if unified_artifact_store_enabled():
        from backend.storage.artifact_repository import get_artifact_repository

        get_artifact_repository().put_artifact(
            artifact_type="vs01_receipt",
            logical_ref=rid,
            data=payload,
            content_type="application/json",
            visibility="private",
            metadata={"schema": "receipt.v1"},
        )
        if _legacy_mirror_enabled():
            try:
                _write_legacy_receipt(receipt)
            except FileExistsError:
                pass
        return

    _write_legacy_receipt(receipt)


def issue_and_persist_receipt(
    *,
    sign_packet: Mapping[str, Any],
    protocol_version: str,
    receipt_id: Optional[str] = None,
) -> Dict[str, Any]:
    r = issue_receipt(
        sign_packet=sign_packet,
        protocol_version=protocol_version,
        receipt_id=receipt_id,
    )
    persist_receipt(r)
    return r


def get_receipt(receipt_id: str) -> Optional[Dict[str, Any]]:
    if unified_artifact_store_enabled():
        from backend.storage.artifact_repository import get_artifact_repository

        raw = get_artifact_repository().get_bytes_by_logical_ref(
            artifact_type="vs01_receipt", logical_ref=receipt_id
        )
        if raw:
            try:
                parsed = json.loads(raw.decode("utf-8"))
                if isinstance(parsed, dict):
                    return parsed
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass
    try:
        d = _receipt_dir(receipt_id)
    except ValueError:
        return None
    path = d / "receipt.json"
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
