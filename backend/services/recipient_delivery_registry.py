"""Per-recipient invite delivery registry on agreement drafts (JTIs, timestamps, resend counts)."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

INVITE_SENT = "invite_sent"
INVITE_OPENED = "invite_opened"
INVITE_RESENT = "invite_resent"
INVITE_SUPERSEDED = "invite_superseded"
INVITE_REPLACEMENT_PENDING = "invite_replacement_pending"
INVITE_REPLACEMENT_ACTIVATED = "invite_replacement_activated"
INVITE_REPLACEMENT_ABORTED = "invite_replacement_aborted"
INVITE_REPLACEMENT_FAILED = "invite_replacement_failed"
RECIPIENT_EMAIL_CORRECTED = "recipient_email_corrected"
REVIEW_APPROVED = "review_approved"
SIGNATURE_COMPLETED = "signature_completed"

RECIPIENT_INVITE_SUPERSEDED_MESSAGE = (
    "This invite was replaced. Ask the sender for the latest link."
)

# Pending replacement statuses (durable on recipient_delivery_v1 rows).
PENDING_MINT = "pending_mint"
PENDING_DELIVERY = "pending_delivery"
PENDING_ACTIVATION = "pending_activation"
FAILED_NEEDS_RETRY = "failed_needs_retry"

KIND_SAME_EMAIL_RESEND = "same_email_resend"
KIND_EMAIL_CORRECTION = "email_correction"

_PENDING_BLOCK_STATUSES = frozenset(
    {PENDING_MINT, PENDING_DELIVERY, PENDING_ACTIVATION, FAILED_NEEDS_RETRY}
)
_RESUMABLE_CORRECTION_STATUSES = frozenset(
    {PENDING_MINT, PENDING_DELIVERY, PENDING_ACTIVATION, FAILED_NEEDS_RETRY}
)


class InviteReplacementError(RuntimeError):
    """Invite replacement lifecycle conflict or activation failure."""

    def __init__(self, code: str, message: str | None = None) -> None:
        self.code = (code or "invite_replacement_failed").strip()
        super().__init__(message or self.code)


class RecipientInviteRegistryPersistError(RuntimeError):
    """Invite JTI could not be bound into the delivery registry (fail closed)."""

    def __init__(self, code: str, message: str | None = None) -> None:
        self.code = (code or "recipient_invite_registry_unavailable").strip()
        super().__init__(message or self.code)


def require_invite_jti_recorded(
    draft: Dict[str, Any],
    *,
    phase: str,
    participant_id: str,
    jti: str,
    email: Optional[str] = None,
    audit_log: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Persist active invite JTI for phase+participant before token return / email send.

    Raises ``RecipientInviteRegistryPersistError`` when binding cannot be established.
    """
    pid = (participant_id or "").strip()
    j = (jti or "").strip()
    if not pid:
        raise RecipientInviteRegistryPersistError(
            "recipient_party_id_required",
            "Commercial signing invites require a recipient party id for delivery registry binding.",
        )
    if not j:
        raise RecipientInviteRegistryPersistError(
            "jti_missing",
            "Invite token JTI is required before delivery registry persistence.",
        )
    try:
        return record_invite_sent(
            draft,
            phase=phase,
            participant_id=pid,
            jti=j,
            email=email,
            audit_log=audit_log,
        )
    except RecipientInviteRegistryPersistError:
        raise
    except Exception as exc:  # noqa: BLE001 — surface as retryable registry failure
        raise RecipientInviteRegistryPersistError(
            "recipient_invite_registry_unavailable",
            "Invite delivery registry could not be updated.",
        ) from exc


def record_invite_sent_cas(
    draft: Dict[str, Any],
    *,
    phase: str,
    participant_id: str,
    jti: Optional[str] = None,
    email: Optional[str] = None,
    audit_log: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Record an invite JTI and CAS-persist ``recipient_delivery_v1``.

    Generic ``save_draft`` cannot create or mutate the security-owned registry; all
    durable invite bindings must go through CAS (this helper or ``save_draft_cas``).
    """
    from backend.services.agreement_draft_store import DraftCasConflictError, save_draft_cas

    base_rev = get_registry_revision(draft)
    record_invite_sent(
        draft,
        phase=phase,
        participant_id=participant_id,
        jti=jti,
        email=email,
        audit_log=audit_log,
    )
    try:
        save_draft_cas(draft, expected_revision=base_rev)
    except DraftCasConflictError as exc:
        raise RecipientInviteRegistryPersistError(
            "invite_replacement_conflict",
            "Invite delivery registry changed concurrently; reload and retry.",
        ) from exc
    return draft


def supersede_active_invite_cas(
    draft: Dict[str, Any],
    *,
    phase: str,
    participant_id: str,
    audit_log: Optional[List[Dict[str, Any]]] = None,
    jti: Optional[str] = None,
    force_revoke_gate: bool = False,
) -> Dict[str, Any]:
    """Supersede the active invite and CAS-persist the registry mutation."""
    from backend.services.agreement_draft_store import DraftCasConflictError, save_draft_cas

    base_rev = get_registry_revision(draft)
    supersede_active_invite(
        draft,
        phase=phase,
        participant_id=participant_id,
        audit_log=audit_log,
        jti=jti,
        force_revoke_gate=force_revoke_gate,
    )
    try:
        save_draft_cas(draft, expected_revision=base_rev)
    except DraftCasConflictError as exc:
        raise RecipientInviteRegistryPersistError(
            "invite_replacement_conflict",
            "Invite delivery registry changed concurrently; reload and retry.",
        ) from exc
    return draft


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_delivery_phase(phase: str) -> str:
    """
    Canonical delivery-registry phases: ``review`` | ``signing``.

    Legacy clients may send ``sign``; map it to ``signing`` so revoke/resend/
    validation/post-complete always hit the same registry key.
    """
    p = (phase or "").strip().lower()
    if p in ("sign", "signing", "signature"):
        return "signing"
    if p == "review":
        return "review"
    return p


def _registry_key(phase: str, participant_id: str) -> str:
    return f"{normalize_delivery_phase(phase)}:{(participant_id or '').strip()}"


def _jti_fingerprint(jti: str) -> str:
    raw = (jti or "").strip()
    if not raw:
        return ""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def get_registry(draft: Dict[str, Any]) -> Dict[str, Any]:
    reg = draft.get("recipient_delivery_v1")
    if isinstance(reg, dict) and reg.get("v") == 1:
        recipients = reg.get("recipients")
        if not isinstance(recipients, dict):
            return {"v": 1, "recipients": {}}
        return reg
    return {"v": 1, "recipients": {}}


def _recipient_row(reg: Dict[str, Any], phase: str, participant_id: str) -> Dict[str, Any]:
    recipients = reg.setdefault("recipients", {})
    if not isinstance(recipients, dict):
        recipients = {}
        reg["recipients"] = recipients
    key = _registry_key(phase, participant_id)
    row = recipients.get(key)
    if not isinstance(row, dict):
        row = {
            "phase": phase,
            "participant_id": participant_id,
            "active_jti": None,
            "active_jti_fp": None,
            "superseded_jtis": [],
            "superseded_jti_fps": [],
            "last_sent_at": None,
            "last_opened_at": None,
            "resent_count": 0,
            "active_signing_email": None,
            "revoked_at": None,
            "pending_replacement": None,
            "replacement_generation": 0,
        }
        recipients[key] = row
    # Backward-compatible defaults for drafts persisted before this lifecycle.
    row.setdefault("pending_replacement", None)
    row.setdefault("replacement_generation", 0)
    return row


def _bump_registry_revision(reg: Dict[str, Any]) -> int:
    try:
        rev = int(reg.get("revision") or 0) + 1
    except (TypeError, ValueError):
        rev = 1
    reg["revision"] = rev
    return rev


def get_registry_revision(draft: Dict[str, Any]) -> int:
    try:
        return int(get_registry(draft).get("revision") or 0)
    except (TypeError, ValueError):
        return 0


def get_replacement_generation(draft: Dict[str, Any], *, phase: str, participant_id: str) -> int:
    reg = get_registry(draft)
    row = (reg.get("recipients") or {}).get(_registry_key(phase, participant_id))
    if not isinstance(row, dict):
        return 0
    try:
        return int(row.get("replacement_generation") or 0)
    except (TypeError, ValueError):
        return 0


def _require_generation(row: Dict[str, Any], expected_generation: Optional[int]) -> int:
    try:
        gen = int(row.get("replacement_generation") or 0)
    except (TypeError, ValueError):
        gen = 0
    if expected_generation is None:
        raise InviteReplacementError(
            "invite_replacement_conflict",
            "expected_generation is required for invite replacement transitions.",
        )
    if int(expected_generation) != gen:
        raise InviteReplacementError(
            "invite_replacement_conflict",
            "Invite replacement generation conflict; reload and retry.",
        )
    return gen


def _require_revision(reg: Dict[str, Any], expected_revision: Optional[int]) -> int:
    try:
        rev = int(reg.get("revision") or 0)
    except (TypeError, ValueError):
        rev = 0
    if expected_revision is None:
        raise InviteReplacementError(
            "invite_replacement_conflict",
            "expected_revision is required for invite replacement transitions.",
        )
    if int(expected_revision) != rev:
        raise InviteReplacementError(
            "invite_replacement_conflict",
            "Invite registry revision conflict; reload and retry.",
        )
    return rev


def _superseded_set(row: Dict[str, Any]) -> set[str]:
    raw = row.get("superseded_jtis") or []
    if not isinstance(raw, list):
        return set()
    return {str(x).strip() for x in raw if str(x).strip()}


def pending_correction_matches(
    pending: Optional[Dict[str, Any]],
    *,
    new_email: str,
    agreement_id: str,
    locked_version_id: str,
    mode: str,
) -> bool:
    """True when durable pending correction targets the same email/agreement/version/mode."""
    if not isinstance(pending, dict):
        return False
    if str(pending.get("kind") or "") != KIND_EMAIL_CORRECTION:
        return False
    status = str(pending.get("status") or "").strip()
    if status not in _RESUMABLE_CORRECTION_STATUSES:
        return False
    email = (new_email or "").strip().lower()
    pending_email = str(pending.get("new_email") or "").strip().lower()
    if not email or pending_email != email:
        return False
    if str(pending.get("agreement_id") or "").strip() != (agreement_id or "").strip():
        return False
    if str(pending.get("locked_version_id") or "").strip() != (locked_version_id or "").strip():
        return False
    if str(pending.get("mode") or "").strip() != normalize_delivery_phase(mode):
        return False
    return True


def _append_superseded(row: Dict[str, Any], jti: str) -> None:
    j = (jti or "").strip()
    if not j:
        return
    superseded = list(row.get("superseded_jtis") or [])
    superseded_fps = list(row.get("superseded_jti_fps") or [])
    if j not in superseded:
        superseded.append(j)
        superseded_fps.append(_jti_fingerprint(j))
    row["superseded_jtis"] = superseded[-20:]
    row["superseded_jti_fps"] = superseded_fps[-20:]


def _consume_pending_into_superseded(row: Dict[str, Any]) -> Optional[str]:
    """Fold pending new_jti into superseded and clear pending. Returns consumed new_jti if any."""
    pending = row.get("pending_replacement")
    if not isinstance(pending, dict):
        row["pending_replacement"] = None
        return None
    new_jti = str(pending.get("new_jti") or "").strip()
    if new_jti:
        _append_superseded(row, new_jti)
    row["pending_replacement"] = None
    return new_jti or None


def get_pending_replacement(
    draft: Dict[str, Any],
    *,
    phase: str,
    participant_id: str,
) -> Optional[Dict[str, Any]]:
    phase = normalize_delivery_phase(phase)
    reg = get_registry(draft)
    row = (reg.get("recipients") or {}).get(_registry_key(phase, participant_id))
    if not isinstance(row, dict):
        return None
    pending = row.get("pending_replacement")
    return dict(pending) if isinstance(pending, dict) else None


def begin_invite_replacement(
    draft: Dict[str, Any],
    *,
    phase: str,
    participant_id: str,
    kind: str,
    new_jti: str,
    email: Optional[str] = None,
    old_email: Optional[str] = None,
    new_email: Optional[str] = None,
    actor: Optional[str] = None,
    reason: Optional[str] = None,
    audit_log: Optional[List[Dict[str, Any]]] = None,
    expected_generation: Optional[int] = None,
    expected_revision: Optional[int] = None,
    agreement_id: Optional[str] = None,
    locked_version_id: Optional[str] = None,
    mode: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Stage a pending replacement without activating it or superseding the current active invite.

    Same-email resend: active invite stays valid until ``activate_invite_replacement``.
    Email correction: caller must already have revoked the old invite; this only stages the new JTI.
    Requires ``expected_generation`` / ``expected_revision`` for concurrency safety.
    """
    phase = normalize_delivery_phase(phase)
    pid = (participant_id or "").strip()
    j_new = (new_jti or "").strip()
    if not pid:
        raise InviteReplacementError("recipient_party_id_required")
    if not j_new:
        raise InviteReplacementError("jti_missing")
    kind_n = (kind or "").strip()
    if kind_n not in (KIND_SAME_EMAIL_RESEND, KIND_EMAIL_CORRECTION):
        raise InviteReplacementError("invalid_replacement_kind")

    reg = get_registry(draft)
    _require_revision(reg, expected_revision)
    row = _recipient_row(reg, phase, pid)
    gen = _require_generation(row, expected_generation)

    old_jti = str(row.get("active_jti") or "").strip()
    pending = row.get("pending_replacement")
    # Idempotent retry: same pending new_jti already staged.
    if isinstance(pending, dict) and str(pending.get("new_jti") or "").strip() == j_new:
        draft["recipient_delivery_v1"] = reg
        return draft

    # Same-email resend must never consume/corrupt an in-flight email correction.
    if (
        isinstance(pending, dict)
        and str(pending.get("kind") or "") == KIND_EMAIL_CORRECTION
        and kind_n == KIND_SAME_EMAIL_RESEND
    ):
        raise InviteReplacementError(
            "email_correction_pending",
            "An email-correction replacement is already pending; finish or cancel it first.",
        )

    # Abort any prior incomplete pending of the same kind family (do not activate it).
    _consume_pending_into_superseded(row)

    if old_jti and old_jti == j_new:
        raise InviteReplacementError(
            "replacement_jti_unchanged",
            "Replacement JTI must differ from the active invite.",
        )
    if j_new in _superseded_set(row):
        raise InviteReplacementError(
            "replacement_jti_superseded",
            "Replacement JTI was already superseded and cannot be reactivated.",
        )

    gen += 1
    row["replacement_generation"] = gen
    now = _utc_now_iso()
    norm_new = (new_email or email or "").strip().lower() or None
    norm_old = (old_email or "").strip().lower() or None
    row["pending_replacement"] = {
        "v": 1,
        "kind": kind_n,
        "status": PENDING_DELIVERY,
        "old_jti": old_jti or None,
        "old_jti_fp": _jti_fingerprint(old_jti) if old_jti else None,
        "new_jti": j_new,
        "new_jti_fp": _jti_fingerprint(j_new),
        "old_email": norm_old,
        "new_email": norm_new,
        "old_email_redacted": _redact_email(norm_old or ""),
        "new_email_redacted": _redact_email(norm_new or ""),
        "agreement_id": (agreement_id or str(draft.get("id") or "")).strip() or None,
        "locked_version_id": (locked_version_id or "").strip() or None,
        "mode": normalize_delivery_phase(mode or phase),
        "actor": (actor or "").strip() or None,
        "reason": (reason or "").strip()[:500] or None,
        "created_at": now,
        "updated_at": now,
        "failure_code": None,
        "generation": gen,
    }
    _bump_registry_revision(reg)
    draft["recipient_delivery_v1"] = reg
    if audit_log is not None:
        audit_log.append(
            {
                "event_type": INVITE_REPLACEMENT_PENDING,
                "at": now,
                "field": "recipient_delivery",
                "value": {
                    "phase": phase,
                    "participant_id": pid,
                    "kind": kind_n,
                    "status": PENDING_DELIVERY,
                    "old_jti_fp": _jti_fingerprint(old_jti) if old_jti else None,
                    "new_jti_fp": _jti_fingerprint(j_new),
                    "generation": gen,
                    "actor": (actor or "").strip() or None,
                    "reason": (reason or "").strip()[:200] or None,
                },
            }
        )
    return draft


def stage_invite_replacement_mint_pending(
    draft: Dict[str, Any],
    *,
    phase: str,
    participant_id: str,
    kind: str,
    old_email: Optional[str] = None,
    new_email: Optional[str] = None,
    actor: Optional[str] = None,
    reason: Optional[str] = None,
    failure_code: str = "correction_mint_failed",
    audit_log: Optional[List[Dict[str, Any]]] = None,
    expected_generation: Optional[int] = None,
    expected_revision: Optional[int] = None,
    agreement_id: Optional[str] = None,
    locked_version_id: Optional[str] = None,
    mode: Optional[str] = None,
) -> Dict[str, Any]:
    """Durable pending replacement when mint failed (no JTI yet)."""
    phase = normalize_delivery_phase(phase)
    pid = (participant_id or "").strip()
    kind_n = (kind or "").strip()
    if not pid:
        raise InviteReplacementError("recipient_party_id_required")
    if kind_n not in (KIND_SAME_EMAIL_RESEND, KIND_EMAIL_CORRECTION):
        raise InviteReplacementError("invalid_replacement_kind")

    reg = get_registry(draft)
    _require_revision(reg, expected_revision)
    row = _recipient_row(reg, phase, pid)
    gen = _require_generation(row, expected_generation)
    pending = row.get("pending_replacement")
    if (
        isinstance(pending, dict)
        and str(pending.get("kind") or "") == KIND_EMAIL_CORRECTION
        and kind_n == KIND_SAME_EMAIL_RESEND
    ):
        raise InviteReplacementError("email_correction_pending")

    old_jti = str(row.get("active_jti") or "").strip()
    _consume_pending_into_superseded(row)
    gen += 1
    row["replacement_generation"] = gen
    now = _utc_now_iso()
    norm_new = (new_email or "").strip().lower() or None
    norm_old = (old_email or "").strip().lower() or None
    row["pending_replacement"] = {
        "v": 1,
        "kind": kind_n,
        "status": PENDING_MINT,
        "old_jti": old_jti or None,
        "old_jti_fp": _jti_fingerprint(old_jti) if old_jti else None,
        "new_jti": None,
        "new_jti_fp": None,
        "old_email": norm_old,
        "new_email": norm_new,
        "old_email_redacted": _redact_email(norm_old or ""),
        "new_email_redacted": _redact_email(norm_new or ""),
        "agreement_id": (agreement_id or str(draft.get("id") or "")).strip() or None,
        "locked_version_id": (locked_version_id or "").strip() or None,
        "mode": normalize_delivery_phase(mode or phase),
        "actor": (actor or "").strip() or None,
        "reason": (reason or "").strip()[:500] or None,
        "created_at": now,
        "updated_at": now,
        "failure_code": (failure_code or "correction_mint_failed")[:200],
        "generation": gen,
    }
    _bump_registry_revision(reg)
    draft["recipient_delivery_v1"] = reg
    if audit_log is not None:
        audit_log.append(
            {
                "event_type": INVITE_REPLACEMENT_FAILED,
                "at": now,
                "field": "recipient_delivery",
                "value": {
                    "phase": phase,
                    "participant_id": pid,
                    "kind": kind_n,
                    "status": PENDING_MINT,
                    "failure_code": (failure_code or "correction_mint_failed")[:200],
                    "generation": gen,
                    "old_email_redacted": _redact_email(norm_old or ""),
                    "new_email_redacted": _redact_email(norm_new or ""),
                },
            }
        )
    return draft


def rebind_pending_replacement_jti(
    draft: Dict[str, Any],
    *,
    phase: str,
    participant_id: str,
    new_jti: str,
    expected_generation: Optional[int] = None,
    expected_revision: Optional[int] = None,
    audit_log: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Attach/replace JTI on an existing pending row without bumping generation."""
    phase = normalize_delivery_phase(phase)
    pid = (participant_id or "").strip()
    j_new = (new_jti or "").strip()
    if not j_new:
        raise InviteReplacementError("jti_missing")
    reg = get_registry(draft)
    _require_revision(reg, expected_revision)
    row = _recipient_row(reg, phase, pid)
    gen = _require_generation(row, expected_generation)
    pending = row.get("pending_replacement")
    if not isinstance(pending, dict):
        raise InviteReplacementError("invite_replacement_missing")
    if int(pending.get("generation") or 0) != gen:
        raise InviteReplacementError("invite_replacement_conflict")
    if j_new in _superseded_set(row):
        raise InviteReplacementError("replacement_jti_superseded")
    active = str(row.get("active_jti") or "").strip()
    if active and active == j_new:
        raise InviteReplacementError("replacement_jti_unchanged")
    now = _utc_now_iso()
    pending = dict(pending)
    prior = str(pending.get("new_jti") or "").strip()
    if prior and prior != j_new:
        _append_superseded(row, prior)
    pending["new_jti"] = j_new
    pending["new_jti_fp"] = _jti_fingerprint(j_new)
    pending["status"] = PENDING_DELIVERY
    pending["failure_code"] = None
    pending["updated_at"] = now
    row["pending_replacement"] = pending
    _bump_registry_revision(reg)
    draft["recipient_delivery_v1"] = reg
    if audit_log is not None:
        audit_log.append(
            {
                "event_type": INVITE_REPLACEMENT_PENDING,
                "at": now,
                "field": "recipient_delivery",
                "value": {
                    "phase": phase,
                    "participant_id": pid,
                    "kind": pending.get("kind"),
                    "status": PENDING_DELIVERY,
                    "new_jti_fp": _jti_fingerprint(j_new),
                    "generation": gen,
                    "via": "rebind_pending_jti",
                },
            }
        )
    return draft


def abort_invite_replacement(
    draft: Dict[str, Any],
    *,
    phase: str,
    participant_id: str,
    failure_code: str,
    audit_log: Optional[List[Dict[str, Any]]] = None,
    preserve_active: bool = True,
    expected_generation: Optional[int] = None,
    expected_revision: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Abort a pending same-email replacement before activation.

    Supersedes the unused pending new_jti and clears pending. When
    ``preserve_active`` is True (ordinary resend), the prior active invite remains
    only when it still matches ``pending.old_jti`` and is not already superseded.
    """
    phase = normalize_delivery_phase(phase)
    pid = (participant_id or "").strip()
    reg = get_registry(draft)
    _require_revision(reg, expected_revision)
    row = _recipient_row(reg, phase, pid)
    gen = _require_generation(row, expected_generation)
    pending = row.get("pending_replacement")
    if not isinstance(pending, dict):
        return draft
    if int(pending.get("generation") or 0) != gen:
        raise InviteReplacementError("invite_replacement_conflict")
    now = _utc_now_iso()
    new_jti = str(pending.get("new_jti") or "").strip()
    pending_old = str(pending.get("old_jti") or "").strip()
    old_active = str(row.get("active_jti") or "").strip()
    superseded = _superseded_set(row)
    _consume_pending_into_superseded(row)

    preserved = False
    if preserve_active:
        # Never resurrect a JTI that authoritative state already superseded.
        if (
            old_active
            and pending_old
            and old_active == pending_old
            and old_active not in superseded
        ):
            row["active_jti"] = old_active
            row["active_jti_fp"] = _jti_fingerprint(old_active)
            preserved = True
        elif old_active and old_active in superseded:
            # Stale in-memory view: do not restore superseded active.
            row["active_jti"] = None
            row["active_jti_fp"] = None
        elif old_active and pending_old and old_active != pending_old:
            raise InviteReplacementError(
                "invite_replacement_conflict",
                "Active invite moved; refusing stale abort preserve.",
            )
    _bump_registry_revision(reg)
    draft["recipient_delivery_v1"] = reg
    if audit_log is not None:
        audit_log.append(
            {
                "event_type": INVITE_REPLACEMENT_ABORTED,
                "at": now,
                "field": "recipient_delivery",
                "value": {
                    "phase": phase,
                    "participant_id": pid,
                    "failure_code": (failure_code or "")[:200],
                    "new_jti_fp": _jti_fingerprint(new_jti) if new_jti else None,
                    "preserved_active": preserved,
                    "active_jti_fp": _jti_fingerprint(str(row.get("active_jti") or ""))
                    if row.get("active_jti")
                    else None,
                    "generation": gen,
                },
            }
        )
    return draft


def mark_invite_replacement_failed(
    draft: Dict[str, Any],
    *,
    phase: str,
    participant_id: str,
    failure_code: str,
    audit_log: Optional[List[Dict[str, Any]]] = None,
    expected_generation: Optional[int] = None,
    expected_revision: Optional[int] = None,
) -> Dict[str, Any]:
    """Keep durable pending state for support retry (email correction / activation)."""
    phase = normalize_delivery_phase(phase)
    pid = (participant_id or "").strip()
    reg = get_registry(draft)
    _require_revision(reg, expected_revision)
    row = _recipient_row(reg, phase, pid)
    gen = _require_generation(row, expected_generation)
    pending = row.get("pending_replacement")
    if not isinstance(pending, dict):
        return draft
    if int(pending.get("generation") or 0) != gen:
        raise InviteReplacementError("invite_replacement_conflict")
    now = _utc_now_iso()
    pending = dict(pending)
    pending["status"] = FAILED_NEEDS_RETRY
    pending["failure_code"] = (failure_code or "")[:200]
    pending["updated_at"] = now
    row["pending_replacement"] = pending
    _bump_registry_revision(reg)
    draft["recipient_delivery_v1"] = reg
    if audit_log is not None:
        audit_log.append(
            {
                "event_type": INVITE_REPLACEMENT_FAILED,
                "at": now,
                "field": "recipient_delivery",
                "value": {
                    "phase": phase,
                    "participant_id": pid,
                    "kind": pending.get("kind"),
                    "failure_code": pending.get("failure_code"),
                    "new_jti_fp": pending.get("new_jti_fp"),
                    "old_jti_fp": pending.get("old_jti_fp"),
                    "generation": pending.get("generation"),
                },
            }
        )
    return draft


def mark_invite_replacement_pending_activation(
    draft: Dict[str, Any],
    *,
    phase: str,
    participant_id: str,
    audit_log: Optional[List[Dict[str, Any]]] = None,
    expected_generation: Optional[int] = None,
    expected_revision: Optional[int] = None,
) -> Dict[str, Any]:
    """Delivery succeeded but activation did not; old active remains until retry activates."""
    phase = normalize_delivery_phase(phase)
    pid = (participant_id or "").strip()
    reg = get_registry(draft)
    _require_revision(reg, expected_revision)
    row = _recipient_row(reg, phase, pid)
    gen = _require_generation(row, expected_generation)
    pending = row.get("pending_replacement")
    if not isinstance(pending, dict):
        return draft
    if int(pending.get("generation") or 0) != gen:
        raise InviteReplacementError("invite_replacement_conflict")
    now = _utc_now_iso()
    pending = dict(pending)
    pending["status"] = PENDING_ACTIVATION
    pending["failure_code"] = "activation_incomplete"
    pending["updated_at"] = now
    row["pending_replacement"] = pending
    _bump_registry_revision(reg)
    draft["recipient_delivery_v1"] = reg
    if audit_log is not None:
        audit_log.append(
            {
                "event_type": INVITE_REPLACEMENT_FAILED,
                "at": now,
                "field": "recipient_delivery",
                "value": {
                    "phase": phase,
                    "participant_id": pid,
                    "kind": pending.get("kind"),
                    "failure_code": "activation_incomplete",
                    "status": PENDING_ACTIVATION,
                    "new_jti_fp": pending.get("new_jti_fp"),
                    "old_jti_fp": pending.get("old_jti_fp"),
                    "generation": gen,
                },
            }
        )
    return draft


def activate_invite_replacement(
    draft: Dict[str, Any],
    *,
    phase: str,
    participant_id: str,
    email: Optional[str] = None,
    audit_log: Optional[List[Dict[str, Any]]] = None,
    expected_generation: Optional[int] = None,
    expected_revision: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Atomically activate pending new_jti and supersede the prior active invite.

    Exactly one active JTI remains. Pending is cleared. Active JTI only moves forward
    to the pending new_jti (never resurrects a superseded token).
    """
    phase = normalize_delivery_phase(phase)
    pid = (participant_id or "").strip()
    reg = get_registry(draft)
    _require_revision(reg, expected_revision)
    row = _recipient_row(reg, phase, pid)
    gen = _require_generation(row, expected_generation)
    pending = row.get("pending_replacement")
    if not isinstance(pending, dict):
        raise InviteReplacementError(
            "invite_replacement_missing",
            "No pending invite replacement to activate.",
        )
    if int(pending.get("generation") or 0) != gen:
        raise InviteReplacementError("invite_replacement_conflict")
    new_jti = str(pending.get("new_jti") or "").strip()
    if not new_jti:
        raise InviteReplacementError("jti_missing")
    if new_jti in _superseded_set(row):
        raise InviteReplacementError(
            "replacement_jti_superseded",
            "Pending JTI was superseded and cannot be activated.",
        )
    old_jti = str(row.get("active_jti") or "").strip()
    pending_old = str(pending.get("old_jti") or "").strip()
    # Refuse activate when active moved away from the pending's expected old JTI
    # (unless active already empty after correction revoke).
    if pending_old and old_jti and old_jti != pending_old and old_jti != new_jti:
        raise InviteReplacementError(
            "invite_replacement_conflict",
            "Active invite changed under pending replacement; reload and retry.",
        )
    now = _utc_now_iso()

    if old_jti and old_jti != new_jti:
        _append_superseded(row, old_jti)
    if pending_old and pending_old != new_jti and pending_old != old_jti:
        _append_superseded(row, pending_old)

    row["active_jti"] = new_jti
    row["active_jti_fp"] = _jti_fingerprint(new_jti)
    if email:
        row["active_signing_email"] = email.strip().lower()
    row["revoked_at"] = None
    had_prior_send = bool(row.get("last_sent_at"))
    if had_prior_send:
        row["resent_count"] = int(row.get("resent_count") or 0) + 1
    row["last_sent_at"] = now
    kind = str(pending.get("kind") or "")
    generation = pending.get("generation")
    row["pending_replacement"] = None
    _bump_registry_revision(reg)
    draft["recipient_delivery_v1"] = reg
    if audit_log is not None:
        audit_log.append(
            {
                "event_type": INVITE_REPLACEMENT_ACTIVATED,
                "at": now,
                "field": "recipient_delivery",
                "value": {
                    "phase": phase,
                    "participant_id": pid,
                    "kind": kind,
                    "old_jti_fp": _jti_fingerprint(old_jti) if old_jti else None,
                    "new_jti_fp": _jti_fingerprint(new_jti),
                    "generation": generation,
                },
            }
        )
        audit_log.append(
            {
                "event_type": INVITE_RESENT if had_prior_send else INVITE_SENT,
                "at": now,
                "field": "recipient_delivery",
                "value": {
                    "phase": phase,
                    "participant_id": pid,
                    "jti_fp": _jti_fingerprint(new_jti),
                    "email_redacted": _redact_email(email or ""),
                    "via": "invite_replacement_activation",
                },
            }
        )
    return draft


def record_invite_sent(
    draft: Dict[str, Any],
    *,
    phase: str,
    participant_id: str,
    jti: Optional[str] = None,
    email: Optional[str] = None,
    audit_log: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Record a sent invite; supersede prior active JTI when re-sending."""
    phase = normalize_delivery_phase(phase)
    reg = get_registry(draft)
    row = _recipient_row(reg, phase, participant_id)
    now = _utc_now_iso()
    old_jti = str(row.get("active_jti") or "").strip()
    if old_jti and jti and old_jti != jti:
        supersede_active_invite(draft, phase=phase, participant_id=participant_id, audit_log=audit_log)
        row = _recipient_row(reg, phase, participant_id)
    if jti:
        row["active_jti"] = jti
        row["active_jti_fp"] = _jti_fingerprint(jti)
    if email:
        row["active_signing_email"] = email.strip().lower()
    # New invite clears explicit revoke.
    row["revoked_at"] = None
    had_prior_send = bool(row.get("last_sent_at"))
    if had_prior_send:
        row["resent_count"] = int(row.get("resent_count") or 0) + 1
    row["last_sent_at"] = now
    # Advance registry revision so generic LWW saves cannot treat this as equal-rev.
    if jti:
        _bump_registry_revision(reg)
    draft["recipient_delivery_v1"] = reg
    if audit_log is not None:
        audit_log.append(
            {
                "event_type": INVITE_SENT if not had_prior_send else INVITE_RESENT,
                "at": now,
                "field": "recipient_delivery",
                "value": {
                    "phase": phase,
                    "participant_id": participant_id,
                    "jti_fp": row.get("active_jti_fp"),
                    "email_redacted": _redact_email(email or ""),
                },
            }
        )
    return draft


def record_invite_opened(
    draft: Dict[str, Any],
    *,
    phase: str,
    participant_id: str,
    jti: Optional[str] = None,
    audit_log: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Record invite-open telemetry on the security-owned registry.

    Bumps ``recipient_delivery_v1.revision`` so callers must persist via
    ``save_draft_cas`` / authorized CAS path — generic LWW saves cannot apply
    or silently drop this mutation via whole-blob preservation.
    """
    phase = normalize_delivery_phase(phase)
    reg = get_registry(draft)
    row = _recipient_row(reg, phase, participant_id)
    now = _utc_now_iso()
    if not row.get("last_opened_at"):
        row["first_opened_at"] = now
    row["last_opened_at"] = now
    _bump_registry_revision(reg)
    draft["recipient_delivery_v1"] = reg
    if audit_log is not None:
        audit_log.append(
            {
                "event_type": INVITE_OPENED,
                "at": now,
                "field": "recipient_delivery",
                "value": {
                    "phase": phase,
                    "participant_id": participant_id,
                    "jti_fp": _jti_fingerprint(jti or ""),
                },
            }
        )
    return draft


def supersede_active_invite(
    draft: Dict[str, Any],
    *,
    phase: str,
    participant_id: str,
    audit_log: Optional[List[Dict[str, Any]]] = None,
    jti: Optional[str] = None,
    force_revoke_gate: bool = False,
) -> Dict[str, Any]:
    """
    Supersede the active invite JTI for phase+participant.

    Also consumes any pending replacement JTI (cancel/revoke/reissue/complete are
    security-first and must not leave a pending token usable).

    When ``jti`` is provided (e.g. the token just used to complete), that JTI is
    always marked superseded even if ``active_jti`` was never recorded — closing
    the production replay gap when delivery omitted JTI registration.

    ``force_revoke_gate`` sets ``revoked_at`` even when an active JTI was consumed
    (email-correction security policy: old address must not remain authorized).
    """
    phase = normalize_delivery_phase(phase)
    reg = get_registry(draft)
    row = _recipient_row(reg, phase, participant_id)
    now = _utc_now_iso()
    consumed: List[str] = []
    old_jti = str(row.get("active_jti") or "").strip()
    if old_jti:
        consumed.append(old_jti)
    explicit = str(jti or "").strip()
    if explicit and explicit not in consumed:
        consumed.append(explicit)
    pending_new = _consume_pending_into_superseded(row)
    if pending_new and pending_new not in consumed:
        consumed.append(pending_new)
    for victim in consumed:
        _append_superseded(row, victim)
    # Always clear active invite. When no JTI was known, mark revoked so any
    # outstanding token for this phase+participant fails until a new invite.
    row["active_jti"] = None
    row["active_jti_fp"] = None
    if not consumed or force_revoke_gate:
        row["revoked_at"] = now
    _bump_registry_revision(reg)
    if audit_log is not None:
        audit_log.append(
            {
                "event_type": INVITE_SUPERSEDED,
                "at": now,
                "field": "recipient_delivery",
                "value": {
                    "phase": phase,
                    "participant_id": participant_id,
                    "jti_fp": _jti_fingerprint(consumed[0]) if consumed else None,
                    "consumed_count": len(consumed),
                    "revoked_without_jti": not bool(consumed) or force_revoke_gate,
                    "pending_consumed": bool(pending_new),
                },
            }
        )
    draft["recipient_delivery_v1"] = reg
    return draft


def is_jti_superseded(draft: Dict[str, Any], jti: str, phase: str, participant_id: str) -> bool:
    j = (jti or "").strip()
    if not j:
        return False
    phase = normalize_delivery_phase(phase)
    reg = get_registry(draft)
    recipients = reg.get("recipients") or {}
    if not isinstance(recipients, dict):
        return False
    row = recipients.get(_registry_key(phase, participant_id))
    if not isinstance(row, dict):
        return False
    if row.get("revoked_at"):
        return True
    superseded = row.get("superseded_jtis") or []
    if isinstance(superseded, list) and j in superseded:
        return True
    pending = row.get("pending_replacement")
    if isinstance(pending, dict):
        pending_jti = str(pending.get("new_jti") or "").strip()
        status = str(pending.get("status") or "").strip()
        # Pending replacement must not validate until activation.
        if pending_jti and j == pending_jti and status in _PENDING_BLOCK_STATUSES:
            return True
    active = str(row.get("active_jti") or "").strip()
    # Active invite exists and this JTI is not it → superseded/replaced.
    if active and active != j:
        return True
    return False


def jti_invite_access_denied(
    draft: Dict[str, Any],
    jti: str,
    phase: str,
    participant_id: str,
    *,
    commercial: bool,
) -> bool:
    """
    Whether a recipient invite JTI must be denied.

    Legacy/non-commercial: deny only when explicitly superseded/revoked/pending
    (empty registry remains permissive for local compatibility).

    Commercial: fail closed — JTI must be the durable active invite for
    phase+participant. Missing, emptied, pending, superseded, revoked, or
    mismatched registry state denies access.
    """
    j = (jti or "").strip()
    if not j:
        return bool(commercial)
    phase = normalize_delivery_phase(phase)
    pid = (participant_id or "").strip()
    if is_jti_superseded(draft, j, phase, pid):
        return True
    if not commercial:
        return False
    if not pid:
        return True
    reg = get_registry(draft)
    recipients = reg.get("recipients") or {}
    if not isinstance(recipients, dict) or not recipients:
        return True
    row = recipients.get(_registry_key(phase, pid))
    if not isinstance(row, dict):
        return True
    if row.get("revoked_at"):
        return True
    active = str(row.get("active_jti") or "").strip()
    if not active or active != j:
        return True
    return False


def is_signing_email_superseded(
    draft: Dict[str, Any],
    participant_id: str,
    recipient_email: str,
) -> bool:
    email = (recipient_email or "").strip().lower()
    if not email:
        return False
    reg = get_registry(draft)
    recipients = reg.get("recipients") or {}
    if not isinstance(recipients, dict):
        return False
    row = recipients.get(_registry_key("signing", participant_id))
    if not isinstance(row, dict):
        return False
    active = str(row.get("active_signing_email") or "").strip().lower()
    if active and active != email:
        return True
    parties = draft.get("parties") or []
    for p in parties:
        if not isinstance(p, dict):
            continue
        if str(p.get("id") or "").strip() != participant_id:
            continue
        current = str(p.get("email") or "").strip().lower()
        return bool(current and current != email)
    return False


def _redact_email(email: str) -> str:
    e = (email or "").strip().lower()
    if "@" not in e:
        return "***"
    local, domain = e.split("@", 1)
    if len(local) <= 1:
        return f"*@{domain}"
    return f"{local[0]}***@{domain}"


def extract_jti_from_token(token: str) -> str:
    """Best-effort JTI extraction without full verify (for send recording)."""
    try:
        import base64
        import json

        parts = str(token or "").strip().split(".")
        if len(parts) != 2:
            return ""
        pad = "=" * ((4 - len(parts[0]) % 4) % 4)
        body = base64.urlsafe_b64decode((parts[0] + pad).encode("ascii"))
        payload = json.loads(body.decode("utf-8"))
        return str(payload.get("jti") or "").strip()
    except Exception:  # noqa: BLE001
        return ""


def extract_jti_from_signing_url(url: str) -> str:
    """Extract recipient access-token JTI from a signing URL ``t=`` query param."""
    try:
        from urllib.parse import parse_qs, urlparse

        parsed = urlparse(str(url or "").strip())
        qs = parse_qs(parsed.query or "")
        for key in ("t", "token", "access_token", "recipient_token"):
            vals = qs.get(key) or []
            if vals:
                jti = extract_jti_from_token(str(vals[0] or ""))
                if jti:
                    return jti
        return ""
    except Exception:  # noqa: BLE001
        return ""


def supersede_all_phase_invites(
    draft: Dict[str, Any],
    *,
    phase: str,
    audit_log: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Supersede every active invite for ``phase`` across all participants.

    Used on signing-packet cancel/reissue so prior JTIs cannot complete against
    a cancelled or replaced packet. Idempotent: repeated calls keep JTIs
    superseded and leave ``revoked_at`` set when no active JTI was known.
    """
    phase = normalize_delivery_phase(phase)
    reg = get_registry(draft)
    recipients = reg.get("recipients") or {}
    if not isinstance(recipients, dict):
        return draft
    # Snapshot keys — supersede mutates the registry in place.
    keys = [str(k) for k in list(recipients.keys())]
    prefix = f"{phase}:"
    for key in keys:
        if not key.startswith(prefix):
            continue
        row = recipients.get(key)
        pid = ""
        if isinstance(row, dict):
            pid = str(row.get("participant_id") or "").strip()
        if not pid:
            pid = key[len(prefix) :].strip()
        if not pid:
            continue
        supersede_active_invite(
            draft,
            phase=phase,
            participant_id=pid,
            audit_log=audit_log,
        )
    return draft
