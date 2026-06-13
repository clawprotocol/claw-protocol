"""Owner corrections for mistyped reviewer/signer emails without restarting the agreement."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException

from backend.services.recipient_delivery_registry import (
    RECIPIENT_EMAIL_CORRECTED,
    record_invite_sent,
    supersede_active_invite,
)
from backend.services.email.review_delivery import send_review_invite_to_participant
from backend.services.email.signing_delivery import (
    SIGNING_INVITE_EMAILS_SENT_EVENT,
    send_signing_invite_to_target,
)

REVIEW_RECIPIENT_EMAIL_CORRECTED = "review_recipient_email_corrected"
REVIEW_EMAIL_RESENT = "review_email_resent"
SIGNING_RECIPIENT_EMAIL_CORRECTED = "signing_recipient_email_corrected"
SIGNING_INVITE_RESENT = "signing_invite_resent"
SIGNING_INVITE_SUPERSEDED = "signing_invite_superseded"

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_workflow_role(role: str) -> str:
    r = (role or "").strip().lower()
    if r in ("owner", "sender", "landlord", "client"):
        return "owner"
    if r in ("signer", "party", "tenant", "service_provider", "provider"):
        return "signer"
    if r in ("reviewer",):
        return "reviewer"
    if r in ("viewer", "counterparty", "fyi", "copy", "read_only", "readonly"):
        return "viewer"
    return r or "party"


def _audit_event_dict(e: Any) -> Dict[str, Any]:
    if isinstance(e, dict):
        return e
    if hasattr(e, "model_dump"):
        return e.model_dump()
    return {}


def _approved_participant_ids(audit: Any) -> set[str]:
    out: set[str] = set()
    for e in audit or []:
        d = _audit_event_dict(e)
        if str(d.get("event_type") or "") not in ("participant_approved", "recipient_approved"):
            continue
        val = d.get("value") or {}
        if isinstance(val, dict):
            pid = str(val.get("participant_id") or "").strip()
            if pid:
                out.add(pid)
    return out


def _signature_completed_participant_ids(audit: Any) -> set[str]:
    out: set[str] = set()
    for e in audit or []:
        d = _audit_event_dict(e)
        if str(d.get("event_type") or "") != "signature_completed":
            continue
        val = d.get("value") or {}
        if isinstance(val, dict):
            pid = str(val.get("participant_id") or "").strip()
            if pid:
                out.add(pid)
    return out


def _redact_email(email: str) -> str:
    e = (email or "").strip().lower()
    if "@" not in e:
        return "***"
    local, domain = e.split("@", 1)
    if len(local) <= 1:
        return f"*@{domain}"
    return f"{local[0]}***@{domain}"


def _validate_email(email: str) -> str:
    normalized = (email or "").strip().lower()
    if not normalized or not _EMAIL_RE.match(normalized):
        raise HTTPException(status_code=400, detail="invalid_email")
    return normalized


def _party_dict_by_id(draft: Dict[str, Any], participant_id: str) -> Dict[str, Any]:
    pid = (participant_id or "").strip()
    if not pid:
        raise HTTPException(status_code=400, detail="participant_id_required")
    if pid == "owner":
        for p in draft.get("parties") or []:
            if isinstance(p, dict) and _is_owner_party(p):
                return p
        raise HTTPException(status_code=404, detail="participant_not_found")
    for p in draft.get("parties") or []:
        if isinstance(p, dict) and str(p.get("id") or "").strip() == pid:
            return p
    raise HTTPException(status_code=404, detail="participant_not_found")


def _is_owner_party(party: Dict[str, Any]) -> bool:
    return _normalize_workflow_role(str(party.get("role") or "")) == "owner"


def _latest_signing_packet_revision(audit: Any) -> Optional[str]:
    revision: Optional[str] = None
    if not isinstance(audit, list):
        return None
    for event in audit:
        if not isinstance(event, dict):
            continue
        if str(event.get("event_type") or "") != SIGNING_INVITE_EMAILS_SENT_EVENT:
            continue
        value = event.get("value")
        if isinstance(value, dict):
            rev = str(value.get("packet_revision") or "").strip()
            if rev:
                revision = rev
    return revision


def correct_review_recipient_email(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    participant_id: str,
    new_email: str,
    resend_invite: bool,
    org_id: str | None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Update a reviewer's email before they approve; optionally resend review invite."""
    pid = (participant_id or "").strip()
    email = _validate_email(new_email)
    party = _party_dict_by_id(draft, pid)
    resolved_pid = str(party.get("id") or "").strip() or pid
    if _is_owner_party(party):
        raise HTTPException(status_code=400, detail="owner_email_not_editable_here")

    if resolved_pid in _approved_participant_ids(draft.get("audit_log")):
        raise HTTPException(status_code=400, detail="reviewer_already_approved")

    old_email = str(party.get("email") or "").strip().lower()
    if old_email == email:
        raise HTTPException(status_code=400, detail="email_unchanged")

    now = _utc_now_iso()
    audit_log = list(draft.get("audit_log") or [])
    parties: list[Dict[str, Any]] = []
    for p in draft.get("parties") or []:
        if not isinstance(p, dict):
            continue
        if str(p.get("id") or "").strip() == resolved_pid:
            parties.append({**p, "email": email})
        else:
            parties.append(dict(p))

    audit_log.append(
        {
            "event_type": RECIPIENT_EMAIL_CORRECTED,
            "at": now,
            "field": "parties",
            "value": {
                "phase": "review",
                "participant_id": resolved_pid,
                "old_email_redacted": _redact_email(old_email),
                "new_email_redacted": _redact_email(email),
            },
        }
    )
    audit_log.append(
        {
            "event_type": REVIEW_RECIPIENT_EMAIL_CORRECTED,
            "at": now,
            "field": "parties",
            "value": {
                "participant_id": resolved_pid,
                "old_email_redacted": _redact_email(old_email),
                "new_email_redacted": _redact_email(email),
            },
        }
    )

    sent_invite = False
    next_draft = {**draft, "parties": parties, "audit_log": audit_log, "updated_at": now}
    if resend_invite:
        if not str(draft.get("review_sent_at") or "").strip():
            raise HTTPException(status_code=400, detail="review_not_sent_yet")
        supersede_active_invite(
            next_draft,
            phase="review",
            participant_id=resolved_pid,
            audit_log=audit_log,
        )
        sent_invite, jti = send_review_invite_to_participant(
            agreement_id=agreement_id,
            draft=next_draft,
            participant_id=resolved_pid,
            org_id=org_id,
        )
        if sent_invite:
            record_invite_sent(
                next_draft,
                phase="review",
                participant_id=resolved_pid,
                jti=jti,
                email=email,
                audit_log=audit_log,
            )
            audit_log.append(
                {
                    "event_type": REVIEW_EMAIL_RESENT,
                    "at": now,
                    "field": "review_invite",
                    "value": {"participant_id": resolved_pid, "email_redacted": _redact_email(email)},
                }
            )
            next_draft["audit_log"] = audit_log

    return next_draft, {"sent_invite": sent_invite}


def correct_signing_recipient_email(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    participant_id: str,
    new_email: str,
    signer_role_id: str | None,
    signing_url: str | None,
    resend_invite: bool,
    org_id: str | None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Update signer email; optionally supersede prior invite and resend signing link."""
    pid = (participant_id or "").strip()
    email = _validate_email(new_email)
    party = _party_dict_by_id(draft, pid)
    resolved_pid = str(party.get("id") or "").strip() or pid

    if resolved_pid in _signature_completed_participant_ids(draft.get("audit_log")):
        raise HTTPException(status_code=400, detail="signer_already_signed")

    old_email = str(party.get("email") or "").strip().lower()
    if old_email == email:
        raise HTTPException(status_code=400, detail="email_unchanged")

    signing_invites_sent = _latest_signing_packet_revision(draft.get("audit_log")) is not None
    url = (signing_url or "").strip()
    if resend_invite and signing_invites_sent and not url:
        raise HTTPException(status_code=400, detail="signing_url_required")

    now = _utc_now_iso()
    audit_log = list(draft.get("audit_log") or [])
    parties: list[Dict[str, Any]] = []
    for p in draft.get("parties") or []:
        if not isinstance(p, dict):
            continue
        if str(p.get("id") or "").strip() == resolved_pid:
            parties.append({**p, "email": email})
        else:
            parties.append(dict(p))

    audit_log.append(
        {
            "event_type": RECIPIENT_EMAIL_CORRECTED,
            "at": now,
            "field": "parties",
            "value": {
                "phase": "signing",
                "participant_id": resolved_pid,
                "signer_role_id": (signer_role_id or "").strip() or None,
                "old_email_redacted": _redact_email(old_email),
                "new_email_redacted": _redact_email(email),
            },
        }
    )
    audit_log.append(
        {
            "event_type": SIGNING_RECIPIENT_EMAIL_CORRECTED,
            "at": now,
            "field": "parties",
            "value": {
                "participant_id": resolved_pid,
                "signer_role_id": (signer_role_id or "").strip() or None,
                "old_email_redacted": _redact_email(old_email),
                "new_email_redacted": _redact_email(email),
            },
        }
    )

    sent_invite = False
    packet_revision = _latest_signing_packet_revision(draft.get("audit_log"))
    next_draft = {**draft, "parties": parties, "audit_log": audit_log, "updated_at": now}
    if resend_invite and signing_invites_sent and url:
        supersede_active_invite(
            next_draft,
            phase="signing",
            participant_id=resolved_pid,
            audit_log=audit_log,
        )
        if old_email:
            audit_log.append(
                {
                    "event_type": SIGNING_INVITE_SUPERSEDED,
                    "at": now,
                    "field": "signing_invite",
                    "value": {
                        "participant_id": resolved_pid,
                        "signer_role_id": (signer_role_id or "").strip() or None,
                        "superseded_email_redacted": _redact_email(old_email),
                        "packet_revision": packet_revision,
                    },
                }
            )
        sent_invite = send_signing_invite_to_target(
            agreement_id=agreement_id,
            draft=next_draft,
            target={
                "email": email,
                "display_name": str(party.get("name") or "").strip() or email.split("@", 1)[0],
                "signing_url": url,
                "signer_role_id": (signer_role_id or "").strip(),
                "participant_id": resolved_pid,
            },
            packet_revision=packet_revision,
            org_id=org_id,
        )
        if sent_invite:
            record_invite_sent(
                next_draft,
                phase="signing",
                participant_id=resolved_pid,
                email=email,
                audit_log=audit_log,
            )
            audit_log.append(
                {
                    "event_type": SIGNING_INVITE_RESENT,
                    "at": now,
                    "field": "signing_invite",
                    "value": {
                        "participant_id": resolved_pid,
                        "signer_role_id": (signer_role_id or "").strip() or None,
                        "email_redacted": _redact_email(email),
                        "packet_revision": packet_revision,
                    },
                }
            )
            next_draft["audit_log"] = audit_log

    return next_draft, {
        "sent_invite": sent_invite,
        "signing_invites_sent": signing_invites_sent,
    }
