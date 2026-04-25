"""
Postgres connection + migrations for agreement drafts, versions, and signing locks.

Mirrors the anchoring pattern: explicit SQL files, ``search_path`` schema, short connections.
"""

from __future__ import annotations

import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Sequence

from backend.db.config import (
    agreement_postgresql_schema,
    agreement_postgresql_url,
    postgres_connect_timeout_sec,
    postgres_connection_options_for_schema,
    use_postgresql_for_agreements,
)
from backend.db.sql_split import split_sql_statements

_pg_schema_lock = threading.Lock()
_pg_migrations_applied = False


class PostgresAgreementConnection:
    """Connection for applying migrations (execute + commit)."""

    def __init__(self, url: str, schema: str) -> None:
        self._url = url
        self._schema = schema
        self._cx: Any = None

    def __enter__(self) -> PostgresAgreementConnection:
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

    def execute(self, sql: str, params: Sequence[Any] = ()) -> None:
        assert self._cx is not None
        self._cx.execute(sql, tuple(params))

    def commit(self) -> None:
        assert self._cx is not None
        self._cx.commit()

    def rollback(self) -> None:
        assert self._cx is not None
        self._cx.rollback()


def apply_postgres_agreement_migrations(conn: PostgresAgreementConnection) -> None:
    mig_dir = Path(__file__).resolve().parent.parent / "agreements" / "migrations" / "postgres"
    if not mig_dir.is_dir():
        raise RuntimeError(f"postgres agreement migrations missing: {mig_dir}")
    for path in sorted(mig_dir.glob("*.sql")):
        script = path.read_text(encoding="utf-8")
        for stmt in split_sql_statements(script):
            conn.execute(stmt)
    conn.commit()


def ensure_agreement_postgres_schema() -> None:
    """Run migrations once per process (thread-safe)."""
    global _pg_migrations_applied
    if not use_postgresql_for_agreements():
        return
    if _pg_migrations_applied:
        return
    with _pg_schema_lock:
        if _pg_migrations_applied:
            return
        url = agreement_postgresql_url()
        schema = agreement_postgresql_schema()
        with PostgresAgreementConnection(url, schema) as pg:
            apply_postgres_agreement_migrations(pg)
        _pg_migrations_applied = True


def _qmarks_to_percent_s(sql: str) -> str:
    return sql.replace("?", "%s")


@contextmanager
def agreement_postgres_connection() -> Iterator[Any]:
    """
    Short transaction: commit on success, rollback on error.
    Yields a psycopg connection (use ``.execute`` with ``%s`` placeholders, or pass SQL with ``?`` via helpers).
    """
    ensure_agreement_postgres_schema()
    import psycopg

    url = agreement_postgresql_url()
    schema = agreement_postgresql_schema()
    to = postgres_connect_timeout_sec()
    opts = postgres_connection_options_for_schema(schema)
    cx = psycopg.connect(url, options=opts, connect_timeout=to)
    try:
        yield cx
        cx.commit()
    except Exception:
        cx.rollback()
        raise
    finally:
        cx.close()


def pg_execute(cx: Any, sql: str, params: Sequence[Any] = ()) -> Any:
    """Run statement with SQLite-style ``?`` placeholders."""
    return cx.execute(_qmarks_to_percent_s(sql), tuple(params))
