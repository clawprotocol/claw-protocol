from __future__ import annotations

import json
import os
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from utils.canon_json import canon_sha256_hex

DEFAULT_DB_PATH = os.getenv("CLAW_TIMELINE_DB_PATH", "audit/timeline.sqlite3")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _event_payload_for_hash(
    *,
    timeline_id: str,
    event_index: int,
    event_type: str,
    event_time: str,
    notice: Optional[Dict[str, Any]],
    marker: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "timeline_id": timeline_id,
        "event_index": event_index,
        "event_type": event_type,
        "event_time": event_time,
    }
    if event_type == "notice":
        payload["notice"] = notice or {}
    elif event_type == "marker":
        payload["marker"] = marker or {}
    return payload


def event_sha256(
    *,
    timeline_id: str,
    event_index: int,
    event_type: str,
    event_time: str,
    notice: Optional[Dict[str, Any]],
    marker: Optional[Dict[str, Any]],
) -> str:
    payload = _event_payload_for_hash(
        timeline_id=timeline_id,
        event_index=event_index,
        event_type=event_type,
        event_time=event_time,
        notice=notice,
        marker=marker,
    )
    return canon_sha256_hex(payload)


def manifest_sha256(event_hashes: List[str]) -> str:
    payload = {"event_count": len(event_hashes), "event_hashes": event_hashes}
    return canon_sha256_hex(payload)


@dataclass
class TimelineRow:
    timeline_id: str
    title: str
    parties_json: str
    created_at: str
    protocol_version: str
    network: str
    frozen: int
    frozen_manifest_sha256: Optional[str]
    frozen_at: Optional[str]


@dataclass
class EventRow:
    event_id: str
    timeline_id: str
    event_index: int
    event_type: str
    event_time: str
    notice_json: Optional[str]
    marker_json: Optional[str]
    event_sha256: str
    created_at: str


class TimelineStore:
    def __init__(self, db_path: str = DEFAULT_DB_PATH) -> None:
        self.db_path = db_path
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        os.makedirs(os.path.dirname(self.db_path) or ".", exist_ok=True)
        with self._conn() as c:
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS timelines (
                    timeline_id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    parties_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    protocol_version TEXT NOT NULL,
                    network TEXT NOT NULL,
                    frozen INTEGER NOT NULL DEFAULT 0,
                    frozen_manifest_sha256 TEXT,
                    frozen_at TEXT
                )
                """
            )
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS events (
                    event_id TEXT PRIMARY KEY,
                    timeline_id TEXT NOT NULL,
                    event_index INTEGER NOT NULL,
                    event_type TEXT NOT NULL,
                    event_time TEXT NOT NULL,
                    notice_json TEXT,
                    marker_json TEXT,
                    event_sha256 TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(timeline_id, event_index)
                )
                """
            )
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS receipts (
                    receipt_id TEXT PRIMARY KEY,
                    timeline_id TEXT NOT NULL,
                    protocol_version TEXT NOT NULL,
                    network TEXT NOT NULL,
                    epoch_id TEXT,
                    btc_txid TEXT NOT NULL,
                    commitment TEXT NOT NULL,
                    merkle_proof_json TEXT NOT NULL,
                    zk_proof_refs_json TEXT,
                    issued_at TEXT NOT NULL
                )
                """
            )

    def create_timeline(
        self,
        *,
        timeline_id: Optional[str],
        title: str,
        parties: List[Dict[str, Any]],
        network: str,
        protocol_version: str,
    ) -> TimelineRow:
        tl_id = timeline_id or f"tl_{uuid.uuid4().hex}"
        created_at = _utc_now_iso()
        parties_json = json.dumps(parties, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        with self._conn() as c:
            c.execute(
                """
                INSERT INTO timelines
                (timeline_id, title, parties_json, created_at, protocol_version, network, frozen)
                VALUES (?, ?, ?, ?, ?, ?, 0)
                """,
                (tl_id, title, parties_json, created_at, protocol_version, network),
            )
        return self.get_timeline(tl_id)

    def get_timeline(self, timeline_id: str) -> TimelineRow:
        with self._conn() as c:
            row = c.execute("SELECT * FROM timelines WHERE timeline_id = ?", (timeline_id,)).fetchone()
        if not row:
            raise KeyError("timeline_not_found")
        return TimelineRow(**dict(row))

    def list_event_hashes(self, timeline_id: str) -> List[str]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT event_sha256 FROM events WHERE timeline_id = ? ORDER BY event_index ASC",
                (timeline_id,),
            ).fetchall()
        return [r["event_sha256"] for r in rows]

    def get_event(self, timeline_id: str, event_id: str) -> EventRow:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM events WHERE timeline_id = ? AND event_id = ?",
                (timeline_id, event_id),
            ).fetchone()
        if not row:
            raise KeyError("event_not_found")
        return EventRow(**dict(row))

    def append_event(
        self,
        *,
        timeline_id: str,
        event_type: str,
        event_time: str,
        notice: Optional[Dict[str, Any]],
        marker: Optional[Dict[str, Any]],
    ) -> EventRow:
        if event_type not in ("notice", "marker"):
            raise ValueError("event_type must be notice or marker")
        if (notice is None and marker is None) or (notice is not None and marker is not None):
            raise ValueError("Exactly one of notice or marker must be present")
        if event_type == "notice" and notice is None:
            raise ValueError("notice payload required for event_type=notice")
        if event_type == "marker" and marker is None:
            raise ValueError("marker payload required for event_type=marker")

        conn = self._conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            tl = conn.execute("SELECT * FROM timelines WHERE timeline_id = ?", (timeline_id,)).fetchone()
            if not tl:
                raise KeyError("timeline_not_found")
            if int(tl["frozen"] or 0) == 1:
                raise RuntimeError("timeline_frozen")

            row = conn.execute(
                "SELECT MAX(event_index) AS max_idx FROM events WHERE timeline_id = ?",
                (timeline_id,),
            ).fetchone()
            next_idx = 0 if row["max_idx"] is None else int(row["max_idx"]) + 1

            sha = event_sha256(
                timeline_id=timeline_id,
                event_index=next_idx,
                event_type=event_type,
                event_time=event_time,
                notice=notice,
                marker=marker,
            )
            event_id = f"evt_{sha[:32]}"
            created_at = _utc_now_iso()
            notice_json = json.dumps(notice, ensure_ascii=False, separators=(",", ":"), sort_keys=True) if notice else None
            marker_json = json.dumps(marker, ensure_ascii=False, separators=(",", ":"), sort_keys=True) if marker else None

            conn.execute(
                """
                INSERT INTO events
                (event_id, timeline_id, event_index, event_type, event_time, notice_json, marker_json, event_sha256, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    timeline_id,
                    next_idx,
                    event_type,
                    event_time,
                    notice_json,
                    marker_json,
                    sha,
                    created_at,
                ),
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        return self.get_event(timeline_id, event_id)

    def freeze_timeline(self, timeline_id: str, manifest_hash: str) -> Tuple[str, str]:
        conn = self._conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            tl = conn.execute("SELECT * FROM timelines WHERE timeline_id = ?", (timeline_id,)).fetchone()
            if not tl:
                raise KeyError("timeline_not_found")

            rows = conn.execute(
                "SELECT event_sha256 FROM events WHERE timeline_id = ? ORDER BY event_index ASC",
                (timeline_id,),
            ).fetchall()
            event_hashes = [r["event_sha256"] for r in rows]
            server_manifest = manifest_sha256(event_hashes)
            if server_manifest != manifest_hash:
                raise RuntimeError("manifest_sha256_mismatch")

            if int(tl["frozen"] or 0) == 1:
                existing = tl["frozen_manifest_sha256"] or ""
                if existing != manifest_hash:
                    raise RuntimeError("frozen_manifest_mismatch")
                return existing, tl["frozen_at"]

            frozen_at = _utc_now_iso()
            conn.execute(
                """
                UPDATE timelines
                SET frozen = 1, frozen_manifest_sha256 = ?, frozen_at = ?
                WHERE timeline_id = ?
                """,
                (manifest_hash, frozen_at, timeline_id),
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        return manifest_hash, frozen_at

    def create_receipt(
        self,
        *,
        receipt_id: str,
        timeline_id: str,
        protocol_version: str,
        network: str,
        epoch_id: Optional[str],
        btc_txid: str,
        commitment: str,
        merkle_proof: List[Dict[str, Any]],
        zk_proof_refs: Optional[List[str]],
        issued_at: str,
    ) -> None:
        with self._conn() as c:
            c.execute(
                """
                INSERT INTO receipts
                (receipt_id, timeline_id, protocol_version, network, epoch_id, btc_txid, commitment,
                 merkle_proof_json, zk_proof_refs_json, issued_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    receipt_id,
                    timeline_id,
                    protocol_version,
                    network,
                    epoch_id,
                    btc_txid,
                    commitment,
                    json.dumps(merkle_proof, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
                    json.dumps(zk_proof_refs, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
                    if zk_proof_refs
                    else None,
                    issued_at,
                ),
            )

    def get_receipt(self, receipt_id: str) -> Dict[str, Any]:
        with self._conn() as c:
            row = c.execute("SELECT * FROM receipts WHERE receipt_id = ?", (receipt_id,)).fetchone()
        if not row:
            raise KeyError("receipt_not_found")
        data = dict(row)
        data["merkle_proof"] = json.loads(data["merkle_proof_json"])
        data["zk_proof_refs"] = json.loads(data["zk_proof_refs_json"]) if data["zk_proof_refs_json"] else None
        return data

