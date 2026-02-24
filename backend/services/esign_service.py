from __future__ import annotations

import base64
import hashlib
from typing import Any, Dict, List, Optional

from backend.utils.canon_json import canon_sha256_hex
from backend.services import attestation_service


def _normalize_signers(signers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    def key(s: Dict[str, Any]) -> tuple:
        return (
            (s.get("email") or "").lower(),
            (s.get("name") or "").lower(),
            (s.get("role") or "").lower(),
        )

    normalized = []
    for s in signers:
        signer_id = s.get("signer_id") or f"signer_{canon_sha256_hex({'name': s.get('name'), 'email': s.get('email'), 'role': s.get('role')})[:12]}"
        normalized.append(
            {
                "signer_id": signer_id,
                "name": s.get("name"),
                "email": s.get("email"),
                "role": s.get("role"),
            }
        )
    return sorted(normalized, key=key)


def _sorted_signatures(signatures: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        signatures,
        key=lambda s: (s.get("signed_at") or "", s.get("signer_id") or ""),
    )


def _packet_hash_input(packet: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "schema": packet.get("schema"),
        "document": packet.get("document"),
        "signers": _normalize_signers(packet.get("signers") or []),
        "signatures": _sorted_signatures(packet.get("signatures") or []),
        "created_at": packet.get("created_at"),
    }


def create_packet(
    *,
    document_base64: Optional[str],
    document_sha256: Optional[str],
    title: str,
    mime: str,
    size: int,
    signers: List[Dict[str, Any]],
    created_at: str,
) -> Dict[str, Any]:
    if document_base64:
        raw = base64.b64decode(document_base64)
        doc_sha = hashlib.sha256(raw).hexdigest()
        doc_size = len(raw)
    else:
        if not document_sha256 or size <= 0:
            raise ValueError("document_sha256 requires size > 0")
        doc_sha = document_sha256
        doc_size = size
    packet: Dict[str, Any] = {
        "schema": "claw.esign_packet.v1",
        "document": {
            "title": title,
            "mime": mime,
            "size": doc_size,
            "sha256": doc_sha,
        },
        "signers": _normalize_signers(signers),
        "signatures": [],
        "created_at": created_at,
    }
    packet_sha256 = canon_sha256_hex(_packet_hash_input(packet))
    packet_id = f"esign_{packet_sha256[:16]}"
    packet["packet_id"] = packet_id
    packet["packet_sha256"] = packet_sha256
    return packet


def sign_packet(
    *,
    packet: Dict[str, Any],
    signer_id: str,
    signed_at: str,
    method: str,
    typed_name: Optional[str] = None,
) -> Dict[str, Any]:
    signers = {s.get("signer_id") for s in packet.get("signers") or []}
    if signer_id not in signers:
        raise ValueError("signer_id not in signers")
    signatures = list(packet.get("signatures") or [])
    if any(s.get("signer_id") == signer_id for s in signatures):
        raise ValueError("signer already signed")
    signatures.append(
        {
            "signer_id": signer_id,
            "signed_at": signed_at,
            "method": method,
            "typed_name": typed_name,
        }
    )
    out = dict(packet)
    out["signatures"] = signatures
    out["packet_sha256"] = canon_sha256_hex(_packet_hash_input(out))
    return out


def finalize_packet(*, packet: Dict[str, Any], finalized_at: str) -> Dict[str, Any]:
    signers = [s.get("signer_id") for s in packet.get("signers") or [] if s.get("signer_id")]
    signatures = [s.get("signer_id") for s in packet.get("signatures") or [] if s.get("signer_id")]
    if not signers or not signatures or not all(s in signatures for s in signers):
        raise ValueError("Cannot finalize: not all signers have signed.")
    payload = {
        "schema": "claw.esign_packet.v1",
        "packet_id": packet.get("packet_id"),
        "packet_sha256": packet.get("packet_sha256"),
        "document": packet.get("document"),
        "signers": _normalize_signers(packet.get("signers") or []),
        "signatures": _sorted_signatures(packet.get("signatures") or []),
        "finalized_at": finalized_at,
    }
    signer_metadata = {"id": "esign_packet", "name": "CLAW E-Sign Packet"}
    return attestation_service.create_attestation(
        "esign",
        payload,
        signer_metadata,
        finalized_at,
    )
