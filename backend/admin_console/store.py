from __future__ import annotations

import json
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
                  created_at TEXT NOT NULL,
                  actor_role TEXT,
                  correlation_id TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_admin_action_audit_created
                  ON admin_action_audit (created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_admin_action_audit_target
                  ON admin_action_audit (target_type, target_id, created_at DESC);
                """
            )
            # Additive migrations for older DBs.
            cols = {
                str(r[1])
                for r in con.execute("PRAGMA table_info(admin_action_audit)").fetchall()
            }
            if "actor_role" not in cols:
                con.execute("ALTER TABLE admin_action_audit ADD COLUMN actor_role TEXT")
            if "correlation_id" not in cols:
                con.execute("ALTER TABLE admin_action_audit ADD COLUMN correlation_id TEXT")

    def get_admin_user(self, admin_user_id: str) -> Optional[Dict[str, Any]]:
        uid = (admin_user_id or "").strip()
        if not uid:
            return None
        with self._conn() as con:
            row = con.execute("SELECT * FROM admin_users WHERE id = ?", (uid,)).fetchone()
        return dict(row) if row else None

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

    def count_active_operators(self) -> int:
        self.init_schema()
        with self._conn() as con:
            row = con.execute(
                "SELECT COUNT(*) AS c FROM admin_users WHERE is_active = 1"
            ).fetchone()
            return int(row[0]) if row else 0

    def bootstrap_first_support_operator(
        self,
        *,
        admin_user_id: str,
        reason: str,
        correlation_id: str | None = None,
        email: str | None = None,
    ) -> Dict[str, Any]:
        """
        Atomically create the first active ``support_operator`` + audit row.

        Returns ``{"ok": True, "audit_id": ..., "created": bool}`` or
        ``{"ok": False, "code": "operator_bootstrap_already_done"}``.
        SQLite ``BEGIN IMMEDIATE`` makes the active-count check + writes atomic.
        """
        from backend.security.operator_principal import ROLE_SUPPORT_OPERATOR

        uid = (admin_user_id or "").strip()
        reason_clean = (reason or "").strip()
        if not uid:
            raise ValueError("admin_user_id_required")
        if len(reason_clean) < 3:
            raise ValueError("reason_required")
        self.init_schema()
        now = _utc_now()
        audit_id = str(uuid.uuid4())
        email_clean = (email or "").strip() or None
        con = self._conn()
        try:
            con.execute("BEGIN IMMEDIATE")
            row = con.execute(
                "SELECT COUNT(*) AS c FROM admin_users WHERE is_active = 1"
            ).fetchone()
            if int(row[0] if row else 0) > 0:
                con.execute("ROLLBACK")
                return {"ok": False, "code": "operator_bootstrap_already_done"}

            existing = con.execute(
                "SELECT id, is_active FROM admin_users WHERE id = ?",
                (uid,),
            ).fetchone()
            created = existing is None
            if existing is None:
                con.execute(
                    """
                    INSERT INTO admin_users (id, email, role, is_active, created_at, last_login_at)
                    VALUES (?, ?, ?, 1, ?, ?)
                    """,
                    (uid, email_clean, ROLE_SUPPORT_OPERATOR, now, now),
                )
            else:
                con.execute(
                    """
                    UPDATE admin_users
                    SET email = COALESCE(?, email),
                        role = ?,
                        is_active = 1,
                        last_login_at = ?
                    WHERE id = ?
                    """,
                    (email_clean, ROLE_SUPPORT_OPERATOR, now, uid),
                )

            after = {
                "user_id": uid,
                "role": ROLE_SUPPORT_OPERATOR,
                "is_active": 1,
                "created": created,
            }
            con.execute(
                """
                INSERT INTO admin_action_audit (
                  id, admin_user_id, action_type, target_type, target_id, reason,
                  before_snapshot_json, after_snapshot_json, created_at,
                  actor_role, correlation_id
                ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
                """,
                (
                    audit_id,
                    uid,
                    "operator_bootstrap",
                    "admin_user",
                    uid,
                    reason_clean[:500],
                    json.dumps(after, separators=(",", ":"), sort_keys=True),
                    now,
                    ROLE_SUPPORT_OPERATOR,
                    (correlation_id or "").strip() or None,
                ),
            )
            con.execute("COMMIT")
            return {
                "ok": True,
                "audit_id": audit_id,
                "created": created,
                "role": ROLE_SUPPORT_OPERATOR,
                "user_id": uid,
            }
        except Exception:
            try:
                con.execute("ROLLBACK")
            except Exception:
                pass
            raise
        finally:
            con.close()

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
        actor_role: str | None = None,
        correlation_id: str | None = None,
    ) -> str:
        aid = str(uuid.uuid4())
        reason_clean = (reason or "").strip()
        if not reason_clean:
            raise ValueError("reason_required")
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO admin_action_audit (
                  id, admin_user_id, action_type, target_type, target_id, reason,
                  before_snapshot_json, after_snapshot_json, created_at,
                  actor_role, correlation_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    aid,
                    (admin_user_id or "").strip() or "admin_unknown",
                    (action_type or "").strip() or "unknown",
                    (target_type or "").strip() or "unknown",
                    (target_id or "").strip() or "unknown",
                    reason_clean,
                    before_snapshot_json,
                    after_snapshot_json,
                    _utc_now(),
                    (actor_role or "").strip() or None,
                    (correlation_id or "").strip() or None,
                ),
            )
        return aid

    def list_admin_action_audit(self, *, limit: int = 200) -> List[Dict[str, Any]]:
        lim = max(1, min(int(limit), 1000))
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT id, admin_user_id, action_type, target_type, target_id, reason,
                       before_snapshot_json, after_snapshot_json, created_at,
                       actor_role, correlation_id
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


def reset_admin_console_store_for_tests() -> None:
    global _store
    _store = None
