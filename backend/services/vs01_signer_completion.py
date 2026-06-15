"""Persist VS01 signer completion to agreement audit + optional portable packet corpus."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple


def required_vs01_signer_role_ids(draft: Dict[str, Any]) -> Set[str]:
    stored = draft.get("vs01_signing_packet_v1")
    if not isinstance(stored, dict):
        return set()
    portable = stored.get("portable")
    if not isinstance(portable, dict):
        return set()
    roles = portable.get("roles")
    if not isinstance(roles, list):
        return set()
    out: Set[str] = set()
    for role in roles:
        if not isinstance(role, dict):
            continue
        rid = str(role.get("roleId") or "").strip()
        if not rid:
            continue
        if role.get("requiresSignature", True) is False:
            continue
        out.add(rid)
    return out


def completed_vs01_signer_role_ids(audit: Any) -> Set[str]:
    out: Set[str] = set()
    for event in audit or []:
        if not isinstance(event, dict):
            continue
        if str(event.get("event_type") or "") != "signature_completed":
            continue
        val = event.get("value")
        if not isinstance(val, dict):
            continue
        rid = str(val.get("signer_role_id") or "").strip()
        if rid:
            out.add(rid)
    return out


def signature_completed_participant_ids(audit: Any) -> Set[str]:
    out: Set[str] = set()
    for event in audit or []:
        if not isinstance(event, dict):
            continue
        if str(event.get("event_type") or "") != "signature_completed":
            continue
        val = event.get("value")
        if not isinstance(val, dict):
            continue
        pid = str(val.get("participant_id") or "").strip()
        if pid:
            out.add(pid)
    return out


def signer_role_already_completed(audit: Any, signer_role_id: str) -> bool:
    rid = (signer_role_id or "").strip()
    if not rid:
        return False
    return rid in completed_vs01_signer_role_ids(audit)


def all_signers_signed_from_audit(draft: Dict[str, Any], audit: List[Any]) -> bool:
    parties = draft.get("parties") or []
    signers = [p for p in parties if str((p or {}).get("role") or "").strip().lower() == "signer"]
    done = signature_completed_participant_ids(audit)
    ids = [str((p or {}).get("id") or "").strip() for p in signers]
    if ids and all(ids):
        if ids and all(i in done for i in ids):
            return True

    required_roles = required_vs01_signer_role_ids(draft)
    if required_roles:
        completed_roles = completed_vs01_signer_role_ids(audit)
        return required_roles <= completed_roles

    if len(signers) == 1 and done:
        return True
    return False


def resolve_participant_id_for_signer_role(
    draft: Dict[str, Any],
    signer_role_id: str,
    participant_id_hint: str = "",
) -> str:
    pid = (participant_id_hint or "").strip()
    if pid:
        return pid

    stored = draft.get("vs01_signing_packet_v1")
    portable = stored.get("portable") if isinstance(stored, dict) else None
    roles = portable.get("roles") if isinstance(portable, dict) else None
    role_email = ""
    role_cp = ""
    if isinstance(roles, list):
        for role in roles:
            if not isinstance(role, dict):
                continue
            if str(role.get("roleId") or "").strip() != signer_role_id:
                continue
            role_email = str(role.get("signerEmail") or role.get("reviewEmail") or "").strip().lower()
            role_cp = str(role.get("vs01CounterpartyId") or role.get("partyId") or "").strip()
            break

    for party in draft.get("parties") or []:
        if not isinstance(party, dict):
            continue
        party_id = str(party.get("id") or "").strip()
        if role_cp and party_id == role_cp:
            return party_id
        email = str(party.get("email") or "").strip().lower()
        if role_email and email == role_email:
            return party_id
    return ""


def merge_portable_packet_corpus(
    draft: Dict[str, Any],
    portable_packet: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    if not isinstance(portable_packet, dict):
        return draft
    stored = draft.get("vs01_signing_packet_v1")
    if not isinstance(stored, dict):
        stored = {"v": 1}
    next_stored = {**stored, "portable": portable_packet}
    return {**draft, "vs01_signing_packet_v1": next_stored}


def build_signature_completed_event(
    *,
    signer_role_id: str,
    participant_id: str,
    display_name: str,
    document_id: str,
    signed_at: str,
    signed_date_iso: str,
    signed_date_display: str,
    locked_version_id: str | None,
    agreement_version_hash: str | None,
) -> Dict[str, Any]:
    return {
        "event_type": "signature_completed",
        "at": signed_at,
        "field": "vs01_signing",
        "value": {
            "signer_role_id": signer_role_id,
            "participant_id": participant_id or None,
            "participant_display_name": display_name or None,
            "document_id": document_id or None,
            "signed_date_iso": signed_date_iso or None,
            "signed_date_display": signed_date_display or None,
            "locked_version_id": locked_version_id,
            "agreement_version_hash": agreement_version_hash,
        },
    }


def build_fully_executed_signed_event(
    *,
    signed_at: str,
    agreement_version_hash: str | None,
) -> Dict[str, Any]:
    return {
        "event_type": "signed",
        "at": signed_at,
        "field": "signing",
        "value": {
            "fully_executed": True,
            "agreement_version_hash": agreement_version_hash,
        },
    }
