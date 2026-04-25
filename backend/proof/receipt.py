"""
VS01-B03: receipt.v1 receipt_body + receipt_hash_sha256.

Per docs/architecture/RECEIPT_SCHEMAS.md §3 (no ingest/timeline keys in this slice).
"""
from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional, Tuple

from backend.proof.canon import canon_json_bytes, sha256_hex
from backend.proof.sign_packet import normalize_sign_packet, validate_sha256_hex

RECEIPT_SCHEMA_VERSION = "receipt.v1"
USAGE_RECEIPT_VERSION = "v1"


def build_usage_receipt_body_and_hash(
    *,
    usage_event_id: str,
    org_id: str,
    user_id: Optional[str],
    service_type: str,
    unit_count: Any,
    key_cost: int,
    keys_balance_before: int,
    keys_balance_after: int,
    payment_sources: List[Dict[str, Any]],
    timestamp: str,
    version: str = USAGE_RECEIPT_VERSION,
) -> Tuple[Dict[str, Any], str]:
    """
    Deterministic UsageReceipt body + SHA-256 (no receipt_id / wrapper hashes in body).
    ``payment_sources`` must be ordered (e.g. sorted by payment_id); inner dict keys sorted.
    ``unit_count`` is typically ``int`` or ``str`` (never float) to avoid nondeterminism.
    """
    if not isinstance(usage_event_id, str) or not usage_event_id:
        raise ValueError("usage_event_id required")
    if not isinstance(org_id, str) or not org_id:
        raise ValueError("org_id required")
    if not isinstance(service_type, str) or not service_type:
        raise ValueError("service_type required")
    clean_sources: List[Dict[str, Any]] = []
    for src in payment_sources:
        if not isinstance(src, dict):
            raise ValueError("payment_sources entries must be dicts")
        clean_sources.append({k: src[k] for k in sorted(src.keys())})

    body: Dict[str, Any] = {
        "key_cost": int(key_cost),
        "keys_balance_after": int(keys_balance_after),
        "keys_balance_before": int(keys_balance_before),
        "org_id": org_id,
        "payment_sources": clean_sources,
        "service_type": service_type,
        "timestamp": timestamp,
        "type": "UsageReceipt",
        "unit_count": unit_count,
        "usage_event_id": usage_event_id,
        "user_id": user_id,
        "version": str(version),
    }
    body_ordered = {k: body[k] for k in sorted(body.keys())}
    receipt_hash = sha256_hex(canon_json_bytes(body_ordered))
    return body_ordered, receipt_hash


def build_receipt_body_and_hash(
    *,
    protocol_version: str,
    document_id: str,
    document_content_sha256: str,
    sign_packet: Mapping[str, Any],
    sign_packet_digest_sha256: str,
    ingest_packet_digest_sha256: str | None = None,
    timeline_event_id: str | None = None,
) -> Tuple[Dict[str, Any], str]:
    """
    Build receipt_body (hashed object) and receipt_hash_sha256.

    receipt_body excludes receipt_id and receipt_hash_sha256 per schema.
    Verifies sign_packet_digest matches embedded sign_packet and document binding.
    """
    if not isinstance(protocol_version, str) or not protocol_version:
        raise ValueError("protocol_version must be non-empty string")
    if not isinstance(document_id, str) or not document_id:
        raise ValueError("document_id must be non-empty string")

    normalized_sign = normalize_sign_packet(sign_packet)
    expected_digest = sha256_hex(canon_json_bytes(normalized_sign))
    declared = validate_sha256_hex("sign_packet_digest_sha256", sign_packet_digest_sha256)
    if declared != expected_digest:
        raise ValueError(
            "sign_packet_digest_sha256 does not match embedded sign_packet canonical digest"
        )

    doc_hex = validate_sha256_hex("document_content_sha256", document_content_sha256)
    if doc_hex != normalized_sign["document_content_sha256"]:
        raise ValueError("document_content_sha256 must match sign_packet.document_content_sha256")
    if document_id != normalized_sign["document_id"]:
        raise ValueError("document_id must match sign_packet.document_id")

    body: Dict[str, Any] = {
        "document_content_sha256": doc_hex,
        "document_id": document_id,
        "protocol_version": protocol_version,
        "schema_version": RECEIPT_SCHEMA_VERSION,
        "sign_packet": normalized_sign,
        "sign_packet_digest_sha256": expected_digest,
    }
    if ingest_packet_digest_sha256 is not None:
        body["ingest_packet_digest_sha256"] = validate_sha256_hex(
            "ingest_packet_digest_sha256", ingest_packet_digest_sha256
        )
    if timeline_event_id is not None:
        if not isinstance(timeline_event_id, str) or not timeline_event_id:
            raise ValueError("timeline_event_id must be non-empty string when present")
        body["timeline_event_id"] = timeline_event_id

    body_ordered = {k: body[k] for k in sorted(body.keys())}
    receipt_hash = sha256_hex(canon_json_bytes(body_ordered))
    return body_ordered, receipt_hash
