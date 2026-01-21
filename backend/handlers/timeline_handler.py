from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, field_validator, model_validator

from backend.utils.timeline_store import TimelineStore, manifest_sha256
from utils.canon_json import canon_sha256_hex


PROTOCOL_VERSION = "claw-timeline/1"
ALLOWED_NETWORKS = {"mainnet", "testnet", "signet", "regtest"}
ALLOWED_ANCHOR_NETWORKS = {"bitcoin-mainnet", "bitcoin-testnet"}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_rfc3339(s: str) -> None:
    try:
        datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception as exc:
        raise ValueError("event_time must be RFC3339") from exc


class Party(BaseModel):
    role: str
    id: str
    display_name: str


class CreateTimelineRequest(BaseModel):
    timeline_id: Optional[str] = None
    title: str
    parties: List[Party]
    network: Optional[str] = None

    @field_validator("network")
    @classmethod
    def _network_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in ALLOWED_NETWORKS:
            raise ValueError(f"network must be one of {sorted(ALLOWED_NETWORKS)}")
        return v


class AppendEventRequest(BaseModel):
    event_type: str
    event_time: str
    notice: Optional[Dict[str, Any]] = None
    marker: Optional[Dict[str, Any]] = None

    @field_validator("event_type")
    @classmethod
    def _event_type_valid(cls, v: str) -> str:
        if v not in ("notice", "marker"):
            raise ValueError("event_type must be notice or marker")
        return v

    @field_validator("event_time")
    @classmethod
    def _event_time_valid(cls, v: str) -> str:
        _parse_rfc3339(v)
        return v

    @model_validator(mode="after")
    def _payload_union(self) -> "AppendEventRequest":
        notice = self.notice
        marker = self.marker
        et = self.event_type

        # Exactly one of notice / marker must be present
        if (notice is None and marker is None) or (notice is not None and marker is not None):
            raise ValueError("Exactly one of notice or marker must be present")

        # Must match event_type
        if et == "notice" and notice is None:
            raise ValueError("notice payload required for event_type=notice")
        if et == "marker" and marker is None:
            raise ValueError("marker payload required for event_type=marker")

        return self


class FreezeTimelineRequest(BaseModel):
    manifest_sha256: str


class AnchorTimelineRequest(BaseModel):
    frozen_manifest_sha256: str
    anchor_network: str
    epoch_id: Optional[str] = None

    @field_validator("anchor_network")
    @classmethod
    def _anchor_network_valid(cls, v: str) -> str:
        if v not in ALLOWED_ANCHOR_NETWORKS:
            raise ValueError("anchor_network must be bitcoin-mainnet or bitcoin-testnet")
        return v


def build_manifest(event_hashes: List[str]) -> Dict[str, Any]:
    return {
        "event_count": len(event_hashes),
        "event_hashes": event_hashes,
        "manifest_sha256": manifest_sha256(event_hashes),
    }


def timeline_response(store: TimelineStore, timeline_id: str) -> Dict[str, Any]:
    tl = store.get_timeline(timeline_id)
    event_hashes = store.list_event_hashes(tl.timeline_id)
    manifest = build_manifest(event_hashes)
    return {
        "timeline_id": tl.timeline_id,
        "protocol_version": tl.protocol_version,
        "network": tl.network,
        "created_at": tl.created_at,
        "title": tl.title,
        "parties": json.loads(tl.parties_json),
        "manifest": manifest,
        "frozen": bool(tl.frozen),
        "frozen_manifest_sha256": tl.frozen_manifest_sha256,
        "frozen_at": tl.frozen_at,
    }


def event_response(store: TimelineStore, timeline_id: str, event_id: str) -> Dict[str, Any]:
    ev = store.get_event(timeline_id, event_id)
    notice = json.loads(ev.notice_json) if ev.notice_json else None
    marker = json.loads(ev.marker_json) if ev.marker_json else None
    return {
        "timeline_id": ev.timeline_id,
        "event_id": ev.event_id,
        "event_index": ev.event_index,
        "event_type": ev.event_type,
        "event_time": ev.event_time,
        "notice": notice if ev.event_type == "notice" else None,
        "marker": marker if ev.event_type == "marker" else None,
        "event_sha256": ev.event_sha256,
        "manifest_sha256": manifest_sha256(store.list_event_hashes(ev.timeline_id)),
    }


# ----------------------------
# Receipt hashing (must match verify_handler.py stable identity payload)
# ----------------------------

_RECEIPT_STABLE_IDENTITY_FIELDS: Tuple[str, ...] = (
    "receipt_id",
    "protocol_version",
    "network",
    "epoch_id",
    "timeline_id",
    "commitment",
    "issued_at",
)


def _receipt_payload_for_hash(receipt: Dict[str, Any]) -> Dict[str, Any]:
    # IMPORTANT: include ALL stable fields, even if absent, as None (null).
    # This avoids missing-key vs null-key canonicalization divergence.
    return {k: receipt.get(k, None) for k in _RECEIPT_STABLE_IDENTITY_FIELDS}


def _compute_receipt_hash(receipt: Dict[str, Any]) -> str:
    return canon_sha256_hex(_receipt_payload_for_hash(receipt))


def create_receipt_response(
    *,
    timeline_id: str,
    frozen_manifest_sha256: str,
    anchor_network: str,
    epoch_id: Optional[str],
    btc_txid: str,
) -> Dict[str, Any]:
    """
    Build a receipt that is self-verifiable:
      - commitment == frozen_manifest_sha256
      - receipt_hash_sha256 is computed over the stable identity payload
        (see verify_handler.py for the same field set)
    """
    # Deterministic receipt_id based on stable inputs (not btc_txid, not proofs)
    receipt_id_payload = {
        "timeline_id": timeline_id,
        "frozen_manifest_sha256": frozen_manifest_sha256,
        "anchor_network": anchor_network,
        "epoch_id": epoch_id,
    }
    receipt_id = f"tl_rcpt_{canon_sha256_hex(receipt_id_payload)[:20]}"
    issued_at = _utc_now_iso()

    receipt: Dict[str, Any] = {
        "receipt_id": receipt_id,
        "protocol_version": PROTOCOL_VERSION,
        "network": anchor_network,
        "epoch_id": epoch_id,
        "timeline_id": timeline_id,
        "btc_txid": btc_txid,
        "commitment": frozen_manifest_sha256,
        "issued_at": issued_at,
        "merkle_proof": [],
        "zk_proof_refs": None,
    }

    # Embed integrity hash (top-level pragmatic field)
    receipt["receipt_hash_sha256"] = _compute_receipt_hash(receipt)

    return receipt
