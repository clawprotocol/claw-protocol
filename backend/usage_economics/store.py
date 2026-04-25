"""SQLite persistence for agreement ownership, internal key counters, and analytics events."""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from backend.config.runtime_environment import data_dir


def usage_economics_db_path() -> str:
    env = os.getenv("CLAW_USAGE_ECONOMICS_DB_PATH", "").strip()
    if env:
        return os.path.expanduser(env)
    return os.path.join(data_dir(), "usage_economics.sqlite3")


def _usage_eco_pg() -> bool:
    from backend.db.config import use_postgresql_for_usage_economics

    return use_postgresql_for_usage_economics()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class UsageEconomicsStore:
    def __init__(self, path: Optional[str] = None) -> None:
        self._path = path or usage_economics_db_path()
        self._pg = _usage_eco_pg()
        if not self._pg:
            os.makedirs(os.path.dirname(self._path) or ".", exist_ok=True)

    def _conn(self) -> sqlite3.Connection:
        if self._pg:
            raise RuntimeError(
                "UsageEconomicsStore uses PostgreSQL; internal SQLite _conn() is not available."
            )
        c = sqlite3.connect(self._path, timeout=30.0)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL;")
        return c

    def init_schema(self) -> None:
        if self._pg:
            from backend.usage_economics.usage_economics_postgres import (
                ensure_usage_economics_schema,
            )

            ensure_usage_economics_schema()
            return
        with self._conn() as con:
            con.executescript(
                """
                CREATE TABLE IF NOT EXISTS agreement_owner (
                  agreement_id TEXT PRIMARY KEY,
                  subject_ref TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  completed_at TEXT,
                  internal_keys_draft INTEGER NOT NULL DEFAULT 0,
                  internal_keys_finalize INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_agreement_owner_subject ON agreement_owner (subject_ref);

                CREATE TABLE IF NOT EXISTS subject_counters (
                  subject_ref TEXT PRIMARY KEY,
                  keys_consumed_total INTEGER NOT NULL DEFAULT 0,
                  agreements_created INTEGER NOT NULL DEFAULT 0,
                  agreements_finalized INTEGER NOT NULL DEFAULT 0,
                  ai_calls_count INTEGER NOT NULL DEFAULT 0,
                  abuse_flag INTEGER NOT NULL DEFAULT 0,
                  soft_throttle_flag INTEGER NOT NULL DEFAULT 0,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS ip_subject_day (
                  ip TEXT NOT NULL,
                  day TEXT NOT NULL,
                  subject_ref TEXT NOT NULL,
                  PRIMARY KEY (ip, day, subject_ref)
                );
                CREATE INDEX IF NOT EXISTS idx_ip_day ON ip_subject_day (ip, day);

                CREATE TABLE IF NOT EXISTS analytics_events (
                  id TEXT PRIMARY KEY,
                  subject_ref TEXT,
                  event_type TEXT NOT NULL,
                  payload_json TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_analytics_subject ON analytics_events (subject_ref, created_at);

                CREATE TABLE IF NOT EXISTS ip_draft_burst (
                  ip TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_ip_draft_burst_ip_ts ON ip_draft_burst (ip, created_at);
                """
            )

    def insert_agreement_owner(
        self,
        *,
        agreement_id: str,
        subject_ref: str,
        internal_keys_draft: int,
    ) -> None:
        now = _utc_now()
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            uep.insert_agreement_owner(
                agreement_id=agreement_id,
                subject_ref=subject_ref,
                internal_keys_draft=internal_keys_draft,
                now_iso=now,
            )
            return
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO agreement_owner (
                  agreement_id, subject_ref, created_at, internal_keys_draft
                ) VALUES (?, ?, ?, ?)
                """,
                (agreement_id, subject_ref, now, int(internal_keys_draft)),
            )
            kd = int(internal_keys_draft)
            con.execute(
                """
                INSERT INTO subject_counters (subject_ref, keys_consumed_total, agreements_created, agreements_finalized, ai_calls_count, abuse_flag, soft_throttle_flag, updated_at)
                VALUES (?, ?, 1, 0, 0, 0, 0, ?)
                ON CONFLICT(subject_ref) DO UPDATE SET
                  agreements_created = agreements_created + 1,
                  keys_consumed_total = keys_consumed_total + ?,
                  updated_at = excluded.updated_at
                """,
                (subject_ref, kd, now, kd),
            )

    def owner_subject_for_agreement(self, agreement_id: str) -> Optional[str]:
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.owner_subject_for_agreement(agreement_id)
        with self._conn() as con:
            row = con.execute(
                "SELECT subject_ref FROM agreement_owner WHERE agreement_id = ?",
                ((agreement_id or "").strip(),),
            ).fetchone()
            return str(row[0]) if row else None

    def get_agreement_owner_row(self, agreement_id: str) -> Optional[Dict[str, Any]]:
        aid = (agreement_id or "").strip()
        if not aid:
            return None
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.get_agreement_owner_row(aid)
        with self._conn() as con:
            row = con.execute(
                """
                SELECT agreement_id, subject_ref, created_at, completed_at
                FROM agreement_owner WHERE agreement_id = ?
                """,
                (aid,),
            ).fetchone()
            return dict(row) if row else None

    def owner_subjects_for_agreement_ids(self, agreement_ids: List[str]) -> Dict[str, Optional[str]]:
        """Map agreement_id → subject_ref when registered; missing ids are omitted from dict."""
        ids = [i.strip() for i in agreement_ids if (i or "").strip()]
        if not ids:
            return {}
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.owner_subjects_for_agreement_ids(ids)
        qmarks = ",".join("?" * len(ids))
        with self._conn() as con:
            rows = con.execute(
                f"SELECT agreement_id, subject_ref FROM agreement_owner WHERE agreement_id IN ({qmarks})",
                ids,
            ).fetchall()
        return {str(r[0]): str(r[1]) for r in rows}

    def count_incomplete_agreements(self, subject_ref: str) -> int:
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.count_incomplete_agreements(subject_ref)
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COUNT(*) AS c FROM agreement_owner
                WHERE subject_ref = ? AND completed_at IS NULL
                """,
                (subject_ref,),
            ).fetchone()
            return int(row[0]) if row else 0

    def count_completed_agreements(self, subject_ref: str) -> int:
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.count_completed_agreements(subject_ref)
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COUNT(*) AS c FROM agreement_owner
                WHERE subject_ref = ? AND completed_at IS NOT NULL
                """,
                (subject_ref,),
            ).fetchone()
            return int(row[0]) if row else 0

    def mark_agreement_completed(
        self,
        *,
        agreement_id: str,
        subject_ref: str,
        internal_keys_finalize: int,
    ) -> bool:
        """Returns False if agreement_id not registered for subject."""
        now = _utc_now()
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.mark_agreement_completed(
                agreement_id=agreement_id,
                subject_ref=subject_ref,
                internal_keys_finalize=internal_keys_finalize,
                now_iso=now,
            )
        with self._conn() as con:
            cur = con.execute(
                """
                UPDATE agreement_owner
                SET completed_at = ?, internal_keys_finalize = ?
                WHERE agreement_id = ? AND subject_ref = ? AND completed_at IS NULL
                """,
                (now, int(internal_keys_finalize), agreement_id, subject_ref),
            )
            if cur.rowcount != 1:
                return False
            con.execute(
                """
                UPDATE subject_counters SET
                  agreements_finalized = agreements_finalized + 1,
                  keys_consumed_total = keys_consumed_total + ?,
                  updated_at = ?
                WHERE subject_ref = ?
                """,
                (int(internal_keys_finalize), now, subject_ref),
            )
            return True

    def get_subject_row(self, subject_ref: str) -> Optional[Dict[str, Any]]:
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.get_subject_row(subject_ref)
        with self._conn() as con:
            row = con.execute(
                "SELECT * FROM subject_counters WHERE subject_ref = ?", (subject_ref,)
            ).fetchone()
            return dict(row) if row else None

    def agreements_created_this_utc_month(self, subject_ref: str) -> int:
        """Count agreements created in current UTC calendar month (paid soft limit)."""
        now = datetime.now(timezone.utc)
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat().replace("+00:00", "Z")
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.agreements_created_this_utc_month(subject_ref, start)
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COUNT(*) AS c FROM agreement_owner
                WHERE subject_ref = ? AND created_at >= ?
                """,
                (subject_ref, start),
            ).fetchone()
            return int(row[0]) if row else 0

    def append_ip_draft_create_event(self, ip: str) -> None:
        """Log one draft-creation event from this IP (for burst / abuse heuristics)."""
        safe_ip = (ip or "unknown").strip() or "unknown"
        now = _utc_now()
        cutoff_day = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat().replace("+00:00", "Z")
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            uep.append_ip_draft_create_event(safe_ip, now, cutoff_day)
            return
        with self._conn() as con:
            con.execute(
                "INSERT INTO ip_draft_burst (ip, created_at) VALUES (?, ?)",
                (safe_ip, now),
            )
            con.execute("DELETE FROM ip_draft_burst WHERE created_at < ?", (cutoff_day,))

    def count_recent_draft_creates_from_ip(self, ip: str, window_seconds: int) -> int:
        safe_ip = (ip or "unknown").strip() or "unknown"
        if window_seconds < 60:
            window_seconds = 60
        cutoff_dt = datetime.now(timezone.utc) - timedelta(seconds=int(window_seconds))
        cutoff = cutoff_dt.isoformat().replace("+00:00", "Z")
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.count_recent_draft_creates_from_ip(safe_ip, cutoff)
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COUNT(*) AS c FROM ip_draft_burst
                WHERE ip = ? AND created_at >= ?
                """,
                (safe_ip, cutoff),
            ).fetchone()
            return int(row[0]) if row else 0

    def record_ip_subject(self, *, ip: str, subject_ref: str) -> int:
        """Return distinct subject count for this IP today."""
        day = datetime.now(timezone.utc).date().isoformat()
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.record_ip_subject(ip=ip, day=day, subject_ref=subject_ref)
        with self._conn() as con:
            con.execute(
                """
                INSERT OR IGNORE INTO ip_subject_day (ip, day, subject_ref) VALUES (?, ?, ?)
                """,
                (ip, day, subject_ref),
            )
            row = con.execute(
                """
                SELECT COUNT(DISTINCT subject_ref) AS c FROM ip_subject_day
                WHERE ip = ? AND day = ?
                """,
                (ip, day),
            ).fetchone()
            return int(row[0]) if row else 0

    def set_abuse_flag(self, subject_ref: str, value: int = 1) -> None:
        now = _utc_now()
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            uep.set_abuse_flag(subject_ref, value, now)
            return
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO subject_counters (subject_ref, keys_consumed_total, agreements_created, agreements_finalized, ai_calls_count, abuse_flag, soft_throttle_flag, updated_at)
                VALUES (?, 0, 0, 0, 0, ?, 0, ?)
                ON CONFLICT(subject_ref) DO UPDATE SET abuse_flag = ?, updated_at = excluded.updated_at
                """,
                (subject_ref, int(value), now, int(value)),
            )

    def set_soft_throttle(self, subject_ref: str, value: int = 1) -> None:
        now = _utc_now()
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            uep.set_soft_throttle(subject_ref, value, now)
            return
        with self._conn() as con:
            con.execute(
                """
                UPDATE subject_counters SET soft_throttle_flag = ?, updated_at = ?
                WHERE subject_ref = ?
                """,
                (int(value), now, subject_ref),
            )

    def incr_ai_calls(self, subject_ref: str, n: int = 1) -> None:
        now = _utc_now()
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            uep.incr_ai_calls(subject_ref, n, now)
            return
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO subject_counters (subject_ref, keys_consumed_total, agreements_created, agreements_finalized, ai_calls_count, abuse_flag, soft_throttle_flag, updated_at)
                VALUES (?, 0, 0, 0, ?, 0, 0, ?)
                ON CONFLICT(subject_ref) DO UPDATE SET
                  ai_calls_count = ai_calls_count + excluded.ai_calls_count,
                  updated_at = excluded.updated_at
                """,
                (subject_ref, int(n), now),
            )

    def emit_event(self, *, subject_ref: Optional[str], event_type: str, payload: Dict[str, Any]) -> str:
        eid = str(uuid.uuid4())
        now = _utc_now()
        pj = json.dumps(payload, sort_keys=True)
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            uep.emit_event(
                event_id=eid,
                subject_ref=subject_ref,
                event_type=event_type,
                payload_json=pj,
                now_iso=now,
            )
            return eid
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO analytics_events (id, subject_ref, event_type, payload_json, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (eid, subject_ref, event_type, pj, now),
            )
        return eid

    def list_recent_events(self, limit: int = 200) -> List[Dict[str, Any]]:
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.list_recent_events(limit)
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT * FROM analytics_events ORDER BY created_at DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
            return [dict(r) for r in rows]

    def admin_aggregate_subjects(self) -> List[Dict[str, Any]]:
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.admin_aggregate_subjects()
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT subject_ref, keys_consumed_total, agreements_created, agreements_finalized,
                       ai_calls_count, abuse_flag, soft_throttle_flag, updated_at
                FROM subject_counters ORDER BY keys_consumed_total DESC LIMIT 500
                """
            ).fetchall()
            return [dict(r) for r in rows]


_store: Optional[UsageEconomicsStore] = None


def get_usage_economics_store() -> UsageEconomicsStore:
    global _store
    if _store is None:
        _store = UsageEconomicsStore()
    return _store
