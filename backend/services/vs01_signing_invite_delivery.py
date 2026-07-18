"""Phase 3C1B server-authoritative signing invite delivery."""

from __future__ import annotations

import hashlib
import logging
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import quote

from backend.config.email_config import app_public_origin
from backend.config.signing_invite_delivery_config import signing_invite_delivery_allowed
from backend.security.vs01_recipient_bootstrap_token import (
    VS01_RECIPIENT_BOOTSTRAP_TOKEN_VERSION,
    email_fingerprint,
    jti_fingerprint,
    mint_vs01_recipient_bootstrap_token,
    token_fingerprint,
)
from backend.services.frozen_signing_authority import (
    FrozenSigningAuthorityError,
    build_canonical_frozen_signing_authority,
    materially_identical_frozen_authority,
)
from backend.services.vs01_signing_packet_activation import (
    VS01_SIGNING_PACKET_ACTIVATION_FIELD,
    Vs01SigningPacketActivationError,
    has_active_signing_packet_activation,
)
from backend.utils.agreement_version_store import AgreementVersionStore
from backend.utils.canon_json import canon_json_bytes, canon_sha256_hex

VS01_SIGNING_INVITE_DELIVERY_FIELD = "vs01_signing_invite_delivery_v1"
VS01_SIGNING_INVITE_DELIVERY_VERSION = 1

STATE_PREPARED = "prepared"
STATE_CLAIMED = "claimed"
STATE_DELIVERED = "delivered"
STATE_FAILED = "failed"
STATE_RECONCILIATION_REQUIRED = "reconciliation_required"

TERMINAL_STATES = frozenset({STATE_DELIVERED, STATE_FAILED, STATE_RECONCILIATION_REQUIRED})
IN_FLIGHT_STATES = frozenset({STATE_CLAIMED})

AGGREGATE_DELIVERED = "delivered"
AGGREGATE_PARTIALLY_DELIVERED = "partially_delivered"
AGGREGATE_FAILED = "failed"
AGGREGATE_ALREADY_DELIVERED = "already_delivered"
AGGREGATE_RECONCILIATION_REQUIRED = "reconciliation_required"
AGGREGATE_DELIVERY_DISABLED = "delivery_disabled"

CLAIM_LEASE_SECONDS = 300

_log = logging.getLogger(__name__)


@dataclass(frozen=True)
class ClaimWinnerMaterial:
    delivery_identity: str
    attempt_id: str
    recipient_email: str
    signing_url: str
    provider_idempotency_key: str
    token_jti: str
    token_fp: str


@dataclass(frozen=True)
class RecipientTerminalOutcome:
    delivery_identity: str
    attempt_id: str
    new_state: str
    failure_code: Optional[str] = None
    provider_message_id: Optional[str] = None

ProviderSendFn = Callable[
    [str, str, str, str, str],
    Tuple[bool, Optional[str], Optional[str]],
]
# args: agreement_id, delivery_identity, recipient_email, signing_url_with_fragment, idempotency_key
# returns: (ok, provider_message_id, failure_code)


@dataclass
class Vs01SigningInviteDeliveryError(ValueError):
    code: str
    status_code: int = 400
    detail: Optional[str] = None

    def __str__(self) -> str:
        return self.code


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def compute_delivery_identity(
    *,
    agreement_id: str,
    accepted_version_id: str,
    packet_revision: str,
    signer_record_id: str,
) -> str:
    return ":".join(
        [
            _clean(agreement_id),
            _clean(accepted_version_id),
            _clean(packet_revision),
            _clean(signer_record_id),
        ]
    )


def compute_batch_key(
    *,
    agreement_id: str,
    accepted_version_id: str,
    packet_revision: str,
) -> str:
    return ":".join([_clean(agreement_id), _clean(accepted_version_id), _clean(packet_revision)])


def delivery_batch_material(batch: Dict[str, Any]) -> bytes:
    material = {
        "v": batch.get("v"),
        "batch_key": batch.get("batch_key"),
        "authority": batch.get("authority"),
        "recipients": batch.get("recipients"),
    }
    return canon_json_bytes(material)


def materially_identical_delivery_batch(existing: Dict[str, Any], canonical: Dict[str, Any]) -> bool:
    return delivery_batch_material(existing) == delivery_batch_material(canonical)


def build_signing_url_with_fragment(*, document_id: str, token: str) -> str:
    origin = (app_public_origin() or "").rstrip("/")
    if not origin:
        raise Vs01SigningInviteDeliveryError("app_public_origin_required", 503)
    did = quote(_clean(document_id), safe="")
    tok = quote(_clean(token), safe="")
    return f"{origin}/app/esign/{did}?vs01_recipient_sign=1#t={tok}"


def _append_audit_event(record: Dict[str, Any], *, event_type: str, at: str, detail: Optional[Dict[str, Any]] = None) -> None:
    events = record.setdefault("audit_events", [])
    if not isinstance(events, list):
        events = []
        record["audit_events"] = events
    payload: Dict[str, Any] = {"event_type": event_type, "at": at}
    if detail:
        payload["detail"] = detail
    encoded = canon_json_bytes(payload)
    for existing in events:
        if isinstance(existing, dict) and canon_json_bytes(existing) == encoded:
            return
    events.append(payload)


def _derive_recipients_from_frozen(frozen: Dict[str, Any]) -> List[Dict[str, Any]]:
    signers = frozen.get("signers") or []
    if not isinstance(signers, list) or not signers:
        raise Vs01SigningInviteDeliveryError("frozen_signers_required", 409)
    execution = frozen.get("execution")
    if not isinstance(execution, dict):
        raise Vs01SigningInviteDeliveryError("execution_order_required", 409)
    signer_order = [
        _clean(value) for value in (execution.get("signerOrder") or []) if _clean(value)
    ]
    if not signer_order:
        raise Vs01SigningInviteDeliveryError("execution_signer_order_mismatch", 409)

    signers_by_id = {
        _clean(s.get("signerRecordId")): s
        for s in signers
        if isinstance(s, dict) and _clean(s.get("signerRecordId"))
    }
    if len(signers_by_id) != len(signer_order):
        raise Vs01SigningInviteDeliveryError("execution_signer_order_mismatch", 409)
    if len(set(signer_order)) != len(signer_order):
        raise Vs01SigningInviteDeliveryError("duplicate_signer_record_id", 409)

    parties = {
        _clean(p.get("agreementPartyId")): p
        for p in (frozen.get("parties") or [])
        if isinstance(p, dict) and _clean(p.get("agreementPartyId"))
    }

    derived: List[Dict[str, Any]] = []
    seen_email_identities: set[str] = set()
    for signer_record_id in signer_order:
        signer = signers_by_id.get(signer_record_id)
        if not isinstance(signer, dict):
            raise Vs01SigningInviteDeliveryError("unknown_signer_reference", 409, signer_record_id)
        party_id = _clean(signer.get("agreementPartyId"))
        if party_id not in parties:
            raise Vs01SigningInviteDeliveryError("unknown_party_id", 409, party_id)
        email = _clean(signer.get("signerEmail")).lower()
        if "@" not in email:
            raise Vs01SigningInviteDeliveryError("missing_recipient_email", 409, signer_record_id)
        email_identity = f"{party_id}:{email}"
        if email_identity in seen_email_identities:
            raise Vs01SigningInviteDeliveryError("duplicate_delivery_identity", 409, email_identity)
        seen_email_identities.add(email_identity)
        derived.append(
            {
                "signer_record_id": signer_record_id,
                "party_id": party_id,
                "signer_name": _clean(signer.get("signerName")),
                "signer_title": _clean(signer.get("signerTitle")) or None,
                "signer_email": email,
                "signing_order": int(signer.get("signingOrder")),
            }
        )
    return derived


def _load_validated_frozen_authority(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    version_store: Optional[AgreementVersionStore] = None,
) -> Dict[str, Any]:
    stored = draft.get("frozen_signing_authority_v1")
    if not isinstance(stored, dict):
        raise Vs01SigningInviteDeliveryError("frozen_signing_authority_not_found", 404)
    try:
        canonical = build_canonical_frozen_signing_authority(
            agreement_id=agreement_id,
            candidate=stored,
            frozen_at=_clean(stored.get("frozenAt")),
            version_store=version_store,
        )
    except FrozenSigningAuthorityError as exc:
        raise Vs01SigningInviteDeliveryError(exc.code, exc.status_code, exc.detail) from exc
    if not materially_identical_frozen_authority(stored, canonical):
        raise Vs01SigningInviteDeliveryError("stored_frozen_signing_authority_invalid", 409)
    return stored


def _load_validated_activation(
    *,
    agreement_id: str,
    document_id: str,
    draft: Dict[str, Any],
) -> Dict[str, Any]:
    if not has_active_signing_packet_activation(draft):
        raise Vs01SigningInviteDeliveryError("signing_packet_activation_required", 409)
    activation = draft.get(VS01_SIGNING_PACKET_ACTIVATION_FIELD)
    if not isinstance(activation, dict):
        raise Vs01SigningInviteDeliveryError("signing_packet_activation_required", 409)
    stored_document_id = _clean(activation.get("document_id"))
    if stored_document_id != _clean(document_id):
        raise Vs01SigningInviteDeliveryError("document_id_mismatch", 409)
    return activation


def _validate_authority_bindings(
    *,
    agreement_id: str,
    draft: Dict[str, Any],
    activation: Dict[str, Any],
    signing_lock: Optional[Dict[str, Any]],
    version_store: Optional[AgreementVersionStore] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    frozen = _load_validated_frozen_authority(
        agreement_id=agreement_id,
        draft=draft,
        version_store=version_store,
    )
    accepted_version_id = _clean(frozen.get("acceptedVersionId"))
    accepted_corpus_sha256 = _clean(frozen.get("acceptedCorpusSha256")).lower()
    if not accepted_version_id.startswith("av_"):
        raise Vs01SigningInviteDeliveryError("accepted_version_required", 409)

    activation_av = _clean(activation.get("accepted_version_id"))
    activation_corpus = _clean(activation.get("accepted_corpus_sha256")).lower()
    activation_revision = _clean(activation.get("packet_revision"))
    activation_fah = _clean(activation.get("frozen_authority_material_hash")).lower()
    if activation_av != accepted_version_id:
        raise Vs01SigningInviteDeliveryError("accepted_version_stale", 409)
    if activation_corpus != accepted_corpus_sha256:
        raise Vs01SigningInviteDeliveryError("accepted_corpus_mismatch", 409)

    frozen_material_hash = canon_sha256_hex(
        {key: value for key, value in frozen.items() if key != "frozenAt"}
    ).lower()
    if activation_fah and activation_fah != frozen_material_hash:
        raise Vs01SigningInviteDeliveryError("frozen_authority_stale", 409)

    store = version_store or AgreementVersionStore()
    current = store.get_accepted_version(agreement_id=agreement_id)
    if not current or _clean(current.get("version_id")) != accepted_version_id:
        raise Vs01SigningInviteDeliveryError("accepted_version_stale", 409)
    if _clean(current.get("body_sha256")).lower() != accepted_corpus_sha256:
        raise Vs01SigningInviteDeliveryError("accepted_corpus_mismatch", 409)

    if not isinstance(signing_lock, dict):
        raise Vs01SigningInviteDeliveryError("signing_lock_required", 409)
    locked_version_id = _clean(signing_lock.get("locked_version_id"))
    lock_corpus = _clean(signing_lock.get("content_sha256")).lower()
    lock_accepted = _clean(signing_lock.get("accepted_corpus_sha256")).lower()
    if locked_version_id != accepted_version_id:
        raise Vs01SigningInviteDeliveryError("signing_lock_version_mismatch", 409)
    if lock_corpus != accepted_corpus_sha256:
        raise Vs01SigningInviteDeliveryError("signing_lock_corpus_mismatch", 409)
    if lock_accepted and lock_accepted != accepted_corpus_sha256:
        raise Vs01SigningInviteDeliveryError("signing_lock_corpus_mismatch", 409)

    authority = {
        "document_id": _clean(activation.get("document_id")),
        "accepted_version_id": accepted_version_id,
        "accepted_corpus_sha256": accepted_corpus_sha256,
        "packet_revision": activation_revision,
        "frozen_authority_material_hash": frozen_material_hash,
        "locked_version_id": locked_version_id,
    }
    return frozen, authority


def _build_recipient_record(
    *,
    agreement_id: str,
    authority: Dict[str, Any],
    recipient: Dict[str, Any],
    token_secret: bytes,
    now: str,
) -> Dict[str, Any]:
    delivery_identity = compute_delivery_identity(
        agreement_id=agreement_id,
        accepted_version_id=authority["accepted_version_id"],
        packet_revision=authority["packet_revision"],
        signer_record_id=recipient["signer_record_id"],
    )
    try:
        token, jti, exp = mint_vs01_recipient_bootstrap_token(
            secret=token_secret,
            agreement_id=agreement_id,
            accepted_version_id=authority["accepted_version_id"],
            accepted_corpus_sha256=authority["accepted_corpus_sha256"],
            packet_revision=authority["packet_revision"],
            frozen_authority_material_hash=authority["frozen_authority_material_hash"],
            signer_record_id=recipient["signer_record_id"],
            party_id=recipient["party_id"],
            locked_version_id=authority["locked_version_id"],
        )
    except Exception as exc:
        raise Vs01SigningInviteDeliveryError("token_generation_failed", 500) from exc

    record: Dict[str, Any] = {
        "v": VS01_SIGNING_INVITE_DELIVERY_VERSION,
        "delivery_identity": delivery_identity,
        "signer_record_id": recipient["signer_record_id"],
        "party_id": recipient["party_id"],
        "signer_name": recipient["signer_name"],
        "signer_email_fp": email_fingerprint(recipient["signer_email"]),
        "token_jti": jti,
        "token_fp": token_fingerprint(token),
        "token_exp": exp,
        "token_schema_version": VS01_RECIPIENT_BOOTSTRAP_TOKEN_VERSION,
        "state": STATE_PREPARED,
        "provider_idempotency_key": delivery_identity,
        "provider_message_id": None,
        "attempt_count": 0,
        "failure_code": None,
        "created_at": now,
        "claimed_at": None,
        "completed_at": None,
        "audit_events": [],
        "_signing_url": build_signing_url_with_fragment(
            document_id=authority["document_id"],
            token=token,
        ),
        "_recipient_email": recipient["signer_email"],
    }
    _append_audit_event(record, event_type="delivery_prepared", at=now)
    return record


def validate_delivery_activation_reference(
    *,
    agreement_id: str,
    document_id: str,
    draft: Dict[str, Any],
) -> None:
    """Read-only activation locator checks for disabled delivery (no mint/persist)."""
    _load_validated_activation(
        agreement_id=agreement_id,
        document_id=document_id,
        draft=draft,
    )


def build_delivery_disabled_response(
    *,
    agreement_id: str,
    document_id: str,
    draft: Dict[str, Any],
) -> Dict[str, Any]:
    """Fail-closed disabled path: validate activation reference only, persist nothing."""
    validate_delivery_activation_reference(
        agreement_id=agreement_id,
        document_id=document_id,
        draft=draft,
    )
    _log.info(
        "[signing-invite-delivery] disabled agreement_id=%s document_id=%s",
        agreement_id,
        document_id,
    )
    return delivery_owner_projection(None, delivery_allowed=False)


def build_canonical_delivery_batch(
    *,
    agreement_id: str,
    document_id: str,
    draft: Dict[str, Any],
    signing_lock: Optional[Dict[str, Any]],
    token_secret: bytes,
    attempted_at: str,
    version_store: Optional[AgreementVersionStore] = None,
) -> Dict[str, Any]:
    activation = _load_validated_activation(
        agreement_id=agreement_id,
        document_id=document_id,
        draft=draft,
    )
    frozen, authority = _validate_authority_bindings(
        agreement_id=agreement_id,
        draft=draft,
        activation=activation,
        signing_lock=signing_lock,
        version_store=version_store,
    )
    recipients_derived = _derive_recipients_from_frozen(frozen)
    batch_key = compute_batch_key(
        agreement_id=agreement_id,
        accepted_version_id=authority["accepted_version_id"],
        packet_revision=authority["packet_revision"],
    )
    recipients: Dict[str, Any] = {}
    for recipient in recipients_derived:
        record = _build_recipient_record(
            agreement_id=agreement_id,
            authority=authority,
            recipient=recipient,
            token_secret=token_secret,
            now=attempted_at,
        )
        recipients[record["delivery_identity"]] = record
    return {
        "v": VS01_SIGNING_INVITE_DELIVERY_VERSION,
        "batch_key": batch_key,
        "authority": authority,
        "recipients": recipients,
        "last_attempt_at": attempted_at,
    }


def _sanitize_recipient_projection(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "signer_record_id": record.get("signer_record_id"),
        "party_id": record.get("party_id"),
        "signer_name": record.get("signer_name"),
        "state": record.get("state"),
        "delivery_identity": record.get("delivery_identity"),
        "failure_code": record.get("failure_code"),
        "provider_message_id": record.get("provider_message_id"),
        "attempt_count": record.get("attempt_count"),
        "token_jti_fp": jti_fingerprint(str(record.get("token_jti") or "")),
        "token_exp": record.get("token_exp"),
    }


def compute_aggregate_status(
    *,
    recipients: List[Dict[str, Any]],
    delivery_allowed: bool,
) -> str:
    if not delivery_allowed:
        return AGGREGATE_DELIVERY_DISABLED
    if not recipients:
        return AGGREGATE_FAILED
    states = [str(r.get("state") or "") for r in recipients]
    if all(s == STATE_DELIVERED for s in states):
        if all(int(r.get("attempt_count") or 0) <= 1 for r in recipients):
            return AGGREGATE_DELIVERED
        return AGGREGATE_ALREADY_DELIVERED
    if any(s == STATE_RECONCILIATION_REQUIRED for s in states):
        return AGGREGATE_RECONCILIATION_REQUIRED
    delivered_count = sum(1 for s in states if s == STATE_DELIVERED)
    failed_count = sum(1 for s in states if s == STATE_FAILED)
    if delivered_count > 0 and (failed_count > 0 or any(s in IN_FLIGHT_STATES for s in states)):
        return AGGREGATE_PARTIALLY_DELIVERED
    if failed_count == len(states):
        return AGGREGATE_FAILED
    if delivered_count > 0:
        return AGGREGATE_PARTIALLY_DELIVERED
    in_flight_count = sum(1 for s in states if s in IN_FLIGHT_STATES or s == STATE_PREPARED)
    if in_flight_count > 0:
        return AGGREGATE_PARTIALLY_DELIVERED
    if all(s in TERMINAL_STATES | IN_FLIGHT_STATES | {STATE_PREPARED} for s in states):
        if delivered_count == len(states):
            return AGGREGATE_ALREADY_DELIVERED
    return AGGREGATE_DELIVERY_DISABLED


def delivery_owner_projection(batch: Optional[Dict[str, Any]], *, delivery_allowed: bool) -> Dict[str, Any]:
    if not isinstance(batch, dict):
        return {
            "ok": True,
            "aggregate_status": AGGREGATE_DELIVERY_DISABLED,
            "recipients": [],
            "authority": None,
        }
    recipients = [
        _sanitize_recipient_projection(record)
        for record in (batch.get("recipients") or {}).values()
        if isinstance(record, dict)
    ]
    recipients.sort(key=lambda row: str(row.get("signer_record_id") or ""))
    authority = batch.get("authority") if isinstance(batch.get("authority"), dict) else None
    return {
        "ok": True,
        "aggregate_status": compute_aggregate_status(
            recipients=[r for r in (batch.get("recipients") or {}).values() if isinstance(r, dict)],
            delivery_allowed=delivery_allowed,
        ),
        "recipients": recipients,
        "authority": authority,
        "last_attempt_at": batch.get("last_attempt_at"),
    }


def _utc_epoch() -> int:
    return int(time.time())


def _new_attempt_id() -> str:
    return secrets.token_hex(16)


def _recipient_record_from_canonical(canonical_recipient: Dict[str, Any]) -> Dict[str, Any]:
    record = {
        key: value
        for key, value in canonical_recipient.items()
        if not str(key).startswith("_")
    }
    return record


def _claim_winner_material_from_record(record: Dict[str, Any]) -> ClaimWinnerMaterial:
    signing_url = str(record.pop("_signing_url", "") or "").strip()
    recipient_email = str(record.pop("_recipient_email", "") or "").strip()
    delivery_identity = str(record.get("delivery_identity") or "")
    attempt_id = str(record.get("attempt_id") or "")
    if not signing_url or not recipient_email or not delivery_identity or not attempt_id:
        raise Vs01SigningInviteDeliveryError("claim_winner_material_unavailable", 500)
    return ClaimWinnerMaterial(
        delivery_identity=delivery_identity,
        attempt_id=attempt_id,
        recipient_email=recipient_email,
        signing_url=signing_url,
        provider_idempotency_key=str(record.get("provider_idempotency_key") or delivery_identity),
        token_jti=str(record.get("token_jti") or ""),
        token_fp=str(record.get("token_fp") or ""),
    )


def _promote_recipient_to_claimed(
    record: Dict[str, Any],
    *,
    canonical_recipient: Dict[str, Any],
    attempted_at: str,
    now_epoch: int,
    lease_seconds: int = CLAIM_LEASE_SECONDS,
) -> tuple[ClaimWinnerMaterial, Dict[str, Any]]:
    merged = _recipient_record_from_canonical(canonical_recipient)
    merged.update(
        {
            key: value
            for key, value in record.items()
            if key not in {"state", "attempt_id", "claim_lease_expires_at", "claimed_at", "attempt_count"}
        }
    )
    attempt_id = _new_attempt_id()
    merged["state"] = STATE_CLAIMED
    merged["attempt_id"] = attempt_id
    merged["claim_lease_expires_at"] = now_epoch + max(30, int(lease_seconds))
    merged["claimed_at"] = attempted_at
    merged["attempt_count"] = int(record.get("attempt_count") or 0) + 1
    merged["failure_code"] = None
    merged["_signing_url"] = canonical_recipient.get("_signing_url")
    merged["_recipient_email"] = canonical_recipient.get("_recipient_email")
    _append_audit_event(merged, event_type="delivery_claimed", at=attempted_at)
    material = _claim_winner_material_from_record(dict(merged))
    merged.pop("_signing_url", None)
    merged.pop("_recipient_email", None)
    return material, merged


def _apply_stale_claim_recovery(
    record: Dict[str, Any],
    *,
    attempted_at: str,
    now_epoch: int,
    lease_seconds: int = CLAIM_LEASE_SECONDS,
) -> tuple[Optional[ClaimWinnerMaterial], Dict[str, Any], bool]:
    state = str(record.get("state") or "")
    if state in TERMINAL_STATES:
        return None, record, False
    if state == STATE_PREPARED:
        _transition_recipient_state(
            record,
            new_state=STATE_RECONCILIATION_REQUIRED,
            at=attempted_at,
            failure_code="prepared_without_durable_claim",
        )
        return None, record, True
    if state != STATE_CLAIMED:
        return None, record, False
    lease_expires_at = int(record.get("claim_lease_expires_at") or 0)
    if lease_expires_at > now_epoch:
        return None, record, False
    _transition_recipient_state(
        record,
        new_state=STATE_RECONCILIATION_REQUIRED,
        at=attempted_at,
        failure_code="stale_claim_abandoned",
    )
    return None, record, True


def elect_and_persist_delivery_claims(
    *,
    latest: Dict[str, Any],
    canonical_batch: Dict[str, Any],
    attempted_at: str,
    audit_event: Dict[str, Any],
    claim_lease_seconds: int = CLAIM_LEASE_SECONDS,
) -> tuple[Dict[str, Any], Optional[Dict[str, Any]], bool, List[ClaimWinnerMaterial]]:
    """Atomically elect claim winners and persist durable claimed records."""
    import copy

    canonical_key = str(canonical_batch.get("batch_key") or "")
    existing = latest.get(VS01_SIGNING_INVITE_DELIVERY_FIELD)
    created = False
    if isinstance(existing, dict):
        if str(existing.get("batch_key") or "") != canonical_key:
            raise ValueError("signing_invite_delivery_conflict")
        working_batch = copy.deepcopy(existing)
    else:
        created = True
        working_batch = {
            "v": VS01_SIGNING_INVITE_DELIVERY_VERSION,
            "batch_key": canonical_key,
            "authority": canonical_batch.get("authority"),
            "recipients": {},
            "last_attempt_at": attempted_at,
        }

    now_epoch = _utc_epoch()
    winners: List[ClaimWinnerMaterial] = []
    recipients = dict(working_batch.get("recipients") or {})
    changed = False
    canonical_recipients = canonical_batch.get("recipients") or {}

    for delivery_identity, canonical_recipient in canonical_recipients.items():
        if not isinstance(canonical_recipient, dict):
            continue
        current = recipients.get(delivery_identity)
        if not isinstance(current, dict):
            material, claimed = _promote_recipient_to_claimed(
                {},
                canonical_recipient=canonical_recipient,
                attempted_at=attempted_at,
                now_epoch=now_epoch,
                lease_seconds=claim_lease_seconds,
            )
            winners.append(material)
            recipients[delivery_identity] = claimed
            changed = True
            continue

        material, updated, recipient_changed = _apply_stale_claim_recovery(
            current,
            attempted_at=attempted_at,
            now_epoch=now_epoch,
            lease_seconds=claim_lease_seconds,
        )
        if recipient_changed:
            recipients[delivery_identity] = updated
            changed = True
            continue

        state = str(updated.get("state") or "")
        if state in TERMINAL_STATES:
            recipients[delivery_identity] = updated
            continue
        if state == STATE_CLAIMED:
            recipients[delivery_identity] = updated
            continue
        if state == STATE_PREPARED:
            winner_material, claimed = _promote_recipient_to_claimed(
                updated,
                canonical_recipient=canonical_recipient,
                attempted_at=attempted_at,
                now_epoch=now_epoch,
                lease_seconds=claim_lease_seconds,
            )
            winners.append(winner_material)
            recipients[delivery_identity] = claimed
            changed = True

    working_batch["recipients"] = recipients
    working_batch["last_attempt_at"] = attempted_at

    next_draft: Optional[Dict[str, Any]] = None
    if created or changed:
        next_draft = dict(latest)
        next_draft[VS01_SIGNING_INVITE_DELIVERY_FIELD] = working_batch
        if created:
            audit = list(latest.get("audit_log") or [])
            audit.append(dict(audit_event))
            next_draft["audit_log"] = audit
        next_draft["updated_at"] = attempted_at

    return working_batch, next_draft, created, winners


def execute_provider_for_claim_winners(
    *,
    winners: List[ClaimWinnerMaterial],
    provider_send_fn: ProviderSendFn,
    agreement_id: str,
) -> List[RecipientTerminalOutcome]:
    outcomes: List[RecipientTerminalOutcome] = []
    for winner in winners:
        try:
            ok, provider_message_id, failure_code = provider_send_fn(
                agreement_id,
                winner.delivery_identity,
                winner.recipient_email,
                winner.signing_url,
                winner.provider_idempotency_key,
            )
        except Exception:
            outcomes.append(
                RecipientTerminalOutcome(
                    delivery_identity=winner.delivery_identity,
                    attempt_id=winner.attempt_id,
                    new_state=STATE_RECONCILIATION_REQUIRED,
                    failure_code="provider_exception",
                )
            )
            continue
        if ok:
            outcomes.append(
                RecipientTerminalOutcome(
                    delivery_identity=winner.delivery_identity,
                    attempt_id=winner.attempt_id,
                    new_state=STATE_DELIVERED,
                    provider_message_id=provider_message_id,
                )
            )
        else:
            outcomes.append(
                RecipientTerminalOutcome(
                    delivery_identity=winner.delivery_identity,
                    attempt_id=winner.attempt_id,
                    new_state=STATE_FAILED,
                    failure_code=(failure_code or "provider_send_failed")[:120],
                )
            )
    return outcomes


def merge_recipient_terminal_outcomes_cas(
    existing_batch: Dict[str, Any],
    *,
    outcomes: List[RecipientTerminalOutcome],
    attempted_at: str,
) -> Dict[str, Any]:
    """Compare-and-set merge of terminal outcomes; never regress delivered state."""
    import copy

    if not outcomes:
        return existing_batch
    batch = copy.deepcopy(existing_batch)
    recipients = batch.setdefault("recipients", {})
    if not isinstance(recipients, dict):
        recipients = {}
        batch["recipients"] = recipients
    changed = False
    for outcome in outcomes:
        current = recipients.get(outcome.delivery_identity)
        if not isinstance(current, dict):
            continue
        if str(current.get("state") or "") == STATE_DELIVERED:
            continue
        if str(current.get("attempt_id") or "") != outcome.attempt_id:
            continue
        if str(current.get("state") or "") != STATE_CLAIMED:
            continue
        merged = dict(current)
        _transition_recipient_state(
            merged,
            new_state=outcome.new_state,
            at=attempted_at,
            failure_code=outcome.failure_code,
            provider_message_id=outcome.provider_message_id,
        )
        recipients[outcome.delivery_identity] = merged
        changed = True
    if changed:
        batch["last_attempt_at"] = attempted_at
    return batch


def _transition_recipient_state(
    record: Dict[str, Any],
    *,
    new_state: str,
    at: str,
    failure_code: Optional[str] = None,
    provider_message_id: Optional[str] = None,
) -> None:
    old_state = str(record.get("state") or "")
    if old_state == new_state:
        return
    record["state"] = new_state
    if new_state == STATE_CLAIMED:
        record["claimed_at"] = at
        record["attempt_count"] = int(record.get("attempt_count") or 0) + 1
    if new_state in TERMINAL_STATES:
        record["completed_at"] = at
    if failure_code:
        record["failure_code"] = failure_code
    if provider_message_id:
        record["provider_message_id"] = provider_message_id
    _append_audit_event(
        record,
        event_type=f"delivery_{new_state}",
        at=at,
        detail={
            "from_state": old_state,
            "failure_code": failure_code,
            "provider_message_id": provider_message_id,
        },
    )


def execute_provider_delivery_phase(
    *,
    batch: Dict[str, Any],
    attempted_at: str,
    provider_send_fn: Optional[ProviderSendFn],
    delivery_allowed: bool,
    agreement_id: str,
) -> Dict[str, Any]:
    """Apply provider sends and state transitions to an in-memory batch copy."""
    working = dict(batch)
    recipients = dict(working.get("recipients") or {})
    if not delivery_allowed or provider_send_fn is None:
        working["recipients"] = recipients
        working["last_attempt_at"] = attempted_at
        return working

    for delivery_identity, record in list(recipients.items()):
        if not isinstance(record, dict):
            continue
        state = str(record.get("state") or "")
        if state == STATE_DELIVERED:
            continue
        if state == STATE_RECONCILIATION_REQUIRED:
            continue
        if state == STATE_CLAIMED:
            _transition_recipient_state(
                record,
                new_state=STATE_RECONCILIATION_REQUIRED,
                at=attempted_at,
                failure_code="ambiguous_prior_claim",
            )
            continue
        if state == STATE_FAILED:
            continue
        if state != STATE_PREPARED:
            continue

        signing_url = str(record.get("_signing_url") or "").strip()
        recipient_email = str(record.get("_recipient_email") or "").strip()
        if not signing_url or not recipient_email:
            _transition_recipient_state(
                record,
                new_state=STATE_RECONCILIATION_REQUIRED,
                at=attempted_at,
                failure_code="token_material_unavailable",
            )
            continue

        _transition_recipient_state(record, new_state=STATE_CLAIMED, at=attempted_at)
        record.pop("_signing_url", None)
        record.pop("_recipient_email", None)
        idempotency_key = str(record.get("provider_idempotency_key") or delivery_identity)
        try:
            ok, provider_message_id, failure_code = provider_send_fn(
                agreement_id,
                delivery_identity,
                recipient_email,
                signing_url,
                idempotency_key,
            )
        except Exception:
            _transition_recipient_state(
                record,
                new_state=STATE_RECONCILIATION_REQUIRED,
                at=attempted_at,
                failure_code="provider_exception",
            )
            continue
        if ok:
            _transition_recipient_state(
                record,
                new_state=STATE_DELIVERED,
                at=attempted_at,
                provider_message_id=provider_message_id,
            )
        else:
            sanitized = (failure_code or "provider_send_failed")[:120]
            _transition_recipient_state(
                record,
                new_state=STATE_FAILED,
                at=attempted_at,
                failure_code=sanitized,
            )

    working["recipients"] = recipients
    working["last_attempt_at"] = attempted_at
    return working


def strip_ephemeral_delivery_fields(batch: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = dict(batch)
    recipients = {}
    for key, record in (cleaned.get("recipients") or {}).items():
        if not isinstance(record, dict):
            continue
        row = dict(record)
        row.pop("_signing_url", None)
        row.pop("_recipient_email", None)
        recipients[key] = row
    cleaned["recipients"] = recipients
    return cleaned
