# backend/utils/anchor_queue.py
from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional

DEFAULT_DB_PATH = os.getenv("CLAW_USAGE_DB_PATH", "audit/usage.sqlite3")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class AnchorJob:
    job_id: str
    merkle_root_sha256: str
    receipt_commitment: str
    network: str
    status: str
    created_at: str


class AnchorQueue:
    """
    SQLite-backed queue:
      - enqueue() stores pending anchor jobs
      - claim_batch() atomically marks jobs as 'claimed'
      - mark_done()/mark_failed() finalize results
    """

    def __init__(self, db_path: str = DEFAULT_DB_PATH) -> None:
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.db_path = db_path
        self._init()

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(self.db_path)
        c.execute("PRAGMA journal_mode=WAL;")
        return c

    def _init(self) -> None:
        with self._conn() as c:
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS anchor_jobs (
                    job_id TEXT PRIMARY KEY,
                    merkle_root_sha256 TEXT NOT NULL,
                    receipt_commitment TEXT NOT NULL,
                    network TEXT NOT NULL,
                    status TEXT NOT NULL, -- pending | claimed | done | failed
                    anchor_txid TEXT,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            c.execute("CREATE INDEX IF NOT EXISTS idx_anchor_jobs_status ON anchor_jobs(status)")
            c.commit()

    def enqueue(
        self,
        job_id: str,
        merkle_root_sha256: str,
        receipt_commitment: str,
        network: str,
    ) -> None:
        now = _utc_now().isoformat()
        with self._conn() as c:
            # idempotent insert (ignore if job_id already exists)
            c.execute(
                """
                INSERT OR IGNORE INTO anchor_jobs(
                    job_id, merkle_root_sha256, receipt_commitment, network,
                    status, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, 'pending', ?, ?)
                """,
                (job_id, merkle_root_sha256, receipt_commitment, network, now, now),
            )
            c.commit()

    def claim_batch(self, max_n: int) -> List[AnchorJob]:
        now = _utc_now().isoformat()
        with self._conn() as c:
            rows = c.execute(
                """
                SELECT job_id, merkle_root_sha256, receipt_commitment, network, status, created_at
                FROM anchor_jobs
                WHERE status='pending'
                ORDER BY created_at ASC
                LIMIT ?
                """,
                (max_n,),
            ).fetchall()

            jobs = [AnchorJob(*r) for r in rows]
            if not jobs:
                return []

            # Mark claimed
            for j in jobs:
                c.execute(
                    "UPDATE anchor_jobs SET status='claimed', updated_at=? WHERE job_id=? AND status='pending'",
                    (now, j.job_id),
                )
            c.commit()
            return jobs

    def mark_done(self, job_id: str, anchor_txid: str) -> None:
        now = _utc_now().isoformat()
        with self._conn() as c:
            c.execute(
                "UPDATE anchor_jobs SET status='done', anchor_txid=?, error=NULL, updated_at=? WHERE job_id=?",
                (anchor_txid, now, job_id),
            )
            c.commit()

    def mark_failed(self, job_id: str, error: str) -> None:
        now = _utc_now().isoformat()
        with self._conn() as c:
            c.execute(
                "UPDATE anchor_jobs SET status='failed', error=?, updated_at=? WHERE job_id=?",
                (error[:2000], now, job_id),
            )
            c.commit()

    def pending_count(self) -> int:
        with self._conn() as c:
            row = c.execute("SELECT COUNT(*) FROM anchor_jobs WHERE status='pending'").fetchone()
            return int(row[0]) if row else 0
