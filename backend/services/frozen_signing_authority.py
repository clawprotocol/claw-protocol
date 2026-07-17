"""Durable immutable signing authority bound to a backend accepted version."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from backend.utils.canon_json import canon_sha256_hex
from backend.utils.agreement_version_store import AgreementVersionStore

FROZEN_SIGNING_AUTHORITY_VERSION = 1


@dataclass(frozen=True)
class FrozenSigningAuthorityError(ValueError):
    code: str
    status_code: int = 400
    detail: Optional[str] = None

    def __str__(self) -> str:
        return self.code


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _candidate_parties(raw: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw, list):
        raise FrozenSigningAuthorityError("legal_party_order_mismatch")
    parties: List[Dict[str, Any]] = []
    for index, party in enumerate(raw):
        if not isinstance(party, dict):
            raise FrozenSigningAuthorityError("legal_party_order_mismatch")
        parties.append(
            {
                "agreementPartyId": _clean(party.get("agreementPartyId")),
                "legalEntityName": _clean(party.get("legalEntityName")),
                "agreementRole": _clean(party.get("agreementRole")) or "party",
                "canonicalOrder": party.get("canonicalOrder"),
            }
        )
        if parties[-1]["canonicalOrder"] != index:
            raise FrozenSigningAuthorityError("legal_party_order_mismatch")
    return parties


def _accepted_parties(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw = row.get("parties")
    if not isinstance(raw, list) or len(raw) < 2:
        raise FrozenSigningAuthorityError("accepted_legal_parties_required", 409)
    parties: List[Dict[str, Any]] = []
    for index, party in enumerate(raw):
        if not isinstance(party, dict):
            raise FrozenSigningAuthorityError("accepted_legal_parties_required", 409)
        party_id = _clean(party.get("party_id"))
        legal_name = _clean(party.get("legal_name"))
        if not party_id or not legal_name or party.get("ordinal") != index:
            raise FrozenSigningAuthorityError("accepted_legal_parties_required", 409)
        parties.append(
            {
                "agreementPartyId": party_id,
                "legalEntityName": legal_name,
                "agreementRole": _clean(party.get("role")) or "party",
                "canonicalOrder": index,
            }
        )
    return parties


def _validated_signers(raw: Any, parties: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not isinstance(raw, list) or not raw:
        raise FrozenSigningAuthorityError("finalized_signers_required")
    party_ids = {party["agreementPartyId"] for party in parties}
    seen_signer_ids: set[str] = set()
    signers: List[Dict[str, Any]] = []
    for signer in raw:
        if not isinstance(signer, dict):
            raise FrozenSigningAuthorityError("malformed_signer")
        signer_id = _clean(signer.get("signerRecordId"))
        party_id = _clean(signer.get("agreementPartyId"))
        signer_name = _clean(signer.get("signerName"))
        signer_email = _clean(signer.get("signerEmail"))
        signing_order = signer.get("signingOrder")
        if not signer_id or signer_id in seen_signer_ids:
            raise FrozenSigningAuthorityError("duplicate_signer_record_id")
        if party_id not in party_ids:
            raise FrozenSigningAuthorityError("unknown_party_id", detail=party_id)
        if not signer_name or "@" not in signer_email:
            raise FrozenSigningAuthorityError("finalized_signer_identity_required", detail=signer_id)
        if not isinstance(signing_order, int) or isinstance(signing_order, bool):
            raise FrozenSigningAuthorityError("execution_signer_order_mismatch")
        seen_signer_ids.add(signer_id)
        signers.append(
            {
                "signerRecordId": signer_id,
                "agreementPartyId": party_id,
                "signerName": signer_name,
                "signerTitle": _clean(signer.get("signerTitle")) or None,
                "signerEmail": signer_email,
                "signingOrder": signing_order,
            }
        )
    orders = sorted(signer["signingOrder"] for signer in signers)
    if orders != list(range(len(signers))):
        raise FrozenSigningAuthorityError("execution_signer_order_mismatch")
    return signers


def build_canonical_frozen_signing_authority(
    *,
    agreement_id: str,
    candidate: Dict[str, Any],
    frozen_at: str,
    version_store: Optional[AgreementVersionStore] = None,
) -> Dict[str, Any]:
    if not _clean(agreement_id):
        raise FrozenSigningAuthorityError("real_agreement_id_required")
    if not isinstance(candidate, dict) or candidate.get("version") != FROZEN_SIGNING_AUTHORITY_VERSION:
        raise FrozenSigningAuthorityError("unsupported_frozen_signing_authority_version")
    candidate_agreement_id = _clean(candidate.get("agreementId"))
    if not candidate_agreement_id:
        raise FrozenSigningAuthorityError("real_agreement_id_required")
    if candidate_agreement_id != _clean(agreement_id):
        raise FrozenSigningAuthorityError("agreement_id_mismatch", 409)

    accepted_version_id = _clean(candidate.get("acceptedVersionId"))
    if not accepted_version_id.startswith("av_"):
        raise FrozenSigningAuthorityError("accepted_version_required", 409)
    store = version_store or AgreementVersionStore()
    try:
        row = store.get_version_by_id(version_id=accepted_version_id)
    except KeyError as exc:
        raise FrozenSigningAuthorityError("accepted_version_not_found") from exc
    if _clean(row.get("agreement_id")) != _clean(agreement_id):
        raise FrozenSigningAuthorityError("accepted_version_agreement_mismatch", 409)
    if _clean(row.get("authority_state")) != "accepted":
        raise FrozenSigningAuthorityError("accepted_version_not_final", 409)
    current = store.get_accepted_version(agreement_id=agreement_id)
    if not current or _clean(current.get("version_id")) != accepted_version_id:
        raise FrozenSigningAuthorityError("accepted_version_stale", 409)

    accepted_hash = _clean(row.get("body_sha256")).lower()
    if _clean(candidate.get("acceptedCorpusSha256")).lower() != accepted_hash:
        raise FrozenSigningAuthorityError("accepted_corpus_mismatch", 409)

    accepted_parties = _accepted_parties(row)
    if _candidate_parties(candidate.get("parties")) != accepted_parties:
        raise FrozenSigningAuthorityError("legal_party_order_mismatch", 409)
    signers = _validated_signers(candidate.get("signers"), accepted_parties)

    execution = candidate.get("execution")
    if not isinstance(execution, dict):
        raise FrozenSigningAuthorityError("execution_order_required")
    party_order = [party["agreementPartyId"] for party in accepted_parties]
    if execution.get("partyOrder") != party_order:
        raise FrozenSigningAuthorityError("execution_party_order_mismatch")
    expected_party_hash = canon_sha256_hex(party_order)
    if _clean(execution.get("executionPartyHash")).lower() != expected_party_hash:
        raise FrozenSigningAuthorityError("execution_party_hash_mismatch")
    expected_signer_order = [
        signer["signerRecordId"]
        for signer in sorted(signers, key=lambda signer: signer["signingOrder"])
    ]
    if execution.get("signerOrder") != expected_signer_order:
        raise FrozenSigningAuthorityError("execution_signer_order_mismatch")

    return {
        "version": FROZEN_SIGNING_AUTHORITY_VERSION,
        "agreementId": _clean(agreement_id),
        "acceptedVersionId": accepted_version_id,
        "acceptedCorpusSha256": accepted_hash,
        "frozenAt": frozen_at,
        "parties": accepted_parties,
        "signers": signers,
        "execution": {
            "partyOrder": party_order,
            "signerOrder": expected_signer_order,
            "executionPartyHash": expected_party_hash,
        },
    }


def materially_identical_frozen_authority(
    existing: Dict[str, Any], canonical: Dict[str, Any]
) -> bool:
    def material(record: Dict[str, Any]) -> Dict[str, Any]:
        return {key: value for key, value in record.items() if key != "frozenAt"}

    return canon_sha256_hex(material(existing)) == canon_sha256_hex(material(canonical))
