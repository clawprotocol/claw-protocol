from __future__ import annotations

"""
Agreement draft persistence.

Default: canonical JSON files under ``CLAW_DATA_DIR``/``data``/``agreements``.

Optional Postgres (``CLAW_AGREEMENT_DATABASE_URL`` or shared ``CLAW_DATABASE_URL``): one row per
draft (JSONB payload) in schema ``lawdog_agreements`` (override with ``CLAW_PG_SCHEMA_AGREEMENTS``).
"""

import json
import os
import tempfile
import fcntl
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

from backend.utils.canon_json import canon_json_bytes


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _agreements_dir() -> Path:
    base = os.getenv("CLAW_DATA_DIR", "").strip()
    root = Path(base).expanduser() if base else (_repo_root() / "data")
    path = root / "agreements"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _agreement_path(agreement_id: str) -> Path:
    safe_id = (agreement_id or "").strip()
    if not safe_id:
        raise ValueError("missing_agreement_id")
    return _agreements_dir() / f"{safe_id}.json"


def _use_postgres() -> bool:
    from backend.db.config import use_postgresql_for_agreements

    return use_postgresql_for_agreements()


def draft_exists(agreement_id: str) -> bool:
    """True if a draft row/file exists for this id."""
    aid = (agreement_id or "").strip()
    if not aid:
        return False
    if _use_postgres():
        from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

        with agreement_postgres_connection() as cx:
            cur = pg_execute(
                cx,
                "SELECT 1 FROM agreement_drafts WHERE id = ? LIMIT 1",
                (aid,),
            )
            return cur.fetchone() is not None
    return _agreement_path(aid).exists()


@contextmanager
def agreement_file_lock(agreement_id: str) -> Iterator[None]:
    """Agreement-scoped exclusive lock shared by draft, signing-lock, and activation writes."""
    lock_path = _agreements_dir() / f".{agreement_id}.lock"
    with lock_path.open("a+b") as lock_file:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


@contextmanager
def _agreement_file_lock(agreement_id: str) -> Iterator[None]:
    with agreement_file_lock(agreement_id):
        yield


def _decode_draft_payload(raw: Any) -> Dict[str, Any]:
    parsed = raw if isinstance(raw, dict) else json.loads(str(raw))
    if not isinstance(parsed, dict):
        raise ValueError("invalid_agreement_payload")
    return parsed


def _frozen_material(record: Dict[str, Any]) -> bytes:
    return canon_json_bytes({key: value for key, value in record.items() if key != "frozenAt"})


def _preserve_immutable_audit_events(
    current: Dict[str, Any], next_draft: Dict[str, Any], event_type: str
) -> None:
    preserved_events = [
        event
        for event in (current.get("audit_log") or [])
        if isinstance(event, dict) and event.get("event_type") == event_type
    ]
    if not preserved_events:
        return
    audit = list(next_draft.get("audit_log") or [])
    existing = {canon_json_bytes(event) for event in audit if isinstance(event, dict)}
    for event in preserved_events:
        encoded = canon_json_bytes(event)
        if encoded not in existing:
            audit.append(event)
            existing.add(encoded)
    next_draft["audit_log"] = audit


def _preserve_frozen_audit(current: Dict[str, Any], next_draft: Dict[str, Any]) -> None:
    _preserve_immutable_audit_events(
        current, next_draft, "frozen_signing_authority_persisted"
    )


def _preserve_activation_audit(current: Dict[str, Any], next_draft: Dict[str, Any]) -> None:
    _preserve_immutable_audit_events(current, next_draft, "signing_packet_activated")


def _preserve_delivery_audit(current: Dict[str, Any], next_draft: Dict[str, Any]) -> None:
    _preserve_immutable_audit_events(current, next_draft, "signing_invite_delivery_attempted")


def _delivery_batch_material(record: Dict[str, Any]) -> bytes:
    from backend.services.vs01_signing_invite_delivery import delivery_batch_material

    return delivery_batch_material(record)


def _activation_material(record: Dict[str, Any]) -> bytes:
    from backend.services.vs01_signing_packet_activation import activation_material_bytes

    return activation_material_bytes(record)


def _guard_generic_immutable_write(
    current: Optional[Dict[str, Any]], draft: Dict[str, Any]
) -> Dict[str, Any]:
    next_draft = dict(draft)
    incoming_frozen = next_draft.get("frozen_signing_authority_v1")
    existing_frozen = (current or {}).get("frozen_signing_authority_v1")
    if isinstance(existing_frozen, dict):
        if incoming_frozen is None:
            next_draft["frozen_signing_authority_v1"] = existing_frozen
        elif canon_json_bytes(incoming_frozen) != canon_json_bytes(existing_frozen):
            raise ValueError("frozen_signing_authority_immutable")
        _preserve_frozen_audit(current or {}, next_draft)
    elif isinstance(incoming_frozen, dict):
        raise ValueError("frozen_signing_authority_endpoint_required")

    incoming_activation = next_draft.get("vs01_signing_packet_activation_v1")
    existing_activation = (current or {}).get("vs01_signing_packet_activation_v1")
    if isinstance(existing_activation, dict):
        if incoming_activation is None:
            next_draft["vs01_signing_packet_activation_v1"] = existing_activation
        elif _activation_material(incoming_activation) != _activation_material(existing_activation):
            raise ValueError("signing_packet_activation_immutable")
        _preserve_activation_audit(current or {}, next_draft)
    elif isinstance(incoming_activation, dict):
        raise ValueError("signing_packet_activation_endpoint_required")

    incoming_delivery = next_draft.get("vs01_signing_invite_delivery_v1")
    existing_delivery = (current or {}).get("vs01_signing_invite_delivery_v1")
    if isinstance(existing_delivery, dict):
        if incoming_delivery is None:
            next_draft["vs01_signing_invite_delivery_v1"] = existing_delivery
        elif _delivery_batch_material(incoming_delivery) != _delivery_batch_material(existing_delivery):
            raise ValueError("signing_invite_delivery_immutable")
        _preserve_delivery_audit(current or {}, next_draft)
    elif isinstance(incoming_delivery, dict):
        raise ValueError("signing_invite_delivery_endpoint_required")

    incoming_sessions = next_draft.get("recipient_bootstrap_sessions_v1")
    existing_sessions = (current or {}).get("recipient_bootstrap_sessions_v1")
    if isinstance(existing_sessions, dict):
        if incoming_sessions is None:
            next_draft["recipient_bootstrap_sessions_v1"] = existing_sessions
        else:
            from backend.services.recipient_bootstrap_session_store import sessions_field_material

            if sessions_field_material(incoming_sessions) != sessions_field_material(existing_sessions):
                raise ValueError("recipient_bootstrap_sessions_immutable")
    elif isinstance(incoming_sessions, dict):
        raise ValueError("recipient_bootstrap_sessions_endpoint_required")
    return next_draft


def _guard_generic_frozen_write(
    current: Optional[Dict[str, Any]], draft: Dict[str, Any]
) -> Dict[str, Any]:
    return _guard_generic_immutable_write(current, draft)


def _write_draft_file_unlocked(path: Path, draft: Dict[str, Any]) -> None:
    data = canon_json_bytes(draft)
    fd, tmp_name = tempfile.mkstemp(prefix=f"{path.stem}_", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, path)
        dir_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def save_draft(draft: Dict[str, Any]) -> None:
    agreement_id = str(draft.get("id") or "").strip()
    if not agreement_id:
        raise ValueError("missing_id")
    if _use_postgres():
        _save_draft_postgres(draft, agreement_id)
        return
    path = _agreement_path(agreement_id)
    with _agreement_file_lock(agreement_id):
        current = _decode_draft_payload(path.read_text(encoding="utf-8")) if path.exists() else None
        _write_draft_file_unlocked(path, _guard_generic_frozen_write(current, draft))


def _save_draft_postgres(draft: Dict[str, Any], agreement_id: str) -> None:
    from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

    now = datetime.now(timezone.utc)
    with agreement_postgres_connection() as cx:
        current_row = pg_execute(
            cx,
            "SELECT payload FROM agreement_drafts WHERE id = ? FOR UPDATE",
            (agreement_id,),
        ).fetchone()
        current = _decode_draft_payload(current_row[0]) if current_row else None
        payload_text = canon_json_bytes(
            _guard_generic_frozen_write(current, draft)
        ).decode("utf-8")
        pg_execute(
            cx,
            """
            INSERT INTO agreement_drafts (id, payload, created_at, updated_at)
            VALUES (?, ?::jsonb, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
              payload = EXCLUDED.payload,
              updated_at = EXCLUDED.updated_at
            """,
            (agreement_id, payload_text, now, now),
        )


def _create_frozen_on_latest(
    latest: Dict[str, Any],
    *,
    frozen_record: Dict[str, Any],
    audit_event: Dict[str, Any],
    updated_at: str,
) -> tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    existing = latest.get("frozen_signing_authority_v1")
    if isinstance(existing, dict):
        if _frozen_material(existing) == _frozen_material(frozen_record):
            return existing, None
        raise ValueError("frozen_signing_authority_immutable")
    next_draft = dict(latest)
    next_draft["frozen_signing_authority_v1"] = frozen_record
    audit = list(latest.get("audit_log") or [])
    audit.append(dict(audit_event))
    next_draft["audit_log"] = audit
    next_draft["updated_at"] = updated_at
    return frozen_record, next_draft


def create_frozen_signing_authority(
    agreement_id: str,
    *,
    frozen_record: Dict[str, Any],
    audit_event: Dict[str, Any],
    updated_at: str,
) -> Dict[str, Any]:
    """Atomically create immutable frozen authority or return an identical existing record."""
    aid = str(agreement_id or "").strip()
    if not aid:
        raise ValueError("missing_agreement_id")
    if not isinstance(frozen_record, dict):
        raise ValueError("invalid_frozen_signing_authority")
    if _use_postgres():
        return _create_frozen_signing_authority_postgres(
            aid,
            frozen_record=frozen_record,
            audit_event=audit_event,
            updated_at=updated_at,
        )

    path = _agreement_path(aid)
    with _agreement_file_lock(aid):
        if not path.exists():
            raise KeyError("agreement_not_found")
        latest = _decode_draft_payload(path.read_text(encoding="utf-8"))
        stored, next_draft = _create_frozen_on_latest(
            latest,
            frozen_record=frozen_record,
            audit_event=audit_event,
            updated_at=updated_at,
        )
        if next_draft is not None:
            _write_draft_file_unlocked(path, next_draft)
        return stored


def _create_frozen_signing_authority_postgres(
    agreement_id: str,
    *,
    frozen_record: Dict[str, Any],
    audit_event: Dict[str, Any],
    updated_at: str,
) -> Dict[str, Any]:
    from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

    with agreement_postgres_connection() as cx:
        row = pg_execute(
            cx,
            "SELECT payload FROM agreement_drafts WHERE id = ? FOR UPDATE",
            (agreement_id,),
        ).fetchone()
        if not row:
            raise KeyError("agreement_not_found")
        latest = _decode_draft_payload(row[0])
        stored, next_draft = _create_frozen_on_latest(
            latest,
            frozen_record=frozen_record,
            audit_event=audit_event,
            updated_at=updated_at,
        )
        if next_draft is not None:
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
        return stored


def _create_activation_on_latest(
    latest: Dict[str, Any],
    *,
    activation_record: Dict[str, Any],
    audit_event: Dict[str, Any],
    updated_at: str,
) -> tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    existing = latest.get("vs01_signing_packet_activation_v1")
    if isinstance(existing, dict):
        if _activation_material(existing) == _activation_material(activation_record):
            return existing, None
        raise ValueError("signing_packet_activation_immutable")
    next_draft = dict(latest)
    next_draft["vs01_signing_packet_activation_v1"] = activation_record
    audit = list(latest.get("audit_log") or [])
    audit.append(dict(audit_event))
    next_draft["audit_log"] = audit
    next_draft["updated_at"] = updated_at
    return activation_record, next_draft


def activate_vs01_signing_packet_authoritative(
    agreement_id: str,
    *,
    document_id: str,
    portable_packet: Dict[str, Any],
    activated_at: str,
) -> Dict[str, Any]:
    """Validate authority and atomically create immutable activation inside one critical section."""
    from backend.services.vs01_signing_packet_activation import (
        VS01_SIGNING_PACKET_ACTIVATION_FIELD,
        Vs01SigningPacketActivationError,
        build_canonical_signing_packet_activation,
    )

    aid = str(agreement_id or "").strip()
    did = str(document_id or "").strip()
    if not aid:
        raise ValueError("missing_agreement_id")
    if not did:
        raise ValueError("missing_document_id")
    if not isinstance(portable_packet, dict):
        raise ValueError("invalid_signing_packet_activation")

    audit_event = {
        "event_type": "signing_packet_activated",
        "at": activated_at,
        "field": VS01_SIGNING_PACKET_ACTIVATION_FIELD,
        "value": {"document_id": did},
    }

    if _use_postgres():
        return _activate_vs01_signing_packet_authoritative_postgres(
            aid,
            document_id=did,
            portable_packet=portable_packet,
            activated_at=activated_at,
            audit_event=audit_event,
        )

    from backend.services.agreement_signing_lock_store import read_signing_lock_unlocked

    path = _agreement_path(aid)
    with agreement_file_lock(aid):
        if not path.exists():
            raise KeyError("agreement_not_found")
        latest = _decode_draft_payload(path.read_text(encoding="utf-8"))
        signing_lock = read_signing_lock_unlocked(aid)
        try:
            canonical = build_canonical_signing_packet_activation(
                agreement_id=aid,
                document_id=did,
                portable_packet=portable_packet,
                draft=latest,
                activated_at=activated_at,
                signing_lock=signing_lock,
            )
        except Vs01SigningPacketActivationError:
            raise
        audit_event["value"] = {
            "document_id": canonical["document_id"],
            "packet_revision": canonical["packet_revision"],
            "accepted_version_id": canonical["accepted_version_id"],
            "accepted_corpus_sha256": canonical["accepted_corpus_sha256"],
        }
        stored, next_draft = _create_activation_on_latest(
            latest,
            activation_record=canonical,
            audit_event=audit_event,
            updated_at=activated_at,
        )
        if next_draft is not None:
            _write_draft_file_unlocked(path, next_draft)
        return stored


def _activate_vs01_signing_packet_authoritative_postgres(
    agreement_id: str,
    *,
    document_id: str,
    portable_packet: Dict[str, Any],
    activated_at: str,
    audit_event: Dict[str, Any],
) -> Dict[str, Any]:
    from backend.db.agreement_sql import agreement_postgres_connection, pg_execute
    from backend.services.agreement_signing_lock_store import read_signing_lock_for_update
    from backend.services.vs01_signing_packet_activation import (
        Vs01SigningPacketActivationError,
        build_canonical_signing_packet_activation,
    )

    with agreement_postgres_connection() as cx:
        row = pg_execute(
            cx,
            "SELECT payload FROM agreement_drafts WHERE id = ? FOR UPDATE",
            (agreement_id,),
        ).fetchone()
        if not row:
            raise KeyError("agreement_not_found")
        signing_lock = read_signing_lock_for_update(cx, agreement_id)
        latest = _decode_draft_payload(row[0])
        try:
            canonical = build_canonical_signing_packet_activation(
                agreement_id=agreement_id,
                document_id=document_id,
                portable_packet=portable_packet,
                draft=latest,
                activated_at=activated_at,
                signing_lock=signing_lock,
            )
        except Vs01SigningPacketActivationError:
            raise
        audit_event = dict(audit_event)
        audit_event["value"] = {
            "document_id": canonical["document_id"],
            "packet_revision": canonical["packet_revision"],
            "accepted_version_id": canonical["accepted_version_id"],
            "accepted_corpus_sha256": canonical["accepted_corpus_sha256"],
        }
        stored, next_draft = _create_activation_on_latest(
            latest,
            activation_record=canonical,
            audit_event=audit_event,
            updated_at=activated_at,
        )
        if next_draft is not None:
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
        return stored


def activate_vs01_signing_packet(
    agreement_id: str,
    *,
    activation_record: Dict[str, Any],
    audit_event: Dict[str, Any],
    updated_at: str,
) -> Dict[str, Any]:
    """Low-level atomic create for tests; production callers should use activate_vs01_signing_packet_authoritative."""
    aid = str(agreement_id or "").strip()
    if not aid:
        raise ValueError("missing_agreement_id")
    if not isinstance(activation_record, dict):
        raise ValueError("invalid_signing_packet_activation")
    if _use_postgres():
        return _activate_vs01_signing_packet_postgres(
            aid,
            activation_record=activation_record,
            audit_event=audit_event,
            updated_at=updated_at,
        )

    path = _agreement_path(aid)
    with agreement_file_lock(aid):
        if not path.exists():
            raise KeyError("agreement_not_found")
        latest = _decode_draft_payload(path.read_text(encoding="utf-8"))
        stored, next_draft = _create_activation_on_latest(
            latest,
            activation_record=activation_record,
            audit_event=audit_event,
            updated_at=updated_at,
        )
        if next_draft is not None:
            _write_draft_file_unlocked(path, next_draft)
        return stored


def _activate_vs01_signing_packet_postgres(
    agreement_id: str,
    *,
    activation_record: Dict[str, Any],
    audit_event: Dict[str, Any],
    updated_at: str,
) -> Dict[str, Any]:
    from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

    with agreement_postgres_connection() as cx:
        row = pg_execute(
            cx,
            "SELECT payload FROM agreement_drafts WHERE id = ? FOR UPDATE",
            (agreement_id,),
        ).fetchone()
        if not row:
            raise KeyError("agreement_not_found")
        latest = _decode_draft_payload(row[0])
        stored, next_draft = _create_activation_on_latest(
            latest,
            activation_record=activation_record,
            audit_event=audit_event,
            updated_at=updated_at,
        )
        if next_draft is not None:
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
        return stored


def _create_or_merge_delivery_batch_on_latest(
    latest: Dict[str, Any],
    *,
    canonical_batch: Dict[str, Any],
    audit_event: Dict[str, Any],
    updated_at: str,
) -> tuple[Dict[str, Any], Optional[Dict[str, Any]], bool]:
    from backend.services.vs01_signing_invite_delivery import (
        VS01_SIGNING_INVITE_DELIVERY_FIELD,
    )

    existing = latest.get(VS01_SIGNING_INVITE_DELIVERY_FIELD)
    if isinstance(existing, dict):
        existing_key = str(existing.get("batch_key") or "")
        canonical_key = str(canonical_batch.get("batch_key") or "")
        if existing_key != canonical_key:
            raise ValueError("signing_invite_delivery_conflict")
        return existing, None, False
    next_draft = dict(latest)
    next_draft[VS01_SIGNING_INVITE_DELIVERY_FIELD] = canonical_batch
    audit = list(latest.get("audit_log") or [])
    audit.append(dict(audit_event))
    next_draft["audit_log"] = audit
    next_draft["updated_at"] = updated_at
    return canonical_batch, next_draft, True


def _merge_delivery_terminal_outcomes_on_latest(
    latest: Dict[str, Any],
    *,
    outcomes: List[Any],
    attempted_at: str,
) -> Dict[str, Any]:
    from backend.services.vs01_signing_invite_delivery import (
        VS01_SIGNING_INVITE_DELIVERY_FIELD,
        merge_recipient_terminal_outcomes_cas,
    )

    existing = latest.get(VS01_SIGNING_INVITE_DELIVERY_FIELD)
    if not isinstance(existing, dict):
        raise ValueError("signing_invite_delivery_not_found")
    merged_batch = merge_recipient_terminal_outcomes_cas(
        existing,
        outcomes=outcomes,
        attempted_at=attempted_at,
    )
    next_draft = dict(latest)
    next_draft[VS01_SIGNING_INVITE_DELIVERY_FIELD] = merged_batch
    next_draft["updated_at"] = attempted_at
    return next_draft


def _update_delivery_batch_on_latest(
    latest: Dict[str, Any],
    *,
    delivery_batch: Dict[str, Any],
    updated_at: str,
) -> Dict[str, Any]:
    from backend.services.vs01_signing_invite_delivery import VS01_SIGNING_INVITE_DELIVERY_FIELD

    existing = latest.get(VS01_SIGNING_INVITE_DELIVERY_FIELD)
    if not isinstance(existing, dict):
        raise ValueError("signing_invite_delivery_not_found")
    if str(existing.get("batch_key") or "") != str(delivery_batch.get("batch_key") or ""):
        raise ValueError("signing_invite_delivery_conflict")
    next_draft = dict(latest)
    next_draft[VS01_SIGNING_INVITE_DELIVERY_FIELD] = delivery_batch
    next_draft["updated_at"] = updated_at
    return next_draft


def deliver_vs01_signing_invites_authoritative(
    agreement_id: str,
    *,
    document_id: str,
    attempted_at: str,
    provider_send_fn=None,
    delivery_allowed: bool | None = None,
) -> Dict[str, Any]:
    """Validate authority, atomically claim delivery records, optionally invoke provider."""
    from backend.config.agreement_signing_token import resolve_signing_token_secret_raw
    from backend.config.signing_invite_delivery_config import signing_invite_delivery_allowed
    from backend.services.vs01_signing_invite_delivery import (
        VS01_SIGNING_INVITE_DELIVERY_FIELD,
        Vs01SigningInviteDeliveryError,
        build_canonical_delivery_batch,
        build_delivery_disabled_response,
        delivery_owner_projection,
        strip_ephemeral_delivery_fields,
    )

    aid = str(agreement_id or "").strip()
    did = str(document_id or "").strip()
    if not aid:
        raise ValueError("missing_agreement_id")
    if not did:
        raise ValueError("missing_document_id")

    allowed = signing_invite_delivery_allowed() if delivery_allowed is None else bool(delivery_allowed)

    if not allowed:
        try:
            latest = load_draft(aid)
        except KeyError:
            raise
        return build_delivery_disabled_response(
            agreement_id=aid,
            document_id=did,
            draft=latest,
        )

    try:
        token_secret = resolve_signing_token_secret_raw().encode("utf-8")
    except Exception as exc:
        raise Vs01SigningInviteDeliveryError("signing_token_secret_unavailable", 503) from exc

    audit_event = {
        "event_type": "signing_invite_delivery_attempted",
        "at": attempted_at,
        "field": VS01_SIGNING_INVITE_DELIVERY_FIELD,
        "value": {"document_id": did},
    }

    def _claim_phase(
        latest: Dict[str, Any], signing_lock: Dict[str, Any] | None
    ) -> tuple[Optional[Dict[str, Any]], List[Any], Dict[str, Any], bool]:
        from backend.services.vs01_signing_invite_delivery import elect_and_persist_delivery_claims

        canonical = build_canonical_delivery_batch(
            agreement_id=aid,
            document_id=did,
            draft=latest,
            signing_lock=signing_lock,
            token_secret=token_secret,
            attempted_at=attempted_at,
        )
        working_batch, next_draft, created, winners = elect_and_persist_delivery_claims(
            latest=latest,
            canonical_batch=canonical,
            attempted_at=attempted_at,
            audit_event=audit_event,
        )
        if next_draft is not None:
            persisted_batch = next_draft.get(VS01_SIGNING_INVITE_DELIVERY_FIELD)
            if isinstance(persisted_batch, dict):
                next_draft[VS01_SIGNING_INVITE_DELIVERY_FIELD] = strip_ephemeral_delivery_fields(
                    persisted_batch
                )
        return next_draft, winners, strip_ephemeral_delivery_fields(working_batch), created

    if _use_postgres():
        working_batch = _deliver_vs01_signing_invites_postgres(
            aid,
            document_id=did,
            attempted_at=attempted_at,
            claim_phase=_claim_phase,
            provider_send_fn=provider_send_fn,
            delivery_allowed=allowed,
            audit_event=audit_event,
        )
    else:
        working_batch = _deliver_vs01_signing_invites_file(
            aid,
            document_id=did,
            attempted_at=attempted_at,
            claim_phase=_claim_phase,
            provider_send_fn=provider_send_fn,
            delivery_allowed=allowed,
            audit_event=audit_event,
        )

    try:
        persisted_batch = load_draft(aid).get(VS01_SIGNING_INVITE_DELIVERY_FIELD)
    except KeyError:
        persisted_batch = None
    batch_for_projection = (
        persisted_batch if isinstance(persisted_batch, dict) else working_batch
    )
    return delivery_owner_projection(batch_for_projection, delivery_allowed=allowed)


def _deliver_vs01_signing_invites_file(
    agreement_id: str,
    *,
    document_id: str,
    attempted_at: str,
    claim_phase,
    provider_send_fn,
    delivery_allowed: bool,
    audit_event: Dict[str, Any],
) -> Dict[str, Any]:
    from backend.services.agreement_signing_lock_store import read_signing_lock_unlocked
    from backend.services.vs01_signing_invite_delivery import (
        VS01_SIGNING_INVITE_DELIVERY_FIELD,
        execute_provider_for_claim_winners,
        strip_ephemeral_delivery_fields,
    )

    path = _agreement_path(agreement_id)
    winners: List[Any] = []
    with agreement_file_lock(agreement_id):
        if not path.exists():
            raise KeyError("agreement_not_found")
        latest = _decode_draft_payload(path.read_text(encoding="utf-8"))
        signing_lock = read_signing_lock_unlocked(agreement_id)
        next_draft, winners, working, _created = claim_phase(latest, signing_lock)
        if next_draft is not None:
            _write_draft_file_unlocked(path, next_draft)

    if delivery_allowed and provider_send_fn is not None and winners:
        outcomes = execute_provider_for_claim_winners(
            winners=winners,
            provider_send_fn=provider_send_fn,
            agreement_id=agreement_id,
        )
        if outcomes:
            with agreement_file_lock(agreement_id):
                latest = _decode_draft_payload(path.read_text(encoding="utf-8"))
                persisted = _merge_delivery_terminal_outcomes_on_latest(
                    latest,
                    outcomes=outcomes,
                    attempted_at=attempted_at,
                )
                _write_draft_file_unlocked(path, persisted)
                stored = persisted.get(VS01_SIGNING_INVITE_DELIVERY_FIELD)
                return stored if isinstance(stored, dict) else working
    with agreement_file_lock(agreement_id):
        latest = _decode_draft_payload(path.read_text(encoding="utf-8"))
        stored = latest.get(VS01_SIGNING_INVITE_DELIVERY_FIELD)
        if isinstance(stored, dict):
            return stored
    return strip_ephemeral_delivery_fields(working)


def _deliver_vs01_signing_invites_postgres(
    agreement_id: str,
    *,
    document_id: str,
    attempted_at: str,
    claim_phase,
    provider_send_fn,
    delivery_allowed: bool,
    audit_event: Dict[str, Any],
) -> Dict[str, Any]:
    from backend.db.agreement_sql import agreement_postgres_connection, pg_execute
    from backend.services.agreement_signing_lock_store import read_signing_lock_for_update
    from backend.services.vs01_signing_invite_delivery import (
        VS01_SIGNING_INVITE_DELIVERY_FIELD,
        execute_provider_for_claim_winners,
        strip_ephemeral_delivery_fields,
    )

    winners: List[Any] = []
    with agreement_postgres_connection() as cx:
        row = pg_execute(
            cx,
            "SELECT payload FROM agreement_drafts WHERE id = ? FOR UPDATE",
            (agreement_id,),
        ).fetchone()
        if not row:
            raise KeyError("agreement_not_found")
        signing_lock = read_signing_lock_for_update(cx, agreement_id)
        latest = _decode_draft_payload(row[0])
        next_draft, winners, working, _created = claim_phase(latest, signing_lock)
        if next_draft is not None:
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

    if delivery_allowed and provider_send_fn is not None and winners:
        outcomes = execute_provider_for_claim_winners(
            winners=winners,
            provider_send_fn=provider_send_fn,
            agreement_id=agreement_id,
        )
        if outcomes:
            with agreement_postgres_connection() as cx:
                row = pg_execute(
                    cx,
                    "SELECT payload FROM agreement_drafts WHERE id = ? FOR UPDATE",
                    (agreement_id,),
                ).fetchone()
                if not row:
                    raise KeyError("agreement_not_found")
                latest = _decode_draft_payload(row[0])
                persisted = _merge_delivery_terminal_outcomes_on_latest(
                    latest,
                    outcomes=outcomes,
                    attempted_at=attempted_at,
                )
                pg_execute(
                    cx,
                    """
                    UPDATE agreement_drafts
                    SET payload = ?::jsonb, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        canon_json_bytes(persisted).decode("utf-8"),
                        datetime.now(timezone.utc),
                        agreement_id,
                    ),
                )
                stored = persisted.get(VS01_SIGNING_INVITE_DELIVERY_FIELD)
                return stored if isinstance(stored, dict) else working

    latest = load_draft(agreement_id)
    stored = latest.get(VS01_SIGNING_INVITE_DELIVERY_FIELD)
    if isinstance(stored, dict):
        return stored
    return strip_ephemeral_delivery_fields(working)


def load_draft(agreement_id: str) -> Dict[str, Any]:
    if _use_postgres():
        return _load_draft_postgres(agreement_id)
    path = _agreement_path(agreement_id)
    if not path.exists():
        raise KeyError("agreement_not_found")
    raw = path.read_text(encoding="utf-8")
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("invalid_agreement_payload")
    return parsed


def _load_draft_postgres(agreement_id: str) -> Dict[str, Any]:
    from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

    aid = (agreement_id or "").strip()
    if not aid:
        raise KeyError("agreement_not_found")
    with agreement_postgres_connection() as cx:
        cur = pg_execute(
            cx,
            "SELECT payload FROM agreement_drafts WHERE id = ?",
            (aid,),
        )
        row = cur.fetchone()
    if not row:
        raise KeyError("agreement_not_found")
    payload = row[0]
    if isinstance(payload, dict):
        parsed = payload
    else:
        parsed = json.loads(str(payload))
    if not isinstance(parsed, dict):
        raise ValueError("invalid_agreement_payload")
    return parsed


def _cap_list_limit(limit: Optional[int]) -> Optional[int]:
    if limit is None:
        return None
    return max(1, min(int(limit), 500))


def _json_array_field(raw: Any) -> List[Any]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return []
        return parsed if isinstance(parsed, list) else []
    return []


def _admin_metadata_slice_from_draft(agreement_id: str, draft: Dict[str, Any]) -> Dict[str, Any]:
    """Admin-safe draft projection (no body/purpose/payment fields)."""
    return {
        "id": agreement_id,
        "created_at": draft.get("created_at"),
        "updated_at": draft.get("updated_at"),
        "title": draft.get("title"),
        "review_sent_at": draft.get("review_sent_at"),
        "parties": draft.get("parties") if isinstance(draft.get("parties"), list) else [],
        "audit_log": draft.get("audit_log") if isinstance(draft.get("audit_log"), list) else [],
        "versions": draft.get("versions") if isinstance(draft.get("versions"), list) else [],
    }


def list_draft_agreement_ids_newest_first(limit: Optional[int] = None) -> List[str]:
    """Return draft ids newest first (mtime for files; ``updated_at`` for Postgres)."""
    cap = _cap_list_limit(limit)
    if _use_postgres():
        from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

        with agreement_postgres_connection() as cx:
            if cap is None:
                cur = pg_execute(
                    cx,
                    "SELECT id FROM agreement_drafts ORDER BY updated_at DESC",
                    (),
                )
            else:
                cur = pg_execute(
                    cx,
                    "SELECT id FROM agreement_drafts ORDER BY updated_at DESC LIMIT ?",
                    (cap,),
                )
            rows = cur.fetchall()
        return [str(r[0]) for r in rows]
    paths: List[tuple[int, str]] = []
    for path in _agreements_dir().glob("*.json"):
        if path.name.endswith(".signing-lock.json"):
            continue
        try:
            st = path.stat()
        except OSError:
            continue
        paths.append((st.st_mtime_ns, path.stem))
    paths.sort(key=lambda t: -t[0])
    ids = [aid for _, aid in paths]
    if cap is None:
        return ids
    return ids[:cap]


def _list_draft_admin_metadata_postgres(limit: int) -> List[Dict[str, Any]]:
    from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

    with agreement_postgres_connection() as cx:
        cur = pg_execute(
            cx,
            """
            SELECT
              id,
              payload->>'created_at' AS created_at,
              payload->>'updated_at' AS updated_at,
              payload->>'title' AS title,
              payload->>'review_sent_at' AS review_sent_at,
              payload->'parties' AS parties,
              payload->'audit_log' AS audit_log,
              payload->'versions' AS versions
            FROM agreement_drafts
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            (limit,),
        )
        rows = cur.fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        aid = str(row[0])
        out.append(
            {
                "id": aid,
                "created_at": row[1],
                "updated_at": row[2],
                "title": row[3],
                "review_sent_at": row[4],
                "parties": _json_array_field(row[5]),
                "audit_log": _json_array_field(row[6]),
                "versions": _json_array_field(row[7]),
            }
        )
    return out


def _list_draft_admin_metadata_files(limit: int) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for aid in list_draft_agreement_ids_newest_first(limit=limit):
        try:
            draft = load_draft(aid)
        except Exception:
            continue
        if not isinstance(draft, dict):
            continue
        out.append(_admin_metadata_slice_from_draft(aid, draft))
    return out


def list_draft_admin_metadata_newest_first(limit: int = 200) -> List[Dict[str, Any]]:
    """
    Newest-first admin-safe draft metadata.

    Postgres: one connection, one ``LIMIT`` query with JSONB field projection.
    Local files: bounded id listing then per-file ``load_draft`` (dev/small datasets).
    """
    cap = _cap_list_limit(limit) or 200
    if _use_postgres():
        return _list_draft_admin_metadata_postgres(cap)
    return _list_draft_admin_metadata_files(cap)
