"""Resend recipient invites without changing email or agreement corpus."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Tuple

from fastapi import HTTPException

from backend.services.email.review_delivery import send_review_invite_to_participant
from backend.services.email.signing_delivery import (
    SIGNING_INVITE_EMAILS_SENT_EVENT,
    send_signing_invite_to_target,
)
from backend.services.recipient_delivery_registry import record_invite_sent, supersede_active_invite


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _latest_signing_packet_revision(audit: Any) -> str | None:
    revision: str | None = None
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


def _party_by_id(draft: Dict[str, Any], participant_id: str) -> Dict[str, Any]:
    pid = (participant_id or "").strip()
    for p in draft.get("parties") or []:
        if isinstance(p, dict) and str(p.get("id") or "").strip() == pid:
            return p
    raise HTTPException(status_code=404, detail="participant_not_found")


def resend_recipient_invite(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    phase: str,
    participant_id: str,
    signing_url: str | None = None,
    signer_role_id: str | None = None,
    org_id: str | None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Resend waiting/opened invite; supersedes prior token/link metadata only."""
    pid = (participant_id or "").strip()
    ph = (phase or "").strip().lower()
    if ph not in ("review", "signing"):
        raise HTTPException(status_code=400, detail="invalid_phase")

    party = _party_by_id(draft, pid)
    email = str(party.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="recipient_email_missing")

    now = _utc_now_iso()
    audit_log = list(draft.get("audit_log") or [])
    next_draft = dict(draft)
    supersede_active_invite(next_draft, phase=ph, participant_id=pid, audit_log=audit_log)

    sent_invite = False
    if ph == "review":
        if not str(draft.get("review_sent_at") or "").strip():
            raise HTTPException(status_code=400, detail="review_not_sent_yet")
        sent_invite, jti = send_review_invite_to_participant(
            agreement_id=agreement_id,
            draft=next_draft,
            participant_id=pid,
            org_id=org_id,
        )
        if sent_invite:
            record_invite_sent(
                next_draft,
                phase="review",
                participant_id=pid,
                jti=jti,
                email=email,
                audit_log=audit_log,
            )
    else:
        if _latest_signing_packet_revision(draft.get("audit_log")) is None:
            raise HTTPException(status_code=400, detail="signing_not_sent_yet")
        url = (signing_url or "").strip()
        if not url:
            raise HTTPException(status_code=400, detail="signing_url_required")
        sent_invite = send_signing_invite_to_target(
            agreement_id=agreement_id,
            draft=next_draft,
            target={
                "email": email,
                "display_name": str(party.get("name") or "").strip() or email.split("@", 1)[0],
                "signing_url": url,
                "signer_role_id": (signer_role_id or "").strip(),
                "participant_id": pid,
            },
            packet_revision=_latest_signing_packet_revision(draft.get("audit_log")),
            org_id=org_id,
        )
        if sent_invite:
            record_invite_sent(
                next_draft,
                phase="signing",
                participant_id=pid,
                email=email,
                audit_log=audit_log,
            )

    next_draft["audit_log"] = audit_log
    next_draft["updated_at"] = now
    return next_draft, {"sent_invite": sent_invite}
