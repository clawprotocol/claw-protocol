# backend/utils/usage_store.py
from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

DEFAULT_DB_PATH = os.getenv("CLAW_USAGE_DB_PATH", "audit/usage.sqlite3")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _ym(dt: datetime) -> str:
    return dt.strftime("%Y-%m")


def _ymd(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d")


@dataclass(frozen=True)
class UsageSnapshot:
    ai_calls_month: int
    uploads_day: int
    priority_anchors_day: int


class UsageStore:
    def __init__(self, db_path: str = DEFAULT_DB_PATH) -> None:
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.db_path = db_path
        self._init()

    def _conn(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    def _init(self) -> None:
        with self._conn() as c:
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS counters (
                    key TEXT PRIMARY KEY,
                    value INTEGER NOT NULL
                )
                """
            )
            c.commit()

    def _get(self, key: str) -> int:
        with self._conn() as c:
            row = c.execute("SELECT value FROM counters WHERE key = ?", (key,)).fetchone()
            return int(row[0]) if row else 0

    def _incr(self, key: str, delta: int = 1) -> int:
        with self._conn() as c:
            cur = c.execute("SELECT value FROM counters WHERE key = ?", (key,))
            row = cur.fetchone()
            if row:
                newv = int(row[0]) + delta
                c.execute("UPDATE counters SET value = ? WHERE key = ?", (newv, key))
            else:
                newv = delta
                c.execute("INSERT INTO counters(key, value) VALUES(?, ?)", (key, newv))
            c.commit()
            return newv

    def snapshot(self, subject: str, now: Optional[datetime] = None) -> UsageSnapshot:
        now = now or _utc_now()
        return UsageSnapshot(
            ai_calls_month=self._get(f"ai:{subject}:{_ym(now)}"),
            uploads_day=self._get(f"up:{subject}:{_ymd(now)}"),
            priority_anchors_day=self._get(f"anch:{subject}:{_ymd(now)}"),
        )

    def incr_ai_call(self, subject: str, now: Optional[datetime] = None) -> int:
        now = now or _utc_now()
        return self._incr(f"ai:{subject}:{_ym(now)}", 1)

    def incr_upload(self, subject: str, now: Optional[datetime] = None) -> int:
        now = now or _utc_now()
        return self._incr(f"up:{subject}:{_ymd(now)}", 1)

    def incr_priority_anchor(self, subject: str, now: Optional[datetime] = None) -> int:
        now = now or _utc_now()
        return self._incr(f"anch:{subject}:{_ymd(now)}", 1)
