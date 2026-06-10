"""Server-side review invitation emails after ``review-sent`` (non-fatal)."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, List
from urllib.parse import quote

from backend.config.agreement_signing_token import (
    SigningTokenSecretMissingInProductionError,
    resolve_signing_token_secret_raw,
)
from backend.config.email_config import app_public_origin, email_configured, review_delivery_mode
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


def maybe_send_review_invites_after_review_sent(*, agreement_id: str, draft: Dict[str, Any]) -> None:
    """
    Send review invites when delivery mode allows and Resend is configured.

    Never raises — failures are logged only.
    """
    mode = review_delivery_mode()
    if mode not in ("email", "manual_and_email"):
        return
    if not email_configured():
        _log.info(
            "[review-email] skip agreement_id_short=%s reason=email_not_configured mode=%s",
            _agreement_id_short(agreement_id),
            mode,
        )
        return

    origin = app_public_origin()
    if not origin:
        return

    targets = _review_invite_targets_from_draft(draft)
    if not targets:
        _log.info(
            "[review-email] skip agreement_id_short=%s reason=no_eligible_recipients",
            _agreement_id_short(agreement_id),
        )
        return

    try:
        secret = resolve_signing_token_secret_raw().encode("utf-8")
    except SigningTokenSecretMissingInProductionError:
        _log.warning(
            "[review-email] skip agreement_id_short=%s reason=signing_token_secret_missing",
            _agreement_id_short(agreement_id),
        )
        return

    lock = read_signing_lock(agreement_id)
    locked_version_id = str((lock or {}).get("locked_version_id") or "")
    ttl = _default_recipient_token_ttl_seconds()

    sent = 0
    failed = 0
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
                "[review-email] mint_failed agreement_id_short=%s to=%s err=%s",
                _agreement_id_short(agreement_id),
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
        "[review-email] done agreement_id_short=%s sent=%s failed=%s eligible=%s",
        _agreement_id_short(agreement_id),
        sent,
        failed,
        len(targets),
    )


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


def _agreement_id_short(agreement_id: str) -> str:
    aid = (agreement_id or "").strip()
    return aid[:8] if len(aid) >= 8 else aid or "unknown"


def _redact_to(email: str) -> str:
    e = (email or "").strip().lower()
    if "@" not in e:
        return "invalid"
    local, domain = e.split("@", 1)
    if not local:
        return f"***@{domain}"
    return f"{local[0]}***@{domain}"
