from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _data_dir() -> str:
    env = os.getenv("CLAW_DATA_DIR", "").strip()
    if env:
        return os.path.expanduser(env)
    prod = "/var/lib/claw"
    try:
        if os.path.isdir(prod) and os.access(prod, os.W_OK):
            return prod
    except Exception:
        pass
    return os.path.expanduser("~/.claw")


def _db_path() -> str:
    return os.path.expanduser(
        os.getenv("CLAW_AGREEMENT_DB_PATH", os.path.join(_data_dir(), "agreements.sqlite3"))
    )


def agreement_versions_sqlite_path() -> str:
    """SQLite path for agreement version rows (unused when agreements use Postgres)."""
    return _db_path()


def _use_postgres() -> bool:
    from backend.db.config import use_postgresql_for_agreements

    return use_postgresql_for_agreements()


class AgreementVersionStore:
    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = db_path or _db_path()
        if _use_postgres():
            from backend.db.agreement_sql import ensure_agreement_postgres_schema

            ensure_agreement_postgres_schema()
        else:
            self._init_db_sqlite()

    def _init_db_sqlite(self) -> None:
        os.makedirs(os.path.dirname(self.db_path) or ".", exist_ok=True)
        with self._conn_sqlite() as c:
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS agreement_versions (
                    agreement_id TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    title TEXT NOT NULL,
                    body_markdown TEXT NOT NULL,
                    body_sha256 TEXT NOT NULL,
                    disclaimers_json TEXT,
                    metadata_json TEXT,
                    PRIMARY KEY (agreement_id, version)
                )
                """
            )

    def _conn_sqlite(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    def save_version(
        self,
        *,
        agreement_id: str,
        title: str,
        body_markdown: str,
        created_at: Optional[str],
        disclaimers: Optional[List[str]],
        metadata: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        created_at = created_at or _utc_now_iso()
        body_sha256 = hashlib.sha256(body_markdown.encode("utf-8")).hexdigest()
        if _use_postgres():
            return self._save_version_pg(
                agreement_id=agreement_id,
                title=title,
                body_markdown=body_markdown,
                created_at=created_at,
                body_sha256=body_sha256,
                disclaimers=disclaimers,
                metadata=metadata,
            )
        with self._conn_sqlite() as c:
            row = c.execute(
                "SELECT MAX(version) AS v FROM agreement_versions WHERE agreement_id = ?",
                (agreement_id,),
            ).fetchone()
            next_version = 1 if row["v"] is None else int(row["v"]) + 1
            c.execute(
                """
                INSERT INTO agreement_versions
                (agreement_id, version, created_at, title, body_markdown, body_sha256, disclaimers_json, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    agreement_id,
                    next_version,
                    created_at,
                    title,
                    body_markdown,
                    body_sha256,
                    _json_dump(disclaimers) if disclaimers is not None else None,
                    _json_dump(metadata) if metadata is not None else None,
                ),
            )
            c.commit()
        return {
            "agreement_id": agreement_id,
            "version": next_version,
            "body_sha256": body_sha256,
            "created_at": created_at,
        }

    def _save_version_pg(
        self,
        *,
        agreement_id: str,
        title: str,
        body_markdown: str,
        created_at: str,
        body_sha256: str,
        disclaimers: Optional[List[str]],
        metadata: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

        disc = _json_dump(disclaimers) if disclaimers is not None else None
        meta = _json_dump(metadata) if metadata is not None else None
        created_dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        with agreement_postgres_connection() as cx:
            cur = pg_execute(
                cx,
                "SELECT MAX(version) AS v FROM agreement_versions WHERE agreement_id = ?",
                (agreement_id,),
            )
            row = cur.fetchone()
            next_version = 1 if row is None or row[0] is None else int(row[0]) + 1
            pg_execute(
                cx,
                """
                INSERT INTO agreement_versions
                (agreement_id, version, created_at, title, body_markdown, body_sha256, disclaimers_json, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    agreement_id,
                    next_version,
                    created_dt,
                    title,
                    body_markdown,
                    body_sha256,
                    disc,
                    meta,
                ),
            )
        return {
            "agreement_id": agreement_id,
            "version": next_version,
            "body_sha256": body_sha256,
            "created_at": created_at,
        }

    def list_versions(self, *, agreement_id: str) -> List[Dict[str, Any]]:
        if _use_postgres():
            return self._list_versions_pg(agreement_id)
        with self._conn_sqlite() as c:
            rows = c.execute(
                """
                SELECT agreement_id, version, created_at, title, body_sha256
                FROM agreement_versions
                WHERE agreement_id = ?
                ORDER BY version DESC
                """,
                (agreement_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def _list_versions_pg(self, agreement_id: str) -> List[Dict[str, Any]]:
        from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

        with agreement_postgres_connection() as cx:
            cur = pg_execute(
                cx,
                """
                SELECT agreement_id, version, created_at, title, body_sha256
                FROM agreement_versions
                WHERE agreement_id = ?
                ORDER BY version DESC
                """,
                (agreement_id,),
            )
            rows = cur.fetchall()
        out: List[Dict[str, Any]] = []
        for r in rows:
            out.append(
                {
                    "agreement_id": str(r[0]),
                    "version": int(r[1]),
                    "created_at": _pg_ts_to_iso(r[2]),
                    "title": str(r[3]),
                    "body_sha256": str(r[4]),
                }
            )
        return out

    def get_version(self, *, agreement_id: str, version: int) -> Dict[str, Any]:
        if _use_postgres():
            return self._get_version_pg(agreement_id, version)
        with self._conn_sqlite() as c:
            row = c.execute(
                """
                SELECT * FROM agreement_versions
                WHERE agreement_id = ? AND version = ?
                """,
                (agreement_id, version),
            ).fetchone()
        if not row:
            raise KeyError("agreement_version_not_found")
        data = dict(row)
        data["disclaimers"] = _json_load(data.get("disclaimers_json"))
        data["metadata"] = _json_load(data.get("metadata_json"))
        data.pop("disclaimers_json", None)
        data.pop("metadata_json", None)
        return data

    def _get_version_pg(self, agreement_id: str, version: int) -> Dict[str, Any]:
        from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

        with agreement_postgres_connection() as cx:
            cur = pg_execute(
                cx,
                """
                SELECT agreement_id, version, created_at, title, body_markdown, body_sha256,
                       disclaimers_json, metadata_json
                FROM agreement_versions
                WHERE agreement_id = ? AND version = ?
                """,
                (agreement_id, version),
            )
            row = cur.fetchone()
        if not row:
            raise KeyError("agreement_version_not_found")
        data = {
            "agreement_id": str(row[0]),
            "version": int(row[1]),
            "created_at": _pg_ts_to_iso(row[2]),
            "title": str(row[3]),
            "body_markdown": str(row[4]),
            "body_sha256": str(row[5]),
            "disclaimers_json": row[6],
            "metadata_json": row[7],
        }
        data["disclaimers"] = _json_load(data.get("disclaimers_json"))
        data["metadata"] = _json_load(data.get("metadata_json"))
        data.pop("disclaimers_json", None)
        data.pop("metadata_json", None)
        return data

    def diff_versions(
        self, *, agreement_id: str, from_version: int, to_version: int
    ) -> Dict[str, Any]:
        a = self.get_version(agreement_id=agreement_id, version=from_version)
        b = self.get_version(agreement_id=agreement_id, version=to_version)
        a_text = _normalize_newlines(a.get("body_markdown") or "")
        b_text = _normalize_newlines(b.get("body_markdown") or "")
        diff_lines = _unified_diff(a_text, b_text, agreement_id, from_version, to_version)
        diff_text = "".join(diff_lines)
        diff_sha256 = hashlib.sha256(diff_text.encode("utf-8")).hexdigest()
        return {
            "ok": True,
            "diff_text": diff_text,
            "diff_sha256": diff_sha256,
        }


def _pg_ts_to_iso(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    s = str(v)
    if s.endswith("+00:00"):
        return s.replace("+00:00", "Z")
    return s


def _json_dump(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _json_load(data: Optional[str]) -> Any:
    if not data:
        return None
    return json.loads(data)


def _normalize_newlines(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def _unified_diff(
    a_text: str, b_text: str, agreement_id: str, from_version: int, to_version: int
) -> List[str]:
    import difflib

    header = [
        f"agreement_id: {agreement_id}\n",
        f"from_version: {from_version}\n",
        f"to_version: {to_version}\n",
        "\n",
    ]
    diff = list(
        difflib.unified_diff(
            a_text.splitlines(keepends=True),
            b_text.splitlines(keepends=True),
            fromfile=f"v{from_version}",
            tofile=f"v{to_version}",
        )
    )
    return header + diff
