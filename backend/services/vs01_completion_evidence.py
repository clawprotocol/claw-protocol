"""Server-side VS01 recipient completion evidence: assigned fields + versioned consent.

Raw signature values stay in the private execution record. Receipts and logs
receive hashes only. Caller ``signed_at`` never enters evidence.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

from backend.utils.canon_json import canon_json_bytes, sha256_hex

CONSENT_INTENT_VERSION = "lawdog_esign_consent.v1"
CONSENT_ACTION = "agree_and_sign"
CONSENT_INTENT_STATEMENT = (
    "I agree to use an electronic signature. By selecting Agree and sign, I adopt "
    "the completed assigned signature fields as my electronic signature and affirm "
    "my intent to be bound."
)

SIGNATURE_FIELD_TYPES = frozenset({"signature", "initials", "date"})


class CompletionEvidenceError(ValueError):
    def __init__(self, code: str, message: str, *, status_code: int = 400) -> None:
        super().__init__(code)
        self.code = code
        self.message = message
        self.status_code = status_code

    def http_detail(self) -> Dict[str, str]:
        return {"code": self.code, "message": self.message}


@dataclass(frozen=True)
class ValidatedAssignedField:
    field_id: str
    field_type: str
    value: str
    page_index: Optional[int]
    value_sha256: str


@dataclass(frozen=True)
class ValidatedConsent:
    accepted: bool
    intent_version: str
    intent_statement: str
    action: str


@dataclass(frozen=True)
class ValidatedCompletionEvidence:
    assigned_fields: Tuple[ValidatedAssignedField, ...]
    consent: Optional[ValidatedConsent]
    signature_artifact_digest: str
    consent_artifact_digest: str
    packet_revision: str
    document_id: str
    private_record: Dict[str, Any] = field(default_factory=dict)


def _norm(value: Any) -> str:
    return str(value or "").strip()


def locked_packet_fields(draft: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Assigned fields from the locked Quick envelope or VS01 portable packet."""
    env = draft.get("quick_pdf_envelope_v1")
    if isinstance(env, dict) and isinstance(env.get("fields"), list):
        out: List[Dict[str, Any]] = []
        for raw in env["fields"]:
            if not isinstance(raw, dict):
                continue
            fid = _norm(raw.get("field_id") or raw.get("id"))
            if not fid:
                continue
            out.append(
                {
                    "field_id": fid,
                    "field_type": _norm(raw.get("field_type") or raw.get("type") or "signature").lower(),
                    "signer_role_id": _norm(raw.get("signer_role_id") or raw.get("assignedSignerRoleId")),
                    "page_index": raw.get("page_index") if raw.get("page_index") is not None else raw.get("page"),
                }
            )
        if out:
            return out
    stored = draft.get("vs01_signing_packet_v1")
    portable = stored.get("portable") if isinstance(stored, dict) else None
    fields = portable.get("fields") if isinstance(portable, dict) else None
    out = []
    if isinstance(fields, list):
        for raw in fields:
            if not isinstance(raw, dict):
                continue
            fid = _norm(raw.get("id") or raw.get("field_id"))
            if not fid:
                continue
            out.append(
                {
                    "field_id": fid,
                    "field_type": _norm(raw.get("type") or raw.get("field_type") or "signature").lower(),
                    "signer_role_id": _norm(raw.get("assignedSignerRoleId") or raw.get("signer_role_id")),
                    "page_index": raw.get("page") if raw.get("page") is not None else raw.get("page_index"),
                }
            )
    return out


def locked_packet_revision(draft: Dict[str, Any]) -> str:
    env = draft.get("quick_pdf_envelope_v1")
    if isinstance(env, dict):
        rev = _norm(env.get("packet_revision"))
        if rev:
            return rev
    stored = draft.get("vs01_signing_packet_v1")
    if isinstance(stored, dict):
        return _norm(stored.get("packet_revision"))
    return ""


def locked_document_id(draft: Dict[str, Any]) -> str:
    from backend.services.vs01_signer_completion import vs01_packet_document_id

    env = draft.get("quick_pdf_envelope_v1")
    if isinstance(env, dict):
        did = _norm(env.get("document_id"))
        if did:
            return did
    return vs01_packet_document_id(draft)


def parse_consent(raw: Any, *, required: bool) -> Optional[ValidatedConsent]:
    if raw is None or raw == {}:
        if required:
            raise CompletionEvidenceError(
                "consent_required",
                "Affirmative electronic-signature consent is required.",
            )
        return None
    if not isinstance(raw, dict):
        raise CompletionEvidenceError("consent_required", "Affirmative electronic-signature consent is required.")
    accepted = raw.get("accepted") is True
    version = _norm(raw.get("intent_version") or raw.get("version"))
    statement = _norm(raw.get("intent_statement") or raw.get("statement"))
    action = _norm(raw.get("action")).lower().replace("-", "_")
    if required and not accepted:
        raise CompletionEvidenceError(
            "consent_required",
            "Affirmative electronic-signature consent is required.",
        )
    if required and version != CONSENT_INTENT_VERSION:
        raise CompletionEvidenceError(
            "consent_version_mismatch",
            "Consent intent version is not recognized.",
        )
    if required and action != CONSENT_ACTION:
        raise CompletionEvidenceError(
            "consent_action_required",
            "Completion requires the Agree and sign action.",
        )
    if required and statement != CONSENT_INTENT_STATEMENT:
        raise CompletionEvidenceError(
            "consent_statement_mismatch",
            "Consent intent statement does not match the required versioned text.",
        )
    if not accepted:
        return None
    return ValidatedConsent(
        accepted=True,
        intent_version=version or CONSENT_INTENT_VERSION,
        intent_statement=statement or CONSENT_INTENT_STATEMENT,
        action=action or CONSENT_ACTION,
    )


def consent_artifact_digest(consent: Optional[ValidatedConsent]) -> str:
    if consent is None or not consent.accepted:
        return ""
    return sha256_hex(
        canon_json_bytes(
            {
                "accepted": True,
                "action": consent.action,
                "intent_statement": consent.intent_statement,
                "intent_version": consent.intent_version,
            }
        )
    )


def signature_artifact_digest(fields: Sequence[ValidatedAssignedField]) -> str:
    material = [
        {
            "field_id": row.field_id,
            "field_type": row.field_type,
            "page_index": row.page_index,
            "value_sha256": row.value_sha256,
        }
        for row in sorted(fields, key=lambda row: (row.field_id, row.field_type))
    ]
    return sha256_hex(canon_json_bytes(material))


def _page_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def validate_assigned_fields(
    posted: Any,
    *,
    draft: Dict[str, Any],
    signer_role_id: str,
    required: bool,
) -> Tuple[ValidatedAssignedField, ...]:
    locked = locked_packet_fields(draft)
    by_id = {row["field_id"]: row for row in locked}
    assigned_to_signer = [row for row in locked if row["signer_role_id"] == signer_role_id]
    rows = posted if isinstance(posted, list) else []
    out: List[ValidatedAssignedField] = []
    seen: set[str] = set()
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        fid = _norm(raw.get("field_id") or raw.get("id"))
        if not fid:
            raise CompletionEvidenceError("malformed_field", "Each completed field needs a field id.")
        if fid in seen:
            raise CompletionEvidenceError("duplicate_field", "A completed field was submitted twice.")
        seen.add(fid)
        locked_row = by_id.get(fid)
        if locked and locked_row is None:
            raise CompletionEvidenceError(
                "field_not_in_packet",
                "A submitted field is not on the locked signing packet.",
            )
        role = _norm((locked_row or {}).get("signer_role_id"))
        if locked and role and role != signer_role_id:
            raise CompletionEvidenceError(
                "foreign_field",
                "A submitted field belongs to another signer.",
                status_code=403,
            )
        ftype = _norm(raw.get("field_type") or raw.get("type") or (locked_row or {}).get("field_type") or "signature").lower()
        value = str(raw.get("value") or "")
        if ftype in SIGNATURE_FIELD_TYPES and required and not value.strip():
            raise CompletionEvidenceError(
                "signature_required",
                "A required signature field is empty.",
            )
        page = _page_int(raw.get("page_index") if raw.get("page_index") is not None else raw.get("page"))
        if page is None and locked_row is not None:
            page = _page_int(locked_row.get("page_index"))
        out.append(
            ValidatedAssignedField(
                field_id=fid,
                field_type=ftype,
                value=value,
                page_index=page,
                value_sha256=sha256_hex(value.encode("utf-8")),
            )
        )
    if required:
        if assigned_to_signer:
            posted_ids = {row.field_id for row in out}
            missing_sig = [
                row
                for row in assigned_to_signer
                if row["field_type"] == "signature" and row["field_id"] not in posted_ids
            ]
            if missing_sig:
                raise CompletionEvidenceError(
                    "signature_required",
                    "Every assigned signature field must be completed.",
                )
            if not any(row.field_type == "signature" and row.value.strip() for row in out):
                raise CompletionEvidenceError(
                    "signature_required",
                    "A required signature field is empty.",
                )
        elif not any(row.field_type == "signature" and row.value.strip() for row in out):
            raise CompletionEvidenceError(
                "signature_required",
                "A signature is required to complete signing.",
            )
    return tuple(out)


def validate_completion_evidence(
    *,
    draft: Dict[str, Any],
    signer_role_id: str,
    participant_id: str,
    document_id: str,
    packet_revision: str,
    assigned_fields: Any,
    consent: Any,
    required: bool,
) -> ValidatedCompletionEvidence:
    locked_doc = locked_document_id(draft)
    req_doc = _norm(document_id)
    if required and locked_doc and req_doc and locked_doc != req_doc:
        raise CompletionEvidenceError(
            "document_mismatch",
            "This completion is not bound to the locked document.",
            status_code=409,
        )
    locked_rev = locked_packet_revision(draft)
    req_rev = _norm(packet_revision)
    if required and locked_rev and req_rev and locked_rev != req_rev:
        raise CompletionEvidenceError(
            "packet_revision_mismatch",
            "This signing packet was replaced. Ask the sender for a new link.",
            status_code=409,
        )
    fields = validate_assigned_fields(
        assigned_fields,
        draft=draft,
        signer_role_id=signer_role_id,
        required=required,
    )
    accepted = parse_consent(consent, required=required)
    sig_digest = signature_artifact_digest(fields) if fields else ""
    consent_digest = consent_artifact_digest(accepted)
    if required and not consent_digest:
        raise CompletionEvidenceError(
            "consent_required",
            "Affirmative electronic-signature consent is required.",
        )
    private = {
        "signer_role_id": signer_role_id,
        "participant_id": participant_id,
        "document_id": locked_doc or req_doc,
        "packet_revision": locked_rev or req_rev,
        "assigned_fields": [
            {
                "field_id": row.field_id,
                "field_type": row.field_type,
                "value": row.value,
                "page_index": row.page_index,
            }
            for row in fields
        ],
        "consent": (
            {
                "accepted": True,
                "intent_version": accepted.intent_version,
                "intent_statement": accepted.intent_statement,
                "action": accepted.action,
            }
            if accepted
            else None
        ),
        "signature_artifact_digest": sig_digest,
        "consent_artifact_digest": consent_digest,
    }
    return ValidatedCompletionEvidence(
        assigned_fields=fields,
        consent=accepted,
        signature_artifact_digest=sig_digest,
        consent_artifact_digest=consent_digest,
        packet_revision=locked_rev or req_rev,
        document_id=locked_doc or req_doc,
        private_record=private,
    )


def append_private_execution_record(draft: Dict[str, Any], record: Dict[str, Any]) -> Dict[str, Any]:
    """Persist raw field/consent values only on the private execution record."""
    existing = draft.get("vs01_signer_execution_v1")
    bucket = dict(existing) if isinstance(existing, dict) else {"schema": "vs01_signer_execution.v1", "records": []}
    records = list(bucket.get("records") or [])
    event_id = _norm(record.get("event_id"))
    records = [row for row in records if not (isinstance(row, dict) and _norm(row.get("event_id")) == event_id)]
    records.append(record)
    bucket["records"] = records
    next_draft = dict(draft)
    next_draft["vs01_signer_execution_v1"] = bucket
    return next_draft


def existing_completion_digests(draft: Dict[str, Any], signer_role_id: str) -> Optional[Tuple[str, str]]:
    rid = _norm(signer_role_id)
    for event in draft.get("audit_log") or []:
        if not isinstance(event, dict):
            continue
        if _norm(event.get("event_type")) != "signature_completed":
            continue
        val = event.get("value") if isinstance(event.get("value"), dict) else {}
        if _norm(val.get("signer_role_id")) != rid:
            continue
        return (
            _norm(val.get("signature_artifact_digest")),
            _norm(val.get("consent_artifact_digest")),
        )
    return None
