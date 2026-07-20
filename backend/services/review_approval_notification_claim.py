"""Durable approval-notification claims for GTM Security Slice 3B."""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.utils.canon_json import canon_json_bytes

_log = logging.getLogger(__name__)

REVIEW_APPROVAL_NOTIFICATIONS_FIELD = "review_approval_notifications_v1"
CLAIM_STATUS_PENDING = "pending"
CLAIM_STATUS_INVOKING = "invoking"
CLAIM_STATUS_COMPLETED = "completed"
CLAIM_STATUS_FAILED = "failed"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _clean(value: Any) -> str:
    return str(value or "").strip()


def approval_transition_id(*, approval_at: str, participant_id: str) -> str:
    material = f"{_clean(participant_id)}:{_clean(approval_at)}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def approval_notification_claim_id(
    *,
    agreement_id: str,
    participant_id: str,
    content_sha256: str,
    locked_version_id: str,
) -> str:
    material = "|".join(
        [
            _clean(agreement_id),
            _clean(participant_id),
            _clean(content_sha256),
            _clean(locked_version_id),
        ]
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _claims_container(draft: Dict[str, Any]) -> Dict[str, Any]:
    raw = draft.get(REVIEW_APPROVAL_NOTIFICATIONS_FIELD)
    if isinstance(raw, dict) and raw.get("v") == 1:
        claims = raw.get("claims")
        if isinstance(claims, dict):
            return {"v": 1, "claims": dict(claims)}
    return {"v": 1, "claims": {}}


def claims_field_material(record: Dict[str, Any]) -> bytes:
    if not isinstance(record, dict):
        return b""
    claims = record.get("claims")
    if not isinstance(claims, dict):
        return canon_json_bytes({"v": record.get("v"), "claims": {}})
    return canon_json_bytes({"v": record.get("v"), "claims": claims})


def merge_approval_notification_claim(
    draft: Dict[str, Any],
    *,
    agreement_id: str,
    participant_id: str,
    session_id: Optional[str],
    content_sha256: str,
    locked_version_id: str,
    approval_at: str,
) -> Tuple[Dict[str, Any], bool, str]:
    """
    Atomically establish or observe an approval notification claim on ``draft``.

    Returns ``(draft, won_claim, attempt_id)``. Losers receive the existing
  winner attempt id without mutating claim state.
    """
    pid = _clean(participant_id)
    if not pid:
        return draft, False, ""
    transition = approval_transition_id(approval_at=approval_at, participant_id=pid)
    claim_id = approval_notification_claim_id(
        agreement_id=agreement_id,
        participant_id=pid,
        content_sha256=_clean(content_sha256),
        locked_version_id=_clean(locked_version_id),
    )
    container = _claims_container(draft)
    claims: Dict[str, Any] = container["claims"]
    existing = claims.get(claim_id)
    if isinstance(existing, dict):
        attempt_id = _clean(existing.get("attempt_id"))
        return draft, False, attempt_id

    attempt_id = secrets.token_hex(16)
    claims[claim_id] = {
        "claim_id": claim_id,
        "participant_id": pid,
        "session_id": _clean(session_id) or None,
        "content_sha256": _clean(content_sha256),
        "locked_version_id": _clean(locked_version_id),
        "transition_id": transition,
        "approval_at": _clean(approval_at),
        "attempt_id": attempt_id,
        "status": CLAIM_STATUS_PENDING,
        "owner_notification": None,
        "counterparty_notification": None,
    }
    out = dict(draft)
    out[REVIEW_APPROVAL_NOTIFICATIONS_FIELD] = container
    return out, True, attempt_id


def _find_claim_for_participant(
    draft: Dict[str, Any],
    *,
    participant_id: str,
) -> Optional[Tuple[str, Dict[str, Any]]]:
    pid = _clean(participant_id)
    if not pid:
        return None
    container = _claims_container(draft)
    for claim_id, claim in (container.get("claims") or {}).items():
        if not isinstance(claim, dict):
            continue
        if _clean(claim.get("participant_id")) == pid:
            return claim_id, claim
    return None


def try_claim_provider_invocation(
    draft: Dict[str, Any],
    *,
    claim_id: str,
    attempt_id: str,
) -> Tuple[Dict[str, Any], bool]:
    """CAS pending -> invoking for the winning attempt only."""
    aid = _clean(attempt_id)
    if not aid:
        return draft, False
    container = _claims_container(draft)
    claims: Dict[str, Any] = container["claims"]
    claim = claims.get(claim_id)
    if not isinstance(claim, dict):
        return draft, False
    if _clean(claim.get("attempt_id")) != aid:
        return draft, False
    status = _clean(claim.get("status"))
    if status == CLAIM_STATUS_PENDING:
        updated = dict(claim)
        updated["status"] = CLAIM_STATUS_INVOKING
        updated["invoked_at"] = _utc_now_iso()
        claims[claim_id] = updated
        out = dict(draft)
        out[REVIEW_APPROVAL_NOTIFICATIONS_FIELD] = container
        return out, True
    if status in (CLAIM_STATUS_INVOKING, CLAIM_STATUS_COMPLETED, CLAIM_STATUS_FAILED):
        return draft, False
    return draft, False


def record_provider_outcome(
    draft: Dict[str, Any],
    *,
    claim_id: str,
    attempt_id: str,
    owner_notification: Optional[Dict[str, Any]],
    counterparty_notification: Optional[Dict[str, Any]],
    provider_failed: bool,
) -> Tuple[Dict[str, Any], bool]:
    """CAS invoking -> terminal outcome without clobbering a different attempt."""
    aid = _clean(attempt_id)
    container = _claims_container(draft)
    claims: Dict[str, Any] = container["claims"]
    claim = claims.get(claim_id)
    if not isinstance(claim, dict) or _clean(claim.get("attempt_id")) != aid:
        return draft, False
    if _clean(claim.get("status")) not in (CLAIM_STATUS_INVOKING, CLAIM_STATUS_PENDING):
        return draft, False
    updated = dict(claim)
    updated["status"] = CLAIM_STATUS_FAILED if provider_failed else CLAIM_STATUS_COMPLETED
    updated["completed_at"] = _utc_now_iso()
    if owner_notification is not None:
        updated["owner_notification"] = owner_notification
    if counterparty_notification is not None:
        updated["counterparty_notification"] = counterparty_notification
    claims[claim_id] = updated
    out = dict(draft)
    out[REVIEW_APPROVAL_NOTIFICATIONS_FIELD] = container
    return out, True


def merge_notification_claims_preserving_terminal(
    current: Optional[Dict[str, Any]],
    incoming: Dict[str, Any],
) -> Dict[str, Any]:
    """Merge claim records without letting a loser overwrite terminal winner state."""
    current_container = _claims_container(current or {})
    incoming_container = _claims_container(incoming)
    merged_claims = dict(current_container.get("claims") or {})
    for claim_id, incoming_claim in (incoming_container.get("claims") or {}).items():
        if not isinstance(incoming_claim, dict):
            continue
        existing = merged_claims.get(claim_id)
        if not isinstance(existing, dict):
            merged_claims[claim_id] = incoming_claim
            continue
        existing_status = _clean(existing.get("status"))
        incoming_status = _clean(incoming_claim.get("status"))
        if existing_status in (CLAIM_STATUS_COMPLETED, CLAIM_STATUS_FAILED):
            merged_claims[claim_id] = existing
            continue
        if existing_status == CLAIM_STATUS_INVOKING and incoming_status == CLAIM_STATUS_PENDING:
            merged_claims[claim_id] = existing
            continue
        merged_claims[claim_id] = incoming_claim
    return {"v": 1, "claims": merged_claims}


def _persist_notification_outcome_locked(
    agreement_id: str,
    draft_dump: Dict[str, Any],
    *,
    claim_id: str,
    attempt_id: str,
    owner_notification: Optional[Dict[str, Any]],
    counterparty_notification: Optional[Dict[str, Any]],
    provider_failed: bool,
    request: Any = None,
) -> Dict[str, Any]:
    from backend.services.agreement_draft_store import (
        _use_postgres,
        agreement_file_lock,
    )

    aid = _clean(agreement_id)
    if not aid:
        return draft_dump

    def _apply(current: Dict[str, Any]) -> Dict[str, Any]:
        updated, ok = record_provider_outcome(
            current,
            claim_id=claim_id,
            attempt_id=attempt_id,
            owner_notification=owner_notification,
            counterparty_notification=counterparty_notification,
            provider_failed=provider_failed,
        )
        return updated if ok else current

    if _use_postgres():
        from backend.db.agreement_sql import agreement_postgres_connection, pg_execute
        from backend.services.agreement_draft_store import _decode_draft_payload
        from backend.utils.canon_json import canon_json_bytes
        from datetime import datetime, timezone

        with agreement_postgres_connection() as cx:
            row = pg_execute(
                cx,
                "SELECT payload FROM agreement_drafts WHERE id = ? FOR UPDATE",
                (aid,),
            ).fetchone()
            current = _decode_draft_payload(row[0]) if row else {}
            merged = _apply(dict(current or {}))
            payload_text = canon_json_bytes(merged).decode("utf-8")
            pg_execute(
                cx,
                "UPDATE agreement_drafts SET payload = ?::jsonb, updated_at = ? WHERE id = ?",
                (payload_text, datetime.now(timezone.utc), aid),
            )
            return merged

    from backend.services.agreement_draft_store import (
        _agreement_path,
        _decode_draft_payload,
        _write_draft_file_unlocked,
    )

    with agreement_file_lock(aid):
        path = _agreement_path(aid)
        current = _decode_draft_payload(path.read_text(encoding="utf-8")) if path.exists() else {}
        merged = _apply(dict(current or {}))
        if merged is not current:
            _write_draft_file_unlocked(path, merged)
        return merged


def process_committed_approval_notifications(
    agreement_id: str,
    draft_dump: Dict[str, Any],
    *,
    approver_participant_id: str | None,
    approver_display_name: str | None,
    org_id: str | None = None,
    request: Any = None,
) -> Dict[str, Any]:
    """
    Invoke notification providers only for the durable claim winner after commit.

    Losers and retries observe terminal claim state and perform zero provider work.
    """
    pid = _clean(approver_participant_id)
    if not pid:
        return draft_dump

    located = _find_claim_for_participant(draft_dump, participant_id=pid)
    if not located:
        return draft_dump
    claim_id, claim = located
    attempt_id = _clean(claim.get("attempt_id"))
    if not attempt_id:
        return draft_dump

    from backend.services.agreement_draft_store import (
        _use_postgres,
        agreement_file_lock,
        load_draft,
    )

    def _claim_slot(current: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
        return try_claim_provider_invocation(
            current,
            claim_id=claim_id,
            attempt_id=attempt_id,
        )

    if _use_postgres():
        from backend.db.agreement_sql import agreement_postgres_connection, pg_execute
        from backend.services.agreement_draft_store import _decode_draft_payload

        with agreement_postgres_connection() as cx:
            row = pg_execute(
                cx,
                "SELECT payload FROM agreement_drafts WHERE id = ? FOR UPDATE",
                (agreement_id,),
            ).fetchone()
            current = _decode_draft_payload(row[0]) if row else {}
            claimed, won = _claim_slot(dict(current or {}))
            if not won:
                return draft_dump
            from backend.utils.canon_json import canon_json_bytes
            from datetime import datetime, timezone

            payload_text = canon_json_bytes(claimed).decode("utf-8")
            pg_execute(
                cx,
                "UPDATE agreement_drafts SET payload = ?::jsonb, updated_at = ? WHERE id = ?",
                (payload_text, datetime.now(timezone.utc), agreement_id),
            )
            working = claimed
    else:
        from backend.services.agreement_draft_store import (
            _agreement_path,
            _decode_draft_payload,
            _write_draft_file_unlocked,
        )

        with agreement_file_lock(agreement_id):
            path = _agreement_path(agreement_id)
            current = _decode_draft_payload(path.read_text(encoding="utf-8")) if path.exists() else {}
            claimed, won = _claim_slot(dict(current or {}))
            if not won:
                return draft_dump
            _write_draft_file_unlocked(path, claimed)
            working = claimed

    owner_notification: Optional[Dict[str, Any]] = None
    counterparty_notification: Optional[Dict[str, Any]] = None
    provider_failed = False
    notify_events: List[Dict[str, Any]] = []
    try:
        from backend.services.email.review_delivery import (
            maybe_notify_counterparties_all_reviews_complete,
            maybe_notify_owner_after_reviewer_approval,
        )

        owner_notification = maybe_notify_owner_after_reviewer_approval(
            agreement_id=agreement_id,
            draft=working,
            approver_participant_id=pid,
            approver_display_name=approver_display_name,
            org_id=org_id,
        )
        if owner_notification:
            notify_events.append(owner_notification)
        counterparty_notification = maybe_notify_counterparties_all_reviews_complete(
            agreement_id=agreement_id,
            draft=working,
        )
        if counterparty_notification:
            notify_events.append(counterparty_notification)
    except Exception:
        provider_failed = True
        _log.exception(
            "approval_notification_provider_failed agreement_id=%s participant_id=%s",
            agreement_id,
            pid,
        )

    outcome_draft = _persist_notification_outcome_locked(
        agreement_id,
        working,
        claim_id=claim_id,
        attempt_id=attempt_id,
        owner_notification=owner_notification,
        counterparty_notification=counterparty_notification,
        provider_failed=provider_failed,
        request=request,
    )

    if not notify_events:
        return outcome_draft

    audit = list(outcome_draft.get("audit_log") or [])
    for event in notify_events:
        if isinstance(event, dict):
            audit.append(dict(event))
    out_dump = dict(outcome_draft)
    out_dump["audit_log"] = audit
    out_dump["updated_at"] = _utc_now_iso()
    if request is not None:
        from backend.routers.agreements_v2_api import _save_draft_sync

        _save_draft_sync(out_dump, request)
    else:
        from backend.services.agreement_draft_store import save_draft

        save_draft(out_dump)
    return out_dump
