"""Persist VS01 signer completion to agreement audit + optional portable packet corpus."""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set

_completion_locks_guard = threading.Lock()
_completion_locks: Dict[str, threading.RLock] = {}


def vs01_signer_complete_lock(agreement_id: str) -> threading.RLock:
    """Serialize mutate + persist + finalize + completion-email + audit per agreement."""
    aid = (agreement_id or "").strip()
    with _completion_locks_guard:
        lock = _completion_locks.get(aid)
        if lock is None:
            lock = threading.RLock()
            _completion_locks[aid] = lock
        return lock


def vs01_completion_email_lock(agreement_id: str) -> threading.RLock:
    """Backward-compatible alias — email path shares the full completion lock."""
    return vs01_signer_complete_lock(agreement_id)


def reset_vs01_completion_email_locks_for_tests() -> None:
    with _completion_locks_guard:
        _completion_locks.clear()


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


def vs01_packet_document_id(draft: Dict[str, Any]) -> str:
    stored = draft.get("vs01_signing_packet_v1")
    if not isinstance(stored, dict):
        return ""
    doc = str(stored.get("document_id") or "").strip()
    if doc:
        return doc
    portable = stored.get("portable")
    if isinstance(portable, dict):
        seed = portable.get("seed")
        if isinstance(seed, dict):
            return str(seed.get("documentId") or "").strip()
    return ""


def vs01_signing_phase_started(draft: Dict[str, Any]) -> bool:
    from backend.services.email.signing_delivery import SIGNING_INVITE_EMAILS_SENT_EVENT

    for event in draft.get("audit_log") or []:
        if not isinstance(event, dict):
            continue
        et = str(event.get("event_type") or "")
        if et == SIGNING_INVITE_EMAILS_SENT_EVENT:
            return True
        if et == "signature_completed":
            return True
    return isinstance(draft.get("vs01_signing_packet_v1"), dict)


def vs01_open_signing_link_completion_allowed(
    draft: Dict[str, Any],
    *,
    signer_role_id: str,
    document_id: str,
) -> bool:
    """
    Allow tokenless VS01 signer completion when the role and document match the prepared packet.

    Covers signing invite links that omit ``t=`` (already delivered) while economics still require
    recipient tokens for other flows.
    """
    rid = (signer_role_id or "").strip()
    if not rid or not vs01_signing_phase_started(draft):
        return False
    required = required_vs01_signer_role_ids(draft)
    if not required or rid not in required:
        return False
    stored_doc = vs01_packet_document_id(draft)
    req_doc = (document_id or "").strip()
    if stored_doc and req_doc and stored_doc != req_doc:
        return False
    return True


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


def signer_role_already_completed(audit: Any, signer_role_id: str) -> bool:
    rid = (signer_role_id or "").strip()
    if not rid:
        return False
    return rid in completed_vs01_signer_role_ids(audit)


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


_COMPLETION_ELIGIBLE_PARTY_ROLES = frozenset(
    {"", "signer", "owner", "party", "counterparty", "provider", "client", "service_provider"}
)

_NON_SIGNING_PARTY_ROLES = frozenset({"viewer", "reviewer", "coordinator", "fyi", "copy", "read_only", "readonly"})


def _normalize_party_workflow_role(role: str) -> str:
    r = (role or "").strip().lower().replace("-", "_").replace(" ", "_")
    if r in ("serviceprovider", "service_provider"):
        return "service_provider"
    if r in ("readonly", "read_only"):
        return "viewer"
    return r


def party_requires_signature(party: Any) -> bool:
    """True when a draft party row should count toward required signer completion."""
    if not isinstance(party, dict):
        return False
    if party.get("requires_signature") is False:
        return False
    if not str(party.get("name") or "").strip():
        return False
    wr = _normalize_party_workflow_role(str(party.get("role") or ""))
    return wr not in _NON_SIGNING_PARTY_ROLES


def resolve_required_signer_count(draft: Dict[str, Any]) -> int:
    """
    Authoritative required signer count for dashboard / public verify / completion gates.

    Prefers VS01 portable role ids; falls back to draft parties that require signatures.
    """
    required_roles = required_vs01_signer_role_ids(draft)
    if required_roles:
        return len(required_roles)
    parties = draft.get("parties") or []
    party_signers = sum(1 for p in parties if party_requires_signature(p))
    if party_signers > 0:
        return party_signers
    legacy = [
        p
        for p in parties
        if _normalize_party_workflow_role(str((p or {}).get("role") or "")) == "signer"
    ]
    if legacy:
        return len(legacy)
    return max(len(parties), 1) if parties else 0


def all_signers_signed_from_audit(draft: Dict[str, Any], audit: List[Any]) -> bool:
    parties = draft.get("parties") or []

    required_roles = required_vs01_signer_role_ids(draft)
    if required_roles:
        completed_roles = completed_vs01_signer_role_ids(audit)
        return required_roles <= completed_roles

    signing_parties = [p for p in parties if party_requires_signature(p)]
    if signing_parties:
        done = signature_completed_participant_ids(audit)
        ids = [str((p or {}).get("id") or "").strip() for p in signing_parties]
        if ids and all(ids) and all(i in done for i in ids):
            return True

    signers = [p for p in parties if str((p or {}).get("role") or "").strip().lower() == "signer"]
    done = signature_completed_participant_ids(audit)
    ids = [str((p or {}).get("id") or "").strip() for p in signers]
    if ids and all(ids) and all(i in done for i in ids):
        return True

    if len(signers) == 1 and done:
        return True
    return False


def portable_party_id_for_signer_role(draft: Dict[str, Any], signer_role_id: str) -> str:
    """Party / counterparty id bound to a VS01 portable role row."""
    stored = draft.get("vs01_signing_packet_v1")
    portable = stored.get("portable") if isinstance(stored, dict) else None
    roles = portable.get("roles") if isinstance(portable, dict) else None
    rid = (signer_role_id or "").strip()
    if not rid or not isinstance(roles, list):
        return ""
    for role in roles:
        if not isinstance(role, dict):
            continue
        if str(role.get("roleId") or "").strip() != rid:
            continue
        return str(role.get("vs01CounterpartyId") or role.get("partyId") or "").strip()
    return ""


def assert_recipient_signer_completion_binding(
    draft: Dict[str, Any],
    *,
    signer_role_id: str,
    participant_id: str,
    token_party_id: str = "",
) -> None:
    """
    Recipient token + body must match the portable packet row for signer_role_id.
    Prevents completing another party while holding a valid token for a different party.
    """
    from fastapi import HTTPException

    rid = (signer_role_id or "").strip()
    pid = (participant_id or "").strip()
    tok_pid = (token_party_id or "").strip()
    required = required_vs01_signer_role_ids(draft)
    if required and rid not in required:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "signer_role_not_in_packet",
                "message": "This signing link does not match this agreement.",
            },
        )
    packet_pid = portable_party_id_for_signer_role(draft, rid)
    if tok_pid and packet_pid and tok_pid != packet_pid:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "signer_token_role_mismatch",
                "message": "This signing link does not match your invite.",
            },
        )
    if tok_pid and pid and tok_pid != pid:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "recipient_party_token_mismatch",
                "message": "This signing link does not match your invite.",
            },
        )
    if pid and packet_pid and pid != packet_pid:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "completion_participant_role_mismatch",
                "message": "This signing link does not match your invite.",
            },
        )


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
    portable_packet: Optional[Dict[str, Any]] = None,
) -> Vs01SignerCompleteOutcome:
    """
    Reload-merge before write: if another request recorded this signer first, prefer fresh audit
    but still merge portable packet / snapshot when provided.
    """
    fresh_audit = list(fresh_draft.get("audit_log") or [])
    rid = (signer_role_id or "").strip()
    draft_dict = dict(fresh_draft)
    packet_mutated = False
    if isinstance(portable_packet, dict):
        merged = merge_portable_packet_corpus(draft_dict, portable_packet)
        packet_mutated = merged.get("vs01_signing_packet_v1") != draft_dict.get("vs01_signing_packet_v1")
        draft_dict = merged

    if signer_role_already_completed(fresh_audit, rid):
        fully = all_signers_signed_from_audit(draft_dict, fresh_audit)
        return Vs01SignerCompleteOutcome(
            draft_dict={**draft_dict, "audit_log": fresh_audit},
            audit=fresh_audit,
            already_signed=True,
            fully_executed=fully,
            newly_finalized=False,
            audit_mutated=packet_mutated,
        )
    if packet_mutated and pending_outcome.draft_dict.get("vs01_signing_packet_v1") != draft_dict.get(
        "vs01_signing_packet_v1"
    ):
        return Vs01SignerCompleteOutcome(
            draft_dict={**pending_outcome.draft_dict, "vs01_signing_packet_v1": draft_dict.get("vs01_signing_packet_v1")},
            audit=pending_outcome.audit,
            already_signed=pending_outcome.already_signed,
            fully_executed=pending_outcome.fully_executed,
            newly_finalized=pending_outcome.newly_finalized,
            audit_mutated=True,
        )
    return pending_outcome
