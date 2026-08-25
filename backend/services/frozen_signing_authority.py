"""Phase 3B — durable frozen signing authority on agreement drafts."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

FROZEN_SIGNING_AUTHORITY_VERSION = 1
SUPPORTED_VERSIONS = {1}

PACKET_STATE_DRAFT = "draft"
PACKET_STATE_ACTIVE = "active"
PACKET_STATE_PARTIALLY_SIGNED = "partially_signed"
PACKET_STATE_COMPLETED = "completed"
PACKET_STATE_CANCELLED = "cancelled"
PACKET_STATE_SUPERSEDED = "superseded"

ACTIVE_PACKET_STATES = {PACKET_STATE_ACTIVE, PACKET_STATE_PARTIALLY_SIGNED}


def _clean_str(value: Any) -> str:
    return str(value or "").strip()


def validate_frozen_signing_authority_snapshot(
    snapshot: Dict[str, Any],
    *,
    expected_agreement_id: Optional[str] = None,
    expected_corpus_hash: Optional[str] = None,
) -> Tuple[bool, Optional[str], Optional[str]]:
    """Return (ok, error_code, detail)."""
    if not isinstance(snapshot, dict):
        return False, "malformed_snapshot", "not_object"
    version = snapshot.get("version")
    if version not in SUPPORTED_VERSIONS:
        return False, "unsupported_version", str(version)
    agreement_id = _clean_str(snapshot.get("agreementId") or snapshot.get("agreement_id"))
    if expected_agreement_id and agreement_id != _clean_str(expected_agreement_id):
        return False, "agreement_id_mismatch", agreement_id
    parties = snapshot.get("parties")
    if not isinstance(parties, list) or len(parties) < 1:
        return False, "empty_parties", None
    party_ids = set()
    for party in parties:
        if not isinstance(party, dict):
            return False, "malformed_party", None
        pid = _clean_str(party.get("agreementPartyId") or party.get("agreement_party_id"))
        if not pid:
            return False, "missing_party_id", None
        if pid in party_ids:
            return False, "duplicate_party_id", pid
        party_ids.add(pid)
    signers = snapshot.get("signers")
    if not isinstance(signers, list):
        return False, "malformed_signers", None
    signer_ids = set()
    for signer in signers:
        if not isinstance(signer, dict):
            return False, "malformed_signer", None
        sid = _clean_str(signer.get("signerRecordId") or signer.get("signer_record_id"))
        spid = _clean_str(signer.get("agreementPartyId") or signer.get("agreement_party_id"))
        if sid in signer_ids:
            return False, "duplicate_signer_record_id", sid
        signer_ids.add(sid)
        if spid and spid not in party_ids:
            return False, "unknown_party_id", spid
        requires = bool(signer.get("requiresSignature", signer.get("requires_signature", False)))
        email = _clean_str(signer.get("signerEmail") or signer.get("signer_email"))
        if requires and "@" not in email:
            return False, "missing_required_signer_email", sid
    frozen_hash = _clean_str(snapshot.get("frozenCorpusHash") or snapshot.get("frozen_corpus_hash"))
    if expected_corpus_hash and frozen_hash != _clean_str(expected_corpus_hash):
        return False, "corpus_hash_mismatch", frozen_hash
    execution = snapshot.get("execution")
    if isinstance(execution, dict):
        party_order = execution.get("partyOrder") or execution.get("party_order") or []
        if isinstance(party_order, list) and party_order:
            sorted_parties = sorted(
                [p for p in parties if isinstance(p, dict)],
                key=lambda p: int(p.get("canonicalOrder", p.get("canonical_order", 0))),
            )
            canonical_order = [
                _clean_str(p.get("agreementPartyId") or p.get("agreement_party_id")) for p in sorted_parties
            ]
            normalized = [_clean_str(x) for x in party_order if _clean_str(x)]
            if normalized != canonical_order:
                return False, "execution_party_mismatch", None
    return True, None, None


def extract_required_signing_actions(snapshot: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Build durable required signing actions from snapshot signers + optional explicit list."""
    explicit = snapshot.get("requiredActions") or snapshot.get("required_actions")
    if isinstance(explicit, list) and explicit:
        return [a for a in explicit if isinstance(a, dict)]
    actions: List[Dict[str, Any]] = []
    signers = snapshot.get("signers") if isinstance(snapshot.get("signers"), list) else []
    for signer in signers:
        if not isinstance(signer, dict):
            continue
        if not bool(signer.get("requiresSignature", signer.get("requires_signature", False))):
            continue
        signer_id = _clean_str(signer.get("signerRecordId") or signer.get("signer_record_id"))
        party_id = _clean_str(signer.get("agreementPartyId") or signer.get("agreement_party_id"))
        actions.append(
            {
                "actionId": f"signature:{signer_id}",
                "signerRecordId": signer_id,
                "agreementPartyId": party_id,
                "type": "signature",
                "fieldId": f"signature:{signer_id}",
                "required": True,
            }
        )
        if bool(signer.get("requiresInitials", signer.get("requires_initials", False))):
            actions.append(
                {
                    "actionId": f"initials:{signer_id}",
                    "signerRecordId": signer_id,
                    "agreementPartyId": party_id,
                    "type": "initials",
                    "fieldId": f"initials:{signer_id}",
                    "required": True,
                }
            )
    return actions


def resolve_signing_status_counts(snapshot: Dict[str, Any]) -> Dict[str, int]:
    parties = snapshot.get("parties") if isinstance(snapshot.get("parties"), list) else []
    signers = snapshot.get("signers") if isinstance(snapshot.get("signers"), list) else []
    recipients = snapshot.get("recipients") if isinstance(snapshot.get("recipients"), list) else []
    required_signers = [
        s
        for s in signers
        if isinstance(s, dict) and bool(s.get("requiresSignature", s.get("requires_signature", False)))
    ]
    invite_recipients = [
        r
        for r in recipients
        if isinstance(r, dict) and _clean_str(r.get("recipientType") or r.get("recipient_type")) == "signer"
    ]
    actions = extract_required_signing_actions(snapshot)
    return {
        "legal_party_count": len(parties),
        "signer_count": len(signers),
        "required_signer_count": len(required_signers),
        "invitation_count": len(invite_recipients),
        "required_action_count": len([a for a in actions if a.get("required")]),
    }


def build_recipient_signing_projection(
    snapshot: Dict[str, Any],
    *,
    signer_record_id: Optional[str] = None,
    agreement_party_id: Optional[str] = None,
    participant_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Minimum recipient-safe projection — one signer/recipient only."""
    signers = snapshot.get("signers") if isinstance(snapshot.get("signers"), list) else []
    parties = snapshot.get("parties") if isinstance(snapshot.get("parties"), list) else []
    recipients = snapshot.get("recipients") if isinstance(snapshot.get("recipients"), list) else []
    target_signer: Optional[Dict[str, Any]] = None
    sid = _clean_str(signer_record_id)
    pid = _clean_str(agreement_party_id or participant_id)
    if sid:
        target_signer = next((s for s in signers if isinstance(s, dict) and _clean_str(s.get("signerRecordId") or s.get("signer_record_id")) == sid), None)
    if not target_signer and pid:
        target_signer = next(
            (s for s in signers if isinstance(s, dict) and _clean_str(s.get("agreementPartyId") or s.get("agreement_party_id")) == pid),
            None,
        )
    if not target_signer:
        return None
    signer_id = _clean_str(target_signer.get("signerRecordId") or target_signer.get("signer_record_id"))
    party_id = _clean_str(target_signer.get("agreementPartyId") or target_signer.get("agreement_party_id"))
    party = next(
        (p for p in parties if isinstance(p, dict) and _clean_str(p.get("agreementPartyId") or p.get("agreement_party_id")) == party_id),
        None,
    )
    recipient = next(
        (
            r
            for r in recipients
            if isinstance(r, dict)
            and _clean_str(r.get("signerRecordId") or r.get("signer_record_id")) == signer_id
        ),
        None,
    )
    actions = [
        a
        for a in extract_required_signing_actions(snapshot)
        if _clean_str(a.get("signerRecordId")) == signer_id
    ]
    return {
        "version": 1,
        "agreementId": _clean_str(snapshot.get("agreementId") or snapshot.get("agreement_id")),
        "frozenCorpusHash": _clean_str(snapshot.get("frozenCorpusHash") or snapshot.get("frozen_corpus_hash")),
        "recipientRecordId": _clean_str(recipient.get("recipientRecordId") or recipient.get("recipient_record_id")) if isinstance(recipient, dict) else "",
        "signerRecordId": signer_id,
        "agreementPartyId": party_id,
        "legalEntityName": _clean_str(party.get("legalEntityName") or party.get("legal_entity_name")) if isinstance(party, dict) else "",
        "signerName": _clean_str(target_signer.get("signerName") or target_signer.get("signer_name")),
        "signerTitle": _clean_str(target_signer.get("signerTitle") or target_signer.get("signer_title")),
        "requiredActions": actions,
        "packetState": _clean_str(snapshot.get("packetState") or snapshot.get("packet_state") or PACKET_STATE_ACTIVE),
    }


def corpus_hash_from_portable(portable: Dict[str, Any]) -> str:
    seed = portable.get("seed") if isinstance(portable.get("seed"), dict) else {}
    return _clean_str(seed.get("corpusHash") or seed.get("corpus_hash"))


def synthesize_frozen_from_portable(
    *,
    agreement_id: str,
    portable: Dict[str, Any],
    packet_revision: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Build a minimum frozen snapshot from an existing ceremony portable packet."""
    if not isinstance(portable, dict):
        return None
    roles = portable.get("roles") if isinstance(portable.get("roles"), list) else []
    parties: List[Dict[str, Any]] = []
    signers: List[Dict[str, Any]] = []
    seen_parties: set[str] = set()
    for idx, role in enumerate(roles):
        if not isinstance(role, dict):
            continue
        party_id = _clean_str(
            role.get("partyId") or role.get("party_id") or role.get("vs01CounterpartyId")
        )
        if not party_id or party_id in seen_parties:
            continue
        seen_parties.add(party_id)
        try:
            order = int(role.get("partyIndex") if role.get("partyIndex") is not None else idx)
        except (TypeError, ValueError):
            order = idx
        parties.append(
            {
                "agreementPartyId": party_id,
                "legalEntityName": _clean_str(
                    role.get("entityName") or role.get("entity_name") or role.get("partyName")
                ),
                "canonicalOrder": order,
            }
        )
        email = _clean_str(role.get("signerEmail") or role.get("reviewEmail") or role.get("signer_email"))
        if "@" not in email:
            email = f"signer{order}@invalid.example"
        requires = role.get("requiresSignature")
        if requires is None:
            requires = role.get("requires_signature")
        signers.append(
            {
                "signerRecordId": _clean_str(role.get("roleId") or role.get("role_id"))
                or f"signer:{party_id}:{order}",
                "agreementPartyId": party_id,
                "signerEmail": email,
                "signerName": _clean_str(role.get("signerName") or role.get("signer_name")),
                "signingOrder": order,
                "requiresSignature": False if requires is False else True,
                "requiresInitials": False,
            }
        )
    if len(parties) < 1 or len(signers) < 1:
        return None
    corpus_hash = corpus_hash_from_portable(portable)
    snapshot = {
        "version": FROZEN_SIGNING_AUTHORITY_VERSION,
        "agreementId": _clean_str(agreement_id),
        "frozenCorpusHash": corpus_hash,
        "frozenAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "parties": parties,
        "signers": signers,
        "recipients": [],
        "execution": {
            "partyOrder": [p["agreementPartyId"] for p in parties],
            "signerOrder": [s["signerRecordId"] for s in signers],
        },
        "packetState": PACKET_STATE_ACTIVE,
        "activePacketRevision": _clean_str(packet_revision),
        "requiredActions": [],
    }
    snapshot["requiredActions"] = extract_required_signing_actions(snapshot)
    ok, _, _ = validate_frozen_signing_authority_snapshot(
        snapshot,
        expected_agreement_id=agreement_id,
        expected_corpus_hash=corpus_hash or None,
    )
    return snapshot if ok else None


def normalize_stored_frozen_authority(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    ok, _, _ = validate_frozen_signing_authority_snapshot(raw)
    if not ok:
        return None
    return raw
