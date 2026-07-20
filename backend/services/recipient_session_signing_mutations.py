"""Phase 3C2C: session-bound recipient signing field mutations and signer completion."""

from __future__ import annotations

import hashlib
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from backend.services.recipient_session_packet_projection import (
    RecipientSessionPacketProjectionError,
    _filter_signer_fields,
    _initials_policy,
    _resolve_locked_role_id,
)
from backend.services.vs01_recipient_bootstrap_exchange import (
    RecipientBootstrapExchangeError,
    _clean,
    load_revalidated_recipient_session,
)
from backend.services.vs01_signer_completion import (
    all_signers_signed_from_audit,
    build_signature_completed_event,
    signer_role_already_completed,
)
from backend.utils.canon_json import canon_json_bytes

VS01_RECIPIENT_SIGNER_STATE_FIELD = "vs01_recipient_signer_state_v1"
RECIPIENT_SIGNER_STATE_VERSION = 1

READINESS_READY_FOR_SIGNING = "ready_for_signing"
READINESS_SIGNER_COMPLETE = "signer_complete"

_EDITABLE_FIELD_TYPES = frozenset({"signature", "initials"})
_MAX_FIELD_VALUE_LEN = 500
_MAX_MUTATION_ID_LEN = 128
_MUTATION_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# PostgreSQL signing mutations acquire row locks in this order to prevent deadlocks:
# 1. recipient_bootstrap_sessions (token_hash)
# 2. agreement_drafts (agreement_id)
# 3. agreement_signing_locks (agreement_id, via read_signing_lock_for_update)
# File mode uses the agreement file lock, which covers draft-embedded session authority.


class RecipientSessionSigningMutationError(RecipientBootstrapExchangeError):
    """Uniform fail-closed signing mutation error."""


class RecipientSessionSigningValidationError(Exception):
    """Field validation failure — mapped to 400 with generic message at API boundary."""

    def __init__(self, code: str = "field_validation_failed") -> None:
        self.code = code
        super().__init__(code)


class RecipientSessionSigningConflictError(Exception):
    """Stale revision conflict — mapped to 409 with generic message at API boundary."""

    def __init__(self, code: str = "field_revision_conflict") -> None:
        self.code = code
        super().__init__(code)


class RecipientSessionSigningArtifactConflictError(Exception):
    """Completed artifact material conflict — mapped to 409 at API boundary."""

    def __init__(self, code: str = "completed_artifact_conflict") -> None:
        self.code = code
        super().__init__(code)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _server_signing_date_display(iso_date: str) -> str:
    try:
        year, month, day = iso_date.split("-")
        dt = datetime(int(year), int(month), int(day), 12, 0, 0, tzinfo=timezone.utc)
        return dt.strftime("%b %d, %Y")
    except (TypeError, ValueError):
        return iso_date


def _contains_disallowed_control_characters(text: str) -> bool:
    for ch in text:
        if ch in ("\u2028", "\u2029"):
            return True
        category = unicodedata.category(ch)
        if category in ("Cc", "Cf"):
            return True
    return False


def _validate_mutation_id(mutation_id: str) -> str:
    raw = (mutation_id or "").strip()
    if not raw or len(raw) > _MAX_MUTATION_ID_LEN:
        raise RecipientSessionSigningValidationError("mutation_id_invalid")
    if _contains_disallowed_control_characters(raw):
        raise RecipientSessionSigningValidationError("mutation_id_invalid")
    if not _MUTATION_ID_RE.match(raw):
        raise RecipientSessionSigningValidationError("mutation_id_invalid")
    return raw


def _mutation_material_fingerprint(*, field_id: str, value: str, expected_revision: int) -> str:
    material = {"field_id": field_id, "value": value, "expected_revision": expected_revision}
    return hashlib.sha256(canon_json_bytes(material)).hexdigest()


def _mutation_ledger(signer_state: Dict[str, Any]) -> Dict[str, Any]:
    ledger = signer_state.get("mutation_ledger")
    return dict(ledger) if isinstance(ledger, dict) else {}


def signer_state_field_material(state: Dict[str, Any]) -> bytes:
    return canon_json_bytes(state)


def _empty_signer_state(*, packet_revision: str) -> Dict[str, Any]:
    return {
        "v": RECIPIENT_SIGNER_STATE_VERSION,
        "packet_revision": packet_revision,
        "by_signer_record_id": {},
    }


def _get_activation_portable(draft: Dict[str, Any]) -> Dict[str, Any]:
    activation = draft.get("vs01_signing_packet_activation_v1")
    if not isinstance(activation, dict):
        raise RecipientSessionSigningMutationError()
    portable = activation.get("portable")
    if not isinstance(portable, dict):
        raise RecipientSessionSigningMutationError()
    return portable


def _locked_role_and_fields(
    *,
    session: Dict[str, Any],
    draft: Dict[str, Any],
) -> Tuple[str, List[Dict[str, Any]], Dict[str, bool]]:
    portable = _get_activation_portable(draft)
    signer_record_id = _clean(session.get("signer_record_id"))
    if not signer_record_id:
        raise RecipientSessionSigningMutationError()
    locked_role_id = _resolve_locked_role_id(portable=portable, signer_record_id=signer_record_id)
    fields = _filter_signer_fields(portable=portable, locked_role_id=locked_role_id)
    return locked_role_id, fields, _initials_policy(portable)


def _packet_revision_from_draft(draft: Dict[str, Any]) -> str:
    activation = draft.get("vs01_signing_packet_activation_v1")
    if not isinstance(activation, dict):
        raise RecipientSessionSigningMutationError()
    revision = _clean(activation.get("packet_revision"))
    if not revision:
        raise RecipientSessionSigningMutationError()
    return revision


def _load_signer_state(
    draft: Dict[str, Any],
    *,
    signer_record_id: str,
    packet_revision: str,
) -> Dict[str, Any]:
    root = draft.get(VS01_RECIPIENT_SIGNER_STATE_FIELD)
    if not isinstance(root, dict):
        return _empty_signer_state(packet_revision=packet_revision)
    if _clean(root.get("packet_revision")) != packet_revision:
        raise RecipientSessionSigningMutationError()
    by_signer = root.get("by_signer_record_id")
    if not isinstance(by_signer, dict):
        by_signer = {}
    existing = by_signer.get(signer_record_id)
    if not isinstance(existing, dict):
        existing = {"field_values": {}, "completed_at": None}
    field_values = existing.get("field_values")
    if not isinstance(field_values, dict):
        field_values = {}
    mutation_ledger = existing.get("mutation_ledger")
    if not isinstance(mutation_ledger, dict):
        mutation_ledger = {}
    return {
        "field_values": dict(field_values),
        "mutation_ledger": dict(mutation_ledger),
        "completed_at": _clean(existing.get("completed_at")) or None,
        "signed_date_iso": _clean(existing.get("signed_date_iso")) or None,
        "signed_date_display": _clean(existing.get("signed_date_display")) or None,
    }


def _merge_signer_state(
    draft: Dict[str, Any],
    *,
    signer_record_id: str,
    packet_revision: str,
    signer_state: Dict[str, Any],
) -> Dict[str, Any]:
    root = draft.get(VS01_RECIPIENT_SIGNER_STATE_FIELD)
    if not isinstance(root, dict) or _clean(root.get("packet_revision")) != packet_revision:
        root = _empty_signer_state(packet_revision=packet_revision)
    by_signer = dict(root.get("by_signer_record_id") or {})
    by_signer[signer_record_id] = signer_state
    return {**draft, VS01_RECIPIENT_SIGNER_STATE_FIELD: {**root, "by_signer_record_id": by_signer}}


def _field_by_id(fields: List[Dict[str, Any]], field_id: str) -> Optional[Dict[str, Any]]:
    fid = _clean(field_id)
    for field in fields:
        if _clean(field.get("id")) == fid:
            return field
    return None


def _sanitize_field_value(value: Any, *, field_type: str) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise RecipientSessionSigningValidationError("field_value_type_invalid")
    text = value.strip()
    if len(text) > _MAX_FIELD_VALUE_LEN:
        raise RecipientSessionSigningValidationError("field_value_too_long")
    if _contains_disallowed_control_characters(text):
        raise RecipientSessionSigningValidationError("field_value_invalid")
    if field_type in _EDITABLE_FIELD_TYPES and "<" in text and ">" in text:
        raise RecipientSessionSigningValidationError("field_value_unsafe")
    return text


def _validate_field_value_for_type(field_type: str, value: str) -> None:
    if field_type in _EDITABLE_FIELD_TYPES:
        if not value:
            raise RecipientSessionSigningValidationError("field_value_required")
        return
    if field_type == "email":
        if value and "@" not in value:
            raise RecipientSessionSigningValidationError("field_value_invalid")
        return
    if field_type == "date":
        if value and not _ISO_DATE_RE.match(value):
            raise RecipientSessionSigningValidationError("field_value_invalid")
        return


def _metadata_auto_value(
    field: Dict[str, Any],
    *,
    session: Dict[str, Any],
) -> str:
    field_type = _clean(field.get("type"))
    display_name = _clean(session.get("signer_display_name")) or "Recipient"
    if field_type == "printed_name":
        return display_name
    if field_type == "date":
        return _utc_now_iso()[:10]
    if field_type == "email":
        return ""
    if field_type == "text":
        return ""
    return ""


def _stored_field_value(
    signer_state: Dict[str, Any],
    field_id: str,
) -> str:
    raw = (signer_state.get("field_values") or {}).get(field_id)
    if not isinstance(raw, dict):
        return ""
    return _clean(raw.get("value"))


def _stored_field_revision(
    signer_state: Dict[str, Any],
    field_id: str,
) -> int:
    raw = (signer_state.get("field_values") or {}).get(field_id)
    if not isinstance(raw, dict):
        return 0
    revision = raw.get("revision")
    if isinstance(revision, int) and revision >= 0:
        return revision
    if _clean(raw.get("value")):
        return 1
    return 0


def _project_field_revisions(
    fields: List[Dict[str, Any]],
    *,
    signer_state: Dict[str, Any],
) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for field in fields:
        fid = _clean(field.get("id"))
        field_type = _clean(field.get("type"))
        if not fid or field_type not in _EDITABLE_FIELD_TYPES:
            continue
        out[fid] = _stored_field_revision(signer_state, fid)
    return out


def _effective_field_value(
    field: Dict[str, Any],
    *,
    session: Dict[str, Any],
    signer_state: Dict[str, Any],
) -> str:
    field_type = _clean(field.get("type"))
    field_id = _clean(field.get("id"))
    if field_type in _EDITABLE_FIELD_TYPES:
        return _stored_field_value(signer_state, field_id)
    return _metadata_auto_value(field, session=session)


def _required_editable_fields(
    fields: List[Dict[str, Any]],
    initials_policy: Dict[str, bool],
) -> List[Dict[str, Any]]:
    initials_on = bool(initials_policy.get("enabled"))
    out: List[Dict[str, Any]] = []
    for field in fields:
        field_type = _clean(field.get("type"))
        if field_type == "signature":
            out.append(field)
        elif field_type == "initials" and initials_on:
            out.append(field)
    return out


def compute_signer_readiness(
    *,
    session: Dict[str, Any],
    draft: Dict[str, Any],
    signer_state: Dict[str, Any],
) -> Dict[str, Any]:
    _, fields, initials_policy = _locked_role_and_fields(session=session, draft=draft)
    signer_record_id = _clean(session.get("signer_record_id"))
    locked_role_id = _resolve_locked_role_id(
        portable=_get_activation_portable(draft),
        signer_record_id=signer_record_id,
    )
    audit = draft.get("audit_log") or []
    completed_at = _clean(signer_state.get("completed_at")) or None
    audit_complete = signer_role_already_completed(audit, locked_role_id)
    signer_complete = bool(completed_at or audit_complete)

    required = _required_editable_fields(fields, initials_policy)
    missing: List[str] = []
    for field in required:
        fid = _clean(field.get("id"))
        if not _effective_field_value(field, session=session, signer_state=signer_state):
            missing.append(fid)

    finish_ready = len(required) > 0 and not missing
    readiness = READINESS_SIGNER_COMPLETE if signer_complete else READINESS_READY_FOR_SIGNING
    return {
        "readiness": readiness,
        "signer_complete": signer_complete,
        "finish_ready": finish_ready,
        "required_field_count": len(required),
        "completed_field_count": len(required) - len(missing),
        "missing_field_ids": missing,
    }


def _project_field_values_for_response(
    fields: List[Dict[str, Any]],
    *,
    session: Dict[str, Any],
    signer_state: Dict[str, Any],
) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for field in fields:
        fid = _clean(field.get("id"))
        if not fid:
            continue
        field_type = _clean(field.get("type"))
        if field_type not in _EDITABLE_FIELD_TYPES:
            continue
        value = _stored_field_value(signer_state, fid)
        if value:
            out[fid] = value
    return out


def _field_mutation_response(
    *,
    fields: List[Dict[str, Any]],
    session: Dict[str, Any],
    draft: Dict[str, Any],
    signer_state: Dict[str, Any],
    field_id: str,
    idempotent: bool,
) -> Dict[str, Any]:
    readiness = compute_signer_readiness(session=session, draft=draft, signer_state=signer_state)
    return {
        "ok": True,
        "field_id": field_id,
        "idempotent": idempotent,
        "field_values": _project_field_values_for_response(
            fields, session=session, signer_state=signer_state
        ),
        "field_revisions": _project_field_revisions(fields, signer_state=signer_state),
        **readiness,
    }


def _assert_signer_not_complete(
    *,
    session: Dict[str, Any],
    draft: Dict[str, Any],
    signer_state: Dict[str, Any],
    locked_role_id: str,
) -> None:
    if _clean(signer_state.get("completed_at")):
        raise RecipientSessionSigningMutationError()
    if signer_role_already_completed(draft.get("audit_log") or [], locked_role_id):
        raise RecipientSessionSigningMutationError()


def _assert_agreement_not_globally_certified(draft: Dict[str, Any]) -> None:
    from backend.services.vs01_completed_agreement_artifact import completed_artifact_ready

    if completed_artifact_ready(draft):
        raise RecipientSessionSigningMutationError()


def _revoke_all_bootstrap_sessions_on_draft(
    draft: Dict[str, Any], *, revoked_at: str
) -> Dict[str, Any]:
    from backend.services.recipient_bootstrap_session_store import apply_all_sessions_revocation_to_draft

    next_draft, _ = apply_all_sessions_revocation_to_draft(draft, revoked_at=revoked_at)
    return next_draft


def _mutate_field_locked(
    *,
    session: Dict[str, Any],
    draft: Dict[str, Any],
    field_id: str,
    value: str,
    expected_revision: int,
    mutation_id: str,
    now_iso: str,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    locked_role_id, fields, _ = _locked_role_and_fields(session=session, draft=draft)
    signer_record_id = _clean(session.get("signer_record_id"))
    packet_revision = _packet_revision_from_draft(draft)
    signer_state = _load_signer_state(
        draft,
        signer_record_id=signer_record_id,
        packet_revision=packet_revision,
    )
    _assert_agreement_not_globally_certified(draft)
    _assert_signer_not_complete(
        session=session,
        draft=draft,
        signer_state=signer_state,
        locked_role_id=locked_role_id,
    )

    field = _field_by_id(fields, field_id)
    if not field:
        raise RecipientSessionSigningMutationError()

    field_type = _clean(field.get("type"))
    if field_type not in _EDITABLE_FIELD_TYPES:
        raise RecipientSessionSigningMutationError()

    sanitized = _sanitize_field_value(value, field_type=field_type)
    _validate_field_value_for_type(field_type, sanitized)

    fid = _clean(field.get("id"))
    current_revision = _stored_field_revision(signer_state, fid)
    validated_mutation_id = _validate_mutation_id(mutation_id)
    material_fp = _mutation_material_fingerprint(
        field_id=fid,
        value=sanitized,
        expected_revision=expected_revision,
    )
    ledger = _mutation_ledger(signer_state)
    existing_record = ledger.get(validated_mutation_id)
    if isinstance(existing_record, dict):
        if _clean(existing_record.get("material_fp")) != material_fp:
            raise RecipientSessionSigningConflictError("mutation_id_conflict")
        return draft, _field_mutation_response(
            fields=fields,
            session=session,
            draft=draft,
            signer_state=signer_state,
            field_id=fid,
            idempotent=True,
        )

    if expected_revision != current_revision:
        raise RecipientSessionSigningConflictError()

    field_values = dict(signer_state.get("field_values") or {})
    field_values[fid] = {
        "value": sanitized,
        "revision": current_revision + 1,
        "updated_at": now_iso,
    }
    ledger[validated_mutation_id] = {
        "field_id": fid,
        "material_fp": material_fp,
        "revision": current_revision + 1,
        "recorded_at": now_iso,
    }
    next_signer_state = {
        **signer_state,
        "field_values": field_values,
        "mutation_ledger": ledger,
    }
    next_draft = _merge_signer_state(
        draft,
        signer_record_id=signer_record_id,
        packet_revision=packet_revision,
        signer_state=next_signer_state,
    )
    return next_draft, _field_mutation_response(
        fields=fields,
        session=session,
        draft=next_draft,
        signer_state=next_signer_state,
        field_id=fid,
        idempotent=False,
    )


def _complete_signer_locked(
    *,
    session: Dict[str, Any],
    draft: Dict[str, Any],
    now_iso: str,
    locked_version_id: Optional[str],
    agreement_version_hash: Optional[str],
    signing_lock: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    locked_role_id, fields, initials_policy = _locked_role_and_fields(session=session, draft=draft)
    signer_record_id = _clean(session.get("signer_record_id"))
    party_id = _clean(session.get("party_id"))
    packet_revision = _packet_revision_from_draft(draft)
    document_id = _clean(session.get("document_id"))
    display_name = _clean(session.get("signer_display_name")) or "Recipient"

    signer_state = _load_signer_state(
        draft,
        signer_record_id=signer_record_id,
        packet_revision=packet_revision,
    )
    audit = list(draft.get("audit_log") or [])
    already_complete = signer_role_already_completed(audit, locked_role_id) or bool(
        _clean(signer_state.get("completed_at"))
    )

    if already_complete:
        from backend.services.vs01_completed_agreement_artifact import read_completed_artifact_from_draft

        readiness = compute_signer_readiness(session=session, draft=draft, signer_state=signer_state)
        globally_executed = read_completed_artifact_from_draft(draft) is not None
        next_draft = draft
        if globally_executed:
            next_draft = _revoke_all_bootstrap_sessions_on_draft(draft, revoked_at=now_iso)
        return next_draft, {
            "ok": True,
            "signer_complete": True,
            "idempotent": True,
            "globally_executed": globally_executed,
            "agreement_id": _clean(session.get("agreement_id")) or _clean(draft.get("id")),
            **readiness,
        }

    _assert_agreement_not_globally_certified(draft)

    readiness_pre = compute_signer_readiness(session=session, draft=draft, signer_state=signer_state)
    if not readiness_pre.get("finish_ready"):
        raise RecipientSessionSigningValidationError("signer_not_ready")

    signed_date_iso = now_iso[:10]
    signed_date_display = _server_signing_date_display(signed_date_iso)

    audit.append(
        build_signature_completed_event(
            signer_role_id=locked_role_id,
            participant_id=party_id,
            display_name=display_name,
            document_id=document_id,
            signed_at=now_iso,
            signed_date_iso=signed_date_iso,
            signed_date_display=signed_date_display,
            locked_version_id=locked_version_id,
            agreement_version_hash=agreement_version_hash,
        )
    )

    next_signer_state = {
        **signer_state,
        "completed_at": now_iso,
        "signed_date_iso": signed_date_iso,
        "signed_date_display": signed_date_display,
    }
    next_draft = {**draft, "audit_log": audit, "updated_at": now_iso}
    next_draft = _merge_signer_state(
        next_draft,
        signer_record_id=signer_record_id,
        packet_revision=packet_revision,
        signer_state=next_signer_state,
    )

    readiness = compute_signer_readiness(
        session=session,
        draft=next_draft,
        signer_state=next_signer_state,
    )
    globally_executed = False
    if all_signers_signed_from_audit(next_draft, next_draft.get("audit_log") or []):
        from backend.services.vs01_completed_agreement_artifact import (
            CompletedAgreementArtifactConflictError,
            CompletedAgreementArtifactError,
            establish_completed_artifact_on_draft,
        )

        try:
            established = establish_completed_artifact_on_draft(
                next_draft,
                signing_lock=signing_lock if isinstance(signing_lock, dict) else None,
                now_iso=now_iso,
            )
            next_draft = established.draft_dict
            globally_executed = established.globally_executed
            if globally_executed:
                next_draft = _revoke_all_bootstrap_sessions_on_draft(
                    next_draft,
                    revoked_at=now_iso,
                )
        except CompletedAgreementArtifactConflictError as exc:
            raise RecipientSessionSigningArtifactConflictError(exc.code) from exc
        except CompletedAgreementArtifactError as exc:
            raise RecipientSessionSigningValidationError(exc.code) from exc

    return next_draft, {
        "ok": True,
        "signer_complete": True,
        "idempotent": False,
        "globally_executed": globally_executed,
        "agreement_id": _clean(session.get("agreement_id")) or _clean(next_draft.get("id")),
        **readiness,
    }


def _with_locked_draft_mutation(
    *,
    session_secret: str,
    mutate_fn: Callable[[Dict[str, Any], Dict[str, Any], Optional[Dict[str, Any]]], Tuple[Dict[str, Any], Dict[str, Any]]],
) -> Dict[str, Any]:
    from backend.services.recipient_bootstrap_session_store import (
        get_session_by_token_hash_for_update,
        session_token_hash,
    )
    from backend.services.vs01_recipient_bootstrap_exchange import (
        _lookup_active_session,
        _lookup_session_for_signing_mutation,
        _revalidate_session_authority,
    )

    raw_secret = (session_secret or "").strip()
    if not raw_secret:
        raise RecipientSessionSigningMutationError()
    token_hash = session_token_hash(raw_secret)

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
            session = get_session_by_token_hash_for_update(cx, token_hash)
            if not session:
                raise RecipientSessionSigningMutationError()
            agreement_id = _clean(session.get("agreement_id"))
            if not agreement_id:
                raise RecipientSessionSigningMutationError()
            row = pg_execute(
                cx,
                "SELECT payload FROM agreement_drafts WHERE id = ? FOR UPDATE",
                (agreement_id,),
            ).fetchone()
            if not row:
                raise RecipientSessionSigningMutationError()
            signing_lock = read_signing_lock_for_update(cx, agreement_id)
            latest = _decode_draft_payload(row[0])
            _revalidate_session_authority(draft=latest, session=session, signing_lock=signing_lock)
            next_draft, result = mutate_fn(session, latest, signing_lock)
            if result.get("globally_executed"):
                from backend.services.recipient_bootstrap_session_store import (
                    revoke_all_sessions_for_agreement_postgres,
                )

                revoke_all_sessions_for_agreement_postgres(
                    agreement_id=agreement_id,
                    revoked_at=_utc_now_iso(),
                    cx=cx,
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
            return result

    probe = _lookup_session_for_signing_mutation(session_secret)
    if not probe:
        raise RecipientSessionSigningMutationError()
    agreement_id = _clean(probe.get("agreement_id"))
    if not agreement_id:
        raise RecipientSessionSigningMutationError()

    path = _agreement_path(agreement_id)
    with agreement_file_lock(agreement_id):
        if not path.exists():
            raise RecipientSessionSigningMutationError()
        latest = _decode_draft_payload(path.read_text(encoding="utf-8"))
        from backend.services.agreement_signing_lock_store import read_signing_lock_unlocked

        signing_lock = read_signing_lock_unlocked(agreement_id)
        session = _lookup_session_for_signing_mutation(session_secret)
        if not session:
            raise RecipientSessionSigningMutationError()
        _revalidate_session_authority(draft=latest, session=session, signing_lock=signing_lock)
        next_draft, result = mutate_fn(session, latest, signing_lock)
        _write_draft_file_unlocked(path, next_draft)
        return result


def mutate_recipient_session_field(
    *,
    session_secret: str,
    field_id: str,
    value: str,
    expected_revision: int,
    mutation_id: str,
) -> Dict[str, Any]:
    now_iso = _utc_now_iso()

    def _mutate(
        session: Dict[str, Any],
        draft: Dict[str, Any],
        _signing_lock: Optional[Dict[str, Any]],
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        return _mutate_field_locked(
            session=session,
            draft=draft,
            field_id=field_id,
            value=value,
            expected_revision=expected_revision,
            mutation_id=mutation_id,
            now_iso=now_iso,
        )

    try:
        return _with_locked_draft_mutation(session_secret=session_secret, mutate_fn=_mutate)
    except RecipientSessionSigningValidationError:
        raise
    except RecipientSessionSigningConflictError:
        raise
    except (RecipientBootstrapExchangeError, RecipientSessionPacketProjectionError):
        raise RecipientSessionSigningMutationError() from None


def complete_recipient_session_signer(
    *,
    session_secret: str,
) -> Dict[str, Any]:
    now_iso = _utc_now_iso()

    def _mutate(
        session: Dict[str, Any],
        draft: Dict[str, Any],
        signing_lock: Optional[Dict[str, Any]],
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        agreement_id = _clean(session.get("agreement_id"))
        locked_version_id = None
        agreement_version_hash = None
        if isinstance(signing_lock, dict):
            locked_version_id = _clean(signing_lock.get("locked_version_id")) or None
            agreement_version_hash = _clean(signing_lock.get("content_sha256")) or None
        return _complete_signer_locked(
            session=session,
            draft=draft,
            now_iso=now_iso,
            locked_version_id=locked_version_id,
            agreement_version_hash=agreement_version_hash,
            signing_lock=signing_lock,
        )

    try:
        return _with_locked_draft_mutation(session_secret=session_secret, mutate_fn=_mutate)
    except RecipientSessionSigningValidationError:
        raise
    except RecipientSessionSigningArtifactConflictError:
        raise
    except (RecipientBootstrapExchangeError, RecipientSessionPacketProjectionError):
        raise RecipientSessionSigningMutationError() from None


def resolve_recipient_session_readiness(*, session_secret: str) -> Dict[str, Any]:
    try:
        session, draft, _ = load_revalidated_recipient_session(session_secret=session_secret)
        signer_record_id = _clean(session.get("signer_record_id"))
        packet_revision = _packet_revision_from_draft(draft)
        signer_state = _load_signer_state(
            draft,
            signer_record_id=signer_record_id,
            packet_revision=packet_revision,
        )
        readiness = compute_signer_readiness(session=session, draft=draft, signer_state=signer_state)
        return {"ok": True, **readiness}
    except (RecipientBootstrapExchangeError, RecipientSessionPacketProjectionError):
        raise RecipientSessionSigningMutationError() from None


def load_signer_state_for_session(
    draft: Dict[str, Any],
    *,
    signer_record_id: str,
    packet_revision: str,
) -> Dict[str, Any]:
    return _load_signer_state(
        draft,
        signer_record_id=signer_record_id,
        packet_revision=packet_revision,
    )


def project_editable_field_values(
    fields: List[Dict[str, Any]],
    *,
    session: Dict[str, Any],
    signer_state: Dict[str, Any],
) -> Dict[str, str]:
    return _project_field_values_for_response(fields, session=session, signer_state=signer_state)


def project_editable_field_revisions(
    fields: List[Dict[str, Any]],
    *,
    signer_state: Dict[str, Any],
) -> Dict[str, int]:
    return _project_field_revisions(fields, signer_state=signer_state)


def merge_signer_state_preserving_terminal(
    existing: Dict[str, Any],
    incoming: Dict[str, Any],
) -> Dict[str, Any]:
    """Merge signer state records without reversing terminal completion."""
    if not isinstance(existing, dict):
        return incoming
    if not isinstance(incoming, dict):
        return existing
    existing_by = existing.get("by_signer_record_id")
    incoming_by = incoming.get("by_signer_record_id")
    if not isinstance(existing_by, dict):
        existing_by = {}
    if not isinstance(incoming_by, dict):
        incoming_by = {}
    merged_by: Dict[str, Any] = {}
    keys: Set[str] = set(existing_by.keys()) | set(incoming_by.keys())
    for key in keys:
        prev = existing_by.get(key) if isinstance(existing_by.get(key), dict) else {}
        nxt = incoming_by.get(key) if isinstance(incoming_by.get(key), dict) else {}
        if _clean(prev.get("completed_at")):
            merged_by[key] = prev
        elif _clean(nxt.get("completed_at")):
            merged_by[key] = nxt
        else:
            prev_values = prev.get("field_values") if isinstance(prev.get("field_values"), dict) else {}
            next_values = nxt.get("field_values") if isinstance(nxt.get("field_values"), dict) else {}
            merged_values = {**prev_values, **next_values}
            merged_by[key] = {**prev, **nxt, "field_values": merged_values}
    revision = _clean(incoming.get("packet_revision")) or _clean(existing.get("packet_revision"))
    return {
        "v": RECIPIENT_SIGNER_STATE_VERSION,
        "packet_revision": revision,
        "by_signer_record_id": merged_by,
    }
