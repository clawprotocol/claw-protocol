"""GTM Security Slice 3B: atomic review bootstrap exchange and session lifecycle."""

from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional, Tuple

from backend.config.agreement_signing_token import resolve_signing_token_secret_raw
from backend.security.negotiation_review_canonical_role import party_matches_canonical_review_role
from backend.security.negotiation_review_bootstrap_token import (
    verify_negotiation_review_bootstrap_token,
)
from backend.security.negotiation_review_content_binding import (
    assert_review_bindings_match,
    authoritative_review_binding,
    review_content_binding_sha256,
)
from backend.security.negotiation_review_version_binding import (
    PRE_LOCK_VERSION_BINDING,
    authoritative_review_version_binding,
    normalize_bound_version_id,
)
from backend.services.negotiation_review_session_store import (
    NEGOTIATION_REVIEW_SESSIONS_FIELD,
    REVIEW_BOOTSTRAP_INVALID_OR_EXPIRED,
    REVIEW_BOOTSTRAP_INVALID_OR_EXPIRED_MESSAGE,
    apply_session_to_draft,
    build_session_record,
    get_session_by_token_hash,
    insert_session_postgres,
    mint_session_secret,
    revoke_session,
    session_token_hash,
    touch_last_seen,
    upsert_session_lookup_hint,
    get_sessions_field,
)
from backend.services.recipient_delivery_registry import get_registry, is_jti_superseded
from backend.utils.canon_json import canon_json_bytes


@dataclass
class NegotiationReviewBootstrapExchangeError(Exception):
    code: str = REVIEW_BOOTSTRAP_INVALID_OR_EXPIRED
    status_code: int = 403
    message: str = REVIEW_BOOTSTRAP_INVALID_OR_EXPIRED_MESSAGE


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _min_exchange_window_seconds() -> int:
    default = 10
    raw = os.getenv("CLAW_NEGOTIATION_REVIEW_BOOTSTRAP_MIN_EXCHANGE_WINDOW_SECONDS", "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
        if value <= 0:
            return default
        return value
    except ValueError:
        return default


def _session_ttl_seconds(*, bootstrap_exp: int, now_ts: int) -> int:
    remaining = int(bootstrap_exp) - int(now_ts)
    if remaining <= 0:
        raise NegotiationReviewBootstrapExchangeError()
    configured = 7 * 24 * 3600
    configured_raw = os.getenv("CLAW_NEGOTIATION_REVIEW_SESSION_TTL_SECONDS", "").strip()
    if configured_raw:
        try:
            configured = int(configured_raw)
            if configured <= 0:
                configured = remaining
        except ValueError:
            pass
    return min(remaining, configured)


def _find_delivery_row(
    draft: Dict[str, Any],
    *,
    jti: str,
    party_id: str,
) -> Optional[Dict[str, Any]]:
    reg = get_registry(draft)
    recipients = reg.get("recipients") or {}
    if not isinstance(recipients, dict):
        return None
    key = f"review:{party_id}"
    row = recipients.get(key)
    if not isinstance(row, dict):
        return None
    if _clean(row.get("active_jti")) != jti:
        return None
    if not row.get("bootstrap_authority"):
        return None
    return row


def _validate_token_claims_against_row(
    *,
    payload: Dict[str, Any],
    agreement_id: str,
    row: Dict[str, Any],
    signing_lock: Optional[Dict[str, Any]],
    draft: Dict[str, Any],
) -> None:
    if _clean(payload.get("aid")) != agreement_id:
        raise NegotiationReviewBootstrapExchangeError()
    assert_review_bindings_match(
        signing_lock=signing_lock,
        draft=draft,
        bound_version_id=payload.get("v"),
        bound_content_sha256=payload.get("ch"),
    )
    party_id = _clean(payload.get("pid"))
    if party_id != _clean(row.get("participant_id")):
        raise NegotiationReviewBootstrapExchangeError()
    if not _recipient_party_role_exact(draft, party_id, _clean(payload.get("r"))):
        raise NegotiationReviewBootstrapExchangeError()
    if _clean(payload.get("pur")) != "review_bootstrap":
        raise NegotiationReviewBootstrapExchangeError()
    if _clean(payload.get("m")) != "review":
        raise NegotiationReviewBootstrapExchangeError()


def _recipient_party_role_exact(draft: Dict[str, Any], party_id: str, role: str) -> bool:
    return party_matches_canonical_review_role(draft, party_id=party_id, bound_role=role)


def revalidate_session_authority_unlocked(
    *,
    draft: Dict[str, Any],
    session: Dict[str, Any],
    signing_lock: Optional[Dict[str, Any]],
) -> None:
    _revalidate_session_authority(draft=draft, session=session, signing_lock=signing_lock)


def _revalidate_session_authority(
    *,
    draft: Dict[str, Any],
    session: Dict[str, Any],
    signing_lock: Optional[Dict[str, Any]],
) -> None:
    agreement_id = _clean(session.get("agreement_id"))
    if not agreement_id or not draft:
        raise NegotiationReviewBootstrapExchangeError()

    assert_review_bindings_match(
        signing_lock=signing_lock,
        draft=draft,
        bound_version_id=session.get("locked_version_id"),
        bound_content_sha256=session.get("content_sha256"),
    )

    party_id = _clean(session.get("party_id"))
    if not _recipient_party_role_exact(draft, party_id, _clean(session.get("role"))):
        raise NegotiationReviewBootstrapExchangeError()
    row = _find_delivery_row(
        draft,
        jti=_clean(session.get("consumed_token_jti")),
        party_id=party_id,
    )
    if not row:
        raise NegotiationReviewBootstrapExchangeError()
    if _clean(row.get("recipient_session_id")) != _clean(session.get("session_id")):
        raise NegotiationReviewBootstrapExchangeError()
    if is_jti_superseded(draft, _clean(session.get("consumed_token_jti")), "review", party_id):
        raise NegotiationReviewBootstrapExchangeError()


def _status_projection(session: Dict[str, Any], *, authenticated: bool) -> Dict[str, Any]:
    bound = normalize_bound_version_id(session.get("locked_version_id"))
    locked_out = None if bound == PRE_LOCK_VERSION_BINDING else bound
    return {
        "ok": True,
        "authenticated": authenticated,
        "agreement_id": _clean(session.get("agreement_id")),
        "recipient_party_id": _clean(session.get("party_id")) or None,
        "role": _clean(session.get("role")) or "reviewer",
        "locked_version_id": locked_out,
        "recipient_display_name": _clean(session.get("recipient_display_name")) or "Reviewer",
        "agreement_title": _clean(session.get("agreement_title")) or "Agreement",
        "expires_at": _clean(session.get("expires_at")),
        "readiness": "session_established",
    }


def _assert_session_active(session: Dict[str, Any], *, now_ts: int) -> None:
    if _clean(session.get("revoked_at")):
        raise NegotiationReviewBootstrapExchangeError()
    exp_raw = _clean(session.get("expires_at"))
    if exp_raw:
        try:
            exp_dt = datetime.fromisoformat(exp_raw.replace("Z", "+00:00"))
            if int(exp_dt.timestamp()) <= now_ts:
                raise NegotiationReviewBootstrapExchangeError()
        except NegotiationReviewBootstrapExchangeError:
            raise
        except Exception:
            raise NegotiationReviewBootstrapExchangeError() from None


def _agreement_title(draft: Dict[str, Any]) -> str:
    title = _clean(draft.get("title"))
    if title:
        return title[:120]
    return "Agreement"


def _party_display_name(draft: Dict[str, Any], party_id: str) -> str:
    pid = (party_id or "").strip()
    for party in draft.get("parties") or []:
        if not isinstance(party, dict):
            continue
        if _clean(party.get("id")) == pid:
            name = _clean(party.get("name"))
            if name:
                return name[:80]
    return "Reviewer"


def _build_exchange_draft(
    *,
    latest: Dict[str, Any],
    party_id: str,
    now_iso: str,
    session_id: str,
    session_record: Dict[str, Any],
) -> Dict[str, Any]:
    next_draft = dict(latest)
    reg = dict(get_registry(next_draft))
    recipients = dict(reg.get("recipients") or {})
    key = f"review:{party_id}"
    row = dict(recipients.get(key) or {})
    row["bootstrap_exchanged_at"] = now_iso
    row["recipient_session_id"] = session_id
    recipients[key] = row
    reg["recipients"] = recipients
    next_draft["recipient_delivery_v1"] = reg
    return apply_session_to_draft(next_draft, session_record)


def _exchange_locked(
    *,
    agreement_id: str,
    payload: Dict[str, Any],
    jti: str,
    now_iso: str,
    now_ts: int,
    latest: Dict[str, Any],
    signing_lock: Optional[Dict[str, Any]],
    finalize_exchange_fn: Callable[[Dict[str, Any], Dict[str, Any]], None],
) -> Tuple[str, Dict[str, Any], int]:
    party_id = _clean(payload.get("pid"))
    if not party_id:
        raise NegotiationReviewBootstrapExchangeError()

    row = _find_delivery_row(latest, jti=jti, party_id=party_id)
    if not row:
        raise NegotiationReviewBootstrapExchangeError()

    _validate_token_claims_against_row(
        payload=payload,
        agreement_id=agreement_id,
        row=row,
        signing_lock=signing_lock,
        draft=latest,
    )

    if _clean(row.get("bootstrap_exchanged_at")):
        raise NegotiationReviewBootstrapExchangeError()
    if is_jti_superseded(latest, jti, "review", party_id):
        raise NegotiationReviewBootstrapExchangeError()

    bootstrap_exp = int(payload.get("exp") or 0)
    remaining = bootstrap_exp - now_ts
    if remaining < _min_exchange_window_seconds():
        raise NegotiationReviewBootstrapExchangeError()

    session_id = uuid.uuid4().hex
    session_secret = mint_session_secret()
    th = session_token_hash(session_secret)
    ttl = _session_ttl_seconds(bootstrap_exp=bootstrap_exp, now_ts=now_ts)
    cookie_max_age_seconds = max(1, ttl)
    expires_at = datetime.fromtimestamp(now_ts + ttl, tz=timezone.utc).isoformat().replace(
        "+00:00", "Z"
    )
    locked_version_id = normalize_bound_version_id(
        _clean(payload.get("v")) or authoritative_review_version_binding(signing_lock)
    )
    content_sha256 = review_content_binding_sha256(latest)
    session_record = build_session_record(
        agreement_id=agreement_id,
        locked_version_id=locked_version_id,
        content_sha256=content_sha256,
        party_id=party_id,
        role=_clean(payload.get("r")) or "reviewer",
        consumed_token_jti=jti,
        recipient_display_name=_party_display_name(latest, party_id),
        agreement_title=_agreement_title(latest),
        token_hash=th,
        created_at=now_iso,
        expires_at=expires_at,
        session_id=session_id,
    )

    next_draft = _build_exchange_draft(
        latest=latest,
        party_id=party_id,
        now_iso=now_iso,
        session_id=session_id,
        session_record=session_record,
    )

    try:
        finalize_exchange_fn(next_draft, session_record)
    except NegotiationReviewBootstrapExchangeError:
        raise
    except Exception as exc:
        raise NegotiationReviewBootstrapExchangeError() from exc

    return session_secret, _status_projection(session_record, authenticated=True), cookie_max_age_seconds


def exchange_review_bootstrap_token(*, token: str) -> Tuple[str, Dict[str, Any], int]:
    raw = (token or "").strip()
    if not raw or len(raw) > 4096:
        raise NegotiationReviewBootstrapExchangeError()
    try:
        secret_raw = resolve_signing_token_secret_raw().encode("utf-8")
    except Exception as exc:
        raise NegotiationReviewBootstrapExchangeError() from exc
    try:
        payload = verify_negotiation_review_bootstrap_token(token=raw, secret=secret_raw)
    except ValueError:
        raise NegotiationReviewBootstrapExchangeError() from None

    agreement_id = _clean(payload.get("aid"))
    if not agreement_id:
        raise NegotiationReviewBootstrapExchangeError()
    jti = _clean(payload.get("jti"))
    if not jti:
        raise NegotiationReviewBootstrapExchangeError()

    now_iso = _utc_now_iso()
    now_ts = int(time.time())

    from backend.services.agreement_draft_store import (
        _agreement_path,
        _decode_draft_payload,
        _use_postgres,
        _write_draft_file_unlocked,
        agreement_file_lock,
    )

    if _use_postgres():
        from backend.db.agreement_sql import agreement_postgres_connection, pg_execute
        from backend.services.agreement_signing_lock_store import read_signing_lock_for_update

        with agreement_postgres_connection() as cx:
            row = pg_execute(
                cx,
                "SELECT payload FROM agreement_drafts WHERE id = ? FOR UPDATE",
                (agreement_id,),
            ).fetchone()
            if not row:
                raise NegotiationReviewBootstrapExchangeError()
            signing_lock = read_signing_lock_for_update(cx, agreement_id)
            latest = _decode_draft_payload(row[0])

            def _finalize(next_draft: Dict[str, Any], session_record: Dict[str, Any]) -> None:
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
                insert_session_postgres(cx, session_record)

            return _exchange_locked(
                agreement_id=agreement_id,
                payload=payload,
                jti=jti,
                now_iso=now_iso,
                now_ts=now_ts,
                latest=latest,
                signing_lock=signing_lock,
                finalize_exchange_fn=_finalize,
            )

    path = _agreement_path(agreement_id)
    with agreement_file_lock(agreement_id):
        if not path.exists():
            raise NegotiationReviewBootstrapExchangeError()
        latest = _decode_draft_payload(path.read_text(encoding="utf-8"))
        from backend.services.agreement_signing_lock_store import read_signing_lock_unlocked

        signing_lock = read_signing_lock_unlocked(agreement_id)

        def _finalize(next_draft: Dict[str, Any], session_record: Dict[str, Any]) -> None:
            _write_draft_file_unlocked(path, next_draft)
            try:
                upsert_session_lookup_hint(session_record)
            except Exception:
                pass

        return _exchange_locked(
            agreement_id=agreement_id,
            payload=payload,
            jti=jti,
            now_iso=now_iso,
            now_ts=now_ts,
            latest=latest,
            signing_lock=signing_lock,
            finalize_exchange_fn=_finalize,
        )


def _lookup_active_session(session_secret: str) -> Optional[Dict[str, Any]]:
    raw = (session_secret or "").strip()
    if not raw:
        return None
    session = get_session_by_token_hash(session_token_hash(raw))
    if not session:
        return None
    _assert_session_active(session, now_ts=int(time.time()))
    return session


def peek_revalidated_negotiation_review_session(*, session_secret: str) -> Dict[str, Any]:
    """Revalidate session authority without touching last_seen_at."""
    session = _lookup_active_session(session_secret)
    if not session:
        raise NegotiationReviewBootstrapExchangeError()

    agreement_id = _clean(session.get("agreement_id"))
    from backend.services.agreement_draft_store import load_draft
    from backend.services.agreement_signing_lock_store import read_signing_lock

    try:
        draft = load_draft(agreement_id)
    except KeyError:
        raise NegotiationReviewBootstrapExchangeError() from None

    signing_lock = read_signing_lock(agreement_id)
    _revalidate_session_authority(draft=draft, session=session, signing_lock=signing_lock)
    return session


def touch_negotiation_review_session_last_seen(*, session_secret: str) -> None:
    session = _lookup_active_session(session_secret)
    if not session:
        return
    touch_last_seen(
        session_id=_clean(session.get("session_id")),
        last_seen_at=_utc_now_iso(),
        agreement_id=_clean(session.get("agreement_id")),
    )


def advance_session_content_binding_on_draft(
    draft: Dict[str, Any], *, session: Dict[str, Any]
) -> Dict[str, Any]:
    """Advance session content binding after an authorized mutation."""
    sid = _clean(session.get("session_id"))
    if not sid:
        return draft
    next_draft = dict(draft)
    container = dict(get_sessions_field(next_draft))
    sessions = dict(container.get("sessions") or {})
    current = sessions.get(sid)
    if not isinstance(current, dict):
        return draft
    updated = dict(current)
    updated["content_sha256"] = review_content_binding_sha256(draft)
    sessions[sid] = updated
    container["sessions"] = sessions
    next_draft[NEGOTIATION_REVIEW_SESSIONS_FIELD] = container
    return next_draft


def load_revalidated_negotiation_review_session(*, session_secret: str) -> Dict[str, Any]:
    session = peek_revalidated_negotiation_review_session(session_secret=session_secret)
    touch_negotiation_review_session_last_seen(session_secret=session_secret)
    return session


def resolve_negotiation_review_session_status(*, session_secret: str) -> Dict[str, Any]:
    session = load_revalidated_negotiation_review_session(session_secret=session_secret)
    return _status_projection(session, authenticated=True)


def revoke_negotiation_review_session(*, session_secret: str) -> None:
    session = _lookup_active_session(session_secret)
    if not session:
        return
    revoke_session(
        session_id=_clean(session.get("session_id")),
        revoked_at=_utc_now_iso(),
        agreement_id=_clean(session.get("agreement_id")),
    )


def negotiation_review_session_context_from_request(request) -> Optional[Dict[str, Any]]:
    """Return validated session context for protected review routes, or None."""
    from backend.security.negotiation_review_session_cookie import (
        read_negotiation_review_session_cookie,
    )

    cookie = read_negotiation_review_session_cookie(request)
    if not cookie:
        return None
    try:
        session = load_revalidated_negotiation_review_session(session_secret=cookie)
    except NegotiationReviewBootstrapExchangeError:
        return None
    return {
        "agreement_id": _clean(session.get("agreement_id")),
        "mode": "review",
        "locked_version_id": _clean(session.get("locked_version_id")),
        "role": _clean(session.get("role")) or "reviewer",
        "recipient_party_id": _clean(session.get("party_id")) or None,
        "inviter_display_name": None,
        "session_id": _clean(session.get("session_id")),
    }
