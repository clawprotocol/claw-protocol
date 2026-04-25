from __future__ import annotations

import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from backend.config.runtime_environment import data_dir


def _feed_db_path() -> str:
    env = os.getenv("CLAW_FEED_DB_PATH", "").strip()
    if env:
        return os.path.expanduser(env)
    return os.path.join(data_dir(), "claw_feed.sqlite3")


@dataclass(frozen=True)
class FeedEventRow:
    event_id: str
    agreement_id: str
    event_type: str
    at: str
    summary: str
    visibility: str
    anchor_network: str
    anchor_status: str
    anchor_txid: Optional[str]
    batch_id: Optional[str]
    commitment_hex: str
    anchor_attempts: int
    anchor_error: Optional[str]


class ClawFeedStore:
    def __init__(self, db_path: str | None = None) -> None:
        self._path = db_path or _feed_db_path()

    def _connect(self) -> sqlite3.Connection:
        con = sqlite3.connect(self._path, timeout=30.0)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA journal_mode=WAL;")
        return con

    def init_schema(self) -> None:
        with self._connect() as con:
            con.executescript(
                """
                CREATE TABLE IF NOT EXISTS feed_events (
                  event_id TEXT PRIMARY KEY,
                  agreement_id TEXT NOT NULL,
                  event_type TEXT NOT NULL,
                  at TEXT NOT NULL,
                  summary TEXT NOT NULL,
                  visibility TEXT NOT NULL,
                  anchor_network TEXT NOT NULL,
                  anchor_status TEXT NOT NULL,
                  anchor_txid TEXT,
                  batch_id TEXT,
                  commitment_hex TEXT NOT NULL,
                  anchor_attempts INTEGER NOT NULL DEFAULT 0,
                  anchor_error TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_feed_events_agreement
                  ON feed_events (agreement_id);
                CREATE INDEX IF NOT EXISTS idx_feed_events_at
                  ON feed_events (at DESC);
                CREATE INDEX IF NOT EXISTS idx_feed_events_anchor_status
                  ON feed_events (anchor_status);

                CREATE TABLE IF NOT EXISTS feed_anchor_jobs (
                  job_id TEXT PRIMARY KEY,
                  event_id TEXT NOT NULL,
                  network TEXT NOT NULL,
                  commitment_hex TEXT NOT NULL,
                  status TEXT NOT NULL,
                  attempts INTEGER NOT NULL DEFAULT 0,
                  last_error TEXT,
                  UNIQUE(event_id)
                );
                CREATE INDEX IF NOT EXISTS idx_feed_anchor_jobs_status
                  ON feed_anchor_jobs (status);
                """
            )
            self._migrate_feed_anchor_jobs_columns(con)

    def _migrate_feed_anchor_jobs_columns(self, con: sqlite3.Connection) -> None:
        cols = {str(r[1]) for r in con.execute("PRAGMA table_info(feed_anchor_jobs)").fetchall()}
        if "claimed_at" not in cols:
            con.execute("ALTER TABLE feed_anchor_jobs ADD COLUMN claimed_at TEXT")

    def recover_stale_feed_anchor_jobs(self, *, stale_seconds: int = 900) -> int:
        """Reset jobs stuck in ``processing`` (e.g. worker crash) back to ``queued``."""
        if stale_seconds <= 0:
            return 0
        cutoff = (datetime.now(timezone.utc) - timedelta(seconds=int(stale_seconds))).isoformat().replace(
            "+00:00", "Z"
        )
        with self._connect() as con:
            cur = con.execute(
                """
                UPDATE feed_anchor_jobs
                SET status = 'queued', last_error = 'stale_claim_recovered'
                WHERE status = 'processing' AND claimed_at IS NOT NULL AND claimed_at < ?
                """,
                (cutoff,),
            )
            return int(cur.rowcount or 0)

    def insert_feed_event_pending(
        self,
        *,
        event_id: str,
        agreement_id: str,
        event_type: str,
        at: str,
        summary: str,
        visibility: str,
        anchor_network: str,
        commitment_hex: str,
    ) -> str:
        with self._connect() as con:
            con.execute(
                """
                INSERT INTO feed_events (
                  event_id, agreement_id, event_type, at, summary, visibility,
                  anchor_network, anchor_status, anchor_txid, batch_id,
                  commitment_hex, anchor_attempts, anchor_error
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, 0, NULL)
                """,
                (
                    event_id,
                    agreement_id,
                    event_type,
                    at,
                    summary,
                    visibility,
                    anchor_network,
                    commitment_hex,
                ),
            )
            con.execute(
                """
                INSERT INTO feed_anchor_jobs (job_id, event_id, network, commitment_hex, status, attempts)
                VALUES (?, ?, ?, ?, 'queued', 0)
                """,
                (str(uuid.uuid4()), event_id, anchor_network, commitment_hex),
            )
        return event_id

    def list_public_feed_events(self, *, limit: int = 100) -> List[Dict[str, Any]]:
        with self._connect() as con:
            rows = con.execute(
                """
                SELECT event_id, agreement_id, event_type, at, summary, visibility,
                  anchor_network, anchor_status, anchor_txid, batch_id,
                  commitment_hex, anchor_attempts, anchor_error
                FROM feed_events
                WHERE visibility = 'public'
                ORDER BY at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    def get_feed_anchor_summary_for_agreement(self, agreement_id: str) -> Optional[Dict[str, Any]]:
        """Latest feed row with anchored txid, else latest row."""
        aid = (agreement_id or "").strip()
        if not aid:
            return None
        with self._connect() as con:
            row = con.execute(
                """
                SELECT event_id, event_type, at, summary, anchor_network, anchor_status, anchor_txid, batch_id
                FROM feed_events
                WHERE agreement_id = ? AND visibility = 'public' AND anchor_txid IS NOT NULL AND anchor_txid != ''
                ORDER BY at DESC
                LIMIT 1
                """,
                (aid,),
            ).fetchone()
            if row:
                return dict(row)
            row = con.execute(
                """
                SELECT event_id, event_type, at, summary, anchor_network, anchor_status, anchor_txid, batch_id
                FROM feed_events
                WHERE agreement_id = ? AND visibility = 'public'
                ORDER BY at DESC
                LIMIT 1
                """,
                (aid,),
            ).fetchone()
            if row:
                return dict(row)
        return None

    def claim_feed_anchor_jobs(self, *, max_n: int) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        with self._connect() as con:
            con.execute("BEGIN IMMEDIATE")
            rows = con.execute(
                """
                SELECT job_id, event_id, network, commitment_hex, attempts
                FROM feed_anchor_jobs
                WHERE status = 'queued'
                ORDER BY rowid ASC
                LIMIT ?
                """,
                (max_n,),
            ).fetchall()
            now_claim = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            for r in rows:
                jid = str(r["job_id"])
                con.execute(
                    "UPDATE feed_anchor_jobs SET status = 'processing', claimed_at = ? WHERE job_id = ?",
                    (now_claim, jid),
                )
                con.execute(
                    """
                    UPDATE feed_events SET anchor_status = 'queued'
                    WHERE event_id = ? AND anchor_status IN ('pending', 'queued', 'failed')
                    """,
                    (str(r["event_id"]),),
                )
                out.append(
                    {
                        "job_id": jid,
                        "event_id": str(r["event_id"]),
                        "network": str(r["network"]),
                        "commitment": str(r["commitment_hex"]),
                        "attempts": int(r["attempts"] or 0),
                    }
                )
            con.execute("COMMIT")
        return out

    def mark_feed_anchor_done(self, *, job_id: str, event_id: str, txid: str) -> None:
        with self._connect() as con:
            con.execute(
                "UPDATE feed_anchor_jobs SET status = 'done', last_error = NULL WHERE job_id = ?",
                (job_id,),
            )
            con.execute(
                """
                UPDATE feed_events
                SET anchor_status = 'anchored', anchor_txid = ?, anchor_error = NULL
                WHERE event_id = ?
                """,
                (txid, event_id),
            )

    def mark_feed_anchor_failed(self, *, job_id: str, event_id: str, error: str, max_attempts: int) -> None:
        err = (error or "").strip() or "unknown_error"
        with self._connect() as con:
            row = con.execute(
                "SELECT attempts FROM feed_anchor_jobs WHERE job_id = ?", (job_id,)
            ).fetchone()
            attempts = int(row["attempts"] or 0) + 1 if row else 1
            failed_final = attempts >= max_attempts
            status = "failed" if failed_final else "queued"
            con.execute(
                """
                UPDATE feed_anchor_jobs
                SET status = ?, attempts = ?, last_error = ?
                WHERE job_id = ?
                """,
                (status, attempts, err, job_id),
            )
            ev_status = "failed" if failed_final else "queued"
            con.execute(
                """
                UPDATE feed_events
                SET anchor_status = ?, anchor_error = ?, anchor_attempts = ?
                WHERE event_id = ?
                """,
                (ev_status, err, attempts, event_id),
            )


# Module-level lazy init for API
_store: ClawFeedStore | None = None


def get_claw_feed_store() -> ClawFeedStore:
    global _store
    if _store is None:
        _store = ClawFeedStore()
        _store.init_schema()
    return _store
