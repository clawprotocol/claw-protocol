"""Resend recipient invites without changing email or agreement corpus.

Same-email resend uses a durable pending→deliver→activate lifecycle so a failed
replacement never leaves the recipient without the prior usable invite, and never
creates two simultaneously valid active JTIs. Transitions are generation/revision
gated and persisted with compare-and-swap.
"""

from __future__ import annotations

import copy
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional, Tuple

from fastapi import HTTPException

from backend.services.agreement_draft_store import DraftCasConflictError, save_draft_cas
from backend.services.email.review_delivery import (
    mint_review_invite_token_for_participant,
    send_review_invite_to_participant,
)
from backend.services.email.signing_delivery import (
    SIGNING_INVITE_EMAILS_SENT_EVENT,
    send_signing_invite_to_target,
)
from backend.services.recipient_party_identity import find_party_dict_by_participant_id
from backend.services.recipient_delivery_registry import (
    FAILED_NEEDS_RETRY,
    KIND_EMAIL_CORRECTION,
    KIND_SAME_EMAIL_RESEND,
    PENDING_ACTIVATION,
    PENDING_DELIVERY,
    PENDING_MINT,
    InviteReplacementError,
    abort_invite_replacement,
    activate_invite_replacement,
    begin_invite_replacement,
    extract_jti_from_signing_url,
    get_pending_replacement,
    get_registry_revision,
    get_replacement_generation,
    mark_invite_replacement_pending_activation,
    normalize_delivery_phase,
    rebind_pending_replacement_jti,
)


PersistFn = Callable[..., None]


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


def _locked_version_id(agreement_id: str) -> str:
    try:
        from backend.services.agreement_signing_lock_store import read_signing_lock

        lock = read_signing_lock(agreement_id) or {}
        return str(lock.get("locked_version_id") or "").strip()
    except Exception:  # noqa: BLE001
        return ""


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
            # CAS already wrote; do not fall back to last-write-wins persist.
            pass
        except DraftCasConflictError as exc:
            raise InviteReplacementError(exc.code, str(exc)) from exc
    return get_registry_revision(draft)


def _conflict_meta(code: str = "invite_replacement_conflict") -> Dict[str, Any]:
    return {
        "sent_invite": False,
        "preserved_active": True,
        "replacement_activated": False,
        "retryable": True,
        "code": code,
        "persisted": False,
        "needs_final_cas": False,
    }


def _try_activate(
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


def resend_recipient_invite(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    phase: str,
    participant_id: str,
    signing_url: str | None = None,
    signer_role_id: str | None = None,
    org_id: str | None,
    persist: Optional[PersistFn] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Same-email resend with pending→deliver→activate replacement.

    Invariants:
    - Failed mint/registry/save/email preserves the prior active invite.
    - At most one active JTI; pending new_jti is not valid until activation.
    - Delivery-without-activation leaves recoverable ``pending_activation``.
    - Generation/revision CAS prevents stale abort from resurrecting JTIs.
    - Pending email-correction blocks same-email resend.
    """
    pid = (participant_id or "").strip()
    ph = normalize_delivery_phase(phase)
    if ph not in ("review", "signing"):
        raise HTTPException(status_code=400, detail="invalid_phase")

    party = _party_by_id(draft, pid)
    email = str(party.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="recipient_email_missing")

    now = _utc_now_iso()
    next_draft = copy.deepcopy(draft)
    audit_log = list(next_draft.get("audit_log") or [])
    next_draft["audit_log"] = audit_log
    locked_version_id = _locked_version_id(agreement_id)

    pending = get_pending_replacement(next_draft, phase=ph, participant_id=pid)
    if isinstance(pending, dict) and pending.get("kind") == KIND_EMAIL_CORRECTION:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "email_correction_pending",
                "message": (
                    "An email correction is pending for this recipient. "
                    "Retry the correction flow or cancel/revoke before same-email resend."
                ),
                "retryable": True,
                "correction_pending": True,
            },
        )

    cas_base = get_registry_revision(next_draft)
    gen = get_replacement_generation(next_draft, phase=ph, participant_id=pid)

    # Recoverable retry: activation incomplete after a prior successful delivery.
    if (
        isinstance(pending, dict)
        and pending.get("kind") == KIND_SAME_EMAIL_RESEND
        and str(pending.get("status") or "") == PENDING_ACTIVATION
    ):
        try:
            activated = _try_activate(
                next_draft,
                phase=ph,
                participant_id=pid,
                email=email,
                audit_log=audit_log,
                expected_generation=gen,
                expected_revision=cas_base,
            )
            next_draft["audit_log"] = audit_log
            next_draft["updated_at"] = now
            _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
        except InviteReplacementError as exc:
            return next_draft, _conflict_meta(exc.code)
        return next_draft, {
            "sent_invite": True,
            "replacement_activated": activated,
            "preserved_active": not activated,
            "pending_activation": not activated,
            "retryable": not activated,
            "code": None if activated else "invite_replacement_activation_pending",
            "persisted": True,
            "needs_final_cas": False,
        }

    # Resume pending delivery / mint / failed retry without consuming the pending row.
    if (
        isinstance(pending, dict)
        and pending.get("kind") == KIND_SAME_EMAIL_RESEND
        and str(pending.get("status") or "") in {PENDING_MINT, PENDING_DELIVERY, FAILED_NEEDS_RETRY}
    ):
        reuse_token: str | None = None
        new_jti = str(pending.get("new_jti") or "").strip()
        try:
            if ph == "review":
                reuse_token, new_jti_opt = mint_review_invite_token_for_participant(
                    agreement_id=agreement_id,
                    draft=next_draft,
                    participant_id=pid,
                )
                minted_jti = (new_jti_opt or "").strip()
                if not reuse_token or not minted_jti:
                    return next_draft, {
                        "sent_invite": False,
                        "preserved_active": True,
                        "replacement_activated": False,
                        "retryable": True,
                        "code": "invite_replacement_mint_failed",
                        "persisted": False,
                        "needs_final_cas": False,
                    }
                rebind_pending_replacement_jti(
                    next_draft,
                    phase=ph,
                    participant_id=pid,
                    new_jti=minted_jti,
                    expected_generation=gen,
                    expected_revision=cas_base,
                    audit_log=audit_log,
                )
                new_jti = minted_jti
                cas_base = _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
                gen = get_replacement_generation(next_draft, phase=ph, participant_id=pid)
            else:
                url = (signing_url or "").strip()
                if not url:
                    raise HTTPException(status_code=400, detail="signing_url_required")
                url_jti = extract_jti_from_signing_url(url)
                if not url_jti:
                    return next_draft, {
                        "sent_invite": False,
                        "preserved_active": True,
                        "replacement_activated": False,
                        "retryable": True,
                        "code": "invite_replacement_jti_missing",
                        "persisted": False,
                        "needs_final_cas": False,
                    }
                if new_jti and url_jti != new_jti:
                    rebind_pending_replacement_jti(
                        next_draft,
                        phase=ph,
                        participant_id=pid,
                        new_jti=url_jti,
                        expected_generation=gen,
                        expected_revision=cas_base,
                        audit_log=audit_log,
                    )
                    new_jti = url_jti
                    cas_base = _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
                    gen = get_replacement_generation(next_draft, phase=ph, participant_id=pid)
                elif not new_jti:
                    rebind_pending_replacement_jti(
                        next_draft,
                        phase=ph,
                        participant_id=pid,
                        new_jti=url_jti,
                        expected_generation=gen,
                        expected_revision=cas_base,
                        audit_log=audit_log,
                    )
                    new_jti = url_jti
                    cas_base = _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
                    gen = get_replacement_generation(next_draft, phase=ph, participant_id=pid)

            sent_invite = False
            if ph == "review":
                sent_invite, _jti = send_review_invite_to_participant(
                    agreement_id=agreement_id,
                    draft=next_draft,
                    participant_id=pid,
                    org_id=org_id,
                    bind_registry=False,
                    token=reuse_token,
                )
            else:
                url = (signing_url or "").strip()
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
                    bind_registry=False,
                )

            if not sent_invite:
                abort_invite_replacement(
                    next_draft,
                    phase=ph,
                    participant_id=pid,
                    failure_code="invite_delivery_failed",
                    audit_log=audit_log,
                    preserve_active=True,
                    expected_generation=gen,
                    expected_revision=cas_base,
                )
                next_draft["audit_log"] = audit_log
                next_draft["updated_at"] = _utc_now_iso()
                _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
                return next_draft, {
                    "sent_invite": False,
                    "preserved_active": True,
                    "replacement_activated": False,
                    "retryable": True,
                    "code": "invite_replacement_delivery_failed",
                    "persisted": True,
                    "needs_final_cas": False,
                }

            activated = _try_activate(
                next_draft,
                phase=ph,
                participant_id=pid,
                email=email,
                audit_log=audit_log,
                expected_generation=gen,
                expected_revision=cas_base,
            )
            next_draft["audit_log"] = audit_log
            next_draft["updated_at"] = _utc_now_iso()
            _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
            return next_draft, {
                "sent_invite": True,
                "replacement_activated": activated,
                "preserved_active": not activated,
                "pending_activation": not activated,
                "retryable": not activated,
                "code": None if activated else "invite_replacement_activation_pending",
                "persisted": True,
                "needs_final_cas": False,
            }
        except InviteReplacementError as exc:
            return next_draft, _conflict_meta(exc.code)

    # Fresh replacement: mint/extract, then stage pending.
    reuse_token = None
    new_jti = ""
    if ph == "review":
        if not str(draft.get("review_sent_at") or "").strip():
            raise HTTPException(status_code=400, detail="review_not_sent_yet")
        reuse_token, new_jti_opt = mint_review_invite_token_for_participant(
            agreement_id=agreement_id,
            draft=next_draft,
            participant_id=pid,
        )
        new_jti = (new_jti_opt or "").strip()
        if not reuse_token or not new_jti:
            return next_draft, {
                "sent_invite": False,
                "preserved_active": True,
                "replacement_activated": False,
                "retryable": True,
                "code": "invite_replacement_mint_failed",
                "persisted": False,
                "needs_final_cas": False,
            }
    else:
        if _latest_signing_packet_revision(draft.get("audit_log")) is None:
            raise HTTPException(status_code=400, detail="signing_not_sent_yet")
        url = (signing_url or "").strip()
        if not url:
            raise HTTPException(status_code=400, detail="signing_url_required")
        new_jti = extract_jti_from_signing_url(url)
        if not new_jti:
            return next_draft, {
                "sent_invite": False,
                "preserved_active": True,
                "replacement_activated": False,
                "retryable": True,
                "code": "invite_replacement_jti_missing",
                "persisted": False,
                "needs_final_cas": False,
            }

    try:
        begin_invite_replacement(
            next_draft,
            phase=ph,
            participant_id=pid,
            kind=KIND_SAME_EMAIL_RESEND,
            new_jti=new_jti,
            email=email,
            old_email=email,
            new_email=email,
            actor=org_id,
            reason="same_email_resend",
            audit_log=audit_log,
            expected_generation=gen,
            expected_revision=cas_base,
            agreement_id=agreement_id,
            locked_version_id=locked_version_id,
            mode=ph,
        )
    except InviteReplacementError as exc:
        return next_draft, _conflict_meta(exc.code)

    next_draft["audit_log"] = audit_log
    next_draft["updated_at"] = now
    try:
        cas_base = _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
    except InviteReplacementError as exc:
        # Roll back in-memory pending; disk unchanged on CAS conflict.
        try:
            abort_invite_replacement(
                next_draft,
                phase=ph,
                participant_id=pid,
                failure_code="pending_persist_failed",
                audit_log=audit_log,
                preserve_active=True,
                expected_generation=get_replacement_generation(
                    next_draft, phase=ph, participant_id=pid
                ),
                expected_revision=get_registry_revision(next_draft),
            )
        except InviteReplacementError:
            pass
        return next_draft, _conflict_meta(exc.code)

    gen = get_replacement_generation(next_draft, phase=ph, participant_id=pid)

    sent_invite = False
    if ph == "review":
        sent_invite, _jti = send_review_invite_to_participant(
            agreement_id=agreement_id,
            draft=next_draft,
            participant_id=pid,
            org_id=org_id,
            bind_registry=False,
            token=reuse_token,
        )
    else:
        url = (signing_url or "").strip()
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
            bind_registry=False,
        )

    if not sent_invite:
        try:
            abort_invite_replacement(
                next_draft,
                phase=ph,
                participant_id=pid,
                failure_code="invite_delivery_failed",
                audit_log=audit_log,
                preserve_active=True,
                expected_generation=gen,
                expected_revision=cas_base,
            )
            next_draft["audit_log"] = audit_log
            next_draft["updated_at"] = _utc_now_iso()
            _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
        except InviteReplacementError as exc:
            return next_draft, _conflict_meta(exc.code)
        return next_draft, {
            "sent_invite": False,
            "preserved_active": True,
            "replacement_activated": False,
            "retryable": True,
            "code": "invite_replacement_delivery_failed",
            "persisted": True,
            "needs_final_cas": False,
        }

    try:
        activated = _try_activate(
            next_draft,
            phase=ph,
            participant_id=pid,
            email=email,
            audit_log=audit_log,
            expected_generation=gen,
            expected_revision=cas_base,
        )
        next_draft["audit_log"] = audit_log
        next_draft["updated_at"] = _utc_now_iso()
        _persist_cas(next_draft, expected_revision=cas_base, persist=persist)
    except InviteReplacementError as exc:
        return next_draft, _conflict_meta(exc.code)

    return next_draft, {
        "sent_invite": True,
        "replacement_activated": activated,
        "preserved_active": not activated,
        "pending_activation": not activated,
        "retryable": not activated,
        "code": None if activated else "invite_replacement_activation_pending",
        "persisted": True,
        "needs_final_cas": False,
    }
