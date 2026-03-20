"""
VS01-B02: sign_packet.v1 normalization + sign_packet_digest_sha256.

Per docs/architecture/RECEIPT_SCHEMAS.md §1.
"""
from __future__ import annotations

from typing import Any, Dict, List, Mapping

from backend.proof.canon import canon_json_bytes, sha256_hex

SIGN_PACKET_SCHEMA_VERSION = "sign_packet.v1"

_REQUIRED_SIGN_PACKET_KEYS = frozenset(
    {
        "schema_version",
        "document_id",
        "document_content_sha256",
        "signer_ref",
        "intent",
        "signed_at",
        "field_manifest",
    }
)

_OPTIONAL_SIGN_PACKET_KEYS = frozenset({"client_manifest_sha256", "detached_signature_b64"})

_FIELD_MANIFEST_ITEM_KEYS = frozenset({"field_id", "page_index", "x", "y", "w", "h"})


def validate_sha256_hex(name: str, value: str) -> str:
    if not isinstance(value, str) or len(value) != 64:
        raise ValueError(f"{name} must be a 64-char hex string")
    lowered = value.lower()
    try:
        int(lowered, 16)
    except ValueError as e:
        raise ValueError(f"{name} must be hexadecimal") from e
    return lowered


def _sort_field_manifest(items: List[Any]) -> List[Dict[str, Any]]:
    if not isinstance(items, list):
        raise ValueError("field_manifest must be a list")
    out: List[Dict[str, Any]] = []
    for i, item in enumerate(items):
        if not isinstance(item, Mapping):
            raise ValueError(f"field_manifest[{i}] must be an object")
        keys = set(item.keys())
        if keys != _FIELD_MANIFEST_ITEM_KEYS:
            raise ValueError(
                f"field_manifest[{i}] must have exactly keys {_FIELD_MANIFEST_ITEM_KEYS}, got {keys}"
            )
        fid = item["field_id"]
        if not isinstance(fid, str) or not fid:
            raise ValueError(f"field_manifest[{i}].field_id must be non-empty string")
        pi = item["page_index"]
        if not isinstance(pi, int) or pi < 0:
            raise ValueError(f"field_manifest[{i}].page_index must be int >= 0")
        for coord in ("x", "y", "w", "h"):
            v = item[coord]
            if not isinstance(v, (int, float)):
                raise ValueError(f"field_manifest[{i}].{coord} must be a number")
        # Preserve numeric JSON types; copy as plain dict for stable hashing
        out.append(
            {
                "field_id": fid,
                "h": item["h"],
                "page_index": pi,
                "w": item["w"],
                "x": item["x"],
                "y": item["y"],
            }
        )
    # Sort keys in each item for nested canon consistency (schema: same key set)
    normalized_items = []
    for d in out:
        normalized_items.append({k: d[k] for k in sorted(d.keys())})
    normalized_items.sort(key=lambda it: canon_json_bytes(it))
    return normalized_items


def normalize_sign_packet(sign_packet: Mapping[str, Any]) -> Dict[str, Any]:
    """
    Return a new dict suitable for hashing: sorted field_manifest,
    lowercase document_content_sha256, only allowed keys, optional keys omitted if absent.
    """
    if not isinstance(sign_packet, Mapping):
        raise ValueError("sign_packet must be a mapping")
    keys = set(sign_packet.keys())
    allowed = _REQUIRED_SIGN_PACKET_KEYS | _OPTIONAL_SIGN_PACKET_KEYS
    if not _REQUIRED_SIGN_PACKET_KEYS.issubset(keys):
        missing = _REQUIRED_SIGN_PACKET_KEYS - keys
        raise ValueError(f"sign_packet missing required keys: {sorted(missing)}")
    extra = keys - allowed
    if extra:
        raise ValueError(f"sign_packet has unknown keys: {sorted(extra)}")

    sv = sign_packet["schema_version"]
    if sv != SIGN_PACKET_SCHEMA_VERSION:
        raise ValueError(f"schema_version must be {SIGN_PACKET_SCHEMA_VERSION!r}, got {sv!r}")

    doc_id = sign_packet["document_id"]
    if not isinstance(doc_id, str) or not doc_id:
        raise ValueError("document_id must be non-empty string")
    signer_ref = sign_packet["signer_ref"]
    if not isinstance(signer_ref, str) or not signer_ref:
        raise ValueError("signer_ref must be non-empty string")
    intent = sign_packet["intent"]
    if not isinstance(intent, str) or not intent:
        raise ValueError("intent must be non-empty string")
    signed_at = sign_packet["signed_at"]
    if not isinstance(signed_at, str) or not signed_at:
        raise ValueError("signed_at must be non-empty string")

    doc_hash = validate_sha256_hex(
        "document_content_sha256", sign_packet["document_content_sha256"]
    )
    sorted_manifest = _sort_field_manifest(sign_packet["field_manifest"])

    out: Dict[str, Any] = {
        "document_content_sha256": doc_hash,
        "document_id": doc_id,
        "field_manifest": sorted_manifest,
        "intent": sign_packet["intent"],
        "schema_version": SIGN_PACKET_SCHEMA_VERSION,
        "signed_at": sign_packet["signed_at"],
        "signer_ref": sign_packet["signer_ref"],
    }
    if "client_manifest_sha256" in sign_packet:
        out["client_manifest_sha256"] = validate_sha256_hex(
            "client_manifest_sha256", sign_packet["client_manifest_sha256"]
        )
    if "detached_signature_b64" in sign_packet:
        ds = sign_packet["detached_signature_b64"]
        if not isinstance(ds, str) or not ds:
            raise ValueError("detached_signature_b64 must be non-empty string when present")
        out["detached_signature_b64"] = ds
    # Top-level keys in sorted order for readability; canon_json sorts anyway
    return {k: out[k] for k in sorted(out.keys())}


def sign_packet_digest_sha256(sign_packet: Mapping[str, Any]) -> str:
    """
    sign_packet_digest_sha256 = SHA-256(canon_json(sign_packet_object)) per RECEIPT_SCHEMAS §1.
    """
    normalized = normalize_sign_packet(sign_packet)
    return sha256_hex(canon_json_bytes(normalized))
