"""Build owner-facing recipient delivery rows from draft parties, registry, and audit."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from backend.services.email.signing_delivery import SIGNING_INVITE_EMAILS_SENT_EVENT
from backend.services.recipient_delivery_registry import INVITE_SENT, INVITE_RESENT, get_registry
from backend.services.recipient_party_identity import (
    participant_id_for_party,
    party_requires_review_approval,
)

RecipientPhase = str  # "review" | "signing"
RecipientStatus = str  # not_sent | sent | opened | approved | signed | replaced | blocked

_log = logging.getLogger("claw.recipient_delivery_status")


def _safe_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return default
        try:
            return int(raw)
        except ValueError:
            return default
    return default


def _normalize_signing_role(role: str) -> str:
    r = (role or "").strip().lower()
    if r in ("owner", "sender", "landlord", "client"):
        return "owner"
    if r in ("reviewer",):
        return "reviewer"
    if r in ("viewer", "counterparty", "fyi", "copy", "read_only", "readonly"):
        return "counterparty"
    if r in ("signer", "signatory", "party", "tenant", "service_provider", "provider"):
        return "signer"
    return r or "signer"


def _approved_ids(audit: Any) -> set[str]:
    out: set[str] = set()
    for e in audit or []:
        if not isinstance(e, dict):
            continue
        if str(e.get("event_type") or "") not in ("participant_approved", "recipient_approved", "review_approved"):
            continue
        val = e.get("value") or {}
        if isinstance(val, dict):
            pid = str(val.get("participant_id") or "").strip()
            if pid:
                out.add(pid)
    return out


def _signed_ids(audit: Any) -> set[str]:
    out: set[str] = set()
    for e in audit or []:
        if not isinstance(e, dict):
            continue
        if str(e.get("event_type") or "") != "signature_completed":
            continue
        val = e.get("value") or {}
        if isinstance(val, dict):
            pid = str(val.get("participant_id") or "").strip()
            if pid:
                out.add(pid)
    return out


def _signing_invites_sent(audit: Any) -> bool:
    for e in audit or []:
        if not isinstance(e, dict):
            continue
        if str(e.get("event_type") or "") == SIGNING_INVITE_EMAILS_SENT_EVENT:
            return True
    return False


def _registry_row(draft: Dict[str, Any], phase: str, participant_id: str) -> Dict[str, Any]:
    reg = get_registry(draft)
    recipients = reg.get("recipients")
    if not isinstance(recipients, dict):
        return {}
    key = f"{phase}:{participant_id}"
    row = recipients.get(key)
    return row if isinstance(row, dict) else {}


def _registry_row_for_party(
    draft: Dict[str, Any],
    *,
    phase: str,
    party: Dict[str, Any],
    party_index: int,
    participant_id: str,
) -> Dict[str, Any]:
    candidates: List[str] = []
    raw_id = str(party.get("id") or "").strip()
    if participant_id:
        candidates.append(participant_id)
    if raw_id and raw_id not in candidates:
        candidates.append(raw_id)
    if not raw_id:
        candidates.append("")
    for candidate in candidates:
        row = _registry_row(draft, phase, candidate)
        if row:
            return row
    return {}


def _audit_last_sent_at(draft: Dict[str, Any], *, phase: str, participant_id: str) -> Optional[str]:
    audit = draft.get("audit_log") or []
    if not isinstance(audit, list):
        return None
    last: Optional[str] = None
    for event in audit:
        if not isinstance(event, dict):
            continue
        et = str(event.get("event_type") or "")
        if et not in (INVITE_SENT, INVITE_RESENT):
            continue
        val = event.get("value") or {}
        if not isinstance(val, dict):
            continue
        if str(val.get("phase") or "").strip() != phase:
            continue
        event_pid = str(val.get("participant_id") or "").strip()
        if event_pid and event_pid != participant_id:
            continue
        at = str(event.get("at") or "").strip()
        if at:
            last = at
    return last


def _review_display_role(party: Dict[str, Any]) -> str:
    from backend.services.recipient_party_identity import normalize_workflow_role

    role = normalize_workflow_role(str(party.get("role") or ""))
    if role == "counterparty":
        return "counterparty"
    return "reviewer"


def _review_status(
    *,
    draft: Dict[str, Any],
    participant_id: str,
    approved: set[str],
    reg: Dict[str, Any],
) -> RecipientStatus:
    if participant_id in approved:
        return "approved"
    review_sent = bool(str(draft.get("review_sent_at") or "").strip())
    invite_sent = bool(str(draft.get("review_invite_emails_sent_at") or "").strip())
    if not review_sent:
        return "not_sent"
    if reg.get("last_opened_at"):
        return "opened"
    if reg.get("last_sent_at") or invite_sent:
        return "sent"
    return "not_sent"


def _signing_status(
    *,
    draft: Dict[str, Any],
    participant_id: str,
    signed: set[str],
    reg: Dict[str, Any],
) -> RecipientStatus:
    if participant_id in signed:
        return "signed"
    if not _signing_invites_sent(draft.get("audit_log")):
        return "not_sent"
    if reg.get("last_opened_at"):
        return "opened"
    if reg.get("last_sent_at"):
        return "sent"
    return "sent"


def build_recipient_delivery_status(draft: Dict[str, Any]) -> Dict[str, Any]:
    """Return { ok, review_sent, signing_invites_sent, recipients: [...] }."""
    try:
        return _build_recipient_delivery_status(draft)
    except Exception:
        _log.exception("recipient_delivery_status_build_failed")
        review_sent = bool(str(draft.get("review_sent_at") or "").strip())
        return {
            "ok": True,
            "review_sent": review_sent,
            "signing_invites_sent": _signing_invites_sent(draft.get("audit_log")),
            "recipients": _fallback_review_rows(draft, review_sent=review_sent),
        }


def _fallback_review_rows(draft: Dict[str, Any], *, review_sent: bool) -> List[Dict[str, Any]]:
    if not review_sent:
        return []
    parties = draft.get("parties") or []
    if not isinstance(parties, list):
        return []
    rows: List[Dict[str, Any]] = []
    for i, party in enumerate(parties):
        if not isinstance(party, dict):
            continue
        if not party_requires_review_approval(party, i, parties):
            continue
        pid = participant_id_for_party(party, i)
        entity_name = str(party.get("name") or "").strip() or pid
        email = str(party.get("email") or "").strip()
        invite_sent = bool(str(draft.get("review_invite_emails_sent_at") or "").strip())
        rows.append(
            {
                "phase": "review",
                "participant_id": pid,
                "entity_name": entity_name,
                "human_name": None,
                "email": email,
                "role": _review_display_role(party),
                "status": "sent" if invite_sent else "not_sent",
                "last_sent_at": None,
                "last_opened_at": None,
                "resent_count": 0,
                "locked": False,
                "lock_reason": None,
                "can_correct_email": True,
                "can_resend_invite": bool(email),
                "can_copy_link": True,
            }
        )
    return rows


def _build_recipient_delivery_status(draft: Dict[str, Any]) -> Dict[str, Any]:
    audit = draft.get("audit_log") or []
    approved = _approved_ids(audit)
    signed = _signed_ids(audit)
    review_sent = bool(str(draft.get("review_sent_at") or "").strip())
    signing_sent = _signing_invites_sent(audit)

    rows: List[Dict[str, Any]] = []
    parties = draft.get("parties") or []
    if not isinstance(parties, list):
        parties = []

    for party_index, party in enumerate(parties):
        if not isinstance(party, dict):
            continue
        participant_id = participant_id_for_party(party, party_index)
        entity_name = str(party.get("name") or "").strip() or participant_id
        human_name = str(party.get("signer_name") or party.get("contact_name") or "").strip() or None
        email = str(party.get("email") or "").strip()
        signing_role = _normalize_signing_role(str(party.get("role") or ""))

        if review_sent and party_requires_review_approval(party, party_index, parties):
            reg = _registry_row_for_party(
                draft,
                phase="review",
                party=party,
                party_index=party_index,
                participant_id=participant_id,
            )
            status = _review_status(
                draft=draft,
                participant_id=participant_id,
                approved=approved,
                reg=reg,
            )
            locked = status == "approved"
            last_sent_at = reg.get("last_sent_at") or _audit_last_sent_at(
                draft,
                phase="review",
                participant_id=participant_id,
            )
            reg_for_row = {**reg, "last_sent_at": last_sent_at}
            rows.append(
                _row_dict(
                    phase="review",
                    participant_id=participant_id,
                    entity_name=entity_name,
                    human_name=human_name,
                    email=email,
                    role=_review_display_role(party),
                    status=status,
                    reg=reg_for_row,
                    locked=locked,
                    lock_reason="This reviewer already approved." if locked else None,
                )
            )

        if signing_sent:
            reg = _registry_row_for_party(
                draft,
                phase="signing",
                party=party,
                party_index=party_index,
                participant_id=participant_id,
            )
            status = _signing_status(
                draft=draft,
                participant_id=participant_id,
                signed=signed,
                reg=reg,
            )
            locked = status == "signed"
            rows.append(
                _row_dict(
                    phase="signing",
                    participant_id=participant_id,
                    entity_name=entity_name,
                    human_name=human_name,
                    email=email,
                    role="owner" if signing_role == "owner" else "signer",
                    status=status,
                    reg=reg,
                    locked=locked,
                    lock_reason=(
                        "This signer has already signed. To change signer identity, create a new signing packet/version."
                        if locked
                        else None
                    ),
                )
            )

    return {
        "ok": True,
        "review_sent": review_sent,
        "signing_invites_sent": signing_sent,
        "recipients": rows,
    }


def _row_dict(
    *,
    phase: str,
    participant_id: str,
    entity_name: str,
    human_name: Optional[str],
    email: str,
    role: str,
    status: RecipientStatus,
    reg: Dict[str, Any],
    locked: bool,
    lock_reason: Optional[str],
) -> Dict[str, Any]:
    resent_count = _safe_int(reg.get("resent_count"))
    can_correct = not locked and status not in ("approved", "signed")
    can_resend = not locked and status in ("sent", "opened", "not_sent", "replaced")
    return {
        "phase": phase,
        "participant_id": participant_id,
        "entity_name": entity_name,
        "human_name": human_name,
        "email": email,
        "role": role,
        "status": status,
        "last_sent_at": reg.get("last_sent_at"),
        "last_opened_at": reg.get("last_opened_at"),
        "resent_count": resent_count,
        "locked": locked,
        "lock_reason": lock_reason,
        "can_correct_email": can_correct,
        "can_resend_invite": can_resend and bool(email),
        "can_copy_link": not locked,
    }
