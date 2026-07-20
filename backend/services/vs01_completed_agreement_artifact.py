"""Backend-authoritative immutable completed-agreement artifact (Phase 3C3)."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from backend.services.frozen_signing_authority import FROZEN_SIGNING_AUTHORITY_VERSION
from backend.services.recipient_session_signing_mutations import (
    VS01_RECIPIENT_SIGNER_STATE_FIELD,
    compute_signer_readiness,
)
from backend.services.vs01_fully_executed_snapshot import (
    ensure_fully_executed_snapshot_on_draft,
    reconstruct_corpus_from_audit_and_portable,
)
from backend.services.vs01_signer_completion import (
    all_signers_signed_from_audit,
    build_fully_executed_signed_event,
    completed_vs01_signer_role_ids,
    fully_executed_signed_already_recorded,
    merge_portable_packet_corpus,
    required_vs01_signer_role_ids,
    signer_role_already_completed,
    vs01_packet_document_id,
)
from backend.services.vs01_signing_packet_activation import (
    VS01_SIGNING_PACKET_ACTIVATION_FIELD,
    activation_binding_material,
)
from backend.utils.agreement_version_store import AgreementVersionStore
from backend.utils.canon_json import canon_json_bytes, canon_sha256_hex, sha256_hex

VS01_COMPLETED_AGREEMENT_ARTIFACT_FIELD = "vs01_completed_agreement_artifact_v1"
VS01_COMPLETED_AGREEMENT_ARTIFACT_VERSION = 1
_ARTIFACT_NON_MATERIAL_KEYS = frozenset({"completion_timestamp", "material_hash"})


class CompletedAgreementArtifactError(Exception):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class CompletedAgreementArtifactConflictError(CompletedAgreementArtifactError):
    """Materially different artifact already established."""


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _fingerprint_corpus(corpus: str) -> str:
    return hashlib.sha256((corpus or "").encode("utf-8")).hexdigest()


def _frozen_material_hash(frozen: Dict[str, Any]) -> str:
    material = {key: value for key, value in frozen.items() if key != "frozenAt"}
    return canon_sha256_hex(material)


def read_completed_artifact_from_draft(draft: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    stored = draft.get(VS01_COMPLETED_AGREEMENT_ARTIFACT_FIELD)
    if not isinstance(stored, dict):
        return None
    if int(stored.get("v") or 0) != VS01_COMPLETED_AGREEMENT_ARTIFACT_VERSION:
        return None
    material_hash = _clean(stored.get("material_hash")).lower()
    if len(material_hash) != 64:
        return None
    return stored


def completed_artifact_ready(draft: Dict[str, Any]) -> bool:
    return read_completed_artifact_from_draft(draft) is not None


def completed_artifact_material_bytes(record: Dict[str, Any]) -> bytes:
    material = {key: value for key, value in record.items() if key not in _ARTIFACT_NON_MATERIAL_KEYS}
    return canon_json_bytes(material)


def completed_artifact_material_hash(record: Dict[str, Any]) -> str:
    return sha256_hex(completed_artifact_material_bytes(record))


def _activation_record_optional(draft: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    activation = draft.get(VS01_SIGNING_PACKET_ACTIVATION_FIELD)
    if not isinstance(activation, dict):
        return None
    if _clean(activation.get("packet_state")) != "active":
        return None
    return activation


def _activation_record(draft: Dict[str, Any]) -> Dict[str, Any]:
    activation = _activation_record_optional(draft)
    if not activation:
        raise CompletedAgreementArtifactError("activation_missing")
    return activation


def _frozen_record(draft: Dict[str, Any]) -> Dict[str, Any]:
    frozen = draft.get("frozen_signing_authority_v1")
    if not isinstance(frozen, dict):
        raise CompletedAgreementArtifactError("frozen_authority_missing")
    if int(frozen.get("version") or 0) != FROZEN_SIGNING_AUTHORITY_VERSION:
        raise CompletedAgreementArtifactError("frozen_authority_version_mismatch")
    return frozen


def _signing_lock_record(signing_lock: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(signing_lock, dict):
        raise CompletedAgreementArtifactError("signing_lock_missing")
    locked_version_id = _clean(signing_lock.get("locked_version_id"))
    content_sha256 = _clean(signing_lock.get("content_sha256")).lower()
    if not locked_version_id or len(content_sha256) != 64:
        raise CompletedAgreementArtifactError("signing_lock_invalid")
    return {
        "locked_version_id": locked_version_id,
        "content_sha256": content_sha256,
        "locked_at": _clean(signing_lock.get("locked_at")) or None,
    }


def _role_id_for_signer_record(portable: Dict[str, Any], signer_record_id: str) -> str:
    roles = portable.get("roles") if isinstance(portable.get("roles"), list) else []
    sid = _clean(signer_record_id)
    for role in roles:
        if not isinstance(role, dict):
            continue
        if _clean(role.get("signerRecordId")) == sid:
            return _clean(role.get("roleId"))
    return ""


def _signer_record_for_role(portable: Dict[str, Any], role_id: str) -> str:
    roles = portable.get("roles") if isinstance(portable.get("roles"), list) else []
    rid = _clean(role_id)
    for role in roles:
        if not isinstance(role, dict):
            continue
        if _clean(role.get("roleId")) == rid:
            return _clean(role.get("signerRecordId"))
    return ""


def _has_session_signer_state(draft: Dict[str, Any]) -> bool:
    activation = draft.get(VS01_SIGNING_PACKET_ACTIVATION_FIELD)
    if not isinstance(activation, dict):
        return False
    packet_revision = _clean(activation.get("packet_revision"))
    signer_root = draft.get(VS01_RECIPIENT_SIGNER_STATE_FIELD)
    if not isinstance(signer_root, dict):
        return False
    return _clean(signer_root.get("packet_revision")) == packet_revision


def assemble_portable_with_session_field_values(draft: Dict[str, Any]) -> Dict[str, Any]:
    """Merge authoritative session signer field values into the activation portable packet."""
    activation = _activation_record(draft)
    portable = activation.get("portable")
    if not isinstance(portable, dict):
        raise CompletedAgreementArtifactError("activation_portable_missing")
    packet_revision = _clean(activation.get("packet_revision"))
    signer_root = draft.get(VS01_RECIPIENT_SIGNER_STATE_FIELD)
    if not isinstance(signer_root, dict):
        raise CompletedAgreementArtifactError("signer_state_missing")
    if _clean(signer_root.get("packet_revision")) != packet_revision:
        raise CompletedAgreementArtifactError("signer_state_revision_mismatch")
    by_signer = signer_root.get("by_signer_record_id")
    if not isinstance(by_signer, dict):
        by_signer = {}

    fields = list(portable.get("fields") or [])
    next_fields: List[Dict[str, Any]] = []
    for field in fields:
        if not isinstance(field, dict):
            continue
        next_field = dict(field)
        assigned_role = _clean(field.get("assignedSignerRoleId"))
        signer_record_id = _signer_record_for_role(portable, assigned_role) if assigned_role else ""
        if signer_record_id:
            signer_state = by_signer.get(signer_record_id)
            if isinstance(signer_state, dict):
                fid = _clean(field.get("id"))
                raw = (signer_state.get("field_values") or {}).get(fid)
                if isinstance(raw, dict):
                    value = _clean(raw.get("value"))
                    if value:
                        next_field["value"] = value
        next_fields.append(next_field)

    return {**portable, "fields": next_fields}


def _resolve_portable_for_completion(draft: Dict[str, Any]) -> Dict[str, Any]:
    if _has_session_signer_state(draft):
        return assemble_portable_with_session_field_values(draft)
    activation = _activation_record_optional(draft)
    if activation is not None:
        portable = activation.get("portable")
        if isinstance(portable, dict):
            return portable
    stored = draft.get("vs01_signing_packet_v1")
    if isinstance(stored, dict):
        packet_portable = stored.get("portable")
        if isinstance(packet_portable, dict):
            return packet_portable
    raise CompletedAgreementArtifactError("portable_packet_missing")


def _field_assignment_manifest(portable: Dict[str, Any]) -> List[Dict[str, Any]]:
    manifest: List[Dict[str, Any]] = []
    for field in portable.get("fields") or []:
        if not isinstance(field, dict):
            continue
        field_type = _clean(field.get("type"))
        if field_type not in {"signature", "initials"}:
            continue
        manifest.append(
            {
                "field_id": _clean(field.get("id")),
                "field_type": field_type,
                "assigned_signer_role_id": _clean(field.get("assignedSignerRoleId")),
                "assigned_party_id": _clean(field.get("counterpartyId")),
            }
        )
    return manifest


def _final_field_values(draft: Dict[str, Any], portable: Dict[str, Any]) -> Dict[str, Any]:
    signer_root = draft.get(VS01_RECIPIENT_SIGNER_STATE_FIELD)
    by_signer = signer_root.get("by_signer_record_id") if isinstance(signer_root, dict) else {}
    if not isinstance(by_signer, dict):
        by_signer = {}
    out: Dict[str, Any] = {}
    for signer_record_id, signer_state in by_signer.items():
        if not isinstance(signer_state, dict):
            continue
        field_values = signer_state.get("field_values")
        if not isinstance(field_values, dict):
            continue
        role_id = _role_id_for_signer_record(portable, _clean(signer_record_id))
        projected: Dict[str, Any] = {}
        for fid, raw in field_values.items():
            if not isinstance(raw, dict):
                continue
            value = _clean(raw.get("value"))
            if not value:
                continue
            projected[_clean(fid)] = {
                "value": value,
                "revision": raw.get("revision"),
            }
        if projected:
            out[_clean(signer_record_id)] = {
                "signer_role_id": role_id,
                "field_values": projected,
            }
    return out


def _signer_completion_actions(draft: Dict[str, Any], portable: Dict[str, Any]) -> List[Dict[str, Any]]:
    actions: List[Dict[str, Any]] = []
    roles = portable.get("roles") if isinstance(portable.get("roles"), list) else []
    role_by_id = {
        _clean(role.get("roleId")): role
        for role in roles
        if isinstance(role, dict) and _clean(role.get("roleId"))
    }
    for event in draft.get("audit_log") or []:
        if not isinstance(event, dict):
            continue
        if _clean(event.get("event_type")) != "signature_completed":
            continue
        val = event.get("value")
        if not isinstance(val, dict):
            continue
        role_id = _clean(val.get("signer_role_id"))
        role = role_by_id.get(role_id) or {}
        actions.append(
            {
                "signer_role_id": role_id,
                "signer_record_id": _clean(role.get("signerRecordId")),
                "party_id": _clean(val.get("participant_id")),
                "display_name": _clean(val.get("participant_display_name")),
                "signed_at": _clean(event.get("at")),
                "signed_date_iso": _clean(val.get("signed_date_iso")),
                "locked_version_id": _clean(val.get("locked_version_id")),
                "agreement_version_hash": _clean(val.get("agreement_version_hash")).lower(),
            }
        )
    return actions


def _validate_signer_states_complete(draft: Dict[str, Any], portable: Dict[str, Any]) -> None:
    activation = _activation_record(draft)
    packet_revision = _clean(activation.get("packet_revision"))
    signer_root = draft.get(VS01_RECIPIENT_SIGNER_STATE_FIELD)
    if not isinstance(signer_root, dict):
        raise CompletedAgreementArtifactError("signer_state_missing")
    if _clean(signer_root.get("packet_revision")) != packet_revision:
        raise CompletedAgreementArtifactError("signer_state_revision_mismatch")
    by_signer = signer_root.get("by_signer_record_id")
    if not isinstance(by_signer, dict):
        by_signer = {}

    frozen = _frozen_record(draft)
    signers = frozen.get("signers") if isinstance(frozen.get("signers"), list) else []
    audit = draft.get("audit_log") or []
    completed_roles = completed_vs01_signer_role_ids(audit)

    for signer in signers:
        if not isinstance(signer, dict):
            raise CompletedAgreementArtifactError("frozen_signer_invalid")
        signer_record_id = _clean(signer.get("signerRecordId"))
        role_id = _role_id_for_signer_record(portable, signer_record_id)
        if not role_id:
            raise CompletedAgreementArtifactError("signer_role_binding_missing")
        if role_id not in completed_roles:
            raise CompletedAgreementArtifactError("signer_not_complete")

        signer_state = by_signer.get(signer_record_id)
        if not isinstance(signer_state, dict):
            raise CompletedAgreementArtifactError("signer_state_missing_for_record")
        session = {
            "signer_record_id": signer_record_id,
            "party_id": _clean(signer.get("agreementPartyId")),
            "signer_display_name": _clean(signer.get("signerName")),
            "document_id": _clean(activation.get("document_id")),
        }
        readiness = compute_signer_readiness(session=session, draft=draft, signer_state=signer_state)
        if not readiness.get("finish_ready") and not readiness.get("signer_complete"):
            raise CompletedAgreementArtifactError("signer_fields_incomplete")


def _validate_authority_bindings(
    *,
    draft: Dict[str, Any],
    signing_lock: Optional[Dict[str, Any]],
    portable: Dict[str, Any],
) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]], Dict[str, Any]]:
    agreement_id = _clean(draft.get("id"))
    if not agreement_id:
        raise CompletedAgreementArtifactError("agreement_id_missing")

    frozen = _frozen_record(draft)
    activation = _activation_record_optional(draft)
    lock = _signing_lock_record(signing_lock)

    accepted_version_id = _clean(frozen.get("acceptedVersionId"))
    accepted_corpus_sha256 = _clean(frozen.get("acceptedCorpusSha256")).lower()
    if lock["locked_version_id"] != accepted_version_id:
        raise CompletedAgreementArtifactError("signing_lock_version_mismatch")
    if lock["content_sha256"] != accepted_corpus_sha256:
        raise CompletedAgreementArtifactError("signing_lock_hash_mismatch")

    if activation is not None:
        if _clean(activation.get("accepted_version_id")) != accepted_version_id:
            raise CompletedAgreementArtifactError("activation_version_mismatch")
        if _clean(activation.get("accepted_corpus_sha256")).lower() != accepted_corpus_sha256:
            raise CompletedAgreementArtifactError("activation_corpus_mismatch")
        if _clean(activation.get("frozen_authority_material_hash")).lower() != _frozen_material_hash(frozen):
            raise CompletedAgreementArtifactError("frozen_hash_mismatch")

        document_id = _clean(activation.get("document_id"))
        if document_id and document_id != vs01_packet_document_id(draft):
            stored_doc = vs01_packet_document_id(draft)
            if stored_doc and stored_doc != document_id:
                raise CompletedAgreementArtifactError("document_id_mismatch")

        packet_revision = _clean(activation.get("packet_revision"))
        if not packet_revision:
            raise CompletedAgreementArtifactError("packet_revision_missing")
    else:
        packet_revision = ""

    store = AgreementVersionStore()
    current = store.get_accepted_version(agreement_id=agreement_id)
    if not current or _clean(current.get("version_id")) != accepted_version_id:
        raise CompletedAgreementArtifactError("accepted_version_stale")
    if _clean(current.get("body_sha256")).lower() != accepted_corpus_sha256:
        raise CompletedAgreementArtifactError("accepted_corpus_mismatch")

    # Validate signer order matches frozen authority
    frozen_signers = frozen.get("signers") if isinstance(frozen.get("signers"), list) else []
    execution = frozen.get("execution") if isinstance(frozen.get("execution"), dict) else {}
    expected_order = execution.get("signerOrder")
    if not isinstance(expected_order, list):
        raise CompletedAgreementArtifactError("execution_order_missing")
    actual_order = [
        _clean(signer.get("signerRecordId"))
        for signer in sorted(
            [s for s in frozen_signers if isinstance(s, dict)],
            key=lambda s: int(s.get("signingOrder") or 0),
        )
    ]
    if actual_order != [_clean(s) for s in expected_order]:
        raise CompletedAgreementArtifactError("signer_order_mismatch")

    return frozen, activation, lock


def build_completed_artifact_record(
    *,
    draft: Dict[str, Any],
    signing_lock: Optional[Dict[str, Any]],
    portable: Dict[str, Any],
    completed_corpus_sha256: str,
    completion_timestamp: str,
) -> Dict[str, Any]:
    frozen, activation, lock = _validate_authority_bindings(
        draft=draft, signing_lock=signing_lock, portable=portable
    )
    agreement_id = _clean(draft.get("id"))
    accepted_version_id = _clean(frozen.get("acceptedVersionId"))
    accepted_corpus_sha256 = _clean(frozen.get("acceptedCorpusSha256")).lower()

    record: Dict[str, Any] = {
        "v": VS01_COMPLETED_AGREEMENT_ARTIFACT_VERSION,
        "agreement_id": agreement_id,
        "accepted_version_id": accepted_version_id,
        "accepted_corpus_sha256": accepted_corpus_sha256,
        "accepted_corpus_ref": accepted_version_id,
        "frozen_authority_material_hash": _frozen_material_hash(frozen),
        "parties": list(frozen.get("parties") or []),
        "signers": list(frozen.get("signers") or []),
        "execution": dict(frozen.get("execution") or {}),
        "packet_document_id": _clean((activation or {}).get("document_id")) or vs01_packet_document_id(draft),
        "packet_revision": _clean((activation or {}).get("packet_revision")),
        "signing_lock": lock,
        "field_assignment_manifest": _field_assignment_manifest(portable),
        "final_field_values": _final_field_values(draft, portable),
        "signer_completion_actions": _signer_completion_actions(draft, portable),
        "completed_corpus_sha256": _clean(completed_corpus_sha256).lower(),
        "proof_receipt": {
            "agreement_id": agreement_id,
            "accepted_version_id": accepted_version_id,
            "packet_revision": _clean((activation or {}).get("packet_revision")),
            "completed_corpus_sha256": _clean(completed_corpus_sha256).lower(),
            "frozen_authority_material_hash": _frozen_material_hash(frozen),
        },
        "completion_timestamp": completion_timestamp,
    }
    record["material_hash"] = completed_artifact_material_hash(record)
    return record


def revalidate_completed_artifact(
    draft: Dict[str, Any],
    *,
    signing_lock: Optional[Dict[str, Any]] = None,
) -> bool:
    artifact = read_completed_artifact_from_draft(draft)
    if not artifact:
        return False
    stored_hash = _clean(artifact.get("material_hash")).lower()
    if stored_hash != completed_artifact_material_hash(artifact):
        return False
    try:
        activation = _activation_record_optional(draft)
        if activation is not None:
            portable = activation.get("portable")
            if not isinstance(portable, dict):
                return False
            _validate_authority_bindings(draft=draft, signing_lock=signing_lock, portable=portable)
        else:
            stored = draft.get("vs01_signing_packet_v1")
            portable = stored.get("portable") if isinstance(stored, dict) else None
            if not isinstance(portable, dict):
                return False
            _validate_authority_bindings(draft=draft, signing_lock=signing_lock, portable=portable)
    except CompletedAgreementArtifactError:
        return False
    if _clean(artifact.get("agreement_id")) != _clean(draft.get("id")):
        return False
    return True


def public_completed_artifact_projection(artifact: Dict[str, Any]) -> Dict[str, Any]:
    """Safe public projection — no signer emails, session data, or internal blobs."""
    return {
        "schema": "claw.agreement.completed_artifact/v1",
        "agreement_id": _clean(artifact.get("agreement_id")),
        "accepted_version_id": _clean(artifact.get("accepted_version_id")),
        "accepted_corpus_sha256": _clean(artifact.get("accepted_corpus_sha256")).lower(),
        "packet_document_id": _clean(artifact.get("packet_document_id")),
        "packet_revision": _clean(artifact.get("packet_revision")),
        "completed_corpus_sha256": _clean(artifact.get("completed_corpus_sha256")).lower(),
        "material_hash": _clean(artifact.get("material_hash")).lower(),
        "completion_timestamp": _clean(artifact.get("completion_timestamp")),
        "signer_count": len(artifact.get("signer_completion_actions") or []),
    }


@dataclass(frozen=True)
class EstablishCompletedArtifactResult:
    draft_dict: Dict[str, Any]
    artifact: Dict[str, Any]
    created: bool
    globally_executed: bool


def _bind_authoritative_snapshot_from_corpus(
    draft_dict: Dict[str, Any],
    portable: Dict[str, Any],
    *,
    corpus: str,
    completed_corpus_sha256: str,
    completion_timestamp: str,
) -> Dict[str, Any]:
    """Bind fully-executed snapshot from backend-reconstructed session completion corpus."""
    stored = draft_dict.get("vs01_signing_packet_v1")
    if not isinstance(stored, dict):
        stored = {"v": 1}
    seed = portable.get("seed") if isinstance(portable.get("seed"), dict) else {}
    built = {
        "v": 1,
        "corpus_plain": corpus,
        "corpus_hash": completed_corpus_sha256,
        "saved_at": completion_timestamp,
        "signer_role_ids": sorted(required_vs01_signer_role_ids(draft_dict)),
    }
    next_portable = {
        **portable,
        "seed": {
            **seed,
            "corpusPlain": corpus,
            "corpusHash": completed_corpus_sha256,
        },
    }
    return {
        **draft_dict,
        "vs01_signing_packet_v1": {
            **stored,
            "portable": next_portable,
            "fully_executed_snapshot": built,
        },
    }


def establish_completed_artifact_on_draft(
    draft: Dict[str, Any],
    *,
    signing_lock: Optional[Dict[str, Any]],
    now_iso: Optional[str] = None,
) -> EstablishCompletedArtifactResult:
    """
    Establish exactly one completed artifact when all signers are complete.

    Caller must hold agreement row/file lock. No provider calls inside.
    """
    completion_timestamp = (now_iso or _utc_now_iso()).strip()
    existing = read_completed_artifact_from_draft(draft)
    audit = list(draft.get("audit_log") or [])
    draft_dict = dict(draft)

    if not all_signers_signed_from_audit(draft_dict, audit):
        raise CompletedAgreementArtifactError("signers_incomplete")

    portable = _resolve_portable_for_completion(draft_dict)
    if _has_session_signer_state(draft_dict):
        _validate_signer_states_complete(draft_dict, portable)

    draft_dict = merge_portable_packet_corpus(draft_dict, portable)
    corpus = reconstruct_corpus_from_audit_and_portable(draft_dict)
    if not corpus or len(corpus.strip()) < 80:
        raise CompletedAgreementArtifactError("completed_corpus_unavailable")
    completed_corpus_sha256 = _fingerprint_corpus(corpus)

    candidate = build_completed_artifact_record(
        draft=draft_dict,
        signing_lock=signing_lock,
        portable=portable,
        completed_corpus_sha256=completed_corpus_sha256,
        completion_timestamp=completion_timestamp,
    )
    candidate_hash = _clean(candidate.get("material_hash")).lower()

    if existing:
        existing_hash = _clean(existing.get("material_hash")).lower()
        if existing_hash == candidate_hash:
            return EstablishCompletedArtifactResult(
                draft_dict=draft_dict,
                artifact=existing,
                created=False,
                globally_executed=True,
            )
        raise CompletedAgreementArtifactConflictError("completed_artifact_conflict")

    if not fully_executed_signed_already_recorded(audit):
        agreement_version_hash = None
        if isinstance(signing_lock, dict):
            agreement_version_hash = _clean(signing_lock.get("content_sha256")).lower() or None
        audit.append(
            build_fully_executed_signed_event(
                signed_at=completion_timestamp,
                agreement_version_hash=agreement_version_hash,
            )
        )
        draft_dict = {**draft_dict, "audit_log": audit, "updated_at": completion_timestamp}

    ensured = ensure_fully_executed_snapshot_on_draft(draft_dict, agreement_id=_clean(draft_dict.get("id")))
    if ensured.snapshot_ready:
        draft_dict = ensured.draft_dict
    else:
        draft_dict = _bind_authoritative_snapshot_from_corpus(
            draft_dict,
            portable,
            corpus=corpus,
            completed_corpus_sha256=completed_corpus_sha256,
            completion_timestamp=completion_timestamp,
        )

    snap = (draft_dict.get("vs01_signing_packet_v1") or {}).get("fully_executed_snapshot")
    if isinstance(snap, dict):
        snap_hash = _clean(snap.get("corpus_hash")).lower()
        if snap_hash and snap_hash != completed_corpus_sha256:
            candidate = {
                **candidate,
                "completed_corpus_sha256": snap_hash,
            }
            candidate["proof_receipt"] = {
                **candidate.get("proof_receipt", {}),
                "completed_corpus_sha256": snap_hash,
            }
            candidate["material_hash"] = completed_artifact_material_hash(candidate)

    draft_dict = {**draft_dict, VS01_COMPLETED_AGREEMENT_ARTIFACT_FIELD: candidate}
    return EstablishCompletedArtifactResult(
        draft_dict=draft_dict,
        artifact=candidate,
        created=True,
        globally_executed=True,
    )


def owner_completed_artifact_projection(artifact: Dict[str, Any]) -> Dict[str, Any]:
    """Owner-safe projection including binding metadata for hydration parity."""
    return {
        **public_completed_artifact_projection(artifact),
        "frozen_authority_material_hash": _clean(artifact.get("frozen_authority_material_hash")).lower(),
        "signing_lock": artifact.get("signing_lock"),
        "signer_completion_actions": artifact.get("signer_completion_actions") or [],
    }


def read_artifact_bound_corpus_plain(
    draft: Dict[str, Any],
    *,
    signing_lock: Optional[Dict[str, Any]] = None,
) -> str:
    """Return completed corpus text only when a revalidated artifact binds the snapshot hash."""
    from backend.services.vs01_signer_completion import read_fully_executed_snapshot_from_draft

    artifact = read_completed_artifact_from_draft(draft)
    if not artifact or not revalidate_completed_artifact(draft, signing_lock=signing_lock):
        return ""
    snap = read_fully_executed_snapshot_from_draft(draft)
    if not isinstance(snap, dict):
        return ""
    corpus = str(snap.get("corpus_plain") or "").strip()
    if len(corpus) < 80:
        return ""
    artifact_hash = _clean(artifact.get("completed_corpus_sha256")).lower()
    snap_hash = _clean(snap.get("corpus_hash")).lower()
    if artifact_hash:
        bound_hash = snap_hash or _fingerprint_corpus(corpus)
        if bound_hash != artifact_hash:
            return ""
    return corpus


def count_fully_executed_signed_audit_events(audit: Any) -> int:
    count = 0
    for event in audit or []:
        if not isinstance(event, dict):
            continue
        if str(event.get("event_type") or "") != "signed":
            continue
        val = event.get("value")
        if isinstance(val, dict) and val.get("fully_executed"):
            count += 1
    return count
