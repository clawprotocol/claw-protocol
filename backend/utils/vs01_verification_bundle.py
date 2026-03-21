"""
VS01-B12: minimal verification_bundle.v1 zip assembly (no new service).

Per RECEIPT_SCHEMAS §5: manifest lists artifacts (sorted by path); hashes from
actual file bytes. Uses proof canon for manifest digest helpers only.
"""
from __future__ import annotations

import hashlib
import io
import json
import zipfile
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Tuple

from backend.proof.canon import canon_json_bytes, sha256_hex

VERIFICATION_BUNDLE_SCHEMA_VERSION = "verification_bundle.v1"

# Fixed relative paths inside the zip (system-defined; never from client).
PATH_RECEIPT = "receipt.json"
PATH_DOCUMENT = "document.bin"
PATH_VERIFY = "VERIFY.md"
PATH_MANIFEST = "manifest.json"

_VERIFY_MD_BODY = """# CLAW verification bundle (informational)

This archive contains:

- `manifest.json` — `verification_bundle.v1` (artifact paths + content SHA-256)
- `receipt.json` — full `receipt.v1` including `receipt_hash_sha256`
- `document.bin` — raw document bytes (hash must match `document_content_sha256`)

## Offline checks

1. SHA-256 each file; compare to `artifacts[].content_sha256` in `manifest.json`.
2. Recompute `sign_packet_digest_sha256` and `receipt_hash_sha256` per CLAW RECEIPT_SCHEMAS (canonical JSON rules).

Cryptographic verification is authoritative; this file is not proof.
"""


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def canonical_json_bytes(obj: Mapping[str, Any]) -> bytes:
    """UTF-8 canonical JSON for on-disk artifacts (RECEIPT_SCHEMAS global rules)."""
    return json.dumps(
        obj,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def content_sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def bundle_manifest_digest_sha256(manifest_body: Dict[str, Any]) -> str:
    """SHA-256(canon_json(manifest_body)) per RECEIPT_SCHEMAS §5."""
    allowed = {
        "schema_version",
        "bundle_id",
        "created_at",
        "protocol_version",
        "artifacts",
    }
    keys = set(manifest_body.keys())
    if keys != allowed:
        raise ValueError(f"manifest_body must have exactly keys {sorted(allowed)}, got {sorted(keys)}")
    ordered = {k: manifest_body[k] for k in sorted(manifest_body.keys())}
    return sha256_hex(canon_json_bytes(ordered))


def build_artifacts_entries(
    *,
    receipt_json_bytes: bytes,
    document_bytes: bytes,
    verify_md_bytes: bytes,
) -> List[Dict[str, str]]:
    """Artifact rows sorted by path (UTF-8 / Unicode code point order)."""
    rows = [
        {
            "path": PATH_DOCUMENT,
            "role": "document_bytes",
            "content_sha256": content_sha256_hex(document_bytes),
        },
        {
            "path": PATH_RECEIPT,
            "role": "receipt",
            "content_sha256": content_sha256_hex(receipt_json_bytes),
        },
        {
            "path": PATH_VERIFY,
            "role": "optional_attachment",
            "content_sha256": content_sha256_hex(verify_md_bytes),
        },
    ]
    rows.sort(key=lambda a: a["path"])
    return rows


def build_verification_bundle_manifest(
    *,
    bundle_id: str,
    created_at: str,
    protocol_version: str,
    receipt_json_bytes: bytes,
    document_bytes: bytes,
    verify_md_bytes: bytes | None = None,
) -> Dict[str, Any]:
    """Full verification_bundle.v1 object (manifest.json payload)."""
    vm = verify_md_bytes if verify_md_bytes is not None else _VERIFY_MD_BODY.encode("utf-8")
    artifacts = build_artifacts_entries(
        receipt_json_bytes=receipt_json_bytes,
        document_bytes=document_bytes,
        verify_md_bytes=vm,
    )
    return {
        "schema_version": VERIFICATION_BUNDLE_SCHEMA_VERSION,
        "bundle_id": bundle_id,
        "created_at": created_at,
        "protocol_version": protocol_version,
        "artifacts": artifacts,
    }


def build_verification_bundle_zip_bytes(
    *,
    receipt: Dict[str, Any],
    document_bytes: bytes,
    bundle_id: str | None = None,
    created_at: str | None = None,
) -> Tuple[bytes, Dict[str, Any]]:
    """
    Assemble a deterministic ZIP (STORED, fixed timestamps).

    Raises:
      ValueError: document_not_found binding / hash mismatch / invalid receipt
    """
    rid = receipt.get("receipt_id")
    if not isinstance(rid, str) or not rid:
        raise ValueError("receipt_missing_receipt_id")
    doc_hash = receipt.get("document_content_sha256")
    if not isinstance(doc_hash, str) or len(doc_hash) != 64:
        raise ValueError("receipt_missing_document_content_sha256")
    actual = content_sha256_hex(document_bytes)
    if actual != doc_hash.lower():
        raise ValueError("document_hash_mismatch")

    protocol_version = receipt.get("protocol_version")
    if not isinstance(protocol_version, str) or not protocol_version:
        raise ValueError("receipt_missing_protocol_version")

    receipt_obj = dict(receipt)
    receipt_json_bytes = canonical_json_bytes(receipt_obj)
    verify_md_bytes = _VERIFY_MD_BODY.encode("utf-8")
    bid = bundle_id or f"vs01_bundle_{rid}"
    cat = created_at or _utc_now_iso()
    manifest = build_verification_bundle_manifest(
        bundle_id=bid,
        created_at=cat,
        protocol_version=protocol_version,
        receipt_json_bytes=receipt_json_bytes,
        document_bytes=document_bytes,
        verify_md_bytes=verify_md_bytes,
    )
    manifest_bytes = canonical_json_bytes(manifest)

    files: Dict[str, bytes] = {
        PATH_MANIFEST: manifest_bytes,
        PATH_RECEIPT: receipt_json_bytes,
        PATH_DOCUMENT: document_bytes,
        PATH_VERIFY: verify_md_bytes,
    }

    buf = io.BytesIO()
    # Deterministic entry order: sort by path
    names = sorted(files.keys())
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_STORED) as zf:
        for name in names:
            zi = zipfile.ZipInfo(filename=name)
            zi.date_time = (1980, 1, 1, 0, 0, 0)
            zi.compress_type = zipfile.ZIP_STORED
            zf.writestr(zi, files[name])
    return buf.getvalue(), manifest
