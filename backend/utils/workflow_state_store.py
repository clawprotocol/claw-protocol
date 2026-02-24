from __future__ import annotations

import os
import sqlite3
from typing import Any, Dict, List, Optional


class WorkflowStateStore:
    def __init__(self, db_path: Optional[str] = None) -> None:
        if db_path is None:
            db_path = os.path.expanduser(
                os.getenv("CLAW_TIMELINE_DB_PATH", "~/.claw/timeline.sqlite3")
            )
        self.db_path = db_path
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    def _init_db(self) -> None:
        os.makedirs(os.path.dirname(self.db_path) or ".", exist_ok=True)
        with self._conn() as c:
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS state_timelines (
                    timeline_id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    status TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS state_agreements (
                    agreement_id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS state_attestations (
                    attestation_id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    notes_included INTEGER NOT NULL DEFAULT 0
                )
                """
            )

    def upsert_timeline(
        self, *, timeline_id: str, title: str, status: str, updated_at: str
    ) -> None:
        with self._conn() as c:
            c.execute(
                """
                INSERT INTO state_timelines (timeline_id, title, status, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(timeline_id) DO UPDATE SET
                    title=excluded.title,
                    status=excluded.status,
                    updated_at=excluded.updated_at
                """,
                (timeline_id, title, status, updated_at),
            )

    def upsert_agreement(self, *, agreement_id: str, title: str, updated_at: str) -> None:
        with self._conn() as c:
            c.execute(
                """
                INSERT INTO state_agreements (agreement_id, title, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(agreement_id) DO UPDATE SET
                    title=excluded.title,
                    updated_at=excluded.updated_at
                """,
                (agreement_id, title, updated_at),
            )

    def upsert_attestation(
        self,
        *,
        attestation_id: str,
        attestation_type: str,
        updated_at: str,
        notes_included: bool,
    ) -> None:
        with self._conn() as c:
            c.execute(
                """
                INSERT INTO state_attestations (attestation_id, type, updated_at, notes_included)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(attestation_id) DO UPDATE SET
                    type=excluded.type,
                    updated_at=excluded.updated_at,
                    notes_included=excluded.notes_included
                """,
                (attestation_id, attestation_type, updated_at, 1 if notes_included else 0),
            )

    def list_recent(self, *, limit: int) -> Dict[str, List[Dict[str, Any]]]:
        with self._conn() as c:
            timelines = c.execute(
                """
                SELECT timeline_id, title, status, updated_at
                FROM state_timelines
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
            agreements = c.execute(
                """
                SELECT agreement_id, title, updated_at
                FROM state_agreements
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
            attestations = c.execute(
                """
                SELECT attestation_id, type, updated_at, notes_included
                FROM state_attestations
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return {
            "timelines": [dict(r) for r in timelines],
            "agreements": [dict(r) for r in agreements],
            "attestations": [
                {
                    "attestation_id": r["attestation_id"],
                    "type": r["type"],
                    "updated_at": r["updated_at"],
                    "notes_included": bool(r["notes_included"]),
                }
                for r in attestations
            ],
        }

    def export_state(self, *, timeline_id: Optional[str], agreement_id: Optional[str]) -> Dict[str, Any]:
        with self._conn() as c:
            if timeline_id:
                timelines = c.execute(
                    """
                    SELECT timeline_id, title, status, updated_at
                    FROM state_timelines
                    WHERE timeline_id = ?
                    """,
                    (timeline_id,),
                ).fetchall()
            else:
                timelines = c.execute(
                    """
                    SELECT timeline_id, title, status, updated_at
                    FROM state_timelines
                    ORDER BY timeline_id ASC
                    """,
                ).fetchall()
            if agreement_id:
                agreements = c.execute(
                    """
                    SELECT agreement_id, title, updated_at
                    FROM state_agreements
                    WHERE agreement_id = ?
                    """,
                    (agreement_id,),
                ).fetchall()
            else:
                agreements = c.execute(
                    """
                    SELECT agreement_id, title, updated_at
                    FROM state_agreements
                    ORDER BY agreement_id ASC
                    """,
                ).fetchall()
            attestations = c.execute(
                """
                SELECT attestation_id, type, updated_at, notes_included
                FROM state_attestations
                ORDER BY attestation_id ASC
                """,
            ).fetchall()
        return {
            "timelines": [dict(r) for r in timelines],
            "agreements": [dict(r) for r in agreements],
            "attestations": [
                {
                    "attestation_id": r["attestation_id"],
                    "type": r["type"],
                    "updated_at": r["updated_at"],
                    "notes_included": bool(r["notes_included"]),
                }
                for r in attestations
            ],
        }

    def import_state(self, *, state_json: Dict[str, Any]) -> None:
        for tl in state_json.get("timelines") or []:
            self.upsert_timeline(
                timeline_id=tl.get("timeline_id"),
                title=tl.get("title") or "",
                status=tl.get("status") or "draft",
                updated_at=tl.get("updated_at") or "",
            )
        for ag in state_json.get("agreements") or []:
            self.upsert_agreement(
                agreement_id=ag.get("agreement_id"),
                title=ag.get("title") or "",
                updated_at=ag.get("updated_at") or "",
            )
        for att in state_json.get("attestations") or []:
            self.upsert_attestation(
                attestation_id=att.get("attestation_id"),
                attestation_type=att.get("type") or "attestation",
                updated_at=att.get("updated_at") or "",
                notes_included=bool(att.get("notes_included")),
            )
