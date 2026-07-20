"""Resend recipient invites without changing email or agreement corpus."""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, Tuple

from fastapi import HTTPException

from backend.config.agreement_signing_token import (
    SigningTokenSecretMissingInProductionError,
    resolve_signing_token_secret_raw,
)
from backend.config.runtime_environment import clamp_recipient_token_ttl_seconds
from backend.security.negotiation_review_bootstrap_token import mint_negotiation_review_bootstrap_token
from backend.security.negotiation_review_canonical_role import assert_eligible_review_participant
from backend.security.negotiation_review_content_binding import review_content_binding_sha256
from backend.security.negotiation_review_version_binding import authoritative_review_version_binding
from backend.services.email.review_delivery import (
    _build_absolute_review_url,
    _default_recipient_token_ttl_seconds,
    send_review_invite_with_prepared_token,
)
from backend.services.email.signing_delivery import (
    SIGNING_INVITE_EMAILS_SENT_EVENT,
    send_signing_invite_to_target,
)
from backend.services.recipient_delivery_registry import record_invite_sent, supersede_active_invite
from backend.services.recipient_party_identity import find_party_dict_by_participant_id


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
    party = find_party_dict_by_participant_id(draft, participant_id)
    if party:
        return party
    raise HTTPException(status_code=404, detail="participant_not_found")


def _mint_review_resend_token(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    participant_id: str,
    canonical_role: str,
    locked_version_id: str,
    content_sha256: str,
) -> tuple[str, str]:
    try:
        secret = resolve_signing_token_secret_raw().encode("utf-8")
    except SigningTokenSecretMissingInProductionError as exc:
        raise HTTPException(status_code=422, detail="recipient_token_mint_unavailable") from exc

    env_ttl = os.getenv("CLAW_RECIPIENT_TOKEN_TTL_SECONDS", "").strip()
    raw_ttl = int(env_ttl) if env_ttl else 60 * 60 * 24 * 7
    ttl = clamp_recipient_token_ttl_seconds(raw_ttl)
    last_error: BaseException | None = None
    for attempt in range(3):
        try:
            token, jti, _exp = mint_negotiation_review_bootstrap_token(
                secret=secret,
                agreement_id=agreement_id,
                locked_version_id=locked_version_id,
                party_id=participant_id,
                role=canonical_role,
                content_sha256=content_sha256,
                ttl_seconds=ttl,
            )
            if token and jti:
                return token, jti
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt < 2:
                time.sleep(0.06 * (2**attempt))
                continue
            break
    raise HTTPException(
        status_code=422,
        detail="recipient_token_mint_unavailable",
    ) from last_error


def _prepare_review_resend_establishment(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    participant_id: str,
    signing_lock: Dict[str, Any] | None,
) -> tuple[Dict[str, Any], str, str, str]:
    if not str(draft.get("review_sent_at") or "").strip():
        raise HTTPException(status_code=400, detail="review_not_sent_yet")

    party = _party_by_id(draft, participant_id)
    email = str(party.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="recipient_email_missing")

    canonical_role = assert_eligible_review_participant(draft, party_id=participant_id)
    locked_version_id = authoritative_review_version_binding(signing_lock)
    content_sha256 = review_content_binding_sha256(draft)
    token, jti = _mint_review_resend_token(
        agreement_id=agreement_id,
        draft=draft,
        participant_id=participant_id,
        canonical_role=canonical_role,
        locked_version_id=locked_version_id,
        content_sha256=content_sha256,
    )

    now = _utc_now_iso()
    audit_log = list(draft.get("audit_log") or [])
    next_draft = dict(draft)
    supersede_active_invite(next_draft, phase="review", participant_id=participant_id, audit_log=audit_log)
    record_invite_sent(
        next_draft,
        phase="review",
        participant_id=participant_id,
        jti=jti,
        email=email,
        audit_log=audit_log,
        bootstrap_authority=True,
        locked_version_id=locked_version_id,
        content_sha256=content_sha256,
        role=canonical_role,
    )
    next_draft["audit_log"] = audit_log
    next_draft["updated_at"] = now
    return next_draft, token, jti, email


def resend_recipient_invite(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    phase: str,
    participant_id: str,
    signing_url: str | None = None,
    signer_role_id: str | None = None,
    org_id: str | None,
    signing_lock: Dict[str, Any] | None = None,
    persist_establishment_fn=None,
    persist_outcome_fn=None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Resend waiting/opened invite; supersedes prior token/link metadata only."""
    pid = (participant_id or "").strip()
    ph = (phase or "").strip().lower()
    if ph not in ("review", "signing"):
        raise HTTPException(status_code=400, detail="invalid_phase")

    from backend.services.agreement_draft_store import (
        save_draft_establish_review_bootstrap_delivery,
        save_draft_merge_review_delivery_outcome,
    )

    persist_establishment = persist_establishment_fn or save_draft_establish_review_bootstrap_delivery
    persist_outcome = persist_outcome_fn or save_draft_merge_review_delivery_outcome

    now = _utc_now_iso()
    sent_invite = False

    if ph == "review":
        establishment_draft, token, _jti, email = _prepare_review_resend_establishment(
            agreement_id=agreement_id,
            draft=draft,
            participant_id=pid,
            signing_lock=signing_lock,
        )
        try:
            persist_establishment(establishment_draft)
        except ValueError as exc:
            code = str(exc)
            if code.startswith("delivery_establishment"):
                raise HTTPException(status_code=409, detail=code) from exc
            raise

        party = _party_by_id(establishment_draft, pid)
        party_name = str(party.get("name") or "").strip() or email.split("@", 1)[0]
        sent_invite = send_review_invite_with_prepared_token(
            agreement_id=agreement_id,
            draft=establishment_draft,
            participant_id=pid,
            token=token,
            party_name=party_name,
            email=email,
            org_id=org_id,
        )
        outcome_draft = dict(establishment_draft)
        outcome_draft["updated_at"] = _utc_now_iso()
        if sent_invite:
            outcome_draft["review_invite_emails_sent_at"] = outcome_draft["updated_at"]
        try:
            persist_outcome(outcome_draft)
        except Exception:
            pass
        return outcome_draft, {"sent_invite": sent_invite}

    party = _party_by_id(draft, pid)
    email = str(party.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="recipient_email_missing")

    if _latest_signing_packet_revision(draft.get("audit_log")) is None:
        raise HTTPException(status_code=400, detail="signing_not_sent_yet")
    url = (signing_url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="signing_url_required")

    audit_log = list(draft.get("audit_log") or [])
    next_draft = dict(draft)
    supersede_active_invite(next_draft, phase=ph, participant_id=pid, audit_log=audit_log)
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
