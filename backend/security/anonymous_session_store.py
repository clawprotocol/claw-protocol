"""Persistent anonymous session and auth continuation storage."""

from __future__ import annotations

import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from backend.security.anonymous_session_token import token_hash


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _utc_now_dt() -> datetime:
    return datetime.now(timezone.utc)


def _usage_eco_pg() -> bool:
    from backend.db.config import use_postgresql_for_usage_economics

    return use_postgresql_for_usage_economics()


class AnonymousSessionStore:
    def __init__(self, path: Optional[str] = None) -> None:
        from backend.usage_economics.store import usage_economics_db_path

        self._path = path or usage_economics_db_path()
        self._pg = _usage_eco_pg()
        if not self._pg:
            os.makedirs(os.path.dirname(self._path) or ".", exist_ok=True)

    def init_schema(self) -> None:
        if self._pg:
            from backend.usage_economics.usage_economics_postgres import ensure_usage_economics_schema

            ensure_usage_economics_schema()
            return
        with self._conn() as con:
            con.executescript(
                """
                CREATE TABLE IF NOT EXISTS anonymous_sessions (
                  session_id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL UNIQUE,
                  token_hash TEXT NOT NULL UNIQUE,
                  created_at TEXT NOT NULL,
                  expires_at TEXT NOT NULL,
                  claimed_at TEXT,
                  claimed_user_id TEXT,
                  consumed INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_anonymous_sessions_token_hash ON anonymous_sessions (token_hash);
                CREATE INDEX IF NOT EXISTS idx_anonymous_sessions_org_id ON anonymous_sessions (org_id);

                CREATE TABLE IF NOT EXISTS auth_continuation_transactions (
                  continuation_id TEXT PRIMARY KEY,
                  session_id TEXT NOT NULL,
                  org_id TEXT NOT NULL,
                  agreement_id TEXT,
                  destination_path TEXT NOT NULL,
                  workflow_stage TEXT,
                  auth_purpose TEXT,
                  provider TEXT,
                  created_at TEXT NOT NULL,
                  expires_at TEXT NOT NULL,
                  consumed_at TEXT,
                  claimed_user_id TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_auth_continuation_session ON auth_continuation_transactions (session_id, created_at);
                """
            )

    def _conn(self) -> sqlite3.Connection:
        if self._pg:
            raise RuntimeError("AnonymousSessionStore uses PostgreSQL")
        c = sqlite3.connect(self._path, timeout=30.0)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL;")
        return c

    def create_session(self, *, org_id: str, ttl_seconds: int) -> Dict[str, str]:
        self.init_schema()
        session_id = uuid.uuid4().hex
        now = _utc_now_dt()
        expires = now + timedelta(seconds=max(3600, int(ttl_seconds)))
        org = org_id.strip()
        if not org.startswith("anon-"):
            raise ValueError("invalid_anon_org")
        from backend.security.anonymous_session_token import mint_anonymous_session_token

        token = mint_anonymous_session_token(session_id=session_id, org_id=org)
        th = token_hash(token)
        now_iso = now.isoformat().replace("+00:00", "Z")
        exp_iso = expires.isoformat().replace("+00:00", "Z")
        if self._pg:
            from backend.usage_economics import anonymous_session_postgres as asp

            asp.insert_anonymous_session(
                session_id=session_id,
                org_id=org,
                token_hash=th,
                created_at=now_iso,
                expires_at=exp_iso,
            )
        else:
            with self._conn() as con:
                con.execute(
                    """
                    INSERT INTO anonymous_sessions (
                      session_id, org_id, token_hash, created_at, expires_at, consumed
                    ) VALUES (?, ?, ?, ?, ?, 0)
                    """,
                    (session_id, org, th, now_iso, exp_iso),
                )
        return {"session_id": session_id, "org_id": org, "token": token}

    def resolve_token(self, token: str) -> Optional[Dict[str, Any]]:
        self.init_schema()
        th = token_hash(token)
        if self._pg:
            from backend.usage_economics import anonymous_session_postgres as asp

            return asp.get_session_by_token_hash(th)
        with self._conn() as con:
            row = con.execute(
                "SELECT * FROM anonymous_sessions WHERE token_hash = ?",
                (th,),
            ).fetchone()
            return dict(row) if row else None

    def mark_session_claimed(self, *, session_id: str, user_id: str) -> bool:
        self.init_schema()
        now = _utc_now()
        uid = user_id.strip()
        if self._pg:
            from backend.usage_economics import anonymous_session_postgres as asp

            return asp.mark_session_claimed(session_id=session_id, user_id=uid, claimed_at=now)
        with self._conn() as con:
            cur = con.execute(
                """
                UPDATE anonymous_sessions
                SET claimed_at = ?, claimed_user_id = ?, consumed = 1
                WHERE session_id = ? AND consumed = 0
                """,
                (now, uid, session_id),
            )
            return cur.rowcount == 1

    def create_continuation(
        self,
        *,
        session_id: str,
        org_id: str,
        agreement_id: Optional[str],
        destination_path: str,
        workflow_stage: Optional[str],
        auth_purpose: Optional[str],
        provider: Optional[str],
        ttl_seconds: int = 3600,
    ) -> Dict[str, str]:
        self.init_schema()
        continuation_id = uuid.uuid4().hex
        now = _utc_now_dt()
        expires = now + timedelta(seconds=max(300, int(ttl_seconds)))
        now_iso = now.isoformat().replace("+00:00", "Z")
        exp_iso = expires.isoformat().replace("+00:00", "Z")
        dest = destination_path.strip()[:512]
        if self._pg:
            from backend.usage_economics import anonymous_session_postgres as asp

            asp.insert_auth_continuation(
                continuation_id=continuation_id,
                session_id=session_id,
                org_id=org_id,
                agreement_id=(agreement_id or "").strip() or None,
                destination_path=dest,
                workflow_stage=(workflow_stage or "").strip() or None,
                auth_purpose=(auth_purpose or "").strip() or None,
                provider=(provider or "").strip() or None,
                created_at=now_iso,
                expires_at=exp_iso,
            )
        else:
            with self._conn() as con:
                con.execute(
                    """
                    INSERT INTO auth_continuation_transactions (
                      continuation_id, session_id, org_id, agreement_id,
                      destination_path, workflow_stage, auth_purpose, provider,
                      created_at, expires_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        continuation_id,
                        session_id,
                        org_id,
                        (agreement_id or "").strip() or None,
                        dest,
                        (workflow_stage or "").strip() or None,
                        (auth_purpose or "").strip() or None,
                        (provider or "").strip() or None,
                        now_iso,
                        exp_iso,
                    ),
                )
        return {"continuation_id": continuation_id, "expires_at": exp_iso}

    def get_continuation(self, continuation_id: str) -> Optional[Dict[str, Any]]:
        self.init_schema()
        cid = continuation_id.strip()
        if self._pg:
            from backend.usage_economics import anonymous_session_postgres as asp

            return asp.get_auth_continuation(cid)
        with self._conn() as con:
            row = con.execute(
                "SELECT * FROM auth_continuation_transactions WHERE continuation_id = ?",
                (cid,),
            ).fetchone()
            return dict(row) if row else None

    def consume_continuation(self, *, continuation_id: str, user_id: str) -> bool:
        self.init_schema()
        now = _utc_now()
        uid = user_id.strip()
        if self._pg:
            from backend.usage_economics import anonymous_session_postgres as asp

            return asp.consume_auth_continuation(continuation_id=continuation_id, user_id=uid, consumed_at=now)
        with self._conn() as con:
            cur = con.execute(
                """
                UPDATE auth_continuation_transactions
                SET consumed_at = ?, claimed_user_id = ?
                WHERE continuation_id = ? AND consumed_at IS NULL
                """,
                (now, uid, continuation_id),
            )
            return cur.rowcount == 1


_store: Optional[AnonymousSessionStore] = None


def get_anonymous_session_store() -> AnonymousSessionStore:
    global _store
    if _store is None:
        _store = AnonymousSessionStore()
    return _store


def reset_anonymous_session_store_for_tests() -> None:
    global _store
    _store = None
