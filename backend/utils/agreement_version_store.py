from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import uuid
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
                    version_id TEXT,
                    created_at TEXT NOT NULL,
                    title TEXT NOT NULL,
                    body_markdown TEXT NOT NULL,
                    body_sha256 TEXT NOT NULL,
                    authority_state TEXT,
                    accepted_at TEXT,
                    parties_json TEXT,
                    disclaimers_json TEXT,
                    metadata_json TEXT,
                    PRIMARY KEY (agreement_id, version)
                )
                """
            )
            columns = {
                str(row["name"])
                for row in c.execute("PRAGMA table_info(agreement_versions)").fetchall()
            }
            for name, sql_type in (
                ("version_id", "TEXT"),
                ("authority_state", "TEXT"),
                ("accepted_at", "TEXT"),
                ("parties_json", "TEXT"),
            ):
                if name not in columns:
                    c.execute(f"ALTER TABLE agreement_versions ADD COLUMN {name} {sql_type}")
            c.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_agreement_versions_version_id
                ON agreement_versions (version_id)
                WHERE version_id IS NOT NULL
                """
            )
            c.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_agreement_versions_accepted_authority
                ON agreement_versions (agreement_id)
                WHERE authority_state = 'accepted'
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

    def create_accepted_version(
        self,
        *,
        agreement_id: str,
        title: str,
        corpus: str,
        parties: List[Dict[str, Any]],
        accepted_at: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Create one immutable accepted corpus per agreement, or return an identical retry."""
        aid = (agreement_id or "").strip()
        if not aid:
            raise ValueError("missing_agreement_id")
        if not corpus:
            raise ValueError("accepted_corpus_empty")
        accepted_at = accepted_at or _utc_now_iso()
        corpus_sha256 = hashlib.sha256(corpus.encode("utf-8")).hexdigest()
        parties_json = _json_dump(parties)
        metadata_json = _json_dump(metadata) if metadata is not None else None
        if _use_postgres():
            return self._create_accepted_version_pg(
                agreement_id=aid,
                title=title,
                corpus=corpus,
                corpus_sha256=corpus_sha256,
                parties_json=parties_json,
                accepted_at=accepted_at,
                metadata_json=metadata_json,
            )
        with self._conn_sqlite() as c:
            c.execute("BEGIN IMMEDIATE")
            existing = c.execute(
                """
                SELECT * FROM agreement_versions
                WHERE agreement_id = ? AND authority_state = 'accepted'
                """,
                (aid,),
            ).fetchone()
            if existing:
                data = _decode_version_row(dict(existing))
                _assert_identical_accepted_retry(
                    data,
                    corpus_sha256=corpus_sha256,
                    corpus=corpus,
                    parties_json=parties_json,
                )
                c.commit()
                return data
            row = c.execute(
                "SELECT MAX(version) AS v FROM agreement_versions WHERE agreement_id = ?",
                (aid,),
            ).fetchone()
            next_version = 1 if row["v"] is None else int(row["v"]) + 1
            version_id = _new_version_id()
            c.execute(
                """
                INSERT INTO agreement_versions
                (agreement_id, version, version_id, created_at, title, body_markdown,
                 body_sha256, authority_state, accepted_at, parties_json, disclaimers_json,
                 metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?, NULL, ?)
                """,
                (
                    aid,
                    next_version,
                    version_id,
                    accepted_at,
                    title,
                    corpus,
                    corpus_sha256,
                    accepted_at,
                    parties_json,
                    metadata_json,
                ),
            )
            c.commit()
        return {
            "agreement_id": aid,
            "version": next_version,
            "version_id": version_id,
            "created_at": accepted_at,
            "title": title,
            "body_markdown": corpus,
            "body_sha256": corpus_sha256,
            "authority_state": "accepted",
            "accepted_at": accepted_at,
            "parties": parties,
            "metadata": metadata,
            "disclaimers": None,
        }

    def _create_accepted_version_pg(
        self,
        *,
        agreement_id: str,
        title: str,
        corpus: str,
        corpus_sha256: str,
        parties_json: str,
        accepted_at: str,
        metadata_json: Optional[str],
    ) -> Dict[str, Any]:
        from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

        accepted_dt = datetime.fromisoformat(accepted_at.replace("Z", "+00:00"))
        with agreement_postgres_connection() as cx:
            # Serialize acceptance with draft mutations and concurrent acceptance retries.
            draft_cur = pg_execute(
                cx,
                "SELECT id FROM agreement_drafts WHERE id = ? FOR UPDATE",
                (agreement_id,),
            )
            if draft_cur.fetchone() is None:
                raise KeyError("agreement_not_found")
            cur = pg_execute(
                cx,
                """
                SELECT agreement_id, version, version_id, created_at, title, body_markdown,
                       body_sha256, authority_state, accepted_at, parties_json,
                       disclaimers_json, metadata_json
                FROM agreement_versions
                WHERE agreement_id = ? AND authority_state = 'accepted'
                """,
                (agreement_id,),
            )
            existing = cur.fetchone()
            if existing:
                data = _decode_pg_version_row(existing)
                _assert_identical_accepted_retry(
                    data,
                    corpus_sha256=corpus_sha256,
                    corpus=corpus,
                    parties_json=parties_json,
                )
                return data
            cur = pg_execute(
                cx,
                "SELECT MAX(version) AS v FROM agreement_versions WHERE agreement_id = ?",
                (agreement_id,),
            )
            row = cur.fetchone()
            next_version = 1 if row is None or row[0] is None else int(row[0]) + 1
            version_id = _new_version_id()
            pg_execute(
                cx,
                """
                INSERT INTO agreement_versions
                (agreement_id, version, version_id, created_at, title, body_markdown,
                 body_sha256, authority_state, accepted_at, parties_json, disclaimers_json,
                 metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?, NULL, ?)
                """,
                (
                    agreement_id,
                    next_version,
                    version_id,
                    accepted_dt,
                    title,
                    corpus,
                    corpus_sha256,
                    accepted_dt,
                    parties_json,
                    metadata_json,
                ),
            )
        return {
            "agreement_id": agreement_id,
            "version": next_version,
            "version_id": version_id,
            "created_at": accepted_at,
            "title": title,
            "body_markdown": corpus,
            "body_sha256": corpus_sha256,
            "authority_state": "accepted",
            "accepted_at": accepted_at,
            "parties": _json_load(parties_json),
            "metadata": _json_load(metadata_json),
            "disclaimers": None,
        }

    def get_accepted_version(self, *, agreement_id: str) -> Optional[Dict[str, Any]]:
        aid = (agreement_id or "").strip()
        if not aid:
            return None
        if _use_postgres():
            from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

            with agreement_postgres_connection() as cx:
                cur = pg_execute(
                    cx,
                    """
                    SELECT agreement_id, version, version_id, created_at, title, body_markdown,
                           body_sha256, authority_state, accepted_at, parties_json,
                           disclaimers_json, metadata_json
                    FROM agreement_versions
                    WHERE agreement_id = ? AND authority_state = 'accepted'
                    """,
                    (aid,),
                )
                row = cur.fetchone()
            return _decode_pg_version_row(row) if row else None
        with self._conn_sqlite() as c:
            row = c.execute(
                """
                SELECT * FROM agreement_versions
                WHERE agreement_id = ? AND authority_state = 'accepted'
                """,
                (aid,),
            ).fetchone()
        return _decode_version_row(dict(row)) if row else None

    def get_version_by_id(self, *, version_id: str) -> Dict[str, Any]:
        vid = (version_id or "").strip()
        if not vid:
            raise KeyError("agreement_version_not_found")
        if _use_postgres():
            from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

            with agreement_postgres_connection() as cx:
                cur = pg_execute(
                    cx,
                    """
                    SELECT agreement_id, version, version_id, created_at, title, body_markdown,
                           body_sha256, authority_state, accepted_at, parties_json,
                           disclaimers_json, metadata_json
                    FROM agreement_versions
                    WHERE version_id = ?
                    """,
                    (vid,),
                )
                row = cur.fetchone()
            if not row:
                raise KeyError("agreement_version_not_found")
            return _decode_pg_version_row(row)
        with self._conn_sqlite() as c:
            row = c.execute(
                "SELECT * FROM agreement_versions WHERE version_id = ?",
                (vid,),
            ).fetchone()
        if not row:
            raise KeyError("agreement_version_not_found")
        return _decode_version_row(dict(row))

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
        return _decode_version_row(dict(row))

    def _get_version_pg(self, agreement_id: str, version: int) -> Dict[str, Any]:
        from backend.db.agreement_sql import agreement_postgres_connection, pg_execute

        with agreement_postgres_connection() as cx:
            cur = pg_execute(
                cx,
                """
            SELECT agreement_id, version, version_id, created_at, title, body_markdown,
                   body_sha256, authority_state, accepted_at, parties_json,
                   disclaimers_json, metadata_json
                FROM agreement_versions
                WHERE agreement_id = ? AND version = ?
                """,
                (agreement_id, version),
            )
            row = cur.fetchone()
        if not row:
            raise KeyError("agreement_version_not_found")
        return _decode_pg_version_row(row)

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


def _new_version_id() -> str:
    return f"av_{uuid.uuid4().hex}"


def _decode_version_row(data: Dict[str, Any]) -> Dict[str, Any]:
    data["disclaimers"] = _json_load(data.get("disclaimers_json"))
    data["metadata"] = _json_load(data.get("metadata_json"))
    data["parties"] = _json_load(data.get("parties_json"))
    data.pop("disclaimers_json", None)
    data.pop("metadata_json", None)
    data.pop("parties_json", None)
    return data


def _decode_pg_version_row(row: Any) -> Dict[str, Any]:
    return _decode_version_row(
        {
            "agreement_id": str(row[0]),
            "version": int(row[1]),
            "version_id": str(row[2]) if row[2] is not None else None,
            "created_at": _pg_ts_to_iso(row[3]),
            "title": str(row[4]),
            "body_markdown": str(row[5]),
            "body_sha256": str(row[6]),
            "authority_state": str(row[7]) if row[7] is not None else None,
            "accepted_at": _pg_ts_to_iso(row[8]) if row[8] is not None else None,
            "parties_json": row[9],
            "disclaimers_json": row[10],
            "metadata_json": row[11],
        }
    )


def _assert_identical_accepted_retry(
    existing: Dict[str, Any],
    *,
    corpus_sha256: str,
    corpus: str,
    parties_json: str,
) -> None:
    existing_parties_json = _json_dump(existing.get("parties") or [])
    if (
        str(existing.get("body_sha256") or "") != corpus_sha256
        or str(existing.get("body_markdown") or "") != corpus
        or existing_parties_json != parties_json
    ):
        raise ValueError("accepted_version_conflict")


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
