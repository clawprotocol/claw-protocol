from __future__ import annotations

import json
import os
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

# ✅ IMPORTANT: match backend import style
from backend.utils.canon_json import canon_sha256_hex
from backend.handlers.batch_handler import build_receipt_batch

DEFAULT_DB_PATH = os.path.expanduser(os.getenv("CLAW_TIMELINE_DB_PATH", "~/.claw/timeline.sqlite3"))


def _timeline_pg() -> bool:
    from backend.db.config import use_postgresql_for_timeline

    return use_postgresql_for_timeline()


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
    def __init__(self, db_path: Optional[str] = None) -> None:
        if db_path is None:
            db_path = os.path.expanduser(
                os.getenv("CLAW_TIMELINE_DB_PATH", "~/.claw/timeline.sqlite3")
            )
        self.db_path = db_path
        self._pg = _timeline_pg()
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        if self._pg:
            raise RuntimeError(
                "TimelineStore is using PostgreSQL; internal SQLite _conn() is not available."
            )
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    def _init_db(self) -> None:
        if self._pg:
            from backend.utils.timeline_postgres import ensure_timeline_schema

            ensure_timeline_schema()
            return
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
            c.execute("CREATE INDEX IF NOT EXISTS idx_events_timeline ON events(timeline_id)")
            c.execute(
                "CREATE INDEX IF NOT EXISTS idx_events_event_id_lookup ON events(event_id)"
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
                    issued_at TEXT NOT NULL,
                    receipt_hash_sha256 TEXT
                )
                """
            )

            # Backwards-compatible migration: add receipt_hash_sha256 if missing (older DBs)
            cols = [r[1] for r in c.execute("PRAGMA table_info(receipts)").fetchall()]
            if "receipt_hash_sha256" not in cols:
                c.execute("ALTER TABLE receipts ADD COLUMN receipt_hash_sha256 TEXT")

            # ✅ Batch anchoring fields (stored on receipt rows)
            if "batch_id" not in cols:
                c.execute("ALTER TABLE receipts ADD COLUMN batch_id TEXT")
            if "batch_merkle_root_sha256" not in cols:
                c.execute("ALTER TABLE receipts ADD COLUMN batch_merkle_root_sha256 TEXT")
            if "leaf_index" not in cols:
                c.execute("ALTER TABLE receipts ADD COLUMN leaf_index INTEGER")

            c.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_receipts_timeline_issued
                ON receipts (timeline_id, issued_at DESC)
                """
            )
            c.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_receipts_unbatched
                ON receipts (network, protocol_version)
                WHERE receipt_hash_sha256 IS NOT NULL
                  AND (batch_id IS NULL OR batch_id = '')
                """
            )

            # ✅ Batch tables (header + membership). Safe even if you also have a separate audit DB.
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS batches (
                    batch_id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    network TEXT NOT NULL,
                    protocol_version TEXT NOT NULL,
                    leaf_count INTEGER NOT NULL,
                    merkle_root TEXT NOT NULL,
                    batch_commitment TEXT NOT NULL,
                    anchor_txid TEXT,
                    anchor_op_return TEXT
                )
                """
            )
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS batch_receipts (
                    batch_id TEXT NOT NULL,
                    receipt_id TEXT NOT NULL,
                    receipt_hash TEXT NOT NULL,
                    leaf_index INTEGER NOT NULL,
                    PRIMARY KEY (batch_id, receipt_id)
                )
                """
            )
            c.execute(
                "CREATE INDEX IF NOT EXISTS idx_batch_receipts_batch ON batch_receipts(batch_id)"
            )
            c.execute(
                "CREATE INDEX IF NOT EXISTS idx_batch_receipts_receipt ON batch_receipts(receipt_id)"
            )

            # ✅ Timeline anchor job queue (batch mode)
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS timeline_anchor_jobs (
                    job_id TEXT PRIMARY KEY,
                    receipt_id TEXT NOT NULL,
                    timeline_id TEXT NOT NULL,
                    network TEXT NOT NULL,
                    commitment TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'queued',   -- queued|running|done|failed
                    txid TEXT,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

            # Helpful index for batch runners
            c.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_timeline_anchor_jobs_status_created
                ON timeline_anchor_jobs(status, created_at)
                """
            )

            # Backwards-compatible migration: older DBs may have created the table without defaults/columns
            job_cols = [r[1] for r in c.execute("PRAGMA table_info(timeline_anchor_jobs)").fetchall()]
            if job_cols:
                if "status" not in job_cols:
                    c.execute("ALTER TABLE timeline_anchor_jobs ADD COLUMN status TEXT NOT NULL DEFAULT 'queued'")
                if "txid" not in job_cols:
                    c.execute("ALTER TABLE timeline_anchor_jobs ADD COLUMN txid TEXT")
                if "error" not in job_cols:
                    c.execute("ALTER TABLE timeline_anchor_jobs ADD COLUMN error TEXT")
                if "updated_at" not in job_cols:
                    c.execute("ALTER TABLE timeline_anchor_jobs ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''")
                if "attempts" not in job_cols:
                    c.execute(
                        "ALTER TABLE timeline_anchor_jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0"
                    )

            b_cols = [r[1] for r in c.execute("PRAGMA table_info(batches)").fetchall()]
            if b_cols:
                if "anchor_status" not in b_cols:
                    c.execute("ALTER TABLE batches ADD COLUMN anchor_status TEXT")
                if "anchor_error" not in b_cols:
                    c.execute("ALTER TABLE batches ADD COLUMN anchor_error TEXT")
                if "anchor_attempts" not in b_cols:
                    c.execute("ALTER TABLE batches ADD COLUMN anchor_attempts INTEGER NOT NULL DEFAULT 0")
                if "anchor_updated_at" not in b_cols:
                    c.execute("ALTER TABLE batches ADD COLUMN anchor_updated_at TEXT")
                c.execute(
                    """
                    UPDATE batches
                    SET anchor_status = 'anchored'
                    WHERE (anchor_txid IS NOT NULL AND TRIM(COALESCE(anchor_txid,'')) NOT IN ('', 'pending'))
                      AND (anchor_status IS NULL OR TRIM(COALESCE(anchor_status,'')) = '')
                    """
                )

            c.execute(
                "CREATE INDEX IF NOT EXISTS idx_batches_created_at ON batches (created_at ASC)"
            )

    # --------------------------
    # Timelines
    # --------------------------
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
        if self._pg:
            from backend.utils import timeline_postgres as tp

            tp.create_timeline(
                timeline_id=tl_id,
                title=title,
                parties_json=parties_json,
                created_at=created_at,
                protocol_version=protocol_version,
                network=network,
            )
            return self.get_timeline(tl_id)
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
        if self._pg:
            from backend.utils import timeline_postgres as tp

            d = tp.get_timeline_dict(timeline_id)
            if not d:
                raise KeyError("timeline_not_found")
            return TimelineRow(
                timeline_id=str(d["timeline_id"]),
                title=str(d["title"]),
                parties_json=str(d["parties_json"]),
                created_at=str(d["created_at"]),
                protocol_version=str(d["protocol_version"]),
                network=str(d["network"]),
                frozen=int(d["frozen"]),
                frozen_manifest_sha256=d.get("frozen_manifest_sha256"),
                frozen_at=d.get("frozen_at"),
            )
        with self._conn() as c:
            row = c.execute("SELECT * FROM timelines WHERE timeline_id = ?", (timeline_id,)).fetchone()
        if not row:
            raise KeyError("timeline_not_found")
        return TimelineRow(**dict(row))

    # --------------------------
    # Events: helpers
    # --------------------------
    def list_event_hashes(self, timeline_id: str) -> List[str]:
        if self._pg:
            from backend.utils import timeline_postgres as tp

            return tp.list_event_hashes(timeline_id)
        with self._conn() as c:
            rows = c.execute(
                "SELECT event_sha256 FROM events WHERE timeline_id = ? ORDER BY event_index ASC",
                (timeline_id,),
            ).fetchall()
        return [r["event_sha256"] for r in rows]

    def get_event(self, timeline_id: str, event_id: str) -> EventRow:
        if self._pg:
            from backend.utils import timeline_postgres as tp

            d = tp.get_event_dict(timeline_id, event_id)
            if not d:
                raise KeyError("event_not_found")
            return EventRow(
                event_id=str(d["event_id"]),
                timeline_id=str(d["timeline_id"]),
                event_index=int(d["event_index"]),
                event_type=str(d["event_type"]),
                event_time=str(d["event_time"]),
                notice_json=d.get("notice_json"),
                marker_json=d.get("marker_json"),
                event_sha256=str(d["event_sha256"]),
                created_at=str(d["created_at"]),
            )
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM events WHERE timeline_id = ? AND event_id = ?",
                (timeline_id, event_id),
            ).fetchone()
        if not row:
            raise KeyError("event_not_found")
        return EventRow(**dict(row))

    def _ensure_not_frozen_tx(self, conn: sqlite3.Connection, timeline_id: str) -> None:
        tl = conn.execute("SELECT * FROM timelines WHERE timeline_id = ?", (timeline_id,)).fetchone()
        if not tl:
            raise KeyError("timeline_not_found")
        if int(tl["frozen"] or 0) == 1:
            raise RuntimeError("timeline_frozen")

    def _parse_notice(self, notice_json: Optional[str]) -> Optional[Dict[str, Any]]:
        if not notice_json:
            return None
        try:
            return json.loads(notice_json)
        except Exception:
            return None

    def _parse_marker(self, marker_json: Optional[str]) -> Optional[Dict[str, Any]]:
        if not marker_json:
            return None
        try:
            return json.loads(marker_json)
        except Exception:
            return None

    # --------------------------
    # Events: UX-friendly list
    # --------------------------
    def list_events(self, timeline_id: str) -> Dict[str, Any]:
        """
        Returns events ordered by event_index ascending.
        Includes parsed notice/marker objects.
        """
        _ = self.get_timeline(timeline_id)

        if self._pg:
            from backend.utils import timeline_postgres as tp

            rows = tp.fetch_events_ordered(timeline_id)
        else:
            with self._conn() as c:
                rows = c.execute(
                    """
                    SELECT *
                    FROM events
                    WHERE timeline_id = ?
                    ORDER BY event_index ASC
                    """,
                    (timeline_id,),
                ).fetchall()
            rows = [dict(r) for r in rows]

        events: List[Dict[str, Any]] = []
        for r in rows:
            notice = self._parse_notice(r["notice_json"])
            marker = self._parse_marker(r["marker_json"])

            attachment_count = 0
            if isinstance(notice, dict):
                atts = notice.get("attachments")
                if isinstance(atts, list):
                    attachment_count = len(atts)

            events.append(
                {
                    "event_id": r["event_id"],
                    "timeline_id": r["timeline_id"],
                    "event_index": int(r["event_index"]),
                    "event_type": r["event_type"],
                    "event_time": r["event_time"],
                    "notice": notice,
                    "marker": marker,
                    "attachment_count": attachment_count,
                    "event_sha256": r["event_sha256"],
                    "created_at": r["created_at"],
                }
            )

        return {"timeline_id": timeline_id, "events": events}

    # --------------------------
    # Events: create
    # --------------------------
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

        notice_json = (
            json.dumps(notice, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            if notice
            else None
        )
        marker_json = (
            json.dumps(marker, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            if marker
            else None
        )

        if self._pg:
            from backend.utils import timeline_postgres as tp

            eid = tp.append_event_compute(
                timeline_id=timeline_id,
                event_type=event_type,
                event_time=event_time,
                notice_json=notice_json,
                marker_json=marker_json,
            )
            return self.get_event(timeline_id, eid)

        conn = self._conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            self._ensure_not_frozen_tx(conn, timeline_id)

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

    # --------------------------
    # Events: patch / delete / duplicate (Screen 3 actions)
    # --------------------------
    def patch_event(self, timeline_id: str, event_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
        allowed_keys = {"event_type", "event_time", "notice", "marker"}
        patch = {k: v for k, v in patch.items() if k in allowed_keys}
        if not patch:
            return {"ok": True, "event": self._event_as_dict(self.get_event(timeline_id, event_id))}

        if self._pg:
            from backend.utils import timeline_postgres as tp

            rowd = tp.get_event_dict(timeline_id, event_id)
            if not rowd:
                raise KeyError("event_not_found")
            current_type = rowd["event_type"]
            current_time = rowd["event_time"]
            current_notice = self._parse_notice(rowd.get("notice_json"))
            current_marker = self._parse_marker(rowd.get("marker_json"))
            idx = int(rowd["event_index"])
        else:
            conn = self._conn()
            try:
                conn.execute("BEGIN IMMEDIATE")
                self._ensure_not_frozen_tx(conn, timeline_id)

                row = conn.execute(
                    "SELECT * FROM events WHERE timeline_id = ? AND event_id = ?",
                    (timeline_id, event_id),
                ).fetchone()
                if not row:
                    raise KeyError("event_not_found")

                current_type = row["event_type"]
                current_time = row["event_time"]
                current_notice = self._parse_notice(row["notice_json"])
                current_marker = self._parse_marker(row["marker_json"])
                idx = int(row["event_index"])
            except BaseException:
                conn.rollback()
                conn.close()
                raise

        new_type = patch.get("event_type", current_type)
        new_time = patch.get("event_time", current_time)

        notice_provided = "notice" in patch
        marker_provided = "marker" in patch
        new_notice = patch.get("notice") if notice_provided else current_notice
        new_marker = patch.get("marker") if marker_provided else current_marker

        if new_type not in ("notice", "marker"):
            raise ValueError("event_type must be notice or marker")

        if new_type == "notice":
            if new_notice is None:
                raise ValueError("notice payload required for event_type=notice")
            new_marker = None
        else:
            if new_marker is None:
                raise ValueError("marker payload required for event_type=marker")
            new_notice = None

        new_notice_json = (
            json.dumps(new_notice, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            if new_notice is not None
            else None
        )
        new_marker_json = (
            json.dumps(new_marker, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            if new_marker is not None
            else None
        )

        new_sha = event_sha256(
            timeline_id=timeline_id,
            event_index=idx,
            event_type=new_type,
            event_time=new_time,
            notice=new_notice,
            marker=new_marker,
        )

        if self._pg:
            from backend.utils import timeline_postgres as tp

            n = tp.patch_event_row(
                timeline_id=timeline_id,
                event_id=event_id,
                event_type=new_type,
                event_time=new_time,
                notice_json=new_notice_json,
                marker_json=new_marker_json,
                event_sha256=new_sha,
            )
            if n == 0:
                raise KeyError("event_not_found")
        else:
            try:
                conn.execute(
                    """
                    UPDATE events
                    SET event_type = ?, event_time = ?, notice_json = ?, marker_json = ?, event_sha256 = ?
                    WHERE timeline_id = ? AND event_id = ?
                    """,
                    (new_type, new_time, new_notice_json, new_marker_json, new_sha, timeline_id, event_id),
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                conn.close()

        return {"ok": True, "event": self._event_as_dict(self.get_event(timeline_id, event_id))}

    def delete_event(self, timeline_id: str, event_id: str) -> Dict[str, Any]:
        if self._pg:
            from backend.utils import timeline_postgres as tp

            n = tp.delete_event_row(timeline_id=timeline_id, event_id=event_id)
            if n == 0:
                raise KeyError("event_not_found")
            return {"ok": True, "timeline_id": timeline_id, "event_id": event_id}

        conn = self._conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            self._ensure_not_frozen_tx(conn, timeline_id)

            cur = conn.execute(
                "DELETE FROM events WHERE timeline_id = ? AND event_id = ?",
                (timeline_id, event_id),
            )
            if cur.rowcount == 0:
                raise KeyError("event_not_found")

            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        return {"ok": True, "timeline_id": timeline_id, "event_id": event_id}

    def duplicate_event(self, timeline_id: str, event_id: str) -> Dict[str, Any]:
        if self._pg:
            from backend.utils import timeline_postgres as tp

            new_event_id = tp.duplicate_event_compute(
                timeline_id=timeline_id, source_event_id=event_id
            )
            return {"ok": True, "event": self._event_as_dict(self.get_event(timeline_id, new_event_id))}

        conn = self._conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            self._ensure_not_frozen_tx(conn, timeline_id)

            src = conn.execute(
                "SELECT * FROM events WHERE timeline_id = ? AND event_id = ?",
                (timeline_id, event_id),
            ).fetchone()
            if not src:
                raise KeyError("event_not_found")

            row = conn.execute(
                "SELECT MAX(event_index) AS max_idx FROM events WHERE timeline_id = ?",
                (timeline_id,),
            ).fetchone()
            next_idx = 0 if row["max_idx"] is None else int(row["max_idx"]) + 1

            src_type = src["event_type"]
            src_time = src["event_time"]
            src_notice = self._parse_notice(src["notice_json"])
            src_marker = self._parse_marker(src["marker_json"])

            new_sha = event_sha256(
                timeline_id=timeline_id,
                event_index=next_idx,
                event_type=src_type,
                event_time=src_time,
                notice=src_notice,
                marker=src_marker,
            )
            new_event_id = f"evt_{new_sha[:32]}"
            created_at = _utc_now_iso()

            notice_json = (
                json.dumps(src_notice, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
                if src_notice is not None
                else None
            )
            marker_json = (
                json.dumps(src_marker, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
                if src_marker is not None
                else None
            )

            conn.execute(
                """
                INSERT INTO events
                (event_id, timeline_id, event_index, event_type, event_time, notice_json, marker_json, event_sha256, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_event_id,
                    timeline_id,
                    next_idx,
                    src_type,
                    src_time,
                    notice_json,
                    marker_json,
                    new_sha,
                    created_at,
                ),
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        return {"ok": True, "event": self._event_as_dict(self.get_event(timeline_id, new_event_id))}

    def _event_as_dict(self, ev: EventRow) -> Dict[str, Any]:
        notice = self._parse_notice(ev.notice_json)
        marker = self._parse_marker(ev.marker_json)

        attachment_count = 0
        if isinstance(notice, dict):
            atts = notice.get("attachments")
            if isinstance(atts, list):
                attachment_count = len(atts)

        return {
            "event_id": ev.event_id,
            "timeline_id": ev.timeline_id,
            "event_index": int(ev.event_index),
            "event_type": ev.event_type,
            "event_time": ev.event_time,
            "notice": notice,
            "marker": marker,
            "attachment_count": attachment_count,
            "event_sha256": ev.event_sha256,
            "created_at": ev.created_at,
        }

    # --------------------------
    # Freeze
    # --------------------------
    def freeze_timeline(self, timeline_id: str, manifest_hash: str) -> Tuple[str, str]:
        if self._pg:
            from backend.utils import timeline_postgres as tp

            return tp.freeze_timeline(timeline_id=timeline_id, manifest_hash=manifest_hash)

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

    # --------------------------
    # Receipts
    # --------------------------
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
        merkle_proof: List[Any],
        zk_proof_refs: Optional[List[str]],
        issued_at: str,
        receipt_hash_sha256: Optional[str] = None,
    ) -> None:
        mpj = json.dumps(merkle_proof, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        zkj = (
            json.dumps(zk_proof_refs, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            if zk_proof_refs
            else None
        )
        if self._pg:
            from backend.utils import timeline_postgres as tp

            tp.create_receipt(
                receipt_id=receipt_id,
                timeline_id=timeline_id,
                protocol_version=protocol_version,
                network=network,
                epoch_id=epoch_id,
                btc_txid=btc_txid,
                commitment=commitment,
                merkle_proof_json=mpj,
                zk_proof_refs_json=zkj,
                issued_at=issued_at,
                receipt_hash_sha256=receipt_hash_sha256,
            )
            return
        with self._conn() as c:
            c.execute(
                """
                INSERT INTO receipts
                (receipt_id, timeline_id, protocol_version, network, epoch_id, btc_txid, commitment,
                 merkle_proof_json, zk_proof_refs_json, issued_at, receipt_hash_sha256)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    receipt_id,
                    timeline_id,
                    protocol_version,
                    network,
                    epoch_id,
                    btc_txid,
                    commitment,
                    mpj,
                    zkj,
                    issued_at,
                    receipt_hash_sha256,
                ),
            )

    def get_receipt(self, receipt_id: str) -> Dict[str, Any]:
        if self._pg:
            from backend.utils import timeline_postgres as tp

            return tp.get_receipt_parsed(receipt_id)

        with self._conn() as c:
            row = c.execute("SELECT * FROM receipts WHERE receipt_id = ?", (receipt_id,)).fetchone()
        if not row:
            raise KeyError("receipt_not_found")

        data = dict(row)

        # Parse proof + refs
        proof = json.loads(data["merkle_proof_json"]) if data.get("merkle_proof_json") else []
        zk = json.loads(data["zk_proof_refs_json"]) if data.get("zk_proof_refs_json") else None

        # Verifier-only clean fields
        data.pop("merkle_proof_json", None)
        data.pop("zk_proof_refs_json", None)
        data["batch_proof_siblings"] = proof
        data["zk_proof_refs"] = zk

        return data

    def set_receipt_txid(self, *, receipt_id: str, btc_txid: str) -> None:
        if self._pg:
            from backend.utils import timeline_postgres as tp

            tp.set_receipt_txid(receipt_id=receipt_id, btc_txid=btc_txid)
            return
        with self._conn() as c:
            c.execute(
                "UPDATE receipts SET btc_txid = ? WHERE receipt_id = ?",
                (btc_txid, receipt_id),
            )

    def set_receipt_batch_fields(
        self,
        *,
        receipt_id: str,
        batch_id: str,
        batch_merkle_root_sha256: str,
        leaf_index: int,
        merkle_proof_siblings_hex: List[str],
    ) -> None:
        """
        Store batch metadata + merkle proof (siblings hex list) into the receipt.
        We reuse merkle_proof_json for batch proofs.
        """
        mpj = json.dumps(
            merkle_proof_siblings_hex, ensure_ascii=False, separators=(",", ":"), sort_keys=False
        )
        if self._pg:
            from backend.utils import timeline_postgres as tp

            tp.set_receipt_batch_fields(
                receipt_id=receipt_id,
                batch_id=batch_id,
                batch_merkle_root_sha256=batch_merkle_root_sha256,
                leaf_index=leaf_index,
                merkle_proof_json=mpj,
            )
            return
        with self._conn() as c:
            c.execute(
                """
                UPDATE receipts
                SET batch_id = ?,
                    batch_merkle_root_sha256 = ?,
                    leaf_index = ?,
                    merkle_proof_json = ?
                WHERE receipt_id = ?
                """,
                (
                    batch_id,
                    batch_merkle_root_sha256,
                    leaf_index,
                    mpj,
                    receipt_id,
                ),
            )

    # ----------------------------
    # Batch build + persist (NO broadcast)
    # ----------------------------
    def build_next_batch(self, *, network: str, protocol_version: str, limit: int = 5000) -> Dict[str, Any]:
        """
        Deterministically:
          - selects receipts where receipt_hash_sha256 is present AND batch_id is NULL
          - sorts by receipt_hash_sha256
          - builds batch merkle root + commitment
          - persists batches + batch_receipts
          - (optionally) writes batch_id + batch_merkle_root_sha256 + leaf_index onto receipts
        """
        if self._pg:
            from backend.utils import timeline_postgres as tp

            return tp.build_next_batch(network=network, protocol_version=protocol_version, limit=limit)

        conn = self._conn()
        try:
            conn.execute("BEGIN IMMEDIATE")

            rows = conn.execute(
                """
                SELECT receipt_id, receipt_hash_sha256
                FROM receipts
                WHERE network = ?
                  AND protocol_version = ?
                  AND receipt_hash_sha256 IS NOT NULL
                  AND (batch_id IS NULL OR batch_id = '')
                ORDER BY receipt_hash_sha256 ASC
                LIMIT ?
                """,
                (network, protocol_version, limit),
            ).fetchall()

            if not rows:
                conn.rollback()
                return {"ok": False, "reason": "no eligible receipts"}

            receipt_summaries = [
                {"receipt_id": r["receipt_id"], "receipt_sha256": r["receipt_hash_sha256"]} for r in rows
            ]

            built = build_receipt_batch(
                network=network,
                protocol_version=protocol_version,
                receipt_summaries=receipt_summaries,
            )

            # Persist batch header
            conn.execute(
                """
                INSERT INTO batches
                (batch_id, created_at, network, protocol_version, leaf_count, merkle_root, batch_commitment,
                 anchor_status, anchor_attempts, anchor_updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)
                """,
                (
                    built.batch_id,
                    built.created_at,
                    built.network,
                    built.protocol_version,
                    built.leaf_count,
                    built.merkle_root,
                    built.batch_commitment,
                    built.created_at,
                ),
            )

            # Persist membership + stamp receipts
            for idx, r in enumerate(rows):
                rid = r["receipt_id"]
                rh = r["receipt_hash_sha256"]
                conn.execute(
                    """
                    INSERT INTO batch_receipts (batch_id, receipt_id, receipt_hash, leaf_index)
                    VALUES (?, ?, ?, ?)
                    """,
                    (built.batch_id, rid, rh, idx),
                )
                conn.execute(
                    """
                    UPDATE receipts
                    SET batch_id = ?, batch_merkle_root_sha256 = ?, leaf_index = ?
                    WHERE receipt_id = ?
                    """,
                    (built.batch_id, built.merkle_root, idx, rid),
                )

            conn.commit()

            return {
                "ok": True,
                "batch_id": built.batch_id,
                "created_at": built.created_at,
                "network": built.network,
                "protocol_version": built.protocol_version,
                "leaf_count": built.leaf_count,
                "merkle_root": built.merkle_root,
                "batch_commitment": built.batch_commitment,
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def list_unbatched_receipt_groups(self) -> List[Tuple[str, str]]:
        """Distinct (network, protocol_version) with receipts eligible for Merkle batching."""
        if self._pg:
            from backend.utils import timeline_postgres as tp

            return tp.list_unbatched_receipt_groups()
        with self._conn() as c:
            rows = c.execute(
                """
                SELECT DISTINCT network, protocol_version
                FROM receipts
                WHERE receipt_hash_sha256 IS NOT NULL
                  AND (batch_id IS NULL OR batch_id = '')
                ORDER BY network ASC, protocol_version ASC
                """
            ).fetchall()
        return [(str(r["network"]), str(r["protocol_version"])) for r in rows]

    def list_unanchored_batches(self, *, limit: int = 50) -> List[Dict[str, Any]]:
        """Deprecated name: use ``list_merkle_batches_pending_anchor`` (respects retries + status)."""
        ma = max(1, int(os.getenv("CLAW_MERKLE_ANCHOR_MAX_ATTEMPTS", "8")))
        return self.list_merkle_batches_pending_anchor(limit=limit, max_attempts=ma)

    def list_merkle_batches_pending_anchor(
        self, *, limit: int = 50, max_attempts: int = 8
    ) -> List[Dict[str, Any]]:
        """
        Merkle batches eligible for chain anchor: no final txid, below max failures, pending/failed status.
        """
        if self._pg:
            from backend.utils import timeline_postgres as tp

            return tp.list_merkle_batches_pending_anchor(limit=limit, max_attempts=max_attempts)
        with self._conn() as c:
            rows = c.execute(
                """
                SELECT *
                FROM batches
                WHERE (anchor_txid IS NULL OR TRIM(COALESCE(anchor_txid, '')) = '')
                  AND COALESCE(anchor_attempts, 0) < ?
                  AND (
                    COALESCE(anchor_status, 'pending') IN ('pending', 'failed')
                  )
                ORDER BY created_at ASC
                LIMIT ?
                """,
                (max_attempts, limit),
            ).fetchall()
        return [dict(r) for r in rows]

    def mark_merkle_batch_anchor_attempt_started(self, *, batch_id: str) -> None:
        now = _utc_now_iso()
        if self._pg:
            from backend.utils import timeline_postgres as tp

            tp.mark_merkle_batch_anchor_attempt_started(batch_id=batch_id, now_iso=now)
            return
        with self._conn() as c:
            c.execute(
                """
                UPDATE batches
                SET anchor_status='anchoring', anchor_updated_at=?
                WHERE batch_id=?
                """,
                (now, batch_id),
            )

    def mark_merkle_batch_anchored(self, *, batch_id: str, anchor_txid: str) -> None:
        now = _utc_now_iso()
        if self._pg:
            from backend.utils import timeline_postgres as tp

            tp.mark_merkle_batch_anchored(
                batch_id=batch_id, anchor_txid=anchor_txid, now_iso=now
            )
            return
        with self._conn() as c:
            c.execute(
                """
                UPDATE batches
                SET anchor_txid=?,
                    anchor_status='anchored',
                    anchor_error=NULL,
                    anchor_updated_at=?
                WHERE batch_id=?
                """,
                (anchor_txid, now, batch_id),
            )

    def mark_merkle_batch_anchor_failed(self, *, batch_id: str, error: str) -> None:
        now = _utc_now_iso()
        err = (error or "")[:4000]
        if self._pg:
            from backend.utils import timeline_postgres as tp

            tp.mark_merkle_batch_anchor_failed(batch_id=batch_id, error=err, now_iso=now)
            return
        with self._conn() as c:
            c.execute(
                """
                UPDATE batches
                SET anchor_status='failed',
                    anchor_error=?,
                    anchor_attempts=COALESCE(anchor_attempts,0)+1,
                    anchor_updated_at=?
                WHERE batch_id=?
                """,
                (err, now, batch_id),
            )

    def recover_stale_merkle_batch_anchoring(self, *, stale_seconds: int = 900) -> int:
        """Reset ``anchoring`` rows stuck without progress (worker crash mid-flight)."""
        from datetime import datetime, timedelta, timezone

        cutoff_dt = datetime.now(timezone.utc) - timedelta(seconds=stale_seconds)
        cutoff = cutoff_dt.isoformat().replace("+00:00", "Z")
        now = _utc_now_iso()
        if self._pg:
            from backend.utils import timeline_postgres as tp

            return tp.recover_stale_merkle_batch_anchoring(cutoff_iso=cutoff, now_iso=now)
        with self._conn() as c:
            cur = c.execute(
                """
                UPDATE batches
                SET anchor_status='pending',
                    anchor_error=COALESCE(anchor_error,'') || ';recovered_stale_anchoring',
                    anchor_updated_at=?
                WHERE anchor_status='anchoring'
                  AND (anchor_updated_at IS NULL OR anchor_updated_at < ?)
                """,
                (now, cutoff),
            )
            return int(cur.rowcount or 0)

    def requeue_retryable_timeline_anchor_failures(self, *, max_attempts: int = 8) -> int:
        now = _utc_now_iso()
        if self._pg:
            from backend.utils import timeline_postgres as tp

            return tp.requeue_retryable_timeline_anchor_failures(
                now_iso=now, max_attempts=max_attempts
            )
        with self._conn() as c:
            cur = c.execute(
                """
                UPDATE timeline_anchor_jobs
                SET status='queued', updated_at=?
                WHERE status='failed'
                  AND COALESCE(attempts, 0) < ?
                """,
                (now, max_attempts),
            )
            return int(cur.rowcount or 0)

    def set_batch_anchor_txid(self, *, batch_id: str, anchor_txid: str) -> None:
        if self._pg:
            from backend.utils import timeline_postgres as tp

            tp.set_batch_anchor_txid(batch_id=batch_id, anchor_txid=anchor_txid)
            return
        with self._conn() as c:
            c.execute(
                "UPDATE batches SET anchor_txid = ? WHERE batch_id = ?",
                (anchor_txid, batch_id),
            )

    def set_receipt_txids_for_batch(self, *, batch_id: str, btc_txid: str) -> None:
        if self._pg:
            from backend.utils import timeline_postgres as tp

            tp.set_receipt_txids_for_batch(batch_id=batch_id, btc_txid=btc_txid)
            return
        with self._conn() as c:
            c.execute(
                """
                UPDATE receipts
                SET btc_txid = ?
                WHERE receipt_id IN (SELECT receipt_id FROM batch_receipts WHERE batch_id = ?)
                """,
                (btc_txid, batch_id),
            )

    def get_latest_receipt_for_timeline(self, timeline_id: str) -> Optional[Dict[str, Any]]:
        if self._pg:
            from backend.utils import timeline_postgres as tp

            rid = tp.get_latest_receipt_id_for_timeline(timeline_id)
            if not rid:
                return None
            return self.get_receipt(rid)
        with self._conn() as c:
            row = c.execute(
                """
                SELECT receipt_id FROM receipts
                WHERE timeline_id = ?
                ORDER BY issued_at DESC
                LIMIT 1
                """,
                (timeline_id,),
            ).fetchone()
        if not row:
            return None
        return self.get_receipt(str(row["receipt_id"]))

    # ----------------------------
    # Timeline anchor job queue (batch mode)
    # ----------------------------
    def enqueue_timeline_anchor_job(
        self,
        *,
        receipt_id: str,
        timeline_id: str,
        network: str,
        commitment: str,
    ) -> str:
        job_id = f"tl_anchor_{receipt_id}"
        now = _utc_now_iso()
        if self._pg:
            from backend.utils import timeline_postgres as tp

            tp.enqueue_timeline_anchor_job(
                job_id=job_id,
                receipt_id=receipt_id,
                timeline_id=timeline_id,
                network=network,
                commitment=commitment,
                now_iso=now,
            )
            return job_id
        with self._conn() as c:
            c.execute(
                """
                INSERT OR IGNORE INTO timeline_anchor_jobs
                (job_id, receipt_id, timeline_id, network, commitment, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)
                """,
                (job_id, receipt_id, timeline_id, network, commitment, now, now),
            )
        return job_id

    def list_queued_timeline_anchor_jobs(self, *, limit: int = 200) -> List[Dict[str, Any]]:
        if self._pg:
            from backend.utils import timeline_postgres as tp

            return tp.list_queued_timeline_anchor_jobs(limit=limit)
        with self._conn() as c:
            rows = c.execute(
                """
                SELECT *
                FROM timeline_anchor_jobs
                WHERE status = 'queued'
                ORDER BY created_at ASC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    def claim_timeline_anchor_jobs(self, *, max_n: int = 1000) -> List[Dict[str, Any]]:
        """
        Claim queued jobs and mark them running to avoid double-processing.
        """
        if self._pg:
            from backend.utils import timeline_postgres as tp

            return tp.claim_timeline_anchor_jobs(max_n=max_n)

        conn = self._conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            rows = conn.execute(
                """
                SELECT * FROM timeline_anchor_jobs
                WHERE status = 'queued'
                ORDER BY created_at ASC
                LIMIT ?
                """,
                (max_n,),
            ).fetchall()

            jobs = [dict(r) for r in rows]
            now = _utc_now_iso()
            for j in jobs:
                conn.execute(
                    """
                    UPDATE timeline_anchor_jobs
                    SET status='running', updated_at=?
                    WHERE job_id=? AND status='queued'
                    """,
                    (now, j["job_id"]),
                )
            conn.commit()
            return jobs
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def mark_timeline_anchor_built(
        self,
        *,
        job_id: str,
        receipt_id: str,
        batch_id: str,
        batch_merkle_root_sha256: str,
        leaf_index: int,
        merkle_proof_siblings_hex: List[str],
    ) -> None:
        """
        Mark a job as built (we currently reuse status='done' for "built but not broadcast"),
        and store batch fields into the underlying receipt.
        """
        now = _utc_now_iso()
        mpj = json.dumps(
            merkle_proof_siblings_hex, ensure_ascii=False, separators=(",", ":"), sort_keys=False
        )
        if self._pg:
            from backend.utils import timeline_postgres as tp

            tp.mark_timeline_anchor_built(
                job_id=job_id,
                receipt_id=receipt_id,
                batch_id=batch_id,
                batch_merkle_root_sha256=batch_merkle_root_sha256,
                leaf_index=leaf_index,
                merkle_proof_json=mpj,
                now_iso=now,
            )
            return
        conn = self._conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                UPDATE timeline_anchor_jobs
                SET status='done', txid=NULL, error=NULL, updated_at=?
                WHERE job_id=?
                """,
                (now, job_id),
            )
            conn.execute(
                """
                UPDATE receipts
                SET batch_id = ?,
                    batch_merkle_root_sha256 = ?,
                    leaf_index = ?,
                    merkle_proof_json = ?
                WHERE receipt_id = ?
                """,
                (
                    batch_id,
                    batch_merkle_root_sha256,
                    leaf_index,
                    mpj,
                    receipt_id,
                ),
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def mark_timeline_anchor_done(self, *, job_id: str, txid: str) -> None:
        now = _utc_now_iso()
        if self._pg:
            from backend.utils import timeline_postgres as tp

            tp.mark_timeline_anchor_done(job_id=job_id, txid=txid, now_iso=now)
            return
        with self._conn() as c:
            c.execute(
                """
                UPDATE timeline_anchor_jobs
                SET status='done', txid=?, error=NULL, updated_at=?
                WHERE job_id=?
                """,
                (txid, now, job_id),
            )

    def mark_timeline_anchor_failed(self, *, job_id: str, error: str) -> None:
        now = _utc_now_iso()
        err = (error or "")[:4000]
        if self._pg:
            from backend.utils import timeline_postgres as tp

            tp.mark_timeline_anchor_failed(job_id=job_id, error=err, now_iso=now)
            return
        with self._conn() as c:
            c.execute(
                """
                UPDATE timeline_anchor_jobs
                SET status='failed',
                    error=?,
                    updated_at=?,
                    attempts=COALESCE(attempts,0)+1
                WHERE job_id=?
                """,
                (err, now, job_id),
            )

    def get_merkle_batch_row(self, batch_id: str) -> Optional[Dict[str, Any]]:
        """Raw batch header row (verifier / proof-status helpers)."""
        if self._pg:
            from backend.utils import timeline_postgres as tp

            return tp.get_batch_row(batch_id)
        with self._conn() as c:
            row = c.execute("SELECT * FROM batches WHERE batch_id = ?", (batch_id,)).fetchone()
        return dict(row) if row else None

    def find_event_row_by_event_id(self, event_id: str) -> Optional[Dict[str, Any]]:
        if self._pg:
            from backend.utils import timeline_postgres as tp

            return tp.find_event_row_by_event_id(event_id)
        with self._conn() as c:
            row = c.execute(
                "SELECT timeline_id, event_id, notice_json FROM events WHERE event_id = ?",
                (event_id,),
            ).fetchone()
        return dict(row) if row else None

    def get_latest_liability_event_id(self, timeline_id: str) -> Optional[str]:
        if self._pg:
            from backend.utils import timeline_postgres as tp

            return tp.get_latest_liability_event_id(timeline_id)
        with self._conn() as c:
            row = c.execute(
                """
                SELECT event_id
                FROM events
                WHERE timeline_id = ?
                  AND event_type = 'notice'
                  AND notice_json LIKE '%"liability_attestation"%'
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (timeline_id,),
            ).fetchone()
        return str(row["event_id"]) if row else None
