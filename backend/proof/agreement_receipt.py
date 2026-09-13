from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from utils.canon_json import canon_sha256_hex

from backend.config.anchor_network_config import agreement_receipt_protocol_version

_RECEIPT_STABLE_IDENTITY_FIELDS: Tuple[str, ...] = (
    "receipt_id",
    "protocol_version",
    "network",
    "epoch_id",
    "timeline_id",
    "commitment",
    "issued_at",
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _validate_hex64(label: str, value: str) -> str:
    v = (value or "").strip().lower()
    if len(v) != 64 or any(c not in "0123456789abcdef" for c in v):
        raise ValueError(f"{label} must be a 64-character lowercase hex string")
    return v


def _receipt_payload_for_hash(receipt: Dict[str, Any]) -> Dict[str, Any]:
    return {k: receipt.get(k, None) for k in _RECEIPT_STABLE_IDENTITY_FIELDS}


def _compute_receipt_hash(receipt: Dict[str, Any]) -> str:
    """Same stable identity field set as timeline receipts / verify_handler."""
    return canon_sha256_hex(_receipt_payload_for_hash(receipt))


def build_agreement_receipt_body(
    *,
    agreement_id: str,
    finalized_version_id: str,
    finalized_at: str,
    content_sha256: str,
    execution_packet_sha256: str,
    parties_sha256: Optional[str] = None,
    signer_count: Optional[int] = None,
) -> Dict[str, Any]:
    _parse_rfc3339(finalized_at)
    body: Dict[str, Any] = {
        "receipt_type": "agreement_finalized",
        "agreement_id": agreement_id,
        "finalized_version_id": finalized_version_id,
        "finalized_at": finalized_at,
        "content_sha256": _validate_hex64("content_sha256", content_sha256),
        "execution_packet_sha256": _validate_hex64(
            "execution_packet_sha256", execution_packet_sha256
        ),
    }
    if parties_sha256 is not None:
        body["parties_sha256"] = _validate_hex64("parties_sha256", parties_sha256)
    if signer_count is not None:
        if not isinstance(signer_count, int) or signer_count < 0:
            raise ValueError("signer_count must be a non-negative integer when present")
        body["signer_count"] = signer_count
    return dict(sorted(body.items()))


def _parse_rfc3339(s: str) -> None:
    try:
        datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception as exc:
        raise ValueError("finalized_at must be RFC3339 / ISO-8601") from exc


def agreement_commitment_sha256_from_body(body: Dict[str, Any]) -> str:
    """Deterministic digest of the finalized artifact (hashed object only)."""
    return canon_sha256_hex(dict(sorted(body.items())))


def build_drafted_ceremony_execution_packet(
    *,
    agreement_id: str,
    locked_version_id: str,
    accepted_snapshot_id: str,
    accepted_snapshot_digest: str,
    required_participant_ids: List[str],
    completion_events: List[Dict[str, Any]],
    finalized_at: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Durable execution-packet bindings for a drafted ceremony receipt.

    Distinct required participant ids are stored as a set. Duplicate completion
    events cannot substitute for a missing required signer.
    """
    required: List[str] = []
    seen_required = set()
    for raw in required_participant_ids:
        pid = str(raw or "").strip()
        if not pid or pid in seen_required:
            continue
        seen_required.add(pid)
        required.append(pid)
    required.sort()
    events: List[Dict[str, Any]] = []
    seen_events = set()
    for raw in completion_events:
        if not isinstance(raw, dict):
            continue
        pid = str(raw.get("participantId") or raw.get("participant_id") or "").strip()
        if not pid or pid in seen_events:
            continue
        seen_events.add(pid)
        events.append(
            {
                "eventType": str(raw.get("eventType") or raw.get("event_type") or "signature_completed"),
                "participantId": pid,
                "at": raw.get("at"),
                "lockedVersionId": str(
                    raw.get("lockedVersionId") or raw.get("locked_version_id") or locked_version_id
                ).strip(),
            }
        )
    digest = (accepted_snapshot_digest or "").strip().lower()
    packet: Dict[str, Any] = {
        "schema": "agreement_execution_packet.v1",
        "agreementId": str(agreement_id or "").strip(),
        "finalizedVersionId": str(locked_version_id or "").strip(),
        "lockedVersionId": str(locked_version_id or "").strip(),
        "acceptedSnapshotId": str(accepted_snapshot_id or "").strip(),
        "acceptedSnapshotDigest": digest,
        "requiredParticipantIds": required,
        "completionEvents": events,
        "signerCount": len(required),
    }
    finalized = str(finalized_at or "").strip()
    if finalized:
        packet["finalizedAt"] = finalized
    return packet


def verify_receipt_identity_hash(receipt: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """Verify stored receipt_hash_sha256 against the existing canonical identity set."""
    if not isinstance(receipt, dict):
        return False, "receipt_unavailable"
    declared = str(receipt.get("receipt_hash_sha256") or "").strip().lower()
    if len(declared) != 64:
        return False, "receipt_hash_mismatch"
    if declared != _compute_receipt_hash(receipt).lower():
        return False, "receipt_hash_mismatch"
    return True, None


def verify_drafted_finalized_receipt(
    *,
    receipt: Dict[str, Any],
    packet: Optional[Dict[str, Any]],
    agreement_id: str,
    lock: Optional[Dict[str, Any]] = None,
    accepted_snapshot_id: Optional[str] = None,
    accepted_snapshot_digest: Optional[str] = None,
) -> Tuple[bool, Optional[str]]:
    """
    Fail closed when packet evidence is missing, replaced, or no longer matches the
    stored receipt commitment. Does not mint or persist.
    """
    ok, err = verify_receipt_identity_hash(receipt)
    if not ok:
        return False, err
    aid = str(agreement_id or "").strip()
    if not aid:
        return False, "agreement_id_required"
    timeline = str(receipt.get("timeline_id") or "").strip()
    if timeline and timeline != f"agreement:{aid}":
        return False, "snapshot_agreement_mismatch"
    if not isinstance(packet, dict):
        return False, "receipt_unavailable"
    pkt_aid = str(packet.get("agreementId") or "").strip()
    if pkt_aid != aid:
        return False, "snapshot_agreement_mismatch"
    finalized_at = str(packet.get("finalizedAt") or "").strip()
    lv = str(packet.get("finalizedVersionId") or packet.get("lockedVersionId") or "").strip()
    content = str(packet.get("acceptedSnapshotDigest") or "").strip().lower()
    snap_id = str(packet.get("acceptedSnapshotId") or "").strip()
    required = packet.get("requiredParticipantIds")
    if not finalized_at or not lv or len(content) != 64 or not snap_id:
        return False, "receipt_unavailable"
    if not isinstance(required, list) or not required:
        return False, "receipt_unavailable"
    from backend.proof.execution_packet_digest import execution_packet_digest_sha256

    try:
        body = build_agreement_receipt_body(
            agreement_id=aid,
            finalized_version_id=lv,
            finalized_at=finalized_at,
            content_sha256=content,
            execution_packet_sha256=execution_packet_digest_sha256(packet),
            signer_count=len(required),
        )
    except ValueError:
        return False, "receipt_unavailable"
    commitment = agreement_commitment_sha256_from_body(body)
    if commitment != str(receipt.get("commitment") or "").strip().lower():
        return False, "receipt_hash_mismatch"
    want_snap = str(accepted_snapshot_id or "").strip()
    if want_snap and want_snap != snap_id:
        return False, "lock_snapshot_id_mismatch"
    want_digest = str(accepted_snapshot_digest or "").strip().lower()
    if want_digest and want_digest != content:
        return False, "lock_snapshot_digest_mismatch"
    if isinstance(lock, dict):
        lock_aid = str(lock.get("agreement_id") or "").strip()
        if lock_aid and lock_aid != aid:
            return False, "snapshot_agreement_mismatch"
        lock_lv = str(lock.get("locked_version_id") or "").strip()
        if lock_lv and lock_lv != lv:
            return False, "locked_version_mismatch"
        lock_sid = str(lock.get("accepted_snapshot_id") or "").strip()
        if lock_sid and lock_sid != snap_id:
            return False, "lock_snapshot_id_mismatch"
        lock_digest = str(lock.get("accepted_snapshot_digest") or "").strip().lower()
        if lock_digest and lock_digest != content:
            return False, "lock_snapshot_digest_mismatch"
    return True, None


def create_agreement_receipt_response(
    *,
    agreement_id: str,
    finalized_version_id: str,
    finalized_at: str,
    content_sha256: str,
    execution_packet_sha256: str,
    parties_sha256: Optional[str] = None,
    signer_count: Optional[int] = None,
    anchor_network: str,
    epoch_id: Optional[str] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Returns (full_receipt_dict_for_db_and_api, agreement_receipt_body).
    commitment is canon_sha256(body); receipt_hash_sha256 follows timeline verifier rules.
    """
    body = build_agreement_receipt_body(
        agreement_id=agreement_id,
        finalized_version_id=finalized_version_id,
        finalized_at=finalized_at,
        content_sha256=content_sha256,
        execution_packet_sha256=execution_packet_sha256,
        parties_sha256=parties_sha256,
        signer_count=signer_count,
    )
    commitment = agreement_commitment_sha256_from_body(body)
    timeline_id = f"agreement:{agreement_id}"

    receipt_id_payload = {
        "agreement_id": agreement_id,
        "finalized_version_id": finalized_version_id,
        "anchor_network": anchor_network,
    }
    receipt_id = f"agr_rcpt_{canon_sha256_hex(receipt_id_payload)[:20]}"
    issued_at = _utc_now_iso()

    receipt: Dict[str, Any] = {
        "receipt_id": receipt_id,
        "protocol_version": agreement_receipt_protocol_version(),
        "network": anchor_network,
        "epoch_id": epoch_id,
        "timeline_id": timeline_id,
        "btc_txid": "pending",
        "commitment": commitment,
        "issued_at": issued_at,
        "merkle_proof": [],
        "zk_proof_refs": None,
    }
    receipt["receipt_hash_sha256"] = _compute_receipt_hash(receipt)
    return receipt, body
