"""Completion emails after all VS01 signers finish (non-fatal, idempotent)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List
from urllib.parse import quote

from backend.config.email_config import app_public_origin, email_configured
from backend.services.email.delivery import send_email_non_fatal
from backend.services.email.review_delivery import (
    _owner_display_name_from_draft,
    _party_display_names_from_draft,
)
from backend.services.email.templates.signing_complete import build_signing_complete_email

_log = logging.getLogger(__name__)

SIGNING_COMPLETION_EMAILS_SENT_EVENT = "signing_completion_emails_sent"


def maybe_send_signing_completion_emails(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    org_id: str | None = None,
) -> Dict[str, Any] | None:
    """
    Email every signer party when the agreement is fully executed.

    Never raises. Returns an audit event dict when at least one send succeeded.
    """
    aid = (agreement_id or "").strip()
    if not aid:
        return None

    audit_log = draft.get("audit_log") or []
    if _signing_completion_emails_already_sent(audit_log):
        _log.info(
            "[signing-completion-email] skipped agreement_id=%s skip_reason=already_sent sent_count=0",
            aid,
        )
        return None

    if not email_configured():
        _log.info(
            "[signing-completion-email] skipped agreement_id=%s skip_reason=email_not_configured",
            aid,
        )
        return None

    targets = _normalize_signing_completion_targets(draft)
    if not targets:
        _log.info(
            "[signing-completion-email] skipped agreement_id=%s skip_reason=no_eligible_targets",
            aid,
        )
        return None

    title = str(draft.get("title") or "").strip() or "Untitled agreement"
    party_names = _party_display_names_from_draft(draft)
    origin = (app_public_origin() or "").rstrip("/")
    proof_url = f"{origin}/app/agreements/{quote(aid)}/verify" if origin else ""

    sent_count = 0
    failed_count = 0
    for target in targets:
        email = build_signing_complete_email(
            party_name=target["display_name"],
            agreement_title=title,
            proof_url=proof_url,
            party_names=party_names,
        )
        result = send_email_non_fatal(
            to=target["email"],
            subject=email.subject,
            html=email.html,
            text=email.text,
            context="signing_completion",
        )
        if result.ok:
            sent_count += 1
        else:
            failed_count += 1

    _log.info(
        "[signing-completion-email] complete agreement_id=%s target_count=%s sent_count=%s failed_count=%s",
        aid,
        len(targets),
        sent_count,
        failed_count,
    )

    if sent_count < 1:
        return None

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "event_type": SIGNING_COMPLETION_EMAILS_SENT_EVENT,
        "at": now,
        "field": "signing_completion",
        "value": {
            "sent_count": sent_count,
            "failed_count": failed_count,
        },
    }


def _signing_completion_emails_already_sent(audit_log: Any) -> bool:
    if str(audit_log.__class__.__name__) == "list" or isinstance(audit_log, list):
        for event in audit_log:
            if not isinstance(event, dict):
                continue
            if str(event.get("event_type") or "") == SIGNING_COMPLETION_EMAILS_SENT_EVENT:
                return True
    return False


def _normalize_signing_completion_targets(draft: Dict[str, Any]) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    seen: set[str] = set()
    for p in draft.get("parties") or []:
        if not isinstance(p, dict):
            continue
        role = str(p.get("role") or "").strip().lower()
        if role and role != "signer":
            continue
        email = str(p.get("email") or "").strip().lower()
        if not email or "@" not in email or email in seen:
            continue
        seen.add(email)
        display_name = str(p.get("name") or "").strip() or email.split("@", 1)[0]
        out.append({"email": email, "display_name": display_name})
    return out
