from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.services import attestation_service
from backend.utils.canon_json import canon_sha256_hex


def _build_packet(
    *,
    attestable_facts: Dict[str, Any],
    public_legal_context: Dict[str, Any],
    inclusion: Dict[str, Any],
    private_notes: str,
    created_at: str,
    updated_at: str,
    author: Dict[str, Any],
) -> Dict[str, Any]:
    facts = {
        "freeform_text": attestable_facts.get("freeform_text") or "",
    }
    if attestable_facts.get("structured_fields") is not None:
        facts["structured_fields"] = attestable_facts.get("structured_fields")

    plc = {
        "freeform_text": public_legal_context.get("freeform_text") or "",
        "citations": public_legal_context.get("citations") or [],
        "disclaimer_required": True,
    }

    inc = {
        "include_public_legal_context_in_bundle": bool(
            inclusion.get("include_public_legal_context_in_bundle", False)
        ),
        "include_private_notes_in_bundle": bool(
            inclusion.get("include_private_notes_in_bundle", False)
        ),
    }

    return {
        "schema": "claw.liability_attestation.v1",
        "attestable_facts": facts,
        "public_legal_context": plc,
        "inclusion": inc,
        "private_notes": private_notes or "",
        "created_at": created_at,
        "updated_at": updated_at,
        "author": {
            "name": author.get("name") or "",
            "role": author.get("role") or "",
        },
    }


def create_or_update_packet(
    *,
    attestable_facts: Dict[str, Any],
    public_legal_context: Dict[str, Any],
    inclusion: Dict[str, Any],
    private_notes: str,
    created_at: str,
    updated_at: str,
    author: Dict[str, Any],
) -> Dict[str, Any]:
    packet = _build_packet(
        attestable_facts=attestable_facts,
        public_legal_context=public_legal_context,
        inclusion=inclusion,
        private_notes=private_notes,
        created_at=created_at,
        updated_at=updated_at,
        author=author,
    )
    return {
        "packet": packet,
        "packet_sha256": canon_sha256_hex(packet),
    }


def _bundle_payload(packet: Dict[str, Any]) -> Dict[str, Any]:
    inclusion = packet.get("inclusion") or {}
    include_public = bool(inclusion.get("include_public_legal_context_in_bundle", False))
    include_private = bool(inclusion.get("include_private_notes_in_bundle", False))
    payload: Dict[str, Any] = {
        "schema": packet.get("schema"),
        "attestable_facts": packet.get("attestable_facts"),
        "inclusion": inclusion,
        "created_at": packet.get("created_at"),
        "updated_at": packet.get("updated_at"),
        "author": packet.get("author"),
    }
    if include_public:
        payload["public_legal_context"] = packet.get("public_legal_context")
    if include_private:
        payload["private_notes"] = packet.get("private_notes")
    return payload


def finalize_packet(*, packet: Dict[str, Any], finalized_at: str) -> Dict[str, Any]:
    payload = _bundle_payload(packet)
    signer_metadata = {"id": "liability_attestation", "name": "CLAW Liability Attestation"}
    return attestation_service.create_attestation(
        "liability",
        payload,
        signer_metadata,
        finalized_at,
    )
