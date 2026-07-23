"""Owner corrections for mistyped reviewer/signer emails without restarting the agreement.

Email-correction security policy (distinct from same-email resend)
-----------------------------------------------------------------
1. Party email is updated to the **new** address immediately.
2. Any active invite for the old address is **superseded immediately** with a revoke
   gate (``force_revoke_gate``). The old address is never left authorized after a
   correction attempt — availability must not override this security boundary.
3. A durable ``pending_replacement`` (kind=``email_correction``) records actor,
   old/new JTI fingerprints, normalized emails, agreement/version/mode, generation,
   and failure state (including mint failures).
4. Replacement mint/delivery/activation targets only the new address.
5. If replacement mint, delivery, or activation fails after old-address revocation,
   the API returns a clear retryable/support state (``correction_*`` codes). The old
   address remains unauthorized; there is no silent fallback to the prior email.
6. Retry with the same ``new_email`` resumes the durable pending correction
   (delivery/activation/mint) without ``email_unchanged`` and without restoring
   old-address authorization.
7. Same-email resend cannot consume a pending email-correction.
8. Cancel / packet reissue / explicit revoke / completion still supersede active and
   pending JTIs immediately (security-first; no availability preserve).
"""

from __future__ import annotations

import copy
import re
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional, Tuple

from fastapi import HTTPException

from backend.services.agreement_draft_store import DraftCasConflictError, save_draft_cas
from backend.services.recipient_party_identity import find_party_dict_by_participant_id
from backend.services.recipient_delivery_registry import (
    FAILED_NEEDS_RETRY,
    KIND_EMAIL_CORRECTION,
    PENDING_ACTIVATION,
    PENDING_DELIVERY,
    PENDING_MINT,
    RECIPIENT_EMAIL_CORRECTED,
    InviteReplacementError,
    activate_invite_replacement,
    begin_invite_replacement,
    extract_jti_from_signing_url,
    get_pending_replacement,
    get_registry_revision,
    get_replacement_generation,
    mark_invite_replacement_failed,
    mark_invite_replacement_pending_activation,
    pending_correction_matches,
    rebind_pending_replacement_jti,
    stage_invite_replacement_mint_pending,
    supersede_active_invite,
)
from backend.services.email.review_delivery import (
    mint_review_invite_token_for_participant,
    send_review_invite_to_participant,
)
from backend.services.email.signing_delivery import (
    SIGNING_INVITE_EMAILS_SENT_EVENT,
    send_signing_invite_to_target,
)

REVIEW_RECIPIENT_EMAIL_CORRECTED = "review_recipient_email_corrected"
REVIEW_EMAIL_RESENT = "review_email_resent"
SIGNING_RECIPIENT_EMAIL_CORRECTED = "signing_recipient_email_corrected"
SIGNING_INVITE_RESENT = "signing_invite_resent"
SIGNING_INVITE_SUPERSEDED = "signing_invite_superseded"

EMAIL_CORRECTION_SECURITY_POLICY = (
    "Email correction immediately revokes the old-address invite, updates the party "
    "email, and never re-authorizes the old address on failure. Failed replacement "
    "delivery leaves a durable pending_correction for retry/support."
)

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

PersistFn = Callable[..., None]


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
    party = find_party_dict_by_participant_id(draft, pid)
    if party:
        return party
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


def _locked_version_id(agreement_id: str) -> str:
    try:
        from backend.services.agreement_signing_lock_store import read_signing_lock

        lock = read_signing_lock(agreement_id) or {}
        return str(lock.get("locked_version_id") or "").strip()
    except Exception:  # noqa: BLE001
        return ""


def _apply_party_email(
    draft: Dict[str, Any],
    *,
    resolved_pid: str,
    email: str,
) -> list[Dict[str, Any]]:
    parties: list[Dict[str, Any]] = []
    for p in draft.get("parties") or []:
        if not isinstance(p, dict):
            continue
        if str(p.get("id") or "").strip() == resolved_pid:
            parties.append({**p, "email": email})
        else:
            parties.append(dict(p))
    return parties


def _persist_cas(
    draft: Dict[str, Any],
    *,
    expected_revision: int,
    persist: Optional[PersistFn],
) -> int:
    try:
        save_draft_cas(draft, expected_revision=expected_revision)
    except DraftCasConflictError as exc:
        raise InviteReplacementError(exc.code, str(exc)) from exc
    if persist is not None:
        try:
            persist(draft, expected_revision=expected_revision)
        except TypeError:
            pass
        except DraftCasConflictError as exc:
            raise InviteReplacementError(exc.code, str(exc)) from exc
    return get_registry_revision(draft)


def _policy_meta(**extra: Any) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "old_address_authorized": False,
        "policy": EMAIL_CORRECTION_SECURITY_POLICY,
        "persisted": False,
        "needs_final_cas": False,
    }
    out.update(extra)
    return out


def _try_activate_correction(
    next_draft: Dict[str, Any],
    *,
    phase: str,
    participant_id: str,
    email: str,
    audit_log: list,
    expected_generation: int,
    expected_revision: int,
) -> bool:
    try:
        activate_invite_replacement(
            next_draft,
            phase=phase,
            participant_id=participant_id,
            email=email,
            audit_log=audit_log,
            expected_generation=expected_generation,
            expected_revision=expected_revision,
        )
        return True
    except InviteReplacementError:
        mark_invite_replacement_pending_activation(
            next_draft,
            phase=phase,
            participant_id=participant_id,
            audit_log=audit_log,
            expected_generation=expected_generation,
            expected_revision=expected_revision,
        )
        return False


def _resume_review_correction(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    resolved_pid: str,
    email: str,
    org_id: str | None,
    persist: Optional[PersistFn],
    locked_version_id: str,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    next_draft = copy.deepcopy(draft)
    audit_log = list(next_draft.get("audit_log") or [])
    next_draft["audit_log"] = audit_log
    cas_base = get_registry_revision(next_draft)
    gen = get_replacement_generation(next_draft, phase="review", participant_id=resolved_pid)
    pending = get_pending_replacement(next_draft, phase="review", participant_id=resolved_pid)
    status = str((pending or {}).get("status") or "")

    try:
        if status == PENDING_ACTIVATION:
            activated = _try_activate_correction(
                next_draft,
                phase="review",
                participant_id=resolved_pid,
                email=email,
                audit_log=audit_log,
                expected_generation=gen,
                expected_revision=cas_base,
            )
            next_draft["audit_log"] = audit_log
            _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
            return next_draft, _policy_meta(
                sent_invite=True,
                replacement_activated=activated,
                correction_pending=not activated,
                retryable=not activated,
                code=None if activated else "correction_activation_pending",
                persisted=True,
            )

        # pending_mint / pending_delivery / failed_needs_retry → remint in place, deliver, activate
        token, minted_jti = mint_review_invite_token_for_participant(
            agreement_id=agreement_id,
            draft=next_draft,
            participant_id=resolved_pid,
        )
        if not token or not minted_jti:
            mark_invite_replacement_failed(
                next_draft,
                phase="review",
                participant_id=resolved_pid,
                failure_code="correction_mint_failed",
                audit_log=audit_log,
                expected_generation=gen,
                expected_revision=cas_base,
            )
            # Keep status as failed/mint pending identity
            pending_now = get_pending_replacement(
                next_draft, phase="review", participant_id=resolved_pid
            )
            if isinstance(pending_now, dict) and not pending_now.get("new_jti"):
                # ensure durable mint-pending shape
                pass
            next_draft["audit_log"] = audit_log
            _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
            return next_draft, _policy_meta(
                sent_invite=False,
                correction_pending=True,
                retryable=True,
                code="correction_mint_failed",
                persisted=True,
            )

        rebind_pending_replacement_jti(
            next_draft,
            phase="review",
            participant_id=resolved_pid,
            new_jti=minted_jti,
            expected_generation=gen,
            expected_revision=cas_base,
            audit_log=audit_log,
        )
        cas_base = _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
        gen = get_replacement_generation(next_draft, phase="review", participant_id=resolved_pid)

        sent_invite, _jti = send_review_invite_to_participant(
            agreement_id=agreement_id,
            draft=next_draft,
            participant_id=resolved_pid,
            org_id=org_id,
            bind_registry=False,
            token=token,
        )
        if not sent_invite:
            mark_invite_replacement_failed(
                next_draft,
                phase="review",
                participant_id=resolved_pid,
                failure_code="correction_delivery_failed",
                audit_log=audit_log,
                expected_generation=gen,
                expected_revision=cas_base,
            )
            next_draft["audit_log"] = audit_log
            _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
            return next_draft, _policy_meta(
                sent_invite=False,
                correction_pending=True,
                retryable=True,
                code="correction_delivery_failed",
                persisted=True,
            )

        activated = _try_activate_correction(
            next_draft,
            phase="review",
            participant_id=resolved_pid,
            email=email,
            audit_log=audit_log,
            expected_generation=gen,
            expected_revision=cas_base,
        )
        if activated:
            audit_log.append(
                {
                    "event_type": REVIEW_EMAIL_RESENT,
                    "at": _utc_now_iso(),
                    "field": "review_invite",
                    "value": {
                        "participant_id": resolved_pid,
                        "email_redacted": _redact_email(email),
                        "via": "correction_retry",
                    },
                }
            )
        next_draft["audit_log"] = audit_log
        _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
        return next_draft, _policy_meta(
            sent_invite=True,
            replacement_activated=activated,
            correction_pending=not activated,
            retryable=not activated,
            code=None if activated else "correction_activation_pending",
            persisted=True,
        )
    except InviteReplacementError as exc:
        return next_draft, _policy_meta(
            sent_invite=False,
            correction_pending=True,
            retryable=True,
            code=exc.code,
        )


def correct_review_recipient_email(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    participant_id: str,
    new_email: str,
    resend_invite: bool,
    org_id: str | None,
    persist: Optional[PersistFn] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Update a reviewer's email before they approve; optionally resend review invite.

    See module ``EMAIL_CORRECTION_SECURITY_POLICY``.
    """
    pid = (participant_id or "").strip()
    email = _validate_email(new_email)
    party = _party_dict_by_id(draft, pid)
    resolved_pid = str(party.get("id") or "").strip() or pid
    if _is_owner_party(party):
        raise HTTPException(status_code=400, detail="owner_email_not_editable_here")

    if resolved_pid in _approved_participant_ids(draft.get("audit_log")):
        raise HTTPException(status_code=400, detail="reviewer_already_approved")

    old_email = str(party.get("email") or "").strip().lower()
    locked_version_id = _locked_version_id(agreement_id)
    pending = get_pending_replacement(draft, phase="review", participant_id=resolved_pid)

    if old_email == email:
        if resend_invite and pending_correction_matches(
            pending,
            new_email=email,
            agreement_id=agreement_id,
            locked_version_id=locked_version_id,
            mode="review",
        ):
            return _resume_review_correction(
                agreement_id=agreement_id,
                draft=draft,
                resolved_pid=resolved_pid,
                email=email,
                org_id=org_id,
                persist=persist,
                locked_version_id=locked_version_id,
            )
        raise HTTPException(status_code=400, detail="email_unchanged")

    now = _utc_now_iso()
    next_draft = copy.deepcopy(draft)
    audit_log = list(next_draft.get("audit_log") or [])
    parties = _apply_party_email(next_draft, resolved_pid=resolved_pid, email=email)
    next_draft["parties"] = parties
    next_draft["audit_log"] = audit_log
    next_draft["updated_at"] = now
    base_rev = get_registry_revision(next_draft)
    gen = get_replacement_generation(next_draft, phase="review", participant_id=resolved_pid)

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
                "policy": "email_correction_security_first",
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

    # Security-first: revoke old-address invite immediately (consumes prior pending).
    supersede_active_invite(
        next_draft,
        phase="review",
        participant_id=resolved_pid,
        audit_log=audit_log,
        force_revoke_gate=True,
    )
    gen = get_replacement_generation(next_draft, phase="review", participant_id=resolved_pid)

    if not resend_invite:
        next_draft["audit_log"] = audit_log
        try:
            _persist_cas(next_draft, expected_revision=base_rev, persist=persist)
        except InviteReplacementError as exc:
            return next_draft, _policy_meta(
                sent_invite=False,
                correction_pending=False,
                retryable=True,
                code=exc.code,
            )
        return next_draft, _policy_meta(
            sent_invite=False,
            correction_pending=False,
            persisted=True,
        )

    if not str(draft.get("review_sent_at") or "").strip():
        raise HTTPException(status_code=400, detail="review_not_sent_yet")

    # Persist revoke first so a later mint/delivery failure cannot restore old auth.
    try:
        cas_base = _persist_cas(next_draft, expected_revision=base_rev, persist=persist)
    except InviteReplacementError as exc:
        return next_draft, _policy_meta(
            sent_invite=False,
            correction_pending=True,
            retryable=True,
            code=exc.code,
        )
    gen = get_replacement_generation(next_draft, phase="review", participant_id=resolved_pid)

    token, new_jti = mint_review_invite_token_for_participant(
        agreement_id=agreement_id,
        draft=next_draft,
        participant_id=resolved_pid,
    )
    if not token or not new_jti:
        try:
            stage_invite_replacement_mint_pending(
                next_draft,
                phase="review",
                participant_id=resolved_pid,
                kind=KIND_EMAIL_CORRECTION,
                old_email=old_email,
                new_email=email,
                actor=org_id,
                reason="email_correction",
                failure_code="correction_mint_failed",
                audit_log=audit_log,
                expected_generation=gen,
                expected_revision=cas_base,
                agreement_id=agreement_id,
                locked_version_id=locked_version_id,
                mode="review",
            )
            next_draft["audit_log"] = audit_log
            _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
        except InviteReplacementError as exc:
            return next_draft, _policy_meta(
                sent_invite=False,
                correction_pending=True,
                retryable=True,
                code=exc.code,
            )
        return next_draft, _policy_meta(
            sent_invite=False,
            correction_pending=True,
            retryable=True,
            code="correction_mint_failed",
            persisted=True,
        )

    try:
        begin_invite_replacement(
            next_draft,
            phase="review",
            participant_id=resolved_pid,
            kind=KIND_EMAIL_CORRECTION,
            new_jti=new_jti,
            old_email=old_email,
            new_email=email,
            actor=org_id,
            reason="email_correction",
            audit_log=audit_log,
            expected_generation=gen,
            expected_revision=cas_base,
            agreement_id=agreement_id,
            locked_version_id=locked_version_id,
            mode="review",
        )
        cas_base = _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
        gen = get_replacement_generation(next_draft, phase="review", participant_id=resolved_pid)
    except InviteReplacementError as exc:
        next_draft["audit_log"] = audit_log
        return next_draft, _policy_meta(
            sent_invite=False,
            correction_pending=True,
            retryable=True,
            code=exc.code or "correction_registry_failed",
        )

    sent_invite, _jti = send_review_invite_to_participant(
        agreement_id=agreement_id,
        draft=next_draft,
        participant_id=resolved_pid,
        org_id=org_id,
        bind_registry=False,
        token=token,
    )
    if not sent_invite:
        try:
            mark_invite_replacement_failed(
                next_draft,
                phase="review",
                participant_id=resolved_pid,
                failure_code="correction_delivery_failed",
                audit_log=audit_log,
                expected_generation=gen,
                expected_revision=cas_base,
            )
            next_draft["audit_log"] = audit_log
            _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
        except InviteReplacementError as exc:
            return next_draft, _policy_meta(
                sent_invite=False,
                correction_pending=True,
                retryable=True,
                code=exc.code,
            )
        return next_draft, _policy_meta(
            sent_invite=False,
            correction_pending=True,
            retryable=True,
            code="correction_delivery_failed",
            persisted=True,
        )

    try:
        activated = _try_activate_correction(
            next_draft,
            phase="review",
            participant_id=resolved_pid,
            email=email,
            audit_log=audit_log,
            expected_generation=gen,
            expected_revision=cas_base,
        )
        if activated:
            audit_log.append(
                {
                    "event_type": REVIEW_EMAIL_RESENT,
                    "at": _utc_now_iso(),
                    "field": "review_invite",
                    "value": {
                        "participant_id": resolved_pid,
                        "email_redacted": _redact_email(email),
                    },
                }
            )
        next_draft["audit_log"] = audit_log
        _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
    except InviteReplacementError as exc:
        return next_draft, _policy_meta(
            sent_invite=True,
            correction_pending=True,
            retryable=True,
            code=exc.code,
        )

    return next_draft, _policy_meta(
        sent_invite=True,
        replacement_activated=activated,
        correction_pending=not activated,
        retryable=not activated,
        code=None if activated else "correction_activation_pending",
        persisted=True,
    )


def _resume_signing_correction(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    resolved_pid: str,
    email: str,
    signer_role_id: str | None,
    signing_url: str | None,
    org_id: str | None,
    persist: Optional[PersistFn],
    locked_version_id: str,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    next_draft = copy.deepcopy(draft)
    audit_log = list(next_draft.get("audit_log") or [])
    next_draft["audit_log"] = audit_log
    cas_base = get_registry_revision(next_draft)
    gen = get_replacement_generation(next_draft, phase="signing", participant_id=resolved_pid)
    pending = get_pending_replacement(next_draft, phase="signing", participant_id=resolved_pid)
    status = str((pending or {}).get("status") or "")
    packet_revision = _latest_signing_packet_revision(draft.get("audit_log"))
    url = (signing_url or "").strip()
    party = _party_dict_by_id(next_draft, resolved_pid)

    try:
        if status == PENDING_ACTIVATION:
            activated = _try_activate_correction(
                next_draft,
                phase="signing",
                participant_id=resolved_pid,
                email=email,
                audit_log=audit_log,
                expected_generation=gen,
                expected_revision=cas_base,
            )
            next_draft["audit_log"] = audit_log
            _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
            return next_draft, _policy_meta(
                sent_invite=True,
                signing_invites_sent=True,
                replacement_activated=activated,
                correction_pending=not activated,
                retryable=not activated,
                code=None if activated else "correction_activation_pending",
                persisted=True,
            )

        if not url:
            raise HTTPException(status_code=400, detail="signing_url_required")
        url_jti = extract_jti_from_signing_url(url)
        if not url_jti:
            mark_invite_replacement_failed(
                next_draft,
                phase="signing",
                participant_id=resolved_pid,
                failure_code="correction_jti_missing",
                audit_log=audit_log,
                expected_generation=gen,
                expected_revision=cas_base,
            )
            next_draft["audit_log"] = audit_log
            _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
            return next_draft, _policy_meta(
                sent_invite=False,
                signing_invites_sent=True,
                correction_pending=True,
                retryable=True,
                code="correction_jti_missing",
                persisted=True,
            )

        rebind_pending_replacement_jti(
            next_draft,
            phase="signing",
            participant_id=resolved_pid,
            new_jti=url_jti,
            expected_generation=gen,
            expected_revision=cas_base,
            audit_log=audit_log,
        )
        cas_base = _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
        gen = get_replacement_generation(next_draft, phase="signing", participant_id=resolved_pid)

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
            bind_registry=False,
        )
        if not sent_invite:
            mark_invite_replacement_failed(
                next_draft,
                phase="signing",
                participant_id=resolved_pid,
                failure_code="correction_delivery_failed",
                audit_log=audit_log,
                expected_generation=gen,
                expected_revision=cas_base,
            )
            next_draft["audit_log"] = audit_log
            _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
            return next_draft, _policy_meta(
                sent_invite=False,
                signing_invites_sent=True,
                correction_pending=True,
                retryable=True,
                code="correction_delivery_failed",
                persisted=True,
            )

        activated = _try_activate_correction(
            next_draft,
            phase="signing",
            participant_id=resolved_pid,
            email=email,
            audit_log=audit_log,
            expected_generation=gen,
            expected_revision=cas_base,
        )
        if activated:
            audit_log.append(
                {
                    "event_type": SIGNING_INVITE_RESENT,
                    "at": _utc_now_iso(),
                    "field": "signing_invite",
                    "value": {
                        "participant_id": resolved_pid,
                        "signer_role_id": (signer_role_id or "").strip() or None,
                        "email_redacted": _redact_email(email),
                        "packet_revision": packet_revision,
                        "via": "correction_retry",
                    },
                }
            )
        next_draft["audit_log"] = audit_log
        _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
        return next_draft, _policy_meta(
            sent_invite=True,
            signing_invites_sent=True,
            replacement_activated=activated,
            correction_pending=not activated,
            retryable=not activated,
            code=None if activated else "correction_activation_pending",
            persisted=True,
        )
    except InviteReplacementError as exc:
        return next_draft, _policy_meta(
            sent_invite=False,
            signing_invites_sent=True,
            correction_pending=True,
            retryable=True,
            code=exc.code,
        )


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
    persist: Optional[PersistFn] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Update signer email; security-first revoke of old address, then optional resend.

    See module ``EMAIL_CORRECTION_SECURITY_POLICY``.
    """
    pid = (participant_id or "").strip()
    email = _validate_email(new_email)
    party = _party_dict_by_id(draft, pid)
    resolved_pid = str(party.get("id") or "").strip() or pid

    if resolved_pid in _signature_completed_participant_ids(draft.get("audit_log")):
        raise HTTPException(status_code=400, detail="signer_already_signed")

    old_email = str(party.get("email") or "").strip().lower()
    locked_version_id = _locked_version_id(agreement_id)
    pending = get_pending_replacement(draft, phase="signing", participant_id=resolved_pid)
    signing_invites_sent = _latest_signing_packet_revision(draft.get("audit_log")) is not None
    url = (signing_url or "").strip()

    if old_email == email:
        if (
            resend_invite
            and signing_invites_sent
            and pending_correction_matches(
                pending,
                new_email=email,
                agreement_id=agreement_id,
                locked_version_id=locked_version_id,
                mode="signing",
            )
        ):
            return _resume_signing_correction(
                agreement_id=agreement_id,
                draft=draft,
                resolved_pid=resolved_pid,
                email=email,
                signer_role_id=signer_role_id,
                signing_url=signing_url,
                org_id=org_id,
                persist=persist,
                locked_version_id=locked_version_id,
            )
        raise HTTPException(status_code=400, detail="email_unchanged")

    if resend_invite and signing_invites_sent and not url:
        raise HTTPException(status_code=400, detail="signing_url_required")

    now = _utc_now_iso()
    next_draft = copy.deepcopy(draft)
    audit_log = list(next_draft.get("audit_log") or [])
    parties = _apply_party_email(next_draft, resolved_pid=resolved_pid, email=email)
    next_draft["parties"] = parties
    next_draft["audit_log"] = audit_log
    next_draft["updated_at"] = now
    base_rev = get_registry_revision(next_draft)
    packet_revision = _latest_signing_packet_revision(next_draft.get("audit_log"))

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
                "policy": "email_correction_security_first",
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

    supersede_active_invite(
        next_draft,
        phase="signing",
        participant_id=resolved_pid,
        audit_log=audit_log,
        force_revoke_gate=True,
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
                    "policy": "email_correction_security_first",
                },
            }
        )

    if not (resend_invite and signing_invites_sent and url):
        next_draft["audit_log"] = audit_log
        try:
            _persist_cas(next_draft, expected_revision=base_rev, persist=persist)
        except InviteReplacementError as exc:
            return next_draft, _policy_meta(
                sent_invite=False,
                signing_invites_sent=signing_invites_sent,
                correction_pending=False,
                retryable=True,
                code=exc.code,
            )
        return next_draft, _policy_meta(
            sent_invite=False,
            signing_invites_sent=signing_invites_sent,
            correction_pending=False,
            persisted=True,
        )

    try:
        cas_base = _persist_cas(next_draft, expected_revision=base_rev, persist=persist)
    except InviteReplacementError as exc:
        return next_draft, _policy_meta(
            sent_invite=False,
            signing_invites_sent=signing_invites_sent,
            correction_pending=True,
            retryable=True,
            code=exc.code,
        )
    gen = get_replacement_generation(next_draft, phase="signing", participant_id=resolved_pid)

    new_jti = extract_jti_from_signing_url(url)
    if not new_jti:
        try:
            stage_invite_replacement_mint_pending(
                next_draft,
                phase="signing",
                participant_id=resolved_pid,
                kind=KIND_EMAIL_CORRECTION,
                old_email=old_email,
                new_email=email,
                actor=org_id,
                reason="email_correction",
                failure_code="correction_jti_missing",
                audit_log=audit_log,
                expected_generation=gen,
                expected_revision=cas_base,
                agreement_id=agreement_id,
                locked_version_id=locked_version_id,
                mode="signing",
            )
            next_draft["audit_log"] = audit_log
            _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
        except InviteReplacementError as exc:
            return next_draft, _policy_meta(
                sent_invite=False,
                signing_invites_sent=signing_invites_sent,
                correction_pending=True,
                retryable=True,
                code=exc.code,
            )
        return next_draft, _policy_meta(
            sent_invite=False,
            signing_invites_sent=signing_invites_sent,
            correction_pending=True,
            retryable=True,
            code="correction_jti_missing",
            persisted=True,
        )

    try:
        begin_invite_replacement(
            next_draft,
            phase="signing",
            participant_id=resolved_pid,
            kind=KIND_EMAIL_CORRECTION,
            new_jti=new_jti,
            old_email=old_email,
            new_email=email,
            actor=org_id,
            reason="email_correction",
            audit_log=audit_log,
            expected_generation=gen,
            expected_revision=cas_base,
            agreement_id=agreement_id,
            locked_version_id=locked_version_id,
            mode="signing",
        )
        cas_base = _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
        gen = get_replacement_generation(next_draft, phase="signing", participant_id=resolved_pid)
    except InviteReplacementError as exc:
        next_draft["audit_log"] = audit_log
        return next_draft, _policy_meta(
            sent_invite=False,
            signing_invites_sent=signing_invites_sent,
            correction_pending=True,
            retryable=True,
            code=exc.code or "correction_registry_failed",
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
        bind_registry=False,
    )
    if not sent_invite:
        try:
            mark_invite_replacement_failed(
                next_draft,
                phase="signing",
                participant_id=resolved_pid,
                failure_code="correction_delivery_failed",
                audit_log=audit_log,
                expected_generation=gen,
                expected_revision=cas_base,
            )
            next_draft["audit_log"] = audit_log
            _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
        except InviteReplacementError as exc:
            return next_draft, _policy_meta(
                sent_invite=False,
                signing_invites_sent=signing_invites_sent,
                correction_pending=True,
                retryable=True,
                code=exc.code,
            )
        return next_draft, _policy_meta(
            sent_invite=False,
            signing_invites_sent=signing_invites_sent,
            correction_pending=True,
            retryable=True,
            code="correction_delivery_failed",
            persisted=True,
        )

    try:
        activated = _try_activate_correction(
            next_draft,
            phase="signing",
            participant_id=resolved_pid,
            email=email,
            audit_log=audit_log,
            expected_generation=gen,
            expected_revision=cas_base,
        )
        if activated:
            audit_log.append(
                {
                    "event_type": SIGNING_INVITE_RESENT,
                    "at": _utc_now_iso(),
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
        _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
    except InviteReplacementError as exc:
        return next_draft, _policy_meta(
            sent_invite=True,
            signing_invites_sent=signing_invites_sent,
            correction_pending=True,
            retryable=True,
            code=exc.code,
        )

    return next_draft, _policy_meta(
        sent_invite=True,
        signing_invites_sent=signing_invites_sent,
        replacement_activated=activated,
        correction_pending=not activated,
        retryable=not activated,
        code=None if activated else "correction_activation_pending",
        persisted=True,
    )
