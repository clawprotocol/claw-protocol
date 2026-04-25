"""SQLite persistence for timeline events, anchor requests, exports, folders, AI-org metadata."""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.config.runtime_environment import data_dir


def proof_layer_db_path() -> str:
    env = os.getenv("CLAW_PROOF_LAYER_DB_PATH", "").strip()
    if env:
        return os.path.expanduser(env)
    return os.path.join(data_dir(), "proof_layer.sqlite3")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class ProofLayerStore:
    def __init__(self, path: Optional[str] = None) -> None:
        self._path = path or proof_layer_db_path()
        os.makedirs(os.path.dirname(self._path) or ".", exist_ok=True)

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(self._path, timeout=30.0)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL;")
        return c

    def init_schema(self) -> None:
        with self._conn() as con:
            con.executescript(
                """
                CREATE TABLE IF NOT EXISTS proof_timeline_events (
                  event_id TEXT PRIMARY KEY,
                  timeline_id TEXT NOT NULL,
                  actor_id TEXT,
                  event_type TEXT NOT NULL,
                  recorded_at TEXT NOT NULL,
                  event_hash TEXT,
                  receipt_id TEXT,
                  subject_type TEXT NOT NULL,
                  subject_id TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_proof_events_subject
                  ON proof_timeline_events (subject_type, subject_id);
                CREATE INDEX IF NOT EXISTS idx_proof_events_receipt
                  ON proof_timeline_events (receipt_id);

                CREATE TABLE IF NOT EXISTS proof_anchor_requests (
                  anchor_request_id TEXT PRIMARY KEY,
                  subject_type TEXT NOT NULL,
                  subject_id TEXT NOT NULL,
                  requested_by_user_id TEXT,
                  requested_at TEXT,
                  anchor_preference TEXT NOT NULL DEFAULT 'batched',
                  anchor_status TEXT NOT NULL,
                  anchor_error TEXT,
                  batch_id TEXT,
                  network TEXT,
                  txid TEXT,
                  external_reference TEXT,
                  anchor_requested_at TEXT,
                  anchor_submitted_at TEXT,
                  anchor_confirmed_at TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  UNIQUE (subject_type, subject_id)
                );

                CREATE TABLE IF NOT EXISTS proof_export_jobs (
                  export_id TEXT PRIMARY KEY,
                  owner_subject TEXT NOT NULL,
                  scope TEXT NOT NULL,
                  scope_ref TEXT,
                  status TEXT NOT NULL,
                  manifest_json TEXT,
                  download_path TEXT,
                  error_message TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_proof_exports_owner
                  ON proof_export_jobs (owner_subject, created_at);

                CREATE TABLE IF NOT EXISTS proof_folders (
                  folder_id TEXT PRIMARY KEY,
                  owner_subject TEXT NOT NULL,
                  folder_name TEXT NOT NULL,
                  parent_folder_id TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_proof_folders_owner
                  ON proof_folders (owner_subject);

                CREATE TABLE IF NOT EXISTS proof_ai_org_suggestions (
                  id TEXT PRIMARY KEY,
                  owner_subject TEXT NOT NULL,
                  subject_type TEXT NOT NULL,
                  subject_id TEXT NOT NULL,
                  suggestion_type TEXT NOT NULL,
                  payload_json TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  applied_at TEXT,
                  dismissed_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_proof_ai_subject
                  ON proof_ai_org_suggestions (subject_type, subject_id);
                """
            )
            con.commit()

    def upsert_timeline_event(
        self,
        *,
        timeline_id: str,
        event_type: str,
        recorded_at: str,
        subject_type: str,
        subject_id: str,
        receipt_id: Optional[str] = None,
        actor_id: Optional[str] = None,
        event_hash: Optional[str] = None,
    ) -> str:
        eid = f"pevt_{uuid.uuid4().hex}"
        now = _utc_now()
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO proof_timeline_events (
                  event_id, timeline_id, actor_id, event_type, recorded_at,
                  event_hash, receipt_id, subject_type, subject_id, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    eid,
                    timeline_id,
                    actor_id,
                    event_type,
                    recorded_at,
                    event_hash,
                    receipt_id,
                    subject_type,
                    subject_id,
                    now,
                ),
            )
            con.commit()
        return eid

    def latest_event_for_subject(self, subject_type: str, subject_id: str) -> Optional[Dict[str, Any]]:
        st = (subject_type or "").strip()
        sid = (subject_id or "").strip()
        if not st or not sid:
            return None
        with self._conn() as con:
            row = con.execute(
                """
                SELECT * FROM proof_timeline_events
                WHERE subject_type = ? AND subject_id = ?
                ORDER BY recorded_at DESC, created_at DESC
                LIMIT 1
                """,
                (st, sid),
            ).fetchone()
            return dict(row) if row else None

    def get_anchor_request(self, subject_type: str, subject_id: str) -> Optional[Dict[str, Any]]:
        st = (subject_type or "").strip()
        sid = (subject_id or "").strip()
        if not st or not sid:
            return None
        with self._conn() as con:
            row = con.execute(
                """
                SELECT * FROM proof_anchor_requests
                WHERE subject_type = ? AND subject_id = ?
                """,
                (st, sid),
            ).fetchone()
            return dict(row) if row else None

    def upsert_anchor_request(
        self,
        *,
        subject_type: str,
        subject_id: str,
        anchor_status: str,
        requested_by_user_id: Optional[str] = None,
        anchor_preference: str = "batched",
        batch_id: Optional[str] = None,
        network: Optional[str] = None,
        txid: Optional[str] = None,
        external_reference: Optional[str] = None,
        anchor_error: Optional[str] = None,
        anchor_requested_at: Optional[str] = None,
        anchor_submitted_at: Optional[str] = None,
        anchor_confirmed_at: Optional[str] = None,
    ) -> Dict[str, Any]:
        st = (subject_type or "").strip()
        sid = (subject_id or "").strip()
        now = _utc_now()
        with self._conn() as con:
            row = con.execute(
                "SELECT * FROM proof_anchor_requests WHERE subject_type = ? AND subject_id = ?",
                (st, sid),
            ).fetchone()
            if row:
                rid = str(row["anchor_request_id"])
                con.execute(
                    """
                    UPDATE proof_anchor_requests SET
                      requested_by_user_id = COALESCE(?, requested_by_user_id),
                      anchor_preference = ?,
                      anchor_status = ?,
                      anchor_error = ?,
                      batch_id = COALESCE(?, batch_id),
                      network = COALESCE(?, network),
                      txid = COALESCE(?, txid),
                      external_reference = COALESCE(?, external_reference),
                      anchor_requested_at = COALESCE(?, anchor_requested_at),
                      anchor_submitted_at = COALESCE(?, anchor_submitted_at),
                      anchor_confirmed_at = COALESCE(?, anchor_confirmed_at),
                      updated_at = ?
                    WHERE anchor_request_id = ?
                    """,
                    (
                        requested_by_user_id,
                        anchor_preference,
                        anchor_status,
                        anchor_error,
                        batch_id,
                        network,
                        txid,
                        external_reference,
                        anchor_requested_at,
                        anchor_submitted_at,
                        anchor_confirmed_at,
                        now,
                        rid,
                    ),
                )
                con.commit()
                out = con.execute(
                    "SELECT * FROM proof_anchor_requests WHERE anchor_request_id = ?",
                    (rid,),
                ).fetchone()
                return dict(out) if out else {}

            rid = f"par_{uuid.uuid4().hex}"
            req_at = anchor_requested_at or now
            con.execute(
                """
                INSERT INTO proof_anchor_requests (
                  anchor_request_id, subject_type, subject_id, requested_by_user_id,
                  requested_at, anchor_preference, anchor_status, anchor_error,
                  batch_id, network, txid, external_reference,
                  anchor_requested_at, anchor_submitted_at, anchor_confirmed_at,
                  created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    rid,
                    st,
                    sid,
                    requested_by_user_id,
                    now,
                    anchor_preference,
                    anchor_status,
                    anchor_error,
                    batch_id,
                    network,
                    txid,
                    external_reference,
                    req_at,
                    anchor_submitted_at,
                    anchor_confirmed_at,
                    now,
                    now,
                ),
            )
            con.commit()
            out = con.execute(
                "SELECT * FROM proof_anchor_requests WHERE anchor_request_id = ?",
                (rid,),
            ).fetchone()
            return dict(out) if out else {}

    def create_export_job(
        self,
        *,
        owner_subject: str,
        scope: str,
        scope_ref: Optional[str] = None,
    ) -> Dict[str, Any]:
        eid = f"pex_{uuid.uuid4().hex}"
        now = _utc_now()
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO proof_export_jobs (
                  export_id, owner_subject, scope, scope_ref, status,
                  manifest_json, download_path, error_message, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'queued', NULL, NULL, NULL, ?, ?)
                """,
                (eid, owner_subject, scope, scope_ref, now, now),
            )
            con.commit()
            row = con.execute("SELECT * FROM proof_export_jobs WHERE export_id = ?", (eid,)).fetchone()
            return dict(row) if row else {}

    def get_export_job(self, export_id: str, owner_subject: str) -> Optional[Dict[str, Any]]:
        eid = (export_id or "").strip()
        own = (owner_subject or "").strip()
        if not eid or not own:
            return None
        with self._conn() as con:
            row = con.execute(
                """
                SELECT * FROM proof_export_jobs
                WHERE export_id = ? AND owner_subject = ?
                """,
                (eid, own),
            ).fetchone()
            return dict(row) if row else None

    def update_export_job_manifest(
        self, export_id: str, *, status: str, manifest: Optional[Dict[str, Any]] = None, error: Optional[str] = None
    ) -> None:
        now = _utc_now()
        mj = json.dumps(manifest, separators=(",", ":"), default=str) if manifest is not None else None
        with self._conn() as con:
            con.execute(
                """
                UPDATE proof_export_jobs
                SET status = ?, manifest_json = COALESCE(?, manifest_json),
                    error_message = ?, updated_at = ?
                WHERE export_id = ?
                """,
                (status, mj, error, now, export_id),
            )
            con.commit()

    def get_folder(self, owner_subject: str, folder_id: str) -> Optional[Dict[str, Any]]:
        own = (owner_subject or "").strip()
        fid = (folder_id or "").strip()
        if not own or not fid:
            return None
        with self._conn() as con:
            row = con.execute(
                "SELECT * FROM proof_folders WHERE owner_subject = ? AND folder_id = ?",
                (own, fid),
            ).fetchone()
            return dict(row) if row else None

    def insert_folder(
        self,
        owner_subject: str,
        folder_name: str,
        parent_folder_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        own = (owner_subject or "").strip()
        name = (folder_name or "").strip()
        if not own or not name:
            return {}
        fid = f"fld_{uuid.uuid4().hex}"
        now = _utc_now()
        pid = (parent_folder_id or "").strip() or None
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO proof_folders (
                  folder_id, owner_subject, folder_name, parent_folder_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (fid, own, name[:120], pid, now, now),
            )
            con.commit()
            row = con.execute("SELECT * FROM proof_folders WHERE folder_id = ?", (fid,)).fetchone()
            return dict(row) if row else {}

    def list_folders(self, owner_subject: str) -> List[Dict[str, Any]]:
        own = (owner_subject or "").strip()
        if not own:
            return []
        with self._conn() as con:
            rows = con.execute(
                "SELECT * FROM proof_folders WHERE owner_subject = ? ORDER BY folder_name ASC",
                (own,),
            ).fetchall()
            return [dict(r) for r in rows]
