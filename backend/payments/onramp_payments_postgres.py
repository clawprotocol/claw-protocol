"""Postgres backend for ``OnrampStore`` when ``use_postgresql_for_onramp_payments()``."""

from __future__ import annotations

import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from backend.db.config import (
    onramp_payments_postgresql_schema,
    onramp_payments_postgresql_url,
    postgres_connect_timeout_sec,
    postgres_connection_options_for_schema,
    use_postgresql_for_onramp_payments,
)
from backend.db.sql_split import split_sql_statements

_schema_lock = threading.Lock()
_schema_done = False


class _PgAdminConn:
    def __init__(self, url: str, schema: str) -> None:
        self._url = url
        self._schema = schema
        self._cx: Any = None

    def __enter__(self) -> _PgAdminConn:
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


def ensure_onramp_payments_schema() -> None:
    global _schema_done
    if not use_postgresql_for_onramp_payments():
        return
    if _schema_done:
        return
    with _schema_lock:
        if _schema_done:
            return
        mig_dir = Path(__file__).resolve().parent / "migrations" / "postgres"
        url = onramp_payments_postgresql_url()
        schema = onramp_payments_postgresql_schema()
        with _PgAdminConn(url, schema) as adm:
            for path in sorted(mig_dir.glob("*.sql")):
                script = path.read_text(encoding="utf-8")
                for stmt in split_sql_statements(script):
                    adm.execute(stmt)
            adm.commit()
        _schema_done = True


def reset_onramp_payments_schema_cache_for_tests() -> None:
    global _schema_done
    with _schema_lock:
        _schema_done = False


def _iso_z(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return v


def _row_out(d: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(d)
    for k, v in list(out.items()):
        if isinstance(v, datetime):
            out[k] = _iso_z(v)
    return out


@contextmanager
def _tx() -> Any:
    ensure_onramp_payments_schema()
    import psycopg
    from psycopg.rows import dict_row

    conn = psycopg.connect(
        onramp_payments_postgresql_url(),
        options=postgres_connection_options_for_schema(onramp_payments_postgresql_schema()),
        connect_timeout=postgres_connect_timeout_sec(),
        row_factory=dict_row,
    )
    try:
        with conn.transaction():
            yield conn
    finally:
        conn.close()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def try_claim_webhook(*, provider: str, idempotency_key: str, payment_id: str) -> bool:
    import psycopg.errors

    now = _utc_now_iso()
    try:
        with _tx() as conn:
            conn.execute(
                """
                INSERT INTO webhook_idempotency (provider, idempotency_key, payment_id, created_at)
                VALUES (%s, %s, %s, %s::timestamptz)
                """,
                (provider, idempotency_key, payment_id, now),
            )
        return True
    except psycopg.errors.UniqueViolation:
        return False


def insert_payment(
    *,
    payment_id: str,
    provider: str,
    provider_payment_id: str,
    amount_usd: float,
    currency: str,
    status: str,
    org_id: str,
) -> bool:
    import psycopg.errors

    now = _utc_now_iso()
    try:
        with _tx() as conn:
            conn.execute(
                """
                INSERT INTO payments (
                  id, provider, provider_payment_id, amount_usd, currency, status, org_id, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s::timestamptz)
                """,
                (
                    payment_id,
                    provider,
                    provider_payment_id,
                    amount_usd,
                    currency,
                    status,
                    org_id,
                    now,
                ),
            )
        return True
    except psycopg.errors.UniqueViolation:
        return False


def get_payment_by_provider_id(
    *, provider: str, provider_payment_id: str
) -> Optional[Dict[str, Any]]:
    with _tx() as conn:
        row = conn.execute(
            "SELECT * FROM payments WHERE provider = %s AND provider_payment_id = %s",
            (provider, provider_payment_id),
        ).fetchone()
        return _row_out(dict(row)) if row else None


def get_payment_by_id(payment_id: str) -> Optional[Dict[str, Any]]:
    with _tx() as conn:
        row = conn.execute("SELECT * FROM payments WHERE id = %s", (payment_id,)).fetchone()
        return _row_out(dict(row)) if row else None


def list_canonical_events_for_payment(payment_id: str) -> List[Dict[str, Any]]:
    type_order = {
        "PaymentReceived": 0,
        "CryptoReceived": 1,
        "ReserveAllocated": 2,
        "ClawKeyIssued": 3,
    }
    with _tx() as conn:
        rows = conn.execute(
            """
            SELECT * FROM payment_canonical_events
            WHERE payment_id = %s
            ORDER BY created_at ASC
            """,
            (payment_id,),
        ).fetchall()
        lst = [_row_out(dict(r)) for r in rows]
    lst.sort(
        key=lambda r: (
            type_order.get(str(r.get("event_type")), 99),
            str(r.get("created_at") or ""),
            str(r.get("id") or ""),
        )
    )
    return lst


def insert_crypto_receipt(
    *,
    receipt_id: str,
    payment_id: str,
    tx_hash: str,
    amount_usd: float,
    status: str,
) -> bool:
    import psycopg.errors

    now = _utc_now_iso()
    try:
        with _tx() as conn:
            conn.execute(
                """
                INSERT INTO crypto_receipts (
                  id, payment_id, tx_hash, amount_usd, status, received_at
                ) VALUES (%s, %s, %s, %s, %s, %s::timestamptz)
                """,
                (receipt_id, payment_id, tx_hash, amount_usd, status, now),
            )
        return True
    except psycopg.errors.UniqueViolation:
        return False


def insert_reserve(
    *,
    reserve_id: str,
    org_id: str,
    amount_usd: float,
    allocated_at: str,
    release_at: str,
    payment_id: str,
) -> None:
    aa = allocated_at.replace("Z", "+00:00") if allocated_at.endswith("Z") else allocated_at
    ra = release_at.replace("Z", "+00:00") if release_at.endswith("Z") else release_at
    with _tx() as conn:
        conn.execute(
            """
            INSERT INTO reserves (
              id, org_id, amount_usd, allocated_at, release_at, released, payment_id
            ) VALUES (%s, %s, %s, %s::timestamptz, %s::timestamptz, 0, %s)
            """,
            (reserve_id, org_id, amount_usd, aa, ra, payment_id),
        )


def insert_onramp_claw_key(
    *, row_id: str, org_id: str, keys_allocated: int, payment_id: str
) -> None:
    now = _utc_now_iso()
    with _tx() as conn:
        conn.execute(
            """
            INSERT INTO claw_keys (id, org_id, keys_allocated, payment_id, issued_at)
            VALUES (%s, %s, %s, %s, %s::timestamptz)
            """,
            (row_id, org_id, keys_allocated, payment_id, now),
        )


def persist_canonical_event(
    *,
    event_id: str,
    event_sha256: str,
    event_type: str,
    payment_id: Optional[str],
    reserve_id: Optional[str],
    canonical_json: str,
) -> bool:
    import psycopg.errors

    now = _utc_now_iso()
    try:
        with _tx() as conn:
            conn.execute(
                """
                INSERT INTO payment_canonical_events (
                  id, event_sha256, event_type, payment_id, reserve_id, canonical_json, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s::timestamptz)
                """,
                (
                    event_id,
                    event_sha256,
                    event_type,
                    payment_id,
                    reserve_id,
                    canonical_json,
                    now,
                ),
            )
        return True
    except psycopg.errors.UniqueViolation:
        return False


def has_event_hash(event_sha256: str) -> bool:
    with _tx() as conn:
        row = conn.execute(
            "SELECT 1 FROM payment_canonical_events WHERE event_sha256 = %s LIMIT 1",
            (event_sha256,),
        ).fetchone()
        return row is not None


def list_reserves_due(*, as_of_iso: str) -> List[Dict[str, Any]]:
    asof = as_of_iso.replace("Z", "+00:00") if as_of_iso.endswith("Z") else as_of_iso
    with _tx() as conn:
        rows = conn.execute(
            """
            SELECT * FROM reserves
            WHERE released = 0 AND release_at <= %s::timestamptz
            ORDER BY release_at
            """,
            (asof,),
        ).fetchall()
        return [_row_out(dict(r)) for r in rows]


def mark_reserve_released(*, reserve_id: str) -> None:
    with _tx() as conn:
        conn.execute(
            "UPDATE reserves SET released = 1 WHERE id = %s AND released = 0",
            (reserve_id,),
        )


def list_crypto_receipt_tx_hashes() -> List[str]:
    with _tx() as conn:
        rows = conn.execute("SELECT tx_hash FROM crypto_receipts").fetchall()
        return [str(r["tx_hash"]) for r in rows]
