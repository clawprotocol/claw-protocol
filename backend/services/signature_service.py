"""
VS01-B07: sign-packet preparation for draft → sign (no receipt orchestration).

Builds sign_packet.v1 bound to stored document hash; delegates normalization
and digest to backend.proof.sign_packet.
"""
from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional

from backend.proof.sign_packet import (
    SIGN_PACKET_SCHEMA_VERSION,
    normalize_sign_packet,
    sign_packet_digest_sha256,
)
from backend.services import document_service


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
        from backend.proof.sign_packet import validate_sha256_hex

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
