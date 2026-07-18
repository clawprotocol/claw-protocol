"""Phase 3C2A: atomic bootstrap token exchange and recipient session lifecycle."""

from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional, Tuple

from backend.config.agreement_signing_token import resolve_signing_token_secret_raw
from backend.security.vs01_recipient_bootstrap_token import (
    jti_fingerprint,
    token_fingerprint,
    verify_vs01_recipient_bootstrap_token,
)
from backend.services.recipient_bootstrap_session_store import (
    BOOTSTRAP_INVALID_OR_EXPIRED,
    BOOTSTRAP_INVALID_OR_EXPIRED_MESSAGE,
    apply_session_to_draft,
    build_session_record,
    get_session_by_token_hash,
    insert_session_postgres,
    mint_session_secret,
    revoke_session,
    session_token_hash,
    touch_last_seen,
    upsert_session_lookup_hint,
)
from backend.services.recipient_delivery_registry import is_jti_superseded
from backend.services.vs01_signing_invite_delivery import (
    STATE_DELIVERED,
    VS01_SIGNING_INVITE_DELIVERY_FIELD,
    Vs01SigningInviteDeliveryError,
    _load_validated_activation,
    _validate_authority_bindings,
)
from backend.services.vs01_signing_packet_activation import has_active_signing_packet_activation
from backend.utils.canon_json import canon_json_bytes


@dataclass
class RecipientBootstrapExchangeError(Exception):
    code: str = BOOTSTRAP_INVALID_OR_EXPIRED
    status_code: int = 403
    message: str = BOOTSTRAP_INVALID_OR_EXPIRED_MESSAGE


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _min_exchange_window_seconds() -> int:
    default = 10
    raw = os.getenv("CLAW_RECIPIENT_BOOTSTRAP_MIN_EXCHANGE_WINDOW_SECONDS", "").strip()
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
        raise RecipientBootstrapExchangeError()
    configured = 7 * 24 * 3600
    configured_raw = os.getenv("CLAW_RECIPIENT_BOOTSTRAP_SESSION_TTL_SECONDS", "").strip()
    if configured_raw:
        try:
            configured = int(configured_raw)
            if configured <= 0:
                configured = remaining
        except ValueError:
            pass
    return min(remaining, configured)


def _document_label(draft: Dict[str, Any], activation: Dict[str, Any]) -> str:
    title = _clean(draft.get("title"))
    if title:
        return title[:120]
    document_id = _clean(activation.get("document_id"))
    if document_id:
        return f"Document {document_id[:32]}"
    return "Agreement"


def _find_delivery_recipient(
    batch: Dict[str, Any],
    *,
    jti: str,
    token_fp: str,
) -> Optional[Dict[str, Any]]:
    recipients = batch.get("recipients") or {}
    if not isinstance(recipients, dict):
        return None
    for record in recipients.values():
        if not isinstance(record, dict):
            continue
        if _clean(record.get("token_jti")) == jti and _clean(record.get("token_fp")) == token_fp:
            return record
    return None


def _validate_token_claims_against_record(
    *,
    payload: Dict[str, Any],
    agreement_id: str,
    authority: Dict[str, Any],
    activation: Dict[str, Any],
    record: Dict[str, Any],
) -> None:
    if _clean(payload.get("aid")) != agreement_id:
        raise RecipientBootstrapExchangeError()
    if _clean(payload.get("av")) != _clean(authority.get("accepted_version_id")):
        raise RecipientBootstrapExchangeError()
    if _clean(payload.get("ach")).lower() != _clean(authority.get("accepted_corpus_sha256")).lower():
        raise RecipientBootstrapExchangeError()
    if _clean(payload.get("pr")) != _clean(authority.get("packet_revision")):
        raise RecipientBootstrapExchangeError()
    if _clean(payload.get("fah")).lower() != _clean(authority.get("frozen_authority_material_hash")).lower():
        raise RecipientBootstrapExchangeError()
    if _clean(payload.get("srid")) != _clean(record.get("signer_record_id")):
        raise RecipientBootstrapExchangeError()
    if _clean(payload.get("pid")) != _clean(record.get("party_id")):
        raise RecipientBootstrapExchangeError()
    if _clean(payload.get("v")) != _clean(authority.get("locked_version_id")):
        raise RecipientBootstrapExchangeError()
    if _clean(payload.get("m")) != "sign":
        raise RecipientBootstrapExchangeError()
    if _clean(payload.get("r")) != "signer":
        raise RecipientBootstrapExchangeError()
    activation_revision = _clean(activation.get("packet_revision"))
    if activation_revision and activation_revision != _clean(authority.get("packet_revision")):
        raise RecipientBootstrapExchangeError()


def _revalidate_session_authority(
    *,
    draft: Dict[str, Any],
    session: Dict[str, Any],
    signing_lock: Optional[Dict[str, Any]],
) -> None:
    agreement_id = _clean(session.get("agreement_id"))
    if not agreement_id or not draft:
        raise RecipientBootstrapExchangeError()
    activation = draft.get("vs01_signing_packet_activation_v1")
    if not isinstance(activation, dict) or not has_active_signing_packet_activation(draft):
        raise RecipientBootstrapExchangeError()
    document_id = _clean(session.get("document_id")) or _clean(activation.get("document_id"))
    try:
        activation = _load_validated_activation(
            agreement_id=agreement_id,
            document_id=document_id,
            draft=draft,
        )
        _frozen, authority = _validate_authority_bindings(
            agreement_id=agreement_id,
            draft=draft,
            activation=activation,
            signing_lock=signing_lock,
        )
    except (Vs01SigningInviteDeliveryError, RecipientBootstrapExchangeError):
        raise RecipientBootstrapExchangeError() from None
    except Exception:
        raise RecipientBootstrapExchangeError() from None

    bindings = (
        ("accepted_version_id", authority.get("accepted_version_id")),
        ("accepted_corpus_sha256", authority.get("accepted_corpus_sha256")),
        ("packet_revision", authority.get("packet_revision")),
        ("frozen_authority_material_hash", authority.get("frozen_authority_material_hash")),
    )
    for key, expected in bindings:
        if _clean(session.get(key)).lower() != _clean(expected).lower():
            raise RecipientBootstrapExchangeError()

    batch = draft.get(VS01_SIGNING_INVITE_DELIVERY_FIELD)
    if not isinstance(batch, dict):
        raise RecipientBootstrapExchangeError()
    record = batch.get("recipients", {}).get(_clean(session.get("delivery_identity")))
    if not isinstance(record, dict):
        raise RecipientBootstrapExchangeError()
    if _clean(record.get("recipient_session_id")) != _clean(session.get("session_id")):
        raise RecipientBootstrapExchangeError()
    if _clean(record.get("party_id")) != _clean(session.get("party_id")):
        raise RecipientBootstrapExchangeError()
    if _clean(record.get("signer_record_id")) != _clean(session.get("signer_record_id")):
        raise RecipientBootstrapExchangeError()


def _status_projection(session: Dict[str, Any], *, authenticated: bool) -> Dict[str, Any]:
    return {
        "ok": True,
        "authenticated": authenticated,
        "signer_display_name": _clean(session.get("signer_display_name")) or "Recipient",
        "document_label": _clean(session.get("document_label")) or "Agreement",
        "expires_at": _clean(session.get("expires_at")),
        "readiness": "session_established",
    }


def _assert_session_active(session: Dict[str, Any], *, now_ts: int) -> None:
    if _clean(session.get("revoked_at")):
        raise RecipientBootstrapExchangeError()
    exp_raw = _clean(session.get("expires_at"))
    if exp_raw:
        try:
            exp_dt = datetime.fromisoformat(exp_raw.replace("Z", "+00:00"))
            if int(exp_dt.timestamp()) <= now_ts:
                raise RecipientBootstrapExchangeError()
        except RecipientBootstrapExchangeError:
            raise
        except Exception:
            raise RecipientBootstrapExchangeError() from None


def _build_exchange_draft(
    *,
    latest: Dict[str, Any],
    batch: Dict[str, Any],
    delivery_identity: str,
    now_iso: str,
    session_id: str,
    session_record: Dict[str, Any],
) -> Dict[str, Any]:
    next_draft = dict(latest)
    next_batch = dict(batch)
    next_recipients = dict(next_batch.get("recipients") or {})
    next_record = dict(next_recipients.get(delivery_identity) or {})
    next_record["bootstrap_exchanged_at"] = now_iso
    next_record["recipient_session_id"] = session_id
    next_recipients[delivery_identity] = next_record
    next_batch["recipients"] = next_recipients
    next_draft[VS01_SIGNING_INVITE_DELIVERY_FIELD] = next_batch
    return apply_session_to_draft(next_draft, session_record)


def _exchange_locked(
    *,
    agreement_id: str,
    payload: Dict[str, Any],
    jti: str,
    token_fp: str,
    now_iso: str,
    now_ts: int,
    latest: Dict[str, Any],
    signing_lock: Optional[Dict[str, Any]],
    finalize_exchange_fn: Callable[[Dict[str, Any], Dict[str, Any]], None],
) -> Tuple[str, Dict[str, Any], int]:
    activation_field = latest.get("vs01_signing_packet_activation_v1")
    if not isinstance(activation_field, dict):
        raise RecipientBootstrapExchangeError()
    document_id = _clean(activation_field.get("document_id"))
    try:
        activation = _load_validated_activation(
            agreement_id=agreement_id,
            document_id=document_id,
            draft=latest,
        )
        _frozen, authority = _validate_authority_bindings(
            agreement_id=agreement_id,
            draft=latest,
            activation=activation,
            signing_lock=signing_lock,
        )
    except Vs01SigningInviteDeliveryError:
        raise RecipientBootstrapExchangeError() from None
    batch = latest.get(VS01_SIGNING_INVITE_DELIVERY_FIELD)
    if not isinstance(batch, dict):
        raise RecipientBootstrapExchangeError()
    record = _find_delivery_recipient(batch, jti=jti, token_fp=token_fp)
    if not record:
        raise RecipientBootstrapExchangeError()
    _validate_token_claims_against_record(
        payload=payload,
        agreement_id=agreement_id,
        authority=authority,
        activation=activation,
        record=record,
    )
    if _clean(record.get("state")) != STATE_DELIVERED:
        raise RecipientBootstrapExchangeError()
    if _clean(record.get("bootstrap_exchanged_at")):
        raise RecipientBootstrapExchangeError()
    party_id = _clean(record.get("party_id"))
    if is_jti_superseded(latest, jti, "signing", party_id):
        raise RecipientBootstrapExchangeError()

    delivery_identity = _clean(record.get("delivery_identity"))
    bootstrap_exp = int(payload.get("exp") or 0)
    remaining = bootstrap_exp - now_ts
    if remaining < _min_exchange_window_seconds():
        raise RecipientBootstrapExchangeError()
    session_id = uuid.uuid4().hex
    session_secret = mint_session_secret()
    th = session_token_hash(session_secret)
    ttl = _session_ttl_seconds(bootstrap_exp=bootstrap_exp, now_ts=now_ts)
    cookie_max_age_seconds = max(1, ttl)
    expires_at = datetime.fromtimestamp(now_ts + ttl, tz=timezone.utc).isoformat().replace(
        "+00:00", "Z"
    )
    session_record = build_session_record(
        agreement_id=agreement_id,
        accepted_version_id=_clean(authority.get("accepted_version_id")),
        accepted_corpus_sha256=_clean(authority.get("accepted_corpus_sha256")),
        packet_revision=_clean(authority.get("packet_revision")),
        frozen_authority_material_hash=_clean(authority.get("frozen_authority_material_hash")),
        party_id=party_id,
        signer_record_id=_clean(record.get("signer_record_id")),
        delivery_identity=delivery_identity,
        consumed_token_jti=jti,
        consumed_token_jti_fp=jti_fingerprint(jti),
        document_id=_clean(authority.get("document_id")),
        signer_display_name=_clean(record.get("signer_name")) or "Recipient",
        document_label=_document_label(latest, activation),
        token_hash=th,
        created_at=now_iso,
        expires_at=expires_at,
        session_id=session_id,
    )

    next_draft = _build_exchange_draft(
        latest=latest,
        batch=batch,
        delivery_identity=delivery_identity,
        now_iso=now_iso,
        session_id=session_id,
        session_record=session_record,
    )

    try:
        finalize_exchange_fn(next_draft, session_record)
    except RecipientBootstrapExchangeError:
        raise
    except Exception as exc:
        raise RecipientBootstrapExchangeError() from exc

    return session_secret, _status_projection(session_record, authenticated=True), cookie_max_age_seconds


def exchange_bootstrap_token(*, token: str) -> Tuple[str, Dict[str, Any], int]:
    raw = (token or "").strip()
    if not raw or len(raw) > 4096:
        raise RecipientBootstrapExchangeError()
    try:
        secret_raw = resolve_signing_token_secret_raw().encode("utf-8")
    except Exception as exc:
        raise RecipientBootstrapExchangeError() from exc
    try:
        payload = verify_vs01_recipient_bootstrap_token(token=raw, secret=secret_raw)
    except ValueError:
        raise RecipientBootstrapExchangeError() from None

    agreement_id = _clean(payload.get("aid"))
    if not agreement_id:
        raise RecipientBootstrapExchangeError()
    jti = _clean(payload.get("jti"))
    token_fp = token_fingerprint(raw)
    if not jti or not token_fp:
        raise RecipientBootstrapExchangeError()

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
                raise RecipientBootstrapExchangeError()
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
                token_fp=token_fp,
                now_iso=now_iso,
                now_ts=now_ts,
                latest=latest,
                signing_lock=signing_lock,
                finalize_exchange_fn=_finalize,
            )

    path = _agreement_path(agreement_id)
    with agreement_file_lock(agreement_id):
        if not path.exists():
            raise RecipientBootstrapExchangeError()
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
            token_fp=token_fp,
            now_iso=now_iso,
            now_ts=now_ts,
            latest=latest,
            signing_lock=signing_lock,
            finalize_exchange_fn=_finalize,
        )


def resolve_recipient_session_status(*, session_secret: str) -> Dict[str, Any]:
    raw = (session_secret or "").strip()
    if not raw:
        return {"ok": True, "authenticated": False, "readiness": "unauthenticated"}
    session = get_session_by_token_hash(session_token_hash(raw))
    if not session:
        return {"ok": True, "authenticated": False, "readiness": "unauthenticated"}
    now_ts = int(time.time())
    _assert_session_active(session, now_ts=now_ts)

    from backend.services.agreement_draft_store import load_draft
    from backend.services.agreement_signing_lock_store import read_signing_lock

    agreement_id = _clean(session.get("agreement_id"))
    try:
        draft = load_draft(agreement_id)
    except KeyError:
        raise RecipientBootstrapExchangeError() from None
    signing_lock = read_signing_lock(agreement_id)
    _revalidate_session_authority(draft=draft, session=session, signing_lock=signing_lock)
    touch_last_seen(
        session_id=_clean(session.get("session_id")),
        last_seen_at=_utc_now_iso(),
        agreement_id=agreement_id,
    )
    return _status_projection(session, authenticated=True)


def revoke_recipient_session(*, session_secret: str) -> None:
    raw = (session_secret or "").strip()
    if not raw:
        return
    session = get_session_by_token_hash(session_token_hash(raw))
    if not session:
        return
    revoke_session(
        session_id=_clean(session.get("session_id")),
        revoked_at=_utc_now_iso(),
        agreement_id=_clean(session.get("agreement_id")),
    )
