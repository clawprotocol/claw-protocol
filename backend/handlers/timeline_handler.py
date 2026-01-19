from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, validator

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


class AppendEventRequest(BaseModel):
    event_type: str
    event_time: str
    notice: Optional[Dict[str, Any]] = None
    marker: Optional[Dict[str, Any]] = None

    @validator("event_type")
    def _event_type_valid(cls, v: str) -> str:
        if v not in ("notice", "marker"):
            raise ValueError("event_type must be notice or marker")
        return v

    @validator("event_time")
    def _event_time_valid(cls, v: str) -> str:
        _parse_rfc3339(v)
        return v

    @validator("marker", always=True)
    def _payload_union(cls, marker, values):
        notice = values.get("notice")
        et = values.get("event_type")
        if (notice is None and marker is None) or (notice is not None and marker is not None):
            raise ValueError("Exactly one of notice or marker must be present")
        if et == "notice" and notice is None:
            raise ValueError("notice payload required for event_type=notice")
        if et == "marker" and marker is None:
            raise ValueError("marker payload required for event_type=marker")
        return marker


class FreezeTimelineRequest(BaseModel):
    manifest_sha256: str


class AnchorTimelineRequest(BaseModel):
    frozen_manifest_sha256: str
    anchor_network: str
    epoch_id: Optional[str] = None

    @validator("anchor_network")
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


def create_receipt_response(
    *,
    timeline_id: str,
    frozen_manifest_sha256: str,
    anchor_network: str,
    epoch_id: Optional[str],
    btc_txid: str,
) -> Dict[str, Any]:
    payload = {
        "timeline_id": timeline_id,
        "frozen_manifest_sha256": frozen_manifest_sha256,
        "anchor_network": anchor_network,
        "epoch_id": epoch_id,
    }
    receipt_id = f"tl_rcpt_{canon_sha256_hex(payload)[:20]}"
    issued_at = _utc_now_iso()
    return {
        "receipt_id": receipt_id,
        "protocol_version": PROTOCOL_VERSION,
        "network": anchor_network,
        "epoch_id": epoch_id,
        "btc_txid": btc_txid,
        "commitment": frozen_manifest_sha256,
        "merkle_proof": [],
        "zk_proof_refs": None,
        "issued_at": issued_at,
    }

