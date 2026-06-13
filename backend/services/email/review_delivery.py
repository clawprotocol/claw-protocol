"""Server-side review invitation emails after ``review-sent`` (non-fatal)."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List
from urllib.parse import quote

from backend.config.agreement_signing_token import (
    SigningTokenSecretMissingInProductionError,
    resolve_signing_token_secret_raw,
)
from backend.config.email_config import (
    app_public_origin,
    email_configured,
    email_from,
    resend_api_key,
    review_delivery_mode,
)
from backend.config.runtime_environment import clamp_recipient_token_ttl_seconds
from backend.security.recipient_access_token import RecipientRole, mint_recipient_access_token
from backend.services.agreement_signing_lock_store import read_signing_lock
from backend.services.email.delivery import send_email_non_fatal
from backend.services.email.templates.review_invite import build_review_invite_email
from backend.services.email.templates.review_owner_notification import (
    build_review_owner_notification_email,
    build_review_owner_signing_ready_notification_email,
)

_log = logging.getLogger(__name__)

OWNER_REVIEW_APPROVAL_NOTIFIED_EVENT = "owner_review_approval_notified"


@dataclass(frozen=True)
class ReviewInviteTarget:
    to: str
    party_name: str
    agreement_title: str
    recipient_party_id: str | None
    mint_role: RecipientRole


def maybe_send_review_invites_after_review_sent(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    org_id: str | None = None,
) -> str | None:
    """
    Send review invites when delivery mode allows and Resend is configured.

    Never raises — failures are logged only.

    Returns an ISO timestamp to persist on ``review_invite_emails_sent_at`` when at least one
    Resend send succeeded (idempotent guard for duplicate ``review-sent`` calls).
    """
    aid = (agreement_id or "").strip()
    oid = (org_id or "").strip() or None
    mode = review_delivery_mode()
    resend_key_present = bool(resend_api_key())
    email_from_present = bool(email_from())
    origin_present = bool(app_public_origin())
    configured = email_configured()

    _log.info(
        "[review-email-delivery] start agreement_id=%s org_id=%s delivery_mode=%s "
        "resend_api_key_present=%s email_from_present=%s app_public_origin_present=%s email_configured=%s "
        "review_sent_at_present=%s review_invite_emails_sent_at_present=%s",
        aid,
        oid or "",
        mode,
        resend_key_present,
        email_from_present,
        origin_present,
        configured,
        bool(str(draft.get("review_sent_at") or "").strip()),
        bool(str(draft.get("review_invite_emails_sent_at") or "").strip()),
    )
    _log_party_contact_snapshot(aid, oid, draft)

    if mode not in ("email", "manual_and_email"):
        _log.info(
            "[review-email-delivery] skipped agreement_id=%s org_id=%s skip_reason=delivery_mode_not_email "
            "delivery_mode=%s recipient_row_count=0 send_attempt_count=0 sent_count=0 failed_count=0",
            aid,
            oid or "",
            mode,
        )
        return None

    if not configured:
        _log.warning(
            "[review-email-delivery] skipped agreement_id=%s org_id=%s skip_reason=email_not_configured "
            "delivery_mode=%s resend_api_key_present=%s email_from_present=%s app_public_origin_present=%s "
            "recipient_row_count=0 send_attempt_count=0 sent_count=0 failed_count=0",
            aid,
            oid or "",
            mode,
            resend_key_present,
            email_from_present,
            origin_present,
        )
        return None

    origin = app_public_origin()
    if not origin:
        _log.warning(
            "[review-email-delivery] skipped agreement_id=%s org_id=%s skip_reason=app_public_origin_missing "
            "delivery_mode=%s app_public_origin_present=false recipient_row_count=0 send_attempt_count=0 "
            "sent_count=0 failed_count=0",
            aid,
            oid or "",
            mode,
        )
        return None

    if not _draft_has_explicit_owner_party(draft):
        _log.info(
            "[review-email-delivery] skipped agreement_id=%s org_id=%s skip_reason=owner_role_missing "
            "delivery_mode=%s recipient_row_count=0 send_attempt_count=0 sent_count=0 failed_count=0",
            aid,
            oid or "",
            mode,
        )
        return None

    targets = _live_resend_review_invite_targets_from_draft(draft)
    recipient_row_count = len(targets)
    _log_review_invite_target_policy(aid, oid, draft, targets)
    _log.info(
        "[review-email-delivery] recipients agreement_id=%s org_id=%s recipient_count=%s "
        "recipient_emails_redacted=%s",
        aid,
        oid or "",
        recipient_row_count,
        _redact_recipient_emails(targets),
    )
    if not targets:
        parties = draft.get("parties") or []
        party_count = len(parties) if isinstance(parties, list) else 0
        party_email_count = sum(
            1
            for p in parties
            if isinstance(p, dict) and str(p.get("email") or "").strip()
        )
        _log.warning(
            "[review-email-delivery] skipped agreement_id=%s org_id=%s skip_reason=no_eligible_recipients "
            "delivery_mode=%s party_count=%s party_email_count=%s recipient_row_count=0 "
            "party_snapshot=%s send_attempt_count=0 sent_count=0 failed_count=0",
            aid,
            oid or "",
            mode,
            party_count,
            party_email_count,
            _party_contact_snapshot_for_log(parties),
        )
        return None

    try:
        secret = resolve_signing_token_secret_raw().encode("utf-8")
    except SigningTokenSecretMissingInProductionError:
        _log.warning(
            "[review-email-delivery] skipped agreement_id=%s org_id=%s skip_reason=signing_token_secret_missing "
            "delivery_mode=%s recipient_row_count=%s send_attempt_count=0 sent_count=0 failed_count=0",
            aid,
            oid or "",
            mode,
            recipient_row_count,
        )
        return None

    lock = read_signing_lock(agreement_id)
    locked_version_id = str((lock or {}).get("locked_version_id") or "")
    ttl = _default_recipient_token_ttl_seconds()

    sent = 0
    failed = 0
    send_attempt_count = 0
    for target in targets:
        try:
            token = mint_recipient_access_token(
                secret=secret,
                agreement_id=agreement_id,
                locked_version_id=locked_version_id,
                mode="review",
                role=target.mint_role,
                ttl_seconds=ttl,
                recipient_party_id=target.recipient_party_id,
            )
        except Exception as exc:  # noqa: BLE001
            _log.warning(
                "[review-email-delivery] mint_failed agreement_id=%s org_id=%s to=%s err=%s",
                aid,
                oid or "",
                _redact_to(target.to),
                exc,
            )
            failed += 1
            continue

        review_url = _build_absolute_review_url(origin, agreement_id, token)
        email = build_review_invite_email(
            party_name=target.party_name,
            agreement_title=target.agreement_title,
            review_url=review_url,
            requesting_party_name=_owner_display_name_from_draft(draft),
            party_names=_party_display_names_from_draft(draft),
        )
        send_attempt_count += 1
        result = send_email_non_fatal(
            to=target.to,
            subject=email.subject,
            html=email.html,
            text=email.text,
            context="review_invite",
        )
        if result.ok:
            sent += 1
        else:
            failed += 1

    _log.info(
        "[review-email-delivery] complete agreement_id=%s org_id=%s delivery_mode=%s "
        "recipient_count=%s recipient_emails_redacted=%s send_attempt_count=%s sent_count=%s failed_count=%s",
        aid,
        oid or "",
        mode,
        recipient_row_count,
        _redact_recipient_emails(targets),
        send_attempt_count,
        sent,
        failed,
    )
    if sent < 1:
        return None
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def maybe_notify_owner_after_reviewer_approval(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    approver_participant_id: str | None,
    approver_display_name: str | None,
    org_id: str | None = None,
) -> Dict[str, Any] | None:
    """
    Notify the agreement owner that an external reviewer approved.

    Never raises. Returns an audit event dict to append when a send was attempted;
    returns None when skipped or when email delivery is not configured.
    """
    aid = (agreement_id or "").strip()
    oid = (org_id or "").strip() or None
    participant_id = (approver_participant_id or "").strip()
    reviewer_name = (approver_display_name or "").strip()

    _log.info(
        "[review-owner-notification] start agreement_id=%s org_id=%s approver_participant_id=%s",
        aid,
        oid or "",
        participant_id or "none",
    )

    if not participant_id:
        _log.info(
            "[review-owner-notification] skipped agreement_id=%s org_id=%s skip_reason=participant_id_missing sent_count=0",
            aid,
            oid or "",
        )
        return None

    audit_log = draft.get("audit_log") or []
    if _owner_notification_already_sent(audit_log, participant_id):
        _log.info(
            "[review-owner-notification] skipped agreement_id=%s org_id=%s skip_reason=already_notified "
            "participant_id=%s sent_count=0",
            aid,
            oid or "",
            participant_id,
        )
        return None

    if not email_configured():
        _log.info(
            "[review-owner-notification] skipped agreement_id=%s org_id=%s skip_reason=email_not_configured sent_count=0",
            aid,
            oid or "",
        )
        return None

    origin = app_public_origin()
    if not origin:
        _log.info(
            "[review-owner-notification] skipped agreement_id=%s org_id=%s skip_reason=app_public_origin_missing sent_count=0",
            aid,
            oid or "",
        )
        return None

    owner_party = _owner_party_from_draft(draft)
    if not owner_party:
        _log.info(
            "[review-owner-notification] skipped agreement_id=%s org_id=%s skip_reason=owner_party_missing sent_count=0",
            aid,
            oid or "",
        )
        return None

    owner_email = str(owner_party.get("email") or "").strip().lower()
    owner_name = str(owner_party.get("name") or "").strip()
    if not owner_email or "@" not in owner_email:
        _log.info(
            "[review-owner-notification] skipped agreement_id=%s org_id=%s skip_reason=owner_email_missing sent_count=0",
            aid,
            oid or "",
        )
        return None

    approver_party = _party_by_id(draft, participant_id)
    if approver_party and _normalize_workflow_role(str(approver_party.get("role") or "")) == "owner":
        _log.info(
            "[review-owner-notification] skipped agreement_id=%s org_id=%s skip_reason=approver_is_owner sent_count=0",
            aid,
            oid or "",
        )
        return None

    if not reviewer_name and approver_party:
        reviewer_name = str(approver_party.get("name") or "").strip()
    if not reviewer_name:
        reviewer_name = "A reviewer"

    title = str(draft.get("title") or "").strip() or "Untitled agreement"
    dashboard_url = _build_owner_dashboard_url(origin, aid)
    signing_prep_url = _build_owner_signing_prep_url(origin, aid)
    all_reviews_complete = _all_required_review_parties_approved(draft)
    if all_reviews_complete:
        email = build_review_owner_signing_ready_notification_email(
            owner_name=owner_name,
            agreement_title=title,
            reviewer_display_name=reviewer_name,
            signing_prep_url=signing_prep_url,
            dashboard_url=dashboard_url,
        )
    else:
        email = build_review_owner_notification_email(
            owner_name=owner_name,
            agreement_title=title,
            reviewer_display_name=reviewer_name,
            dashboard_url=dashboard_url,
        )
    result = send_email_non_fatal(
        to=owner_email,
        subject=email.subject,
        html=email.html,
        text=email.text,
        context="review_owner_notification",
    )
    sent_count = 1 if result.ok else 0
    _log.info(
        "[review-owner-notification] complete agreement_id=%s org_id=%s participant_id=%s "
        "owner_email_present=true sent_count=%s failed=%s",
        aid,
        oid or "",
        participant_id,
        sent_count,
        not result.ok,
    )
    if not result.ok:
        return None

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "event_type": OWNER_REVIEW_APPROVAL_NOTIFIED_EVENT,
        "at": now,
        "field": "owner_notification",
        "value": {
            "participant_id": participant_id,
            "approver_display_name": reviewer_name,
            "owner_email_redacted": _redact_to(owner_email),
        },
    }


def _owner_notification_already_sent(audit_log: Any, participant_id: str) -> bool:
    if not isinstance(audit_log, list):
        return False
    pid = (participant_id or "").strip()
    if not pid:
        return False
    for event in audit_log:
        if not isinstance(event, dict):
            continue
        if str(event.get("event_type") or "") != OWNER_REVIEW_APPROVAL_NOTIFIED_EVENT:
            continue
        value = event.get("value")
        if isinstance(value, dict) and str(value.get("participant_id") or "").strip() == pid:
            return True
    return False


def _owner_display_name_from_draft(d: Dict[str, Any]) -> str:
    owner = _owner_party_from_draft(d)
    if not owner:
        return ""
    return str(owner.get("name") or "").strip()


def _party_display_names_from_draft(d: Dict[str, Any]) -> List[str]:
    parties = d.get("parties") or []
    if not isinstance(parties, list):
        return []
    out: List[str] = []
    for party in parties:
        if not isinstance(party, dict):
            continue
        name = str(party.get("name") or "").strip()
        if name:
            out.append(name)
    return out


def _owner_party_from_draft(d: Dict[str, Any]) -> Dict[str, Any] | None:
    parties = d.get("parties") or []
    if not isinstance(parties, list):
        return None
    client_fallback: Dict[str, Any] | None = None
    for party in parties:
        if not isinstance(party, dict):
            continue
        raw_role = str(party.get("role") or "").strip().lower()
        if _normalize_workflow_role(raw_role) == "owner":
            return party
        if raw_role == "client" and client_fallback is None:
            client_fallback = party
    return client_fallback


def _party_by_id(d: Dict[str, Any], participant_id: str) -> Dict[str, Any] | None:
    parties = d.get("parties") or []
    if not isinstance(parties, list):
        return None
    pid = (participant_id or "").strip()
    for party in parties:
        if not isinstance(party, dict):
            continue
        if str(party.get("id") or "").strip() == pid:
            return party
    return None


def _build_owner_dashboard_url(origin: str, agreement_id: str) -> str:
    base = origin.rstrip("/")
    aid = quote(agreement_id.strip(), safe="")
    return f"{base}/app?focus={aid}"


def _build_owner_signing_prep_url(origin: str, agreement_id: str) -> str:
    base = origin.rstrip("/")
    aid = quote(agreement_id.strip(), safe="")
    return f"{base}/app/done/{aid}"


def _approved_participant_ids_from_audit(audit: Any) -> set[str]:
    out: set[str] = set()
    if not isinstance(audit, list):
        return out
    for event in audit:
        if not isinstance(event, dict):
            continue
        et = str(event.get("event_type") or "")
        if et not in ("participant_approved", "recipient_approved"):
            continue
        val = event.get("value") or {}
        if not isinstance(val, dict):
            continue
        pid = str(val.get("participant_id") or "").strip()
        if pid:
            out.add(pid)
    return out


def _open_recipient_proposals_exist(audit: Any) -> bool:
    if not isinstance(audit, list):
        return False
    open_ids: set[str] = set()
    closed_ids: set[str] = set()
    for event in audit:
        if not isinstance(event, dict):
            continue
        et = str(event.get("event_type") or "")
        val = event.get("value") or {}
        if not isinstance(val, dict):
            continue
        pid = str(val.get("proposal_id") or "").strip()
        if not pid:
            continue
        if et == "recipient_proposal_pending":
            open_ids.add(pid)
        elif et in ("recipient_proposal_applied", "recipient_proposal_rejected", "recipient_proposal_withdrawn"):
            closed_ids.add(pid)
    return bool(open_ids - closed_ids)


def _resolve_owner_party_index(parties: list[Any]) -> int:
    for i, party in enumerate(parties):
        if not isinstance(party, dict):
            continue
        if _normalize_workflow_role(str(party.get("role") or "")) == "owner":
            return i
    return 0


def _party_requires_review_approval(
    party: Dict[str, Any],
    party_index: int,
    parties: list[Any],
) -> bool:
    role = _normalize_workflow_role(str(party.get("role") or ""))
    if role in ("viewer", "owner"):
        return False
    if role == "reviewer":
        return True
    has_explicit_reviewer = any(
        isinstance(p, dict) and _normalize_workflow_role(str(p.get("role") or "")) == "reviewer"
        for p in parties
    )
    if has_explicit_reviewer:
        return False
    if party_index == _resolve_owner_party_index(parties):
        return False
    name = str(party.get("name") or "").strip()
    email = str(party.get("email") or "").strip().lower()
    return bool(name and email and "@" in email)


def _all_required_review_parties_approved(draft: Dict[str, Any]) -> bool:
    parties = draft.get("parties") or []
    if not isinstance(parties, list) or not parties:
        return False
    audit = draft.get("audit_log") or []
    if _open_recipient_proposals_exist(audit):
        return False
    approved_ids = _approved_participant_ids_from_audit(audit)
    required: list[str] = []
    for i, party in enumerate(parties):
        if not isinstance(party, dict):
            continue
        if not _party_requires_review_approval(party, i, parties):
            continue
        party_id = str(party.get("id") or "").strip()
        if not party_id:
            return False
        required.append(party_id)
    if not required:
        return False
    return all(pid in approved_ids for pid in required)


def _draft_has_explicit_owner_party(d: Dict[str, Any]) -> bool:
    """True when at least one party has an owner-normalized role (owner/sender/landlord)."""
    parties = d.get("parties") or []
    if not isinstance(parties, list):
        return False
    for party in parties:
        if not isinstance(party, dict):
            continue
        if _normalize_workflow_role(str(party.get("role") or "")) == "owner":
            return True
    return False


def _live_resend_review_invite_targets_from_draft(d: Dict[str, Any]) -> List[ReviewInviteTarget]:
    """
    Live Resend review invite recipients only.

    Requires an explicit owner-normalized party role on the draft (see ``_draft_has_explicit_owner_party``).
    Excludes owner-normalized parties by role metadata only — never by array index fallback.
    """
    parties = d.get("parties") or []
    if not isinstance(parties, list) or not parties:
        return []
    if not _draft_has_explicit_owner_party(d):
        return []

    title = str(d.get("title") or "").strip() or "Untitled agreement"
    out: List[ReviewInviteTarget] = []

    for party in parties:
        if not isinstance(party, dict):
            continue
        role = _normalize_workflow_role(str(party.get("role") or ""))
        if role == "owner":
            continue
        name = str(party.get("name") or "").strip()
        email = str(party.get("email") or "").strip().lower()
        if not name or not email or "@" not in email:
            continue
        party_id = str(party.get("id") or "").strip() or None
        mint_role: RecipientRole = "reviewer" if role == "reviewer" else "recipient"
        out.append(
            ReviewInviteTarget(
                to=email,
                party_name=name,
                agreement_title=title,
                recipient_party_id=party_id,
                mint_role=mint_role,
            )
        )
    return out


def _log_review_invite_target_policy(
    agreement_id: str,
    org_id: str | None,
    draft: Dict[str, Any],
    targets: List[ReviewInviteTarget],
) -> None:
    """Log owner exclusion vs external reviewer eligibility (no full emails)."""
    parties = draft.get("parties") or []
    owner_idx = next(
        (
            i
            for i, p in enumerate(parties)
            if isinstance(p, dict) and _normalize_workflow_role(str(p.get("role") or "")) == "owner"
        ),
        -1,
    )
    owner_party = (
        parties[owner_idx]
        if isinstance(parties, list) and owner_idx >= 0 and len(parties) > owner_idx
        else {}
    )
    owner_email = ""
    owner_name = ""
    if isinstance(owner_party, dict):
        owner_email = str(owner_party.get("email") or "").strip().lower()
        owner_name = str(owner_party.get("name") or "").strip()
    owner_domain = owner_email.split("@", 1)[1] if "@" in owner_email else ""
    _log.info(
        "[review-email-delivery] recipient_policy agreement_id=%s org_id=%s owner_excluded=true "
        "owner_party_index=%s owner_name=%s owner_email_present=%s owner_email_domain=%s "
        "external_invite_count=%s external_invite_domains=%s",
        agreement_id,
        org_id or "",
        owner_idx,
        owner_name[:80] or "unknown",
        bool(owner_email),
        owner_domain or "none",
        len(targets),
        sorted({t.to.split("@", 1)[1] for t in targets if "@" in t.to}),
    )


def _build_absolute_review_url(origin: str, agreement_id: str, token: str) -> str:
    base = origin.rstrip("/")
    aid = quote(agreement_id.strip(), safe="")
    tok = quote(token.strip(), safe="")
    return f"{base}/agreements/{aid}/review?t={tok}"


def _default_recipient_token_ttl_seconds() -> int:
    env_ttl = os.getenv("CLAW_RECIPIENT_TOKEN_TTL_SECONDS", "").strip()
    raw_ttl = int(env_ttl) if env_ttl else 60 * 60 * 24 * 7
    return clamp_recipient_token_ttl_seconds(raw_ttl)


def _normalize_workflow_role(role: str) -> str:
    r = (role or "").strip().lower()
    if r in ("owner", "sender", "landlord"):
        return "owner"
    if r in ("signer", "signatory"):
        return "signer"
    if r in ("reviewer",):
        return "reviewer"
    if r in ("viewer", "counterparty", "fyi", "copy", "read_only", "readonly"):
        return "viewer"
    return r or "party"


def _redact_to(email: str) -> str:
    e = (email or "").strip().lower()
    if "@" not in e:
        return "invalid"
    local, domain = e.split("@", 1)
    if not local:
        return f"***@{domain}"
    return f"{local[0]}***@{domain}"


def _redact_recipient_emails(targets: List[ReviewInviteTarget]) -> str:
    if not targets:
        return "none"
    return ",".join(_redact_to(t.to) for t in targets)


def send_review_invite_to_participant(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    participant_id: str,
    org_id: str | None = None,
) -> bool:
    """
    Send a single review invite to one party (used after email correction / resend).

    Never raises. Returns True when Resend accepted the send.
    """
    aid = (agreement_id or "").strip()
    pid = (participant_id or "").strip()
    if not aid or not pid:
        return False

    mode = review_delivery_mode()
    if mode not in ("email", "manual_and_email") or not email_configured():
        return False

    origin = app_public_origin()
    if not origin or not _draft_has_explicit_owner_party(draft):
        return False

    targets = _live_resend_review_invite_targets_from_draft(draft)
    target = next((t for t in targets if (t.recipient_party_id or "") == pid), None)
    if not target:
        return False

    try:
        secret = resolve_signing_token_secret_raw().encode("utf-8")
    except SigningTokenSecretMissingInProductionError:
        return False

    lock = read_signing_lock(agreement_id)
    locked_version_id = str((lock or {}).get("locked_version_id") or "")
    ttl = _default_recipient_token_ttl_seconds()

    try:
        token = mint_recipient_access_token(
            secret=secret,
            agreement_id=agreement_id,
            locked_version_id=locked_version_id,
            mode="review",
            role=target.mint_role,
            ttl_seconds=ttl,
            recipient_party_id=target.recipient_party_id,
        )
    except Exception:  # noqa: BLE001
        return False

    review_url = _build_absolute_review_url(origin, agreement_id, token)
    email = build_review_invite_email(
        party_name=target.party_name,
        agreement_title=target.agreement_title,
        review_url=review_url,
        requesting_party_name=_owner_display_name_from_draft(draft),
        party_names=_party_display_names_from_draft(draft),
    )
    result = send_email_non_fatal(
        to=target.to,
        subject=email.subject,
        html=email.html,
        text=email.text,
        context="review_invite_resend",
    )
    return bool(result.ok)


def _party_contact_snapshot_for_log(parties: Any) -> str:
    if not isinstance(parties, list):
        return "none"
    parts: List[str] = []
    for i, party in enumerate(parties):
        if not isinstance(party, dict):
            continue
        role = str(party.get("role") or "").strip() or "party"
        email = str(party.get("email") or "").strip()
        parts.append(
            f"i={i}:role={role}:email_present={bool(email)}:email={_redact_to(email) if email else 'none'}"
        )
    return ";".join(parts) if parts else "none"


def _log_party_contact_snapshot(agreement_id: str, org_id: str | None, draft: Dict[str, Any]) -> None:
    parties = draft.get("parties") or []
    party_count = len(parties) if isinstance(parties, list) else 0
    _log.info(
        "[review-email-delivery] party_snapshot agreement_id=%s org_id=%s party_count=%s snapshot=%s",
        agreement_id,
        org_id or "",
        party_count,
        _party_contact_snapshot_for_log(parties),
    )
