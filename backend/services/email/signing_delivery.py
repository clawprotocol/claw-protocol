"""Server-side signing invitation emails after VS01 packet prepare (non-fatal)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List
from urllib.parse import urlparse

from backend.config.email_config import app_public_origin, email_configured
from backend.services.email.delivery import send_email_non_fatal
from backend.services.email.review_delivery import (
    _owner_display_name_from_draft,
    _party_display_names_from_draft,
    _redact_to,
)
from backend.services.email.templates.signing_invite import build_signing_invite_email

_log = logging.getLogger(__name__)

SIGNING_INVITE_EMAILS_SENT_EVENT = "signing_invite_emails_sent"


def maybe_send_signing_invites_after_packet_prepared(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    targets: List[Dict[str, Any]],
    packet_revision: str | None = None,
    org_id: str | None = None,
) -> Dict[str, Any] | None:
    """
    Email every prepared signer their VS01 signing URL.

    Never raises. Returns an audit event dict when at least one send succeeded.
    """
    aid = (agreement_id or "").strip()
    oid = (org_id or "").strip() or None
    revision = (packet_revision or "").strip() or None

    _log.info(
        "[signing-email-delivery] start agreement_id=%s org_id=%s packet_revision=%s target_count=%s",
        aid,
        oid or "",
        revision or "none",
        len(targets),
    )

    if not aid:
        return None

    audit_log = draft.get("audit_log") or []
    if _signing_invites_already_sent(audit_log, revision):
        _log.info(
            "[signing-email-delivery] skipped agreement_id=%s org_id=%s skip_reason=already_sent "
            "packet_revision=%s sent_count=0",
            aid,
            oid or "",
            revision or "none",
        )
        return None

    if not email_configured():
        _log.info(
            "[signing-email-delivery] skipped agreement_id=%s org_id=%s skip_reason=email_not_configured sent_count=0",
            aid,
            oid or "",
        )
        return None

    eligible = _normalize_signing_invite_targets(targets)
    if not eligible:
        _log.info(
            "[signing-email-delivery] skipped agreement_id=%s org_id=%s skip_reason=no_eligible_targets sent_count=0",
            aid,
            oid or "",
        )
        return None

    title = str(draft.get("title") or "").strip() or "Untitled agreement"
    requester = _owner_display_name_from_draft(draft)
    party_names = _party_display_names_from_draft(draft)

    sent_count = 0
    failed_count = 0
    sent_role_ids: List[str] = []
    for target in eligible:
        email = build_signing_invite_email(
            party_name=target["display_name"],
            agreement_title=title,
            signing_url=target["signing_url"],
            requesting_party_name=requester,
            party_names=party_names,
        )
        result = send_email_non_fatal(
            to=target["email"],
            subject=email.subject,
            html=email.html,
            text=email.text,
            context="signing_invite",
        )
        if result.ok:
            sent_count += 1
            rid = str(target.get("signer_role_id") or "").strip()
            if rid:
                sent_role_ids.append(rid)
            from backend.services.recipient_delivery_registry import record_invite_sent

            participant_id = str(target.get("participant_id") or "").strip()
            if not participant_id:
                participant_id = _participant_id_for_email(draft, target["email"])
            if participant_id:
                record_invite_sent(
                    draft,
                    phase="signing",
                    participant_id=participant_id,
                    email=target["email"],
                    audit_log=draft.setdefault("audit_log", []),
                )
        else:
            failed_count += 1

    _log.info(
        "[signing-email-delivery] complete agreement_id=%s org_id=%s packet_revision=%s "
        "target_count=%s sent_count=%s failed_count=%s",
        aid,
        oid or "",
        revision or "none",
        len(eligible),
        sent_count,
        failed_count,
    )

    if sent_count < 1:
        return None

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "event_type": SIGNING_INVITE_EMAILS_SENT_EVENT,
        "at": now,
        "field": "signing_invite",
        "value": {
            "packet_revision": revision,
            "sent_count": sent_count,
            "failed_count": failed_count,
            "signer_role_ids": sent_role_ids,
        },
    }


def _signing_invites_already_sent(audit_log: Any, packet_revision: str | None) -> bool:
    if not isinstance(audit_log, list):
        return False
    revision = (packet_revision or "").strip()
    for event in audit_log:
        if not isinstance(event, dict):
            continue
        if str(event.get("event_type") or "") != SIGNING_INVITE_EMAILS_SENT_EVENT:
            continue
        if not revision:
            return True
        value = event.get("value")
        if not isinstance(value, dict):
            continue
        if str(value.get("packet_revision") or "").strip() == revision:
            return True
    return False


def _participant_id_for_email(draft: Dict[str, Any], email: str) -> str:
    want = (email or "").strip().lower()
    for p in draft.get("parties") or []:
        if not isinstance(p, dict):
            continue
        if str(p.get("email") or "").strip().lower() == want:
            return str(p.get("id") or "").strip()
    return ""


def _normalize_signing_invite_targets(targets: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    seen: set[str] = set()
    for raw in targets:
        if not isinstance(raw, dict):
            continue
        email = str(raw.get("email") or "").strip().lower()
        url = str(raw.get("signing_url") or "").strip()
        if not email or "@" not in email or not url:
            continue
        if not _looks_like_signing_url(url):
            continue
        if email in seen:
            continue
        seen.add(email)
        display_name = str(raw.get("display_name") or "").strip() or email.split("@", 1)[0]
        out.append(
            {
                "email": email,
                "display_name": display_name,
                "signing_url": url,
                "signer_role_id": str(raw.get("signer_role_id") or "").strip(),
                "participant_id": str(raw.get("participant_id") or "").strip(),
            }
        )
    return out


def _looks_like_signing_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except Exception:  # noqa: BLE001
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    if not (parsed.netloc or "").strip():
        return False
    return True


def send_signing_invite_to_target(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    target: Dict[str, Any],
    packet_revision: str | None = None,
    org_id: str | None = None,
) -> bool:
    """
    Send one signing invite (resend / corrected email). Bypasses bulk idempotency guard.

    Never raises. Returns True when Resend accepted the send.
    """
    aid = (agreement_id or "").strip()
    if not aid or not email_configured():
        return False

    eligible = _normalize_signing_invite_targets([target])
    if not eligible:
        return False

    row = eligible[0]
    title = str(draft.get("title") or "").strip() or "Untitled agreement"
    requester = _owner_display_name_from_draft(draft)
    party_names = _party_display_names_from_draft(draft)

    email = build_signing_invite_email(
        party_name=row["display_name"],
        agreement_title=title,
        signing_url=row["signing_url"],
        requesting_party_name=requester,
        party_names=party_names,
    )
    result = send_email_non_fatal(
        to=row["email"],
        subject=email.subject,
        html=email.html,
        text=email.text,
        context="signing_invite_resend",
    )
    if result.ok:
        _log.info(
            "[signing-email-delivery] resend agreement_id=%s org_id=%s packet_revision=%s signer_role_id=%s",
            aid,
            (org_id or "").strip() or "none",
            (packet_revision or "").strip() or "none",
            row.get("signer_role_id") or "",
        )
        participant_id = str(target.get("participant_id") or "").strip()
        if not participant_id:
            participant_id = _participant_id_for_email(draft, row["email"])
        if participant_id:
            from backend.services.recipient_delivery_registry import record_invite_sent

            record_invite_sent(
                draft,
                phase="signing",
                participant_id=participant_id,
                email=row["email"],
                audit_log=draft.setdefault("audit_log", []),
            )
    return bool(result.ok)


def send_authoritative_signing_invite(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    recipient_email: str,
    recipient_display_name: str,
    signing_url_with_fragment: str,
    idempotency_key: str,
) -> tuple[bool, str | None, str | None]:
    """
    Phase 3C1B single-recipient provider adapter.

    Returns (ok, provider_message_id, failure_code). Never raises.
    """
    aid = (agreement_id or "").strip()
    email = (recipient_email or "").strip()
    url = (signing_url_with_fragment or "").strip()
    if not aid or not email or "@" not in email or not url:
        return False, None, "invalid_delivery_target"
    if not email_configured():
        return False, None, "email_not_configured"
    if "#t=" not in url:
        return False, None, "token_transport_invalid"
    if "?t=" in url.split("#", 1)[0]:
        return False, None, "token_transport_invalid"

    title = str(draft.get("title") or "").strip() or "Untitled agreement"
    requester = _owner_display_name_from_draft(draft)
    party_names = _party_display_names_from_draft(draft)
    built = build_signing_invite_email(
        party_name=recipient_display_name or email.split("@", 1)[0],
        agreement_title=title,
        signing_url=url,
        requesting_party_name=requester,
        party_names=party_names,
    )
    result = send_email_non_fatal(
        to=email,
        subject=built.subject,
        html=built.html,
        text=built.text,
        context="signing_invite_authoritative",
        idempotency_key=(idempotency_key or "").strip() or None,
    )
    if result.ok:
        return True, result.provider_id, None
    failure = (result.error or "provider_send_failed").strip()[:120]
    return False, None, failure or "provider_send_failed"


def default_authoritative_provider_send_fn(
    draft: Dict[str, Any],
) -> Callable[[str, str, str, str, str], tuple[bool, str | None, str | None]]:
    """Build a provider callback bound to draft context for deliver orchestration."""

    def _send(
        agreement_id: str,
        delivery_identity: str,
        recipient_email: str,
        signing_url_with_fragment: str,
        idempotency_key: str,
    ) -> tuple[bool, str | None, str | None]:
        display_name = recipient_email.split("@", 1)[0]
        for record in (
            (draft.get("vs01_signing_invite_delivery_v1") or {}).get("recipients") or {}
        ).values():
            if not isinstance(record, dict):
                continue
            if str(record.get("delivery_identity") or "") != delivery_identity:
                continue
            display_name = str(record.get("signer_name") or display_name)
            break
        return send_authoritative_signing_invite(
            agreement_id=agreement_id,
            draft=draft,
            recipient_email=recipient_email,
            recipient_display_name=display_name,
            signing_url_with_fragment=signing_url_with_fragment,
            idempotency_key=idempotency_key,
        )

    return _send
