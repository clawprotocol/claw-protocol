"""Authority-bound durable VS01 signing packet activation (Phase 3C1A)."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from backend.services.frozen_signing_authority import (
    FrozenSigningAuthorityError,
    build_canonical_frozen_signing_authority,
    materially_identical_frozen_authority,
)
from backend.utils.agreement_version_store import AgreementVersionStore
from backend.utils.canon_json import canon_json_bytes, canon_sha256_hex

VS01_SIGNING_PACKET_ACTIVATION_FIELD = "vs01_signing_packet_activation_v1"
VS01_SIGNING_PACKET_ACTIVATION_VERSION = 1
PACKET_STATE_ACTIVE = "active"
_ACTIVATION_NON_MATERIAL_KEYS = frozenset({"activated_at", "packet_revision"})


@dataclass
class Vs01SigningPacketActivationError(ValueError):
    code: str
    status_code: int = 400
    detail: Optional[str] = None

    def __str__(self) -> str:
        return self.code


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _fingerprint_agreement_body(text: str) -> str:
    """Match frontend fingerprintAgreementBody (FNV-1a + length prefix)."""
    corpus = (text or "").strip()
    if not corpus:
        return "empty"
    h = 2166136261
    for char in corpus:
        h ^= ord(char)
        h = (h * 16777619) & 0xFFFFFFFF
    return f"{len(corpus)}:{h:x}"


def _normalized_email(value: Any) -> str:
    return _clean(value).lower()


def activation_binding_material(record: Dict[str, Any]) -> Dict[str, Any]:
    return {key: value for key, value in record.items() if key not in _ACTIVATION_NON_MATERIAL_KEYS}


def activation_material_bytes(record: Dict[str, Any]) -> bytes:
    return canon_json_bytes(activation_binding_material(record))


def compute_packet_revision(record: Dict[str, Any]) -> str:
    """Canonical SHA-256 over complete immutable activation material."""
    return canon_sha256_hex(activation_binding_material(record))


def activation_owner_projection(record: Dict[str, Any]) -> Dict[str, Any]:
    """Owner-visible activation metadata without portable corpus or field payloads."""
    return {
        "v": record.get("v"),
        "packet_state": record.get("packet_state"),
        "document_id": record.get("document_id"),
        "packet_revision": record.get("packet_revision"),
        "activated_at": record.get("activated_at"),
        "accepted_version_id": record.get("accepted_version_id"),
        "accepted_corpus_sha256": record.get("accepted_corpus_sha256"),
        "frozen_authority_material_hash": record.get("frozen_authority_material_hash"),
        "signing_lock": record.get("signing_lock"),
    }


def has_active_signing_packet_activation(draft: Dict[str, Any]) -> bool:
    stored = draft.get(VS01_SIGNING_PACKET_ACTIVATION_FIELD)
    return isinstance(stored, dict) and _clean(stored.get("packet_state")) == PACKET_STATE_ACTIVE


def _validate_portable_seed(
    *,
    agreement_id: str,
    document_id: str,
    portable: Dict[str, Any],
    accepted_corpus_sha256: str,
) -> None:
    if portable.get("v") != VS01_SIGNING_PACKET_ACTIVATION_VERSION:
        raise Vs01SigningPacketActivationError("unsupported_portable_packet_version")
    seed = portable.get("seed")
    if not isinstance(seed, dict) or seed.get("v") != VS01_SIGNING_PACKET_ACTIVATION_VERSION:
        raise Vs01SigningPacketActivationError("portable_seed_required")
    seed_agreement_id = _clean(seed.get("agreementId"))
    seed_document_id = _clean(seed.get("documentId"))
    if seed_agreement_id != _clean(agreement_id):
        raise Vs01SigningPacketActivationError("agreement_id_mismatch", 409)
    if seed_document_id != _clean(document_id):
        raise Vs01SigningPacketActivationError("document_id_mismatch", 409)
    corpus_raw = seed.get("corpusPlain")
    if not isinstance(corpus_raw, str) or not corpus_raw.strip():
        raise Vs01SigningPacketActivationError("portable_corpus_required")
    corpus_sha256 = hashlib.sha256(corpus_raw.encode("utf-8")).hexdigest().lower()
    if corpus_sha256 != _clean(accepted_corpus_sha256).lower():
        raise Vs01SigningPacketActivationError("accepted_corpus_mismatch", 409)
    seed_hash = _clean(seed.get("corpusHash"))
    if seed_hash != _fingerprint_agreement_body(corpus_raw):
        raise Vs01SigningPacketActivationError("portable_corpus_hash_mismatch", 409)


def _signature_roles(portable: Dict[str, Any]) -> List[Dict[str, Any]]:
    roles = portable.get("roles")
    if not isinstance(roles, list) or not roles:
        raise Vs01SigningPacketActivationError("portable_roles_required")
    signature_roles: List[Dict[str, Any]] = []
    for role in roles:
        if not isinstance(role, dict):
            raise Vs01SigningPacketActivationError("portable_role_malformed")
        if role.get("requiresSignature") is False:
            continue
        signature_roles.append(role)
    if not signature_roles:
        raise Vs01SigningPacketActivationError("portable_roles_required")
    return signature_roles


def _validate_portable_execution_against_frozen(
    portable: Dict[str, Any], frozen: Dict[str, Any]
) -> None:
    signers = frozen.get("signers") or []
    if not isinstance(signers, list) or not signers:
        raise Vs01SigningPacketActivationError("frozen_signers_required", 409)
    execution = frozen.get("execution")
    if not isinstance(execution, dict):
        raise Vs01SigningPacketActivationError("execution_order_required", 409)
    expected_order = [_clean(value) for value in (execution.get("signerOrder") or []) if _clean(value)]
    if not expected_order:
        raise Vs01SigningPacketActivationError("execution_signer_order_mismatch", 409)

    signers_by_id = {
        _clean(signer.get("signerRecordId")): signer
        for signer in signers
        if isinstance(signer, dict) and _clean(signer.get("signerRecordId"))
    }
    parties = {
        _clean(party.get("agreementPartyId")): party
        for party in (frozen.get("parties") or [])
        if isinstance(party, dict) and _clean(party.get("agreementPartyId"))
    }

    signature_roles = _signature_roles(portable)
    if len(signature_roles) != len(expected_order):
        raise Vs01SigningPacketActivationError("portable_signer_count_mismatch", 409)

    observed_order: List[str] = []
    seen_refs: set[str] = set()
    for role in signature_roles:
        signer_record_id = _clean(role.get("signerRecordId"))
        if not signer_record_id:
            raise Vs01SigningPacketActivationError("portable_signer_reference_required", 409)
        if signer_record_id in seen_refs:
            raise Vs01SigningPacketActivationError("duplicate_signer_record_id", 409)
        signer = signers_by_id.get(signer_record_id)
        if not isinstance(signer, dict):
            raise Vs01SigningPacketActivationError("unknown_signer_reference", 409, signer_record_id)
        seen_refs.add(signer_record_id)
        observed_order.append(signer_record_id)

        party_id = _clean(role.get("partyId"))
        signer_party_id = _clean(signer.get("agreementPartyId"))
        if not party_id or party_id != signer_party_id:
            raise Vs01SigningPacketActivationError("portable_signer_reference_mismatch", 409)
        if party_id not in parties:
            raise Vs01SigningPacketActivationError("unknown_party_id", 409, party_id)

        role_email = _normalized_email(role.get("signerEmail") or role.get("reviewEmail"))
        signer_email = _normalized_email(signer.get("signerEmail"))
        if not role_email or role_email != signer_email:
            raise Vs01SigningPacketActivationError("portable_signer_reference_mismatch", 409)

        role_name = _clean(role.get("signerName"))
        signer_name = _clean(signer.get("signerName"))
        if role_name and signer_name and role_name.casefold() != signer_name.casefold():
            raise Vs01SigningPacketActivationError("portable_signer_reference_mismatch", 409)

        party = parties[party_id]
        entity_name = _clean(role.get("entityName") or role.get("partyName"))
        legal_name = _clean(party.get("legalEntityName"))
        if entity_name and legal_name.casefold() != entity_name.casefold():
            raise Vs01SigningPacketActivationError("legal_party_order_mismatch", 409)
        try:
            party_index = int(role.get("partyIndex"))
        except (TypeError, ValueError):
            raise Vs01SigningPacketActivationError("portable_role_malformed") from None
        if party_index != party.get("canonicalOrder"):
            raise Vs01SigningPacketActivationError("legal_party_order_mismatch", 409)

    if observed_order != expected_order:
        raise Vs01SigningPacketActivationError("execution_signer_order_mismatch", 409)


def _validate_signing_lock(
    *,
    accepted_version_id: str,
    accepted_corpus_sha256: str,
    signing_lock: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    if not isinstance(signing_lock, dict):
        raise Vs01SigningPacketActivationError("signing_lock_required", 409)
    locked_version_id = _clean(signing_lock.get("locked_version_id"))
    content_sha256 = _clean(signing_lock.get("content_sha256")).lower()
    lock_accepted_sha = _clean(signing_lock.get("accepted_corpus_sha256")).lower()
    if locked_version_id != _clean(accepted_version_id):
        raise Vs01SigningPacketActivationError("signing_lock_version_mismatch", 409)
    if content_sha256 != _clean(accepted_corpus_sha256).lower():
        raise Vs01SigningPacketActivationError("signing_lock_corpus_mismatch", 409)
    if lock_accepted_sha and lock_accepted_sha != _clean(accepted_corpus_sha256).lower():
        raise Vs01SigningPacketActivationError("signing_lock_corpus_mismatch", 409)
    return {
        "locked_version_id": locked_version_id,
        "content_sha256": content_sha256,
        "accepted_corpus_sha256": _clean(accepted_corpus_sha256).lower(),
    }


def _load_validated_frozen_authority(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    version_store: Optional[AgreementVersionStore] = None,
) -> Dict[str, Any]:
    stored = draft.get("frozen_signing_authority_v1")
    if not isinstance(stored, dict):
        raise Vs01SigningPacketActivationError("frozen_signing_authority_not_found", 404)
    try:
        canonical = build_canonical_frozen_signing_authority(
            agreement_id=agreement_id,
            candidate=stored,
            frozen_at=_clean(stored.get("frozenAt")),
            version_store=version_store,
        )
    except FrozenSigningAuthorityError as exc:
        raise Vs01SigningPacketActivationError(exc.code, exc.status_code, exc.detail) from exc
    if not materially_identical_frozen_authority(stored, canonical):
        raise Vs01SigningPacketActivationError("stored_frozen_signing_authority_invalid", 409)
    return stored


def build_canonical_signing_packet_activation(
    *,
    agreement_id: str,
    document_id: str,
    portable_packet: Dict[str, Any],
    draft: Dict[str, Any],
    activated_at: str,
    version_store: Optional[AgreementVersionStore] = None,
    signing_lock: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    aid = _clean(agreement_id)
    did = _clean(document_id)
    if not aid:
        raise Vs01SigningPacketActivationError("real_agreement_id_required")
    if not did:
        raise Vs01SigningPacketActivationError("document_id_required")
    if not isinstance(portable_packet, dict):
        raise Vs01SigningPacketActivationError("portable_packet_required")

    frozen = _load_validated_frozen_authority(
        agreement_id=aid,
        draft=draft,
        version_store=version_store,
    )
    accepted_version_id = _clean(frozen.get("acceptedVersionId"))
    accepted_corpus_sha256 = _clean(frozen.get("acceptedCorpusSha256")).lower()
    if not accepted_version_id.startswith("av_"):
        raise Vs01SigningPacketActivationError("accepted_version_required", 409)

    store = version_store or AgreementVersionStore()
    current = store.get_accepted_version(agreement_id=aid)
    if not current or _clean(current.get("version_id")) != accepted_version_id:
        raise Vs01SigningPacketActivationError("accepted_version_stale", 409)
    if _clean(current.get("body_sha256")).lower() != accepted_corpus_sha256:
        raise Vs01SigningPacketActivationError("accepted_corpus_mismatch", 409)

    lock = _validate_signing_lock(
        accepted_version_id=accepted_version_id,
        accepted_corpus_sha256=accepted_corpus_sha256,
        signing_lock=signing_lock,
    )
    _validate_portable_seed(
        agreement_id=aid,
        document_id=did,
        portable=portable_packet,
        accepted_corpus_sha256=accepted_corpus_sha256,
    )
    _validate_portable_execution_against_frozen(portable_packet, frozen)

    frozen_material_hash = canon_sha256_hex(
        {key: value for key, value in frozen.items() if key != "frozenAt"}
    )
    binding = {
        "v": VS01_SIGNING_PACKET_ACTIVATION_VERSION,
        "packet_state": PACKET_STATE_ACTIVE,
        "document_id": did,
        "accepted_version_id": accepted_version_id,
        "accepted_corpus_sha256": accepted_corpus_sha256,
        "frozen_authority_material_hash": frozen_material_hash,
        "signing_lock": lock,
        "portable": portable_packet,
    }
    packet_revision = compute_packet_revision(binding)
    return {
        **binding,
        "packet_revision": packet_revision,
        "activated_at": activated_at,
    }


def materially_identical_activation(existing: Dict[str, Any], canonical: Dict[str, Any]) -> bool:
    return activation_material_bytes(existing) == activation_material_bytes(canonical)
