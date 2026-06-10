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

_log = logging.getLogger(__name__)


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
    Resend send was attempted (idempotent guard for duplicate ``review-sent`` calls).
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
        "resend_api_key_present=%s email_from_present=%s app_public_origin_present=%s email_configured=%s",
        aid,
        oid or "",
        mode,
        resend_key_present,
        email_from_present,
        origin_present,
        configured,
    )

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

    targets = _review_invite_targets_from_draft(draft)
    recipient_row_count = len(targets)
    if not targets:
        _log.info(
            "[review-email-delivery] skipped agreement_id=%s org_id=%s skip_reason=no_eligible_recipients "
            "delivery_mode=%s recipient_row_count=0 send_attempt_count=0 sent_count=0 failed_count=0",
            aid,
            oid or "",
            mode,
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
        "recipient_row_count=%s send_attempt_count=%s sent_count=%s failed_count=%s",
        aid,
        oid or "",
        mode,
        recipient_row_count,
        send_attempt_count,
        sent,
        failed,
    )
    if send_attempt_count < 1:
        return None
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _review_invite_targets_from_draft(d: Dict[str, Any]) -> List[ReviewInviteTarget]:
    parties = d.get("parties") or []
    if not isinstance(parties, list) or not parties:
        return []

    owner_idx = next(
        (
            i
            for i, p in enumerate(parties)
            if isinstance(p, dict) and _normalize_workflow_role(str(p.get("role") or "")) == "owner"
        ),
        0,
    )
    title = str(d.get("title") or "").strip() or "Untitled agreement"
    out: List[ReviewInviteTarget] = []

    for i, party in enumerate(parties):
        if i == owner_idx:
            continue
        if not isinstance(party, dict):
            continue
        name = str(party.get("name") or "").strip()
        email = str(party.get("email") or "").strip().lower()
        if not name or not email or "@" not in email:
            continue
        role = _normalize_workflow_role(str(party.get("role") or ""))
        if role == "owner":
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
