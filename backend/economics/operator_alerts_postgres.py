"""
Postgres persistence for ``lawdog_operator_alerts`` when ``use_postgresql_for_operator_alerts()``.
"""

from __future__ import annotations

import json
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from backend.db.config import (
    operator_alerts_postgresql_schema,
    operator_alerts_postgresql_url,
    postgres_connect_timeout_sec,
    postgres_connection_options_for_schema,
    use_postgresql_for_operator_alerts,
)
from backend.db.sql_split import split_sql_statements

_schema_lock = threading.Lock()
_schema_done = False


class _PostgresOperatorAlertsAdminConn:
    def __init__(self, url: str, schema: str) -> None:
        self._url = url
        self._schema = schema
        self._cx: Any = None

    def __enter__(self) -> _PostgresOperatorAlertsAdminConn:
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


def ensure_operator_alerts_schema() -> None:
    global _schema_done
    if not use_postgresql_for_operator_alerts():
        return
    if _schema_done:
        return
    with _schema_lock:
        if _schema_done:
            return
        mig_dir = Path(__file__).resolve().parent / "migrations" / "operator_alerts_postgres"
        url = operator_alerts_postgresql_url()
        schema = operator_alerts_postgresql_schema()
        with _PostgresOperatorAlertsAdminConn(url, schema) as adm:
            for path in sorted(mig_dir.glob("*.sql")):
                script = path.read_text(encoding="utf-8")
                for stmt in split_sql_statements(script):
                    adm.execute(stmt)
            adm.commit()
        _schema_done = True


def reset_operator_alerts_schema_cache_for_tests() -> None:
    global _schema_done
    with _schema_lock:
        _schema_done = False


def _iso_ts(s: str) -> Any:
    if s.endswith("Z"):
        return s.replace("Z", "+00:00")
    return s


def _iso_out(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return v


@contextmanager
def _alerts_tx() -> Any:
    ensure_operator_alerts_schema()
    import psycopg
    from psycopg.rows import dict_row

    url = operator_alerts_postgresql_url()
    schema = operator_alerts_postgresql_schema()
    conn = psycopg.connect(
        url,
        options=postgres_connection_options_for_schema(schema),
        connect_timeout=postgres_connect_timeout_sec(),
        row_factory=dict_row,
    )
    try:
        with conn.transaction():
            yield conn
    finally:
        conn.close()


def insert_operator_alert(
    *,
    alert_id: str,
    created_at_iso: str,
    event_type: str,
    severity: str,
    payload_json: str,
    batch_id: Optional[str],
) -> None:
    with _alerts_tx() as conn:
        conn.execute(
            """
            INSERT INTO lawdog_operator_alerts (
              id, created_at, event_type, severity, payload_json, batch_id
            ) VALUES (%s, %s::timestamptz, %s, %s, %s, %s)
            """,
            (
                alert_id,
                _iso_ts(created_at_iso),
                event_type,
                severity,
                payload_json,
                batch_id,
            ),
        )


def list_operator_alerts(*, limit: int) -> List[Dict[str, Any]]:
    lim = max(1, min(int(limit), 500))
    with _alerts_tx() as conn:
        cur = conn.execute(
            """
            SELECT id, created_at, event_type, severity, payload_json, batch_id
            FROM lawdog_operator_alerts
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (lim,),
        )
        rows = cur.fetchall()
    out: List[Dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        d["created_at"] = _iso_out(d.get("created_at"))
        raw = d.get("payload_json")
        try:
            d["payload"] = json.loads(raw) if isinstance(raw, str) else {}
        except json.JSONDecodeError:
            d["payload"] = {"parse_error": True}
        del d["payload_json"]
        out.append(d)
    return out
