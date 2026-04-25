"""
Anchoring store connections: SQLite file (default) or Postgres (``CLAW_DATABASE_URL`` / ``CLAW_ANCHORING_DATABASE_URL``).

SQL in ``AnchoringStore`` uses ``?`` placeholders; Postgres path rewrites to ``%s`` for psycopg.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Iterator, List, Optional, Sequence, Union

import sqlite3

from backend.db.config import (
    anchoring_postgresql_schema,
    anchoring_postgresql_url,
    postgres_connect_timeout_sec,
    postgres_connection_options_for_schema,
    use_postgresql_for_anchoring,
)
from backend.db.sql_split import split_sql_statements

# Advisory lock for batch open / close paths (replaces SQLite BEGIN IMMEDIATE serialization).
_ANCHORING_ADVISORY_LOCK_KEY = 4_281_571


def _qmarks_to_percent_s(sql: str) -> str:
    return sql.replace("?", "%s")


class _UnifiedCursor:
    def __init__(self, rowcount: int = -1) -> None:
        self._rows: List[Any] = []
        self.rowcount = rowcount

    def set_rows(self, rows: List[Any]) -> None:
        self._rows = rows

    def fetchone(self) -> Any:
        if not self._rows:
            return None
        return self._rows[0]

    def fetchall(self) -> List[Any]:
        return list(self._rows)


class SqliteAnchoringConnection:
    def __init__(self, path: str) -> None:
        self._path = path
        self._cx: Optional[sqlite3.Connection] = None

    def __enter__(self) -> SqliteAnchoringConnection:
        os.makedirs(os.path.dirname(self._path) or ".", exist_ok=True)
        c = sqlite3.connect(self._path, timeout=30.0)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL;")
        c.execute("PRAGMA foreign_keys=ON;")
        self._cx = c
        return self

    def __exit__(self, *exc: object) -> None:
        if self._cx:
            self._cx.close()
        self._cx = None

    def execute(self, sql: str, params: Sequence[Any] = ()) -> _UnifiedCursor:
        assert self._cx is not None
        cur = self._cx.execute(sql, tuple(params))
        rows = cur.fetchall() if cur.description else []
        uc = _UnifiedCursor(rowcount=getattr(cur, "rowcount", -1))
        uc.set_rows(rows)
        return uc

    def commit(self) -> None:
        assert self._cx is not None
        self._cx.commit()

    def rollback(self) -> None:
        assert self._cx is not None
        self._cx.rollback()

    def begin_immediate(self) -> None:
        assert self._cx is not None
        self._cx.execute("BEGIN IMMEDIATE")

    @property
    def raw(self) -> sqlite3.Connection:
        assert self._cx is not None
        return self._cx


class PostgresAnchoringConnection:
    def __init__(self, url: str, schema: str) -> None:
        self._url = url
        self._schema = schema
        self._cx: Any = None

    def __enter__(self) -> PostgresAnchoringConnection:
        import psycopg
        from psycopg import sql as psql

        to = postgres_connect_timeout_sec()
        opts = postgres_connection_options_for_schema(self._schema)
        with psycopg.connect(
            self._url,
            autocommit=True,
            connect_timeout=to,
            options=opts,
        ) as ax:
            ax.execute(
                psql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(psql.Identifier(self._schema))
            )
        self._cx = psycopg.connect(
            self._url,
            options=opts,
            connect_timeout=to,
        )
        return self

    def __exit__(self, *exc: object) -> None:
        if self._cx:
            self._cx.close()
        self._cx = None

    def execute(self, sql: str, params: Sequence[Any] = ()) -> _UnifiedCursor:
        assert self._cx is not None
        sql_pg = _qmarks_to_percent_s(sql)
        cur = self._cx.execute(sql_pg, tuple(params))
        rows = cur.fetchall() if cur.description else []
        uc = _UnifiedCursor(rowcount=cur.rowcount)
        uc.set_rows(rows)
        return uc

    def commit(self) -> None:
        assert self._cx is not None
        self._cx.commit()

    def rollback(self) -> None:
        assert self._cx is not None
        self._cx.rollback()

    def begin_immediate(self) -> None:
        assert self._cx is not None
        self._cx.execute("SELECT pg_advisory_xact_lock(%s)", (_ANCHORING_ADVISORY_LOCK_KEY,))


def apply_postgres_anchoring_migrations(conn: PostgresAnchoringConnection) -> None:
    from pathlib import Path

    mig_dir = Path(__file__).resolve().parent.parent / "anchoring" / "migrations" / "postgres"
    if not mig_dir.is_dir():
        raise RuntimeError(f"postgres anchoring migrations missing: {mig_dir}")
    for path in sorted(mig_dir.glob("*.sql")):
        script = path.read_text(encoding="utf-8")
        for stmt in split_sql_statements(script):
            conn.execute(stmt)
    conn.commit()


AnchoringConn = Union[SqliteAnchoringConnection, PostgresAnchoringConnection]


@contextmanager
def open_anchoring_store_connection(sqlite_path: str) -> Iterator[AnchoringConn]:
    if use_postgresql_for_anchoring():
        url = anchoring_postgresql_url()
        schema = anchoring_postgresql_schema()
        pg = PostgresAnchoringConnection(url, schema)
        pg.__enter__()
        try:
            yield pg
        finally:
            pg.__exit__(None, None, None)
    else:
        sq = SqliteAnchoringConnection(sqlite_path)
        sq.__enter__()
        try:
            yield sq
        finally:
            sq.__exit__(None, None, None)


def last_statement_changed_rows(_conn: AnchoringConn, cur: _UnifiedCursor) -> int:
    """Rows reported by the driver for the last ``execute`` (``rowcount``)."""
    return int(cur.rowcount if cur.rowcount is not None and cur.rowcount >= 0 else 0)
