"""
VS01-B09: deterministic receipt.v1 assembly + filesystem persistence.

Calls backend.proof only for hashing (ADR-002). No LLM/OCR/timeline imports.
TODO: DB-backed persistence, idempotency keys, ACL.
"""
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

from backend.proof.receipt import build_receipt_body_and_hash
from backend.proof.sign_packet import normalize_sign_packet, sign_packet_digest_sha256


def receipts_root() -> Path:
    return Path(os.getenv("CLAW_RECEIPTS_DIR", "artifacts/receipts")).expanduser().resolve()


def _receipt_dir(receipt_id: str) -> Path:
    if not receipt_id or "/" in receipt_id or ".." in receipt_id:
        raise ValueError("invalid_receipt_id")
    return receipts_root() / receipt_id


def issue_receipt(
    *,
    sign_packet: Mapping[str, Any],
    protocol_version: str,
    receipt_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build full persisted-shaped receipt.v1: receipt_body fields + receipt_id +
    receipt_hash_sha256. Does not write to disk.

    sign_packet may be pre-normalized or raw; digest is always recomputed from
    canonical normalization per RECEIPT_SCHEMAS.
    """
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
    """Write receipt JSON under artifacts/receipts/{receipt_id}/."""
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


def issue_and_persist_receipt(
    *,
    sign_packet: Mapping[str, Any],
    protocol_version: str,
    receipt_id: Optional[str] = None,
) -> Dict[str, Any]:
    """issue_receipt + persist_receipt in one call."""
    r = issue_receipt(
        sign_packet=sign_packet,
        protocol_version=protocol_version,
        receipt_id=receipt_id,
    )
    persist_receipt(r)
    return r


def get_receipt(receipt_id: str) -> Optional[Dict[str, Any]]:
    """Load persisted receipt or None."""
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
