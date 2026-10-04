"""Map legacy generated signing IDs onto persisted durable party UUIDs.

The accepted canonical corpus is the signing text. A generated-to-durable alias
is computed for the prepared execution representation and is not written back
onto the agreement.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from backend.agreements.party_identity_persist import (
    accepted_human_signer_name,
    normalize_legal_name,
)

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.I,
)
_GENERATED_PARTY_ID_RE = re.compile(r"^party_\d+$", re.I)
_GENERATED_HASH_PARTY_ID_RE = re.compile(r"^party_[0-9a-f]+:[0-9a-f]+$", re.I)


class SigningIdentityAuthorityError(Exception):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


@dataclass
class PreparedExecutionParty:
    party_id: str
    legal_name: str
    role: str
    order: int
    signer_name: str
    signer_title: str
    signer_email: str
    legacy_party_id: str


@dataclass
class PreparedExecutionAuthority:
    corpus: str
    digest: str
    length: int
    corpus_source: str
    parties: List[PreparedExecutionParty]
    alias: Dict[str, str] = field(default_factory=dict)

    @property
    def participant_ids(self) -> List[str]:
        return [party.party_id for party in self.parties]


def is_durable_party_uuid(value: str) -> bool:
    return bool(_UUID_RE.match(str(value or "").strip()))


def is_generated_legacy_party_id(value: str) -> bool:
    token = str(value or "").strip()
    return bool(_GENERATED_PARTY_ID_RE.match(token) or _GENERATED_HASH_PARTY_ID_RE.match(token))


def _role_key(role: str) -> str:
    return " ".join(str(role or "").split()).strip().lower()


def _clean(value: Any) -> str:
    return str(value or "").strip()


def frozen_has_generated_party_id(frozen: Any) -> bool:
    if not isinstance(frozen, dict):
        return False
    parties = frozen.get("parties")
    if not isinstance(parties, list):
        return False
    for party in parties:
        if not isinstance(party, dict):
            continue
        pid = _clean(party.get("agreementPartyId") or party.get("agreement_party_id"))
        if is_generated_legacy_party_id(pid):
            return True
    return False


def stale_frozen_corpus_may_be_ignored(
    *,
    validation_code: Optional[str],
    portable_corpus_hash: str,
    accepted_digest: str,
) -> bool:
    """Accepted digest outranks a stale frozen hash. Other validation failures stay closed."""
    if validation_code != "corpus_hash_mismatch":
        return False
    accepted = _clean(accepted_digest).lower()
    portable = _clean(portable_corpus_hash).lower()
    return bool(accepted) and portable == accepted


def signing_corpus_authority(
    *,
    accepted_corpus: str,
    accepted_digest: str,
    frozen_digest: str = "",
    prefer_frozen: bool = False,
) -> Dict[str, str]:
    from backend.services.accepted_review_snapshot import sha256_hex_text

    accepted = str(accepted_corpus or "")
    digest = _clean(accepted_digest).lower()
    frozen = _clean(frozen_digest).lower()
    if prefer_frozen and frozen and digest and frozen != digest:
        raise SigningIdentityAuthorityError("frozen_corpus_mismatch")
    if not accepted or sha256_hex_text(accepted) != digest:
        raise SigningIdentityAuthorityError("accepted_snapshot_invalid")
    return {"corpus": accepted, "digest": digest, "source": "accepted_canonical"}


def prepare_durable_execution_authority(draft: Dict[str, Any]) -> PreparedExecutionAuthority:
    from backend.services.accepted_review_snapshot import (
        get_accepted_snapshot_record,
        verify_snapshot_integrity,
    )

    if not isinstance(draft, dict):
        raise SigningIdentityAuthorityError("accepted_snapshot_missing")
    accepted = get_accepted_snapshot_record(draft)
    if not isinstance(accepted, dict):
        raise SigningIdentityAuthorityError("accepted_snapshot_missing")
    ok, _err = verify_snapshot_integrity(accepted)
    if not ok:
        raise SigningIdentityAuthorityError("accepted_snapshot_invalid")
    corpus = str(accepted.get("corpusPlain") or "")
    digest = _clean(accepted.get("corpusSha256")).lower()
    length = int(accepted.get("corpusLength") or 0)

    frozen = draft.get("frozen_signing_authority_v1")
    if not isinstance(frozen, dict):
        raise SigningIdentityAuthorityError("accepted_snapshot_missing")
    frozen_parties = frozen.get("parties")
    persisted = draft.get("parties")
    if not isinstance(frozen_parties, list) or not isinstance(persisted, list):
        raise SigningIdentityAuthorityError("party_count_mismatch")
    persisted_rows = [row for row in persisted if isinstance(row, dict)]
    frozen_rows = [row for row in frozen_parties if isinstance(row, dict)]
    if len(frozen_rows) != len(persisted_rows):
        raise SigningIdentityAuthorityError("party_count_mismatch")
    if len(persisted_rows) < 2 or len(persisted_rows) > 4:
        raise SigningIdentityAuthorityError("party_count_unsupported")
    if any(not is_durable_party_uuid(_clean(row.get("id"))) for row in persisted_rows):
        raise SigningIdentityAuthorityError("durable_party_id_required")

    persisted_keys = [normalize_legal_name(_clean(row.get("name"))) for row in persisted_rows]
    frozen_keys = [
        normalize_legal_name(_clean(row.get("legalEntityName") or row.get("legal_entity_name")))
        for row in frozen_rows
    ]
    if any(not key for key in persisted_keys) or any(not key for key in frozen_keys):
        raise SigningIdentityAuthorityError("missing_legal_name")
    if len(set(persisted_keys)) != len(persisted_keys) or len(set(frozen_keys)) != len(frozen_keys):
        raise SigningIdentityAuthorityError("ambiguous_legal_name")

    used: set[str] = set()
    alias: Dict[str, str] = {}
    bound: Dict[str, PreparedExecutionParty] = {}
    for frozen_party in frozen_rows:
        frozen_id = _clean(frozen_party.get("agreementPartyId") or frozen_party.get("agreement_party_id"))
        explicit = next(
            (row for row in persisted_rows if _clean(row.get("id")) == frozen_id and is_durable_party_uuid(frozen_id)),
            None,
        )
        if explicit is not None:
            if normalize_legal_name(_clean(explicit.get("name"))) != normalize_legal_name(
                _clean(frozen_party.get("legalEntityName") or frozen_party.get("legal_entity_name"))
            ):
                raise SigningIdentityAuthorityError("explicit_mapping_name_conflict")
            matched = explicit
        elif is_durable_party_uuid(frozen_id) or not is_generated_legacy_party_id(frozen_id):
            raise SigningIdentityAuthorityError("mixed_party_identity")
        else:
            key = normalize_legal_name(
                _clean(frozen_party.get("legalEntityName") or frozen_party.get("legal_entity_name"))
            )
            hits = [row for row in persisted_rows if normalize_legal_name(_clean(row.get("name"))) == key]
            if len(hits) != 1:
                raise SigningIdentityAuthorityError("ambiguous_legal_name")
            matched = hits[0]
        durable_id = _clean(matched.get("id"))
        if not durable_id or durable_id in used:
            raise SigningIdentityAuthorityError("ambiguous_legal_name")
        used.add(durable_id)
        persisted_role = _role_key(_clean(matched.get("role")))
        frozen_role = _role_key(_clean(frozen_party.get("agreementRole") or frozen_party.get("agreement_role")))
        if persisted_role and frozen_role and persisted_role != frozen_role:
            raise SigningIdentityAuthorityError("role_conflict")
        alias[frozen_id] = durable_id
        bound[durable_id] = PreparedExecutionParty(
            party_id=durable_id,
            legal_name=_clean(matched.get("name")),
            role=_clean(matched.get("role")),
            order=next(i for i, row in enumerate(persisted_rows) if _clean(row.get("id")) == durable_id),
            signer_name="",
            signer_title="",
            signer_email="",
            legacy_party_id=frozen_id,
        )

    if len(used) != len(persisted_rows):
        raise SigningIdentityAuthorityError("party_count_mismatch")

    signers = frozen.get("signers") if isinstance(frozen.get("signers"), list) else []
    seen: set[str] = set()
    for signer in signers:
        if not isinstance(signer, dict):
            raise SigningIdentityAuthorityError("missing_signer_record")
        source_id = _clean(signer.get("agreementPartyId") or signer.get("agreement_party_id"))
        durable_id = alias.get(source_id, "")
        if not durable_id:
            raise SigningIdentityAuthorityError("unknown_generated_party")
        if durable_id in seen:
            raise SigningIdentityAuthorityError("multiple_signers_for_party")
        seen.add(durable_id)
        row = bound[durable_id]
        human = accepted_human_signer_name(
            _clean(signer.get("signerName") or signer.get("signer_name")),
            row.legal_name,
        )
        if not human:
            raise SigningIdentityAuthorityError("human_signer_name_missing")
        row.signer_name = human
        row.signer_title = _clean(signer.get("signerTitle") or signer.get("signer_title"))
        row.signer_email = _clean(signer.get("signerEmail") or signer.get("signer_email"))
    if len(seen) != len(persisted_rows):
        raise SigningIdentityAuthorityError("missing_signer_record")

    parties = []
    for index, row in enumerate(persisted_rows):
        prepared = bound.get(_clean(row.get("id")))
        if prepared is None:
            raise SigningIdentityAuthorityError("party_count_mismatch")
        prepared.order = index
        parties.append(prepared)

    return PreparedExecutionAuthority(
        corpus=corpus,
        digest=digest,
        length=length,
        corpus_source="accepted_canonical",
        parties=parties,
        alias=alias,
    )


def local_signing_link_targets(prepared: PreparedExecutionAuthority) -> List[Dict[str, str]]:
    """In-memory link descriptors. This does not send mail or persist an alias."""
    return [
        {
            "participant_id": party.party_id,
            "signer_name": party.signer_name,
            "signer_email": party.signer_email,
            "role": party.role,
            "order": str(party.order),
        }
        for party in prepared.parties
    ]


def durable_party_id_for_legacy(draft: Dict[str, Any], party_id: str) -> str:
    token = _clean(party_id)
    if not is_generated_legacy_party_id(token):
        return token
    if not frozen_has_generated_party_id(draft.get("frozen_signing_authority_v1")):
        return ""
    prepared = prepare_durable_execution_authority(draft)
    return prepared.alias.get(token, "")


def rekey_portable_legacy_party_ids(draft: Dict[str, Any], portable: Any) -> Any:
    """Rewrite generated role ids in a packet copy. Do not store the alias."""
    if not isinstance(portable, dict):
        return portable
    roles = portable.get("roles")
    if not isinstance(roles, list):
        return portable
    generated = False
    for role in roles:
        if not isinstance(role, dict):
            continue
        for key in ("partyId", "vs01CounterpartyId"):
            if is_generated_legacy_party_id(_clean(role.get(key))):
                generated = True
                break
    if not generated:
        return portable
    prepared = prepare_durable_execution_authority(draft)
    next_roles: List[Any] = []
    for role in roles:
        if not isinstance(role, dict):
            next_roles.append(role)
            continue
        updated = dict(role)
        for key in ("partyId", "vs01CounterpartyId"):
            value = _clean(updated.get(key))
            if not is_generated_legacy_party_id(value):
                continue
            mapped = prepared.alias.get(value, "")
            if not mapped:
                raise SigningIdentityAuthorityError("unknown_generated_party")
            updated[key] = mapped
        signer = next(
            (party for party in prepared.parties if party.party_id == _clean(updated.get("partyId"))),
            None,
        )
        if signer is not None:
            if not _clean(updated.get("signerName")):
                updated["signerName"] = signer.signer_name
            if not _clean(updated.get("signerEmail")):
                updated["signerEmail"] = signer.signer_email
        next_roles.append(updated)
    return {**portable, "roles": next_roles}


def portable_from_prepared_authority(draft: Dict[str, Any], prepared: PreparedExecutionAuthority) -> Dict[str, Any]:
    roles = [
        {
            "roleId": f"accepted_party_{party.order}",
            "partyId": party.party_id,
            "vs01CounterpartyId": party.party_id,
            "partyIndex": party.order,
            "entityName": party.legal_name,
            "signerName": party.signer_name,
            "signerEmail": party.signer_email,
            "requiresSignature": True,
        }
        for party in prepared.parties
    ]
    return {
        "v": 1,
        "seed": {
            "v": 1,
            "agreementId": _clean(draft.get("id")),
            "corpusPlain": prepared.corpus,
            "corpusHash": prepared.digest,
            "acceptedSnapshotId": _clean(
                (draft.get("accepted_review_snapshot_v1") or {}).get("snapshotId")
                if isinstance(draft.get("accepted_review_snapshot_v1"), dict)
                else ""
            ),
        },
        "roles": roles,
        "fields": [],
    }
