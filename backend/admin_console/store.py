from __future__ import annotations

import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.config.runtime_environment import data_dir


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def admin_console_db_path() -> str:
    env = os.getenv("CLAW_ADMIN_CONSOLE_DB_PATH", "").strip()
    if env:
        return os.path.expanduser(env)
    return os.path.join(data_dir(), "admin_console.sqlite3")


class AdminConsoleStore:
    def __init__(self, path: Optional[str] = None) -> None:
        self._path = path or admin_console_db_path()
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
                CREATE TABLE IF NOT EXISTS admin_users (
                  id TEXT PRIMARY KEY,
                  email TEXT,
                  role TEXT NOT NULL,
                  is_active INTEGER NOT NULL DEFAULT 1,
                  created_at TEXT NOT NULL,
                  last_login_at TEXT
                );

                CREATE TABLE IF NOT EXISTS agreement_admin_flags (
                  agreement_id TEXT PRIMARY KEY,
                  is_flagged_abuse INTEGER NOT NULL DEFAULT 0,
                  reason TEXT,
                  updated_at TEXT NOT NULL,
                  updated_by_admin_user_id TEXT
                );

                CREATE TABLE IF NOT EXISTS admin_action_audit (
                  id TEXT PRIMARY KEY,
                  admin_user_id TEXT NOT NULL,
                  action_type TEXT NOT NULL,
                  target_type TEXT NOT NULL,
                  target_id TEXT NOT NULL,
                  reason TEXT,
                  before_snapshot_json TEXT,
                  after_snapshot_json TEXT,
                  created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_admin_action_audit_created
                  ON admin_action_audit (created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_admin_action_audit_target
                  ON admin_action_audit (target_type, target_id, created_at DESC);
                """
            )

    def touch_admin_user(self, *, admin_user_id: str, email: str | None, role: str = "operator") -> None:
        uid = (admin_user_id or "").strip()
        if not uid:
            return
        now = _utc_now()
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO admin_users (id, email, role, is_active, created_at, last_login_at)
                VALUES (?, ?, ?, 1, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  email = COALESCE(excluded.email, admin_users.email),
                  role = excluded.role,
                  last_login_at = excluded.last_login_at
                """,
                (uid, (email or "").strip() or None, role, now, now),
            )

    def set_agreement_flag(
        self,
        *,
        agreement_id: str,
        flagged: bool,
        reason: str | None,
        admin_user_id: str,
    ) -> Dict[str, Any]:
        aid = (agreement_id or "").strip()
        now = _utc_now()
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO agreement_admin_flags (
                  agreement_id, is_flagged_abuse, reason, updated_at, updated_by_admin_user_id
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(agreement_id) DO UPDATE SET
                  is_flagged_abuse = excluded.is_flagged_abuse,
                  reason = excluded.reason,
                  updated_at = excluded.updated_at,
                  updated_by_admin_user_id = excluded.updated_by_admin_user_id
                """,
                (aid, 1 if flagged else 0, (reason or "").strip() or None, now, admin_user_id),
            )
            row = con.execute(
                "SELECT * FROM agreement_admin_flags WHERE agreement_id = ?",
                (aid,),
            ).fetchone()
        return dict(row) if row else {}

    def get_agreement_flags_map(self, agreement_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        ids = [str(x or "").strip() for x in agreement_ids if str(x or "").strip()]
        if not ids:
            return {}
        q = ",".join("?" for _ in ids)
        with self._conn() as con:
            rows = con.execute(
                f"SELECT * FROM agreement_admin_flags WHERE agreement_id IN ({q})",
                tuple(ids),
            ).fetchall()
        return {str(r["agreement_id"]): dict(r) for r in rows}

    def append_admin_action_audit(
        self,
        *,
        admin_user_id: str,
        action_type: str,
        target_type: str,
        target_id: str,
        reason: str | None,
        before_snapshot_json: str | None,
        after_snapshot_json: str | None,
    ) -> str:
        aid = str(uuid.uuid4())
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO admin_action_audit (
                  id, admin_user_id, action_type, target_type, target_id, reason,
                  before_snapshot_json, after_snapshot_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    aid,
                    (admin_user_id or "").strip() or "admin_unknown",
                    (action_type or "").strip() or "unknown",
                    (target_type or "").strip() or "unknown",
                    (target_id or "").strip() or "unknown",
                    (reason or "").strip() or None,
                    before_snapshot_json,
                    after_snapshot_json,
                    _utc_now(),
                ),
            )
        return aid

    def list_admin_action_audit(self, *, limit: int = 200) -> List[Dict[str, Any]]:
        lim = max(1, min(int(limit), 1000))
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT id, admin_user_id, action_type, target_type, target_id, reason,
                       before_snapshot_json, after_snapshot_json, created_at
                FROM admin_action_audit
                ORDER BY datetime(created_at) DESC
                LIMIT ?
                """,
                (lim,),
            ).fetchall()
        return [dict(r) for r in rows]


_store: Optional[AdminConsoleStore] = None


def get_admin_console_store() -> AdminConsoleStore:
    global _store
    if _store is None:
        _store = AdminConsoleStore()
        _store.init_schema()
    return _store
