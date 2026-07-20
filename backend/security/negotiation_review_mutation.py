"""Centralized negotiation-review mutation authorization (GTM Security Slice 3B)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional

from fastapi import HTTPException, Request

from backend.security.negotiation_review_authorization import (
    NegotiationReviewAuthorization,
    _write_denied,
)
from backend.security.negotiation_review_same_origin import assert_negotiation_review_same_origin
from backend.security.negotiation_review_session_cookie import (
    read_negotiation_review_session_cookie,
)
from backend.services.negotiation_review_bootstrap_exchange import (
    NegotiationReviewBootstrapExchangeError,
    advance_session_content_binding_on_draft,
    peek_revalidated_negotiation_review_session,
    revalidate_session_authority_unlocked,
)
from backend.services.negotiation_review_draft_projection import (
    build_negotiation_review_draft_projection,
    build_negotiation_review_read_response,
)
from backend.services.negotiation_review_session_store import (
    NEGOTIATION_REVIEW_SESSIONS_FIELD,
    apply_session_last_seen_to_draft,
    get_sessions_field,
)

_AUTHORITY_PRESERVE_KEYS = (
    "recipient_delivery_v1",
    "recipient_bootstrap_sessions_v1",
    "frozen_signing_authority_v1",
    "vs01_signing_packet_v1",
    "vs01_signing_packet_activation_v1",
    "vs01_signing_invite_delivery_v1",
    "review_approval_notifications_v1",
)


@dataclass(frozen=True)
class NegotiationReviewMutationAuth:
    agreement_id: str
    recipient_party_id: Optional[str]
    mode: str
    role: str
    locked_version_id: str
    content_sha256: str
    session_id: str
    session_secret: str

    def as_authorization(self) -> NegotiationReviewAuthorization:
        return NegotiationReviewAuthorization(
            agreement_id=self.agreement_id,
            recipient_party_id=self.recipient_party_id,
            mode=self.mode,
            role=self.role,
            locked_version_id=self.locked_version_id,
            session_id=self.session_id,
        )


def _session_secret_from_request(request: Request) -> str:
    return read_negotiation_review_session_cookie(request)


def _clean(value: Any) -> str:
    return str(value or "").strip()


def merge_mutated_draft_preserving_authority(
    latest_raw: Dict[str, Any],
    mutated_raw: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Merge typed-model or partial draft mutations back into the latest raw draft without
    dropping negotiation-review session/delivery authority fields.
    """
    out = dict(mutated_raw)
    for key in _AUTHORITY_PRESERVE_KEYS:
        if key in latest_raw:
            out[key] = latest_raw[key]
    latest_sessions = get_sessions_field(latest_raw)
    if latest_sessions.get("sessions"):
        out[NEGOTIATION_REVIEW_SESSIONS_FIELD] = latest_sessions
    return out


def negotiation_review_mutation_auth_from_request(
    request: Request,
    agreement_id: str,
    *,
    bind_participant_id: Optional[str] = None,
) -> Optional[NegotiationReviewMutationAuth]:
    """Return validated session mutation auth without side effects, or None."""
    secret = _session_secret_from_request(request)
    if not secret:
        return None
    aid = (agreement_id or "").strip()
    if not aid:
        return None
    try:
        session = peek_revalidated_negotiation_review_session(session_secret=secret)
    except NegotiationReviewBootstrapExchangeError:
        return None
    if _clean(session.get("agreement_id")) != aid:
        return None
    auth = NegotiationReviewMutationAuth(
        agreement_id=aid,
        recipient_party_id=_clean(session.get("party_id")) or None,
        mode="review",
        role=_clean(session.get("role")) or "reviewer",
        locked_version_id=_clean(session.get("locked_version_id")),
        content_sha256=_clean(session.get("content_sha256")),
        session_id=_clean(session.get("session_id")),
        session_secret=secret,
    )
    if bind_participant_id is not None:
        tok_pid = (auth.recipient_party_id or "").strip()
        body_pid = (bind_participant_id or "").strip()
        if tok_pid:
            if not body_pid:
                raise _write_denied(code="recipient_party_id_required")
            if tok_pid != body_pid:
                raise _write_denied(code="recipient_party_token_mismatch")
    return auth


def assert_negotiation_review_session_mutation_allowed(
    request: Request,
    agreement_id: str,
    *,
    bind_participant_id: Optional[str] = None,
) -> NegotiationReviewMutationAuth:
    """
    Cookie-authorized review mutations:
    same-origin first, then session peek/revalidation without last_seen writes.
    """
    assert_negotiation_review_same_origin(request)
    auth = negotiation_review_mutation_auth_from_request(
        request,
        agreement_id,
        bind_participant_id=bind_participant_id,
    )
    if not auth:
        raise _write_denied()
    return auth


def build_negotiation_review_mutation_response(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    auth: NegotiationReviewMutationAuth,
    signing_lock: Optional[Dict[str, Any]],
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    out = build_negotiation_review_read_response(
        agreement_id=agreement_id,
        draft=draft,
        auth=auth.as_authorization(),
        signing_lock=signing_lock,
    )
    if extra:
        out.update(extra)
    return out


def build_negotiation_review_mutation_draft_only(
    *,
    draft: Dict[str, Any],
    auth: NegotiationReviewMutationAuth,
) -> Dict[str, Any]:
    return {
        "draft": build_negotiation_review_draft_projection(
            draft=draft,
            auth=auth.as_authorization(),
        )
    }


def _finalize_mutated_draft(
    *,
    latest_raw: Dict[str, Any],
    mutated_raw: Dict[str, Any],
    session: Dict[str, Any],
    last_seen_at: Optional[str] = None,
) -> Dict[str, Any]:
    preserved = merge_mutated_draft_preserving_authority(latest_raw, mutated_raw)
    advanced = advance_session_content_binding_on_draft(preserved, session=session)
    if last_seen_at:
        sid = _clean(session.get("session_id"))
        updated, _changed = apply_session_last_seen_to_draft(
            advanced,
            session_id=sid,
            last_seen_at=last_seen_at,
        )
        return updated
    return advanced


def _assert_sessions_authority_preserved(
    after_raw: Dict[str, Any],
    *,
    session_id: str,
) -> None:
    after_sessions = get_sessions_field(after_raw)
    if not after_sessions.get("sessions"):
        raise RuntimeError("negotiation_review_sessions_missing_after_mutation")
    sid = _clean(session_id)
    after_record = (after_sessions.get("sessions") or {}).get(sid)
    if not isinstance(after_record, dict):
        raise RuntimeError("negotiation_review_session_record_missing_after_mutation")


def _persist_postgres_mutation(
    *,
    cx: Any,
    agreement_id: str,
    next_draft: Dict[str, Any],
    session: Dict[str, Any],
    last_seen_at: Optional[str],
) -> None:
    from datetime import datetime, timezone

    from backend.db.agreement_sql import pg_execute
    from backend.utils.canon_json import canon_json_bytes

    sid = _clean(session.get("session_id"))
    if sid:
        sessions = dict(get_sessions_field(next_draft).get("sessions") or {})
        session_record = dict(sessions.get(sid) or session)
        if last_seen_at:
            session_record["last_seen_at"] = last_seen_at
        pg_execute(
            cx,
            """
            UPDATE negotiation_review_sessions
            SET payload = ?::jsonb
            WHERE session_id = ? AND revoked_at IS NULL
            """,
            (
                canon_json_bytes(session_record).decode("utf-8"),
                sid,
            ),
        )
    pg_execute(
        cx,
        """
        UPDATE agreement_drafts
        SET payload = ?::jsonb, updated_at = ?
        WHERE id = ?
        """,
        (
            canon_json_bytes(next_draft).decode("utf-8"),
            datetime.now(timezone.utc),
            agreement_id,
        ),
    )


def run_negotiation_review_locked_file_mutation(
    *,
    request: Request,
    agreement_id: str,
    bind_participant_id: Optional[str] = None,
    mutate_fn: Callable[[Dict[str, Any], NegotiationReviewMutationAuth], Dict[str, Any]],
) -> Dict[str, Any]:
    from backend.services.agreement_draft_store import (
        _agreement_path,
        _decode_draft_payload,
        _write_draft_file_unlocked,
        agreement_file_lock,
    )
    from backend.services.agreement_signing_lock_store import read_signing_lock_unlocked
    from backend.services.negotiation_review_bootstrap_exchange import _utc_now_iso

    auth = assert_negotiation_review_session_mutation_allowed(
        request,
        agreement_id,
        bind_participant_id=bind_participant_id,
    )
    path = _agreement_path(agreement_id)
    with agreement_file_lock(agreement_id):
        if not path.exists():
            raise HTTPException(status_code=404, detail="agreement_not_found")
        latest = _decode_draft_payload(path.read_text(encoding="utf-8"))
        signing_lock = read_signing_lock_unlocked(agreement_id)
        try:
            session = peek_revalidated_negotiation_review_session(session_secret=auth.session_secret)
            revalidate_session_authority_unlocked(
                draft=latest,
                session=session,
                signing_lock=signing_lock,
            )
        except NegotiationReviewBootstrapExchangeError:
            raise _write_denied(code="negotiation_review_session_invalid")
        mutated = mutate_fn(latest, auth)
        last_seen_at = _utc_now_iso()
        next_draft = _finalize_mutated_draft(
            latest_raw=latest,
            mutated_raw=mutated,
            session=session,
            last_seen_at=last_seen_at,
        )
        _assert_sessions_authority_preserved(
            next_draft,
            session_id=auth.session_id,
        )
        _write_draft_file_unlocked(path, next_draft)
        signing_lock = read_signing_lock_unlocked(agreement_id)
        return build_negotiation_review_mutation_response(
            agreement_id=agreement_id,
            draft=next_draft,
            auth=auth,
            signing_lock=signing_lock,
        )


def run_negotiation_review_locked_postgres_mutation(
    *,
    request: Request,
    agreement_id: str,
    bind_participant_id: Optional[str] = None,
    mutate_fn: Callable[[Dict[str, Any], NegotiationReviewMutationAuth], Dict[str, Any]],
) -> Dict[str, Any]:
    from backend.db.agreement_sql import agreement_postgres_connection, pg_execute
    from backend.services.agreement_draft_store import _decode_draft_payload
    from backend.services.agreement_signing_lock_store import read_signing_lock_for_update
    from backend.services.negotiation_review_bootstrap_exchange import _utc_now_iso
    from backend.services.negotiation_review_session_store import (
        _session_record_from_postgres_row,
        session_token_hash,
    )

    auth = assert_negotiation_review_session_mutation_allowed(
        request,
        agreement_id,
        bind_participant_id=bind_participant_id,
    )
    th = session_token_hash(auth.session_secret)
    with agreement_postgres_connection() as cx:
        row = pg_execute(
            cx,
            "SELECT payload FROM agreement_drafts WHERE id = ? FOR UPDATE",
            (agreement_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="agreement_not_found")
        latest = _decode_draft_payload(row[0])
        signing_lock = read_signing_lock_for_update(cx, agreement_id)
        session_row = pg_execute(
            cx,
            """
            SELECT payload, revoked_at
            FROM negotiation_review_sessions
            WHERE token_hash = ?
            FOR UPDATE
            """,
            (th,),
        ).fetchone()
        session = _session_record_from_postgres_row(session_row)
        if not session:
            raise _write_denied()
        try:
            revalidate_session_authority_unlocked(
                draft=latest,
                session=session,
                signing_lock=signing_lock,
            )
        except NegotiationReviewBootstrapExchangeError:
            raise _write_denied(code="negotiation_review_session_invalid")
        mutated = mutate_fn(latest, auth)
        last_seen_at = _utc_now_iso()
        next_draft = _finalize_mutated_draft(
            latest_raw=latest,
            mutated_raw=mutated,
            session=session,
            last_seen_at=last_seen_at,
        )
        _assert_sessions_authority_preserved(
            next_draft,
            session_id=auth.session_id,
        )
        try:
            _persist_postgres_mutation(
                cx=cx,
                agreement_id=agreement_id,
                next_draft=next_draft,
                session=session,
                last_seen_at=last_seen_at,
            )
        except Exception as exc:
            cx.rollback()
            raise HTTPException(status_code=500, detail="negotiation_review_mutation_failed") from exc
        signing_lock = read_signing_lock_for_update(cx, agreement_id)
        return build_negotiation_review_mutation_response(
            agreement_id=agreement_id,
            draft=next_draft,
            auth=auth,
            signing_lock=signing_lock,
        )


def run_negotiation_review_locked_mutation(
    *,
    request: Request,
    agreement_id: str,
    bind_participant_id: Optional[str] = None,
    mutate_fn: Callable[[Dict[str, Any], NegotiationReviewMutationAuth], Dict[str, Any]],
) -> Dict[str, Any]:
    from backend.services.agreement_draft_store import _use_postgres

    if _use_postgres():
        return run_negotiation_review_locked_postgres_mutation(
            request=request,
            agreement_id=agreement_id,
            bind_participant_id=bind_participant_id,
            mutate_fn=mutate_fn,
        )
    return run_negotiation_review_locked_file_mutation(
        request=request,
        agreement_id=agreement_id,
        bind_participant_id=bind_participant_id,
        mutate_fn=mutate_fn,
    )
