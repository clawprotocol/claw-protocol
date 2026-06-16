"""Persist VS01 signer completion to agreement audit + optional portable packet corpus."""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set

_email_send_locks_guard = threading.Lock()
_email_send_locks: Dict[str, threading.Lock] = {}


def vs01_completion_email_lock(agreement_id: str) -> threading.Lock:
    """Serialize completion-email send + audit append per agreement (concurrent final signers)."""
    aid = (agreement_id or "").strip()
    with _email_send_locks_guard:
        lock = _email_send_locks.get(aid)
        if lock is None:
            lock = threading.Lock()
            _email_send_locks[aid] = lock
        return lock


def reset_vs01_completion_email_locks_for_tests() -> None:
    with _email_send_locks_guard:
        _email_send_locks.clear()


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


def fully_executed_signed_already_recorded(audit: Any) -> bool:
    for event in audit or []:
        if not isinstance(event, dict):
            continue
        if str(event.get("event_type") or "") != "signed":
            continue
        val = event.get("value")
        if isinstance(val, dict) and val.get("fully_executed"):
            return True
    return False


def completion_emails_already_sent(audit: Any) -> bool:
    from backend.services.email.signing_completion_delivery import (
        SIGNING_COMPLETION_EMAILS_SENT_EVENT,
    )

    for event in audit or []:
        if not isinstance(event, dict):
            continue
        if str(event.get("event_type") or "") == SIGNING_COMPLETION_EMAILS_SENT_EVENT:
            return True
    return False


def count_signature_completed_events(audit: Any) -> int:
    return sum(
        1
        for event in audit or []
        if isinstance(event, dict) and str(event.get("event_type") or "") == "signature_completed"
    )


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


def extract_fully_executed_snapshot_from_portable(
    portable_packet: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    snap = portable_packet.get("fullyExecutedSnapshot")
    if not isinstance(snap, dict):
        return None
    corpus_plain = str(snap.get("corpusPlain") or "").strip()
    if len(corpus_plain) < 80:
        return None
    signer_role_ids = snap.get("signerRoleIds")
    if not isinstance(signer_role_ids, list):
        signer_role_ids = []
    return {
        "v": 1,
        "corpus_plain": corpus_plain,
        "corpus_hash": str(snap.get("corpusHash") or "").strip(),
        "saved_at": str(snap.get("savedAt") or "").strip(),
        "signer_role_ids": [str(r).strip() for r in signer_role_ids if str(r).strip()],
    }


def read_fully_executed_snapshot_from_draft(draft: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    stored = draft.get("vs01_signing_packet_v1")
    if not isinstance(stored, dict):
        return None
    snap = stored.get("fully_executed_snapshot")
    if not isinstance(snap, dict):
        return None
    corpus_plain = str(snap.get("corpus_plain") or "").strip()
    if len(corpus_plain) < 80:
        return None
    return snap


def fully_executed_snapshot_ready(draft: Dict[str, Any]) -> bool:
    return read_fully_executed_snapshot_from_draft(draft) is not None


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
    server_snap = extract_fully_executed_snapshot_from_portable(portable_packet)
    if server_snap:
        next_stored["fully_executed_snapshot"] = server_snap
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


@dataclass(frozen=True)
class Vs01SignerCompleteOutcome:
    """Pure audit/draft mutations — persistence + email delivery happen in the router."""

    draft_dict: Dict[str, Any]
    audit: List[Any]
    already_signed: bool
    fully_executed: bool
    newly_finalized: bool
    audit_mutated: bool


def orchestrate_vs01_signer_complete(
    draft: Dict[str, Any],
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
    portable_packet: Optional[Dict[str, Any]] = None,
) -> Vs01SignerCompleteOutcome:
    """
    Single authoritative completion mutation path.

    Order: signature_completed (per signer) → signed/fully_executed (once) → caller persists → emails.
    """
    rid = (signer_role_id or "").strip()
    audit = list(draft.get("audit_log") or [])
    draft_dict = dict(draft)
    already_signed = signer_role_already_completed(audit, rid)

    if not already_signed:
        audit.append(
            build_signature_completed_event(
                signer_role_id=rid,
                participant_id=participant_id,
                display_name=display_name,
                document_id=document_id,
                signed_at=signed_at,
                signed_date_iso=signed_date_iso,
                signed_date_display=signed_date_display,
                locked_version_id=locked_version_id,
                agreement_version_hash=agreement_version_hash,
            )
        )

    if isinstance(portable_packet, dict):
        draft_dict = merge_portable_packet_corpus(draft_dict, portable_packet)

    fully = all_signers_signed_from_audit(draft_dict, audit)
    newly_finalized = False
    if fully and not fully_executed_signed_already_recorded(audit):
        audit.append(
            build_fully_executed_signed_event(
                signed_at=signed_at,
                agreement_version_hash=agreement_version_hash,
            )
        )
        newly_finalized = True

    draft_dict = {**draft_dict, "audit_log": audit, "updated_at": signed_at}
    audit_mutated = not already_signed or newly_finalized

    return Vs01SignerCompleteOutcome(
        draft_dict=draft_dict,
        audit=audit,
        already_signed=already_signed,
        fully_executed=fully,
        newly_finalized=newly_finalized,
        audit_mutated=audit_mutated,
    )


def merge_fresh_audit_for_vs01_signer(
    fresh_draft: Dict[str, Any],
    pending_outcome: Vs01SignerCompleteOutcome,
    *,
    signer_role_id: str,
) -> Vs01SignerCompleteOutcome:
    """
    Reload-merge before write: if another request recorded this signer first, prefer fresh audit.
    """
    fresh_audit = list(fresh_draft.get("audit_log") or [])
    rid = (signer_role_id or "").strip()
    if signer_role_already_completed(fresh_audit, rid):
        fully = all_signers_signed_from_audit(fresh_draft, fresh_audit)
        return Vs01SignerCompleteOutcome(
            draft_dict={**fresh_draft, "audit_log": fresh_audit},
            audit=fresh_audit,
            already_signed=True,
            fully_executed=fully,
            newly_finalized=False,
            audit_mutated=False,
        )
    return pending_outcome
