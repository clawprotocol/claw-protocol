"""Build owner-facing recipient delivery rows from draft parties, registry, and audit."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.services.email.signing_delivery import SIGNING_INVITE_EMAILS_SENT_EVENT
from backend.services.recipient_delivery_registry import get_registry

RecipientPhase = str  # "review" | "signing"
RecipientStatus = str  # not_sent | sent | opened | approved | signed | replaced | blocked


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


def _normalize_role(role: str) -> str:
    r = (role or "").strip().lower()
    if r in ("owner", "sender", "landlord", "client"):
        return "owner"
    if r in ("reviewer",):
        return "reviewer"
    if r in ("viewer", "counterparty", "fyi", "copy", "read_only", "readonly"):
        return "counterparty"
    if r in ("signer", "party", "tenant", "service_provider", "provider"):
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


def _review_display_role(normalized_role: str) -> str:
    if normalized_role == "owner":
        return "owner"
    if normalized_role == "counterparty":
        return "counterparty"
    return "reviewer"


def _review_status(
    *,
    draft: Dict[str, Any],
    participant_id: str,
    approved: set[str],
) -> RecipientStatus:
    if participant_id in approved:
        return "approved"
    review_sent = bool(str(draft.get("review_sent_at") or "").strip())
    invite_sent = bool(str(draft.get("review_invite_emails_sent_at") or "").strip())
    reg = _registry_row(draft, "review", participant_id)
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
) -> RecipientStatus:
    if participant_id in signed:
        return "signed"
    if not _signing_invites_sent(draft.get("audit_log")):
        return "not_sent"
    reg = _registry_row(draft, "signing", participant_id)
    if reg.get("last_opened_at"):
        return "opened"
    if reg.get("last_sent_at"):
        return "sent"
    return "sent"


def build_recipient_delivery_status(draft: Dict[str, Any]) -> Dict[str, Any]:
    """Return { ok, review_sent, signing_invites_sent, recipients: [...] }."""
    audit = draft.get("audit_log") or []
    approved = _approved_ids(audit)
    signed = _signed_ids(audit)
    review_sent = bool(str(draft.get("review_sent_at") or "").strip())
    signing_sent = _signing_invites_sent(audit)

    rows: List[Dict[str, Any]] = []
    parties = draft.get("parties") or []
    if not isinstance(parties, list):
        parties = []

    for party in parties:
        if not isinstance(party, dict):
            continue
        pid = str(party.get("id") or "").strip()
        if not pid:
            continue
        role = _normalize_role(str(party.get("role") or ""))
        entity_name = str(party.get("name") or "").strip() or pid
        human_name = str(party.get("signer_name") or party.get("contact_name") or "").strip() or None
        email = str(party.get("email") or "").strip()

        if review_sent and role != "owner":
            reg = _registry_row(draft, "review", pid)
            status = _review_status(draft=draft, participant_id=pid, approved=approved)
            locked = status == "approved"
            rows.append(
                _row_dict(
                    phase="review",
                    participant_id=pid,
                    entity_name=entity_name,
                    human_name=human_name,
                    email=email,
                    role=_review_display_role(role),
                    status=status,
                    reg=reg,
                    locked=locked,
                    lock_reason="This reviewer already approved." if locked else None,
                )
            )

        if signing_sent:
            reg = _registry_row(draft, "signing", pid)
            status = _signing_status(draft=draft, participant_id=pid, signed=signed)
            locked = status == "signed"
            rows.append(
                _row_dict(
                    phase="signing",
                    participant_id=pid,
                    entity_name=entity_name,
                    human_name=human_name,
                    email=email,
                    role="owner" if role == "owner" else "signer",
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
