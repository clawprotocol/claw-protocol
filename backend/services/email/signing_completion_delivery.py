"""Completion emails after all VS01 signers finish (non-fatal, idempotent)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List
from urllib.parse import quote

from backend.config.email_config import app_public_origin, email_configured
from backend.services.email.delivery import send_email_non_fatal
from backend.services.email.review_delivery import _redact_to
from backend.services.email.templates.signing_complete import build_signing_complete_email
from backend.services.vs01_fully_executed_snapshot import parse_signature_completed_events
from backend.services.vs01_signer_completion import fully_executed_snapshot_ready

_log = logging.getLogger(__name__)

SIGNING_COMPLETION_EMAILS_SENT_EVENT = "signing_completion_emails_sent"

_COMPLETION_ELIGIBLE_PARTY_ROLES = frozenset(
    {"", "signer", "owner", "party", "counterparty", "provider", "client", "service_provider"}
)


def maybe_send_signing_completion_emails(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    org_id: str | None = None,
) -> Dict[str, Any] | None:
    """
    Email every signing party when the agreement is fully executed.

    Never raises. Returns an audit event dict when all intended recipients were sent.
    """
    aid = (agreement_id or "").strip()
    oid = (org_id or "").strip() or None
    if not aid:
        return None

    _log.info(
        "[signing-completion-email] start agreement_id=%s org_id=%s",
        aid,
        oid or "none",
    )

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

    if not fully_executed_snapshot_ready(draft):
        _log.info(
            "[signing-completion-email] skipped agreement_id=%s skip_reason=signed_snapshot_not_ready",
            aid,
        )
        return None

    targets = resolve_signing_completion_email_targets(draft)
    _log.info(
        "[signing-completion-email] targets agreement_id=%s target_count=%s emails=%s",
        aid,
        len(targets),
        ",".join(_redact_to(t["email"]) for t in targets) if targets else "none",
    )
    if not targets:
        _log.info(
            "[signing-completion-email] skipped agreement_id=%s skip_reason=no_eligible_targets",
            aid,
        )
        return None

    title = str(draft.get("title") or "").strip() or "Untitled agreement"
    origin = (app_public_origin() or "").rstrip("/")
    view_signed_url = f"{origin}/app/agreements/{quote(aid)}/view-signed" if origin else ""
    completed_at_display = _fully_executed_completed_at_display(audit_log)
    party_summary_lines = _signing_completion_party_summary_lines(draft)

    sent_count = 0
    failed_count = 0
    for target in targets:
        email = build_signing_complete_email(
            party_name=target["display_name"],
            agreement_title=title,
            view_signed_url=view_signed_url,
            completed_at_display=completed_at_display,
            party_summary_lines=party_summary_lines,
            download_url=view_signed_url or None,
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
            _log.info(
                "[signing-completion-email] sent agreement_id=%s to=%s",
                aid,
                _redact_to(target["email"]),
            )
        else:
            failed_count += 1
            _log.warning(
                "[signing-completion-email] failed agreement_id=%s to=%s",
                aid,
                _redact_to(target["email"]),
            )

    _log.info(
        "[signing-completion-email] complete agreement_id=%s target_count=%s sent_count=%s failed_count=%s",
        aid,
        len(targets),
        sent_count,
        failed_count,
    )

    if sent_count < 1:
        return None

    if sent_count < len(targets):
        _log.warning(
            "[signing-completion-email] partial agreement_id=%s sent_count=%s target_count=%s "
            "(no audit marker — safe to retry)",
            aid,
            sent_count,
            len(targets),
        )
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


def resolve_signing_completion_email_targets(draft: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Resolve completion-email recipients from VS01 portable roles and draft parties.

    Production agreements commonly use role=owner + role=party (not role=signer).
    """
    out: List[Dict[str, str]] = []
    seen: set[str] = set()

    def add(email: str, display_name: str) -> None:
        em = (email or "").strip().lower()
        if not em or "@" not in em or em in seen:
            return
        seen.add(em)
        out.append(
            {
                "email": em,
                "display_name": (display_name or "").strip() or em.split("@", 1)[0],
            }
        )

    stored = draft.get("vs01_signing_packet_v1")
    portable = stored.get("portable") if isinstance(stored, dict) else None
    if isinstance(portable, dict):
        for role in portable.get("roles") or []:
            if not isinstance(role, dict):
                continue
            if role.get("requiresSignature", True) is False:
                continue
            email = str(role.get("signerEmail") or role.get("reviewEmail") or "").strip()
            if not email:
                continue
            display = (
                str(role.get("signerName") or "").strip()
                or str(role.get("entityName") or "").strip()
                or str(role.get("partyName") or "").strip()
            )
            add(email, display)

    for party in draft.get("parties") or []:
        if not isinstance(party, dict):
            continue
        role = str(party.get("role") or "").strip().lower()
        if role in ("reviewer", "witness", "observer"):
            continue
        if role and role not in _COMPLETION_ELIGIBLE_PARTY_ROLES:
            continue
        email = str(party.get("email") or "").strip()
        if not email:
            continue
        display = str(party.get("signerName") or party.get("name") or "").strip()
        add(email, display)

    return out


def _signing_completion_party_summary_lines(draft: Dict[str, Any]) -> List[str]:
    events = parse_signature_completed_events(draft.get("audit_log"))
    if not events:
        return []

    stored = draft.get("vs01_signing_packet_v1")
    portable = stored.get("portable") if isinstance(stored, dict) else None
    roles: List[Dict[str, Any]] = []
    if isinstance(portable, dict) and isinstance(portable.get("roles"), list):
        roles = [r for r in portable["roles"] if isinstance(r, dict)]

    lines: List[str] = []
    for event in events:
        rid = event.get("signer_role_id") or ""
        role = next((r for r in roles if str(r.get("roleId") or "").strip() == rid), None)
        party_name = ""
        signer_name = (event.get("display_name") or "").strip()
        if isinstance(role, dict):
            party_name = (
                str(role.get("entityName") or "").strip()
                or str(role.get("partyName") or "").strip()
                or str(role.get("roleLabel") or "").strip()
            )
            if not signer_name:
                signer_name = str(role.get("signerName") or "").strip()
        if not party_name:
            for audit_event in draft.get("audit_log") or []:
                if not isinstance(audit_event, dict):
                    continue
                if str(audit_event.get("event_type") or "") != "signature_completed":
                    continue
                val = audit_event.get("value")
                if not isinstance(val, dict):
                    continue
                if str(val.get("signer_role_id") or "").strip() != rid:
                    continue
                pid = str(val.get("participant_id") or "").strip()
                if pid:
                    for party in draft.get("parties") or []:
                        if isinstance(party, dict) and str(party.get("id") or "").strip() == pid:
                            party_name = str(party.get("name") or "").strip()
                            if not signer_name:
                                signer_name = str(party.get("signerName") or "").strip()
                            break
                break
        ts = (event.get("signed_date_display") or "").strip() or _format_audit_timestamp(
            event.get("signed_at") or ""
        )
        party_label = party_name or signer_name or "Signer"
        signer_label = signer_name or party_name or "Signer"
        lines.append(f"{party_label} — signed by {signer_label} at {ts or 'completion'}")
    return lines


def _fully_executed_completed_at_display(audit_log: Any) -> str:
    for event in reversed(list(audit_log or [])):
        if not isinstance(event, dict):
            continue
        if str(event.get("event_type") or "") != "signed":
            continue
        val = event.get("value")
        if isinstance(val, dict) and val.get("fully_executed"):
            return _format_audit_timestamp(str(event.get("at") or ""))
    events = parse_signature_completed_events(audit_log)
    if events:
        return _format_audit_timestamp(events[-1].get("signed_at") or "")
    return ""


def _format_audit_timestamp(iso: str) -> str:
    raw = (iso or "").strip()
    if not raw:
        return ""
    try:
        normalized = raw.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).strftime("%B %d, %Y at %I:%M %p UTC")
    except ValueError:
        if len(raw) >= 10:
            try:
                d = datetime.fromisoformat(f"{raw[:10]}T12:00:00")
                return d.strftime("%B %d, %Y")
            except ValueError:
                pass
        return raw


def _signing_completion_emails_already_sent(audit_log: Any) -> bool:
    if str(audit_log.__class__.__name__) == "list" or isinstance(audit_log, list):
        for event in audit_log:
            if not isinstance(event, dict):
                continue
            if str(event.get("event_type") or "") == SIGNING_COMPLETION_EMAILS_SENT_EVENT:
                return True
    return False


# Backward-compatible alias for tests/imports.
_normalize_signing_completion_targets = resolve_signing_completion_email_targets
