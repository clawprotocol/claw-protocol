"""
SQLite persistence for crypto onramp (separate DB from treasury to avoid table name clashes).

Treasury ``claw_keys`` / ``ledger_events`` remain authoritative for product; this store mirrors
allocation rows and holds provider-specific tables.
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from backend.config.runtime_environment import data_dir
from backend.db.config import use_postgresql_for_onramp_payments


def onramp_db_path() -> str:
    env = os.getenv("CLAW_ONRAMP_DB_PATH", "").strip()
    if env:
        return os.path.expanduser(env)
    return os.path.join(data_dir(), "onramp_payments.sqlite3")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _json_dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True, default=str)


class OnrampStore:
    def __init__(self, path: Optional[str] = None) -> None:
        self._path = path or onramp_db_path()
        if not use_postgresql_for_onramp_payments():
            os.makedirs(os.path.dirname(self._path) or ".", exist_ok=True)

    def _conn(self) -> sqlite3.Connection:
        if use_postgresql_for_onramp_payments():
            raise RuntimeError(
                "OnrampStore is using PostgreSQL; use public store methods instead of _conn()"
            )
        c = sqlite3.connect(self._path, timeout=30.0)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL;")
        return c

    def init_schema(self) -> None:
        if use_postgresql_for_onramp_payments():
            from backend.payments.onramp_payments_postgres import ensure_onramp_payments_schema

            ensure_onramp_payments_schema()
            return
        with self._conn() as con:
            con.executescript(
                """
                CREATE TABLE IF NOT EXISTS payments (
                  id TEXT PRIMARY KEY,
                  provider TEXT NOT NULL,
                  provider_payment_id TEXT NOT NULL UNIQUE,
                  amount_usd REAL NOT NULL,
                  currency TEXT NOT NULL,
                  status TEXT NOT NULL,
                  org_id TEXT,
                  created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_payments_provider_ref
                  ON payments (provider, provider_payment_id);

                CREATE TABLE IF NOT EXISTS crypto_receipts (
                  id TEXT PRIMARY KEY,
                  payment_id TEXT NOT NULL,
                  tx_hash TEXT NOT NULL UNIQUE,
                  amount_usd REAL NOT NULL,
                  status TEXT NOT NULL,
                  received_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_crypto_payment ON crypto_receipts (payment_id);

                CREATE TABLE IF NOT EXISTS claw_keys (
                  id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL,
                  keys_allocated INTEGER NOT NULL,
                  payment_id TEXT NOT NULL,
                  issued_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_onramp_clawkeys_org ON claw_keys (org_id);
                CREATE INDEX IF NOT EXISTS idx_onramp_clawkeys_pay ON claw_keys (payment_id);

                CREATE TABLE IF NOT EXISTS reserves (
                  id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL,
                  amount_usd REAL NOT NULL,
                  allocated_at TEXT NOT NULL,
                  release_at TEXT NOT NULL,
                  released INTEGER NOT NULL DEFAULT 0,
                  payment_id TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_reserves_release ON reserves (released, release_at);

                CREATE TABLE IF NOT EXISTS payment_canonical_events (
                  id TEXT PRIMARY KEY,
                  event_sha256 TEXT NOT NULL UNIQUE,
                  event_type TEXT NOT NULL,
                  payment_id TEXT,
                  reserve_id TEXT,
                  canonical_json TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_pce_payment ON payment_canonical_events (payment_id);

                CREATE TABLE IF NOT EXISTS webhook_idempotency (
                  provider TEXT NOT NULL,
                  idempotency_key TEXT NOT NULL,
                  payment_id TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  PRIMARY KEY (provider, idempotency_key)
                );
                """
            )

    def try_claim_webhook(
        self, *, provider: str, idempotency_key: str, payment_id: str
    ) -> bool:
        """Returns True if this is the first claim for (provider, key)."""
        if use_postgresql_for_onramp_payments():
            from backend.payments import onramp_payments_postgres as opp

            return opp.try_claim_webhook(
                provider=provider, idempotency_key=idempotency_key, payment_id=payment_id
            )
        now = _utc_now()
        with self._conn() as con:
            try:
                con.execute(
                    """
                    INSERT INTO webhook_idempotency (provider, idempotency_key, payment_id, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (provider, idempotency_key, payment_id, now),
                )
                return True
            except sqlite3.IntegrityError:
                return False

    def insert_payment(
        self,
        *,
        payment_id: str,
        provider: str,
        provider_payment_id: str,
        amount_usd: float,
        currency: str,
        status: str,
        org_id: str,
    ) -> bool:
        """Returns True if inserted; False if provider_payment_id already exists."""
        if use_postgresql_for_onramp_payments():
            from backend.payments import onramp_payments_postgres as opp

            return opp.insert_payment(
                payment_id=payment_id,
                provider=provider,
                provider_payment_id=provider_payment_id,
                amount_usd=amount_usd,
                currency=currency,
                status=status,
                org_id=org_id,
            )
        now = _utc_now()
        with self._conn() as con:
            try:
                con.execute(
                    """
                    INSERT INTO payments (
                      id, provider, provider_payment_id, amount_usd, currency, status, org_id, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
            except sqlite3.IntegrityError:
                return False

    def get_payment_by_provider_id(
        self, *, provider: str, provider_payment_id: str
    ) -> Optional[Dict[str, Any]]:
        if use_postgresql_for_onramp_payments():
            from backend.payments import onramp_payments_postgres as opp

            return opp.get_payment_by_provider_id(
                provider=provider, provider_payment_id=provider_payment_id
            )
        with self._conn() as con:
            row = con.execute(
                "SELECT * FROM payments WHERE provider = ? AND provider_payment_id = ?",
                (provider, provider_payment_id),
            ).fetchone()
            return dict(row) if row else None

    def get_payment_by_id(self, payment_id: str) -> Optional[Dict[str, Any]]:
        if use_postgresql_for_onramp_payments():
            from backend.payments import onramp_payments_postgres as opp

            return opp.get_payment_by_id(payment_id)
        with self._conn() as con:
            row = con.execute("SELECT * FROM payments WHERE id = ?", (payment_id,)).fetchone()
            return dict(row) if row else None

    def list_canonical_events_for_payment(self, payment_id: str) -> List[Dict[str, Any]]:
        """Deterministic order: pipeline type order then created_at."""
        if use_postgresql_for_onramp_payments():
            from backend.payments import onramp_payments_postgres as opp

            return opp.list_canonical_events_for_payment(payment_id)
        type_order = {
            "PaymentReceived": 0,
            "CryptoReceived": 1,
            "ReserveAllocated": 2,
            "ClawKeyIssued": 3,
        }
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT * FROM payment_canonical_events
                WHERE payment_id = ?
                ORDER BY created_at ASC
                """,
                (payment_id,),
            ).fetchall()
            lst = [dict(r) for r in rows]
            lst.sort(
                key=lambda r: (
                    type_order.get(str(r.get("event_type")), 99),
                    str(r.get("created_at") or ""),
                    str(r.get("id") or ""),
                )
            )
            return lst

    def insert_crypto_receipt(
        self,
        *,
        receipt_id: str,
        payment_id: str,
        tx_hash: str,
        amount_usd: float,
        status: str,
    ) -> bool:
        if use_postgresql_for_onramp_payments():
            from backend.payments import onramp_payments_postgres as opp

            return opp.insert_crypto_receipt(
                receipt_id=receipt_id,
                payment_id=payment_id,
                tx_hash=tx_hash,
                amount_usd=amount_usd,
                status=status,
            )
        now = _utc_now()
        with self._conn() as con:
            try:
                con.execute(
                    """
                    INSERT INTO crypto_receipts (
                      id, payment_id, tx_hash, amount_usd, status, received_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (receipt_id, payment_id, tx_hash, amount_usd, status, now),
                )
                return True
            except sqlite3.IntegrityError:
                return False

    def insert_reserve(
        self,
        *,
        reserve_id: str,
        org_id: str,
        amount_usd: float,
        allocated_at: str,
        release_at: str,
        payment_id: str,
    ) -> None:
        if use_postgresql_for_onramp_payments():
            from backend.payments import onramp_payments_postgres as opp

            opp.insert_reserve(
                reserve_id=reserve_id,
                org_id=org_id,
                amount_usd=amount_usd,
                allocated_at=allocated_at,
                release_at=release_at,
                payment_id=payment_id,
            )
            return
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO reserves (
                  id, org_id, amount_usd, allocated_at, release_at, released, payment_id
                ) VALUES (?, ?, ?, ?, ?, 0, ?)
                """,
                (reserve_id, org_id, amount_usd, allocated_at, release_at, payment_id),
            )

    def insert_onramp_claw_key(
        self, *, row_id: str, org_id: str, keys_allocated: int, payment_id: str
    ) -> None:
        if use_postgresql_for_onramp_payments():
            from backend.payments import onramp_payments_postgres as opp

            opp.insert_onramp_claw_key(
                row_id=row_id,
                org_id=org_id,
                keys_allocated=keys_allocated,
                payment_id=payment_id,
            )
            return
        now = _utc_now()
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO claw_keys (id, org_id, keys_allocated, payment_id, issued_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (row_id, org_id, keys_allocated, payment_id, now),
            )

    def persist_canonical_event(
        self,
        *,
        event_id: str,
        event_sha256: str,
        event_type: str,
        payment_id: Optional[str],
        reserve_id: Optional[str],
        canonical_json: str,
    ) -> bool:
        """Returns True if inserted; False if event_sha256 duplicate (idempotent)."""
        if use_postgresql_for_onramp_payments():
            from backend.payments import onramp_payments_postgres as opp

            return opp.persist_canonical_event(
                event_id=event_id,
                event_sha256=event_sha256,
                event_type=event_type,
                payment_id=payment_id,
                reserve_id=reserve_id,
                canonical_json=canonical_json,
            )
        now = _utc_now()
        with self._conn() as con:
            try:
                con.execute(
                    """
                    INSERT INTO payment_canonical_events (
                      id, event_sha256, event_type, payment_id, reserve_id, canonical_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
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
            except sqlite3.IntegrityError:
                return False

    def has_event_hash(self, event_sha256: str) -> bool:
        if use_postgresql_for_onramp_payments():
            from backend.payments import onramp_payments_postgres as opp

            return opp.has_event_hash(event_sha256)
        with self._conn() as con:
            row = con.execute(
                "SELECT 1 FROM payment_canonical_events WHERE event_sha256 = ? LIMIT 1",
                (event_sha256,),
            ).fetchone()
            return row is not None

    def list_reserves_due(self, *, as_of_iso: str) -> List[Dict[str, Any]]:
        if use_postgresql_for_onramp_payments():
            from backend.payments import onramp_payments_postgres as opp

            return opp.list_reserves_due(as_of_iso=as_of_iso)
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT * FROM reserves
                WHERE released = 0 AND release_at <= ?
                ORDER BY release_at
                """,
                (as_of_iso,),
            ).fetchall()
            return [dict(r) for r in rows]

    def mark_reserve_released(self, *, reserve_id: str) -> None:
        if use_postgresql_for_onramp_payments():
            from backend.payments import onramp_payments_postgres as opp

            opp.mark_reserve_released(reserve_id=reserve_id)
            return
        with self._conn() as con:
            con.execute(
                "UPDATE reserves SET released = 1 WHERE id = ? AND released = 0",
                (reserve_id,),
            )

    def current_release_deadline_iso(self, *, hold_days_val: int) -> str:
        dt = datetime.now(timezone.utc)
        rel = dt + timedelta(days=hold_days_val)
        return rel.isoformat().replace("+00:00", "Z")

    def release_at_for_allocation(self, *, allocated_at_iso: str, hold_days: int) -> str:
        dt = datetime.fromisoformat(allocated_at_iso.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        rel = dt + timedelta(days=hold_days)
        return rel.isoformat().replace("+00:00", "Z")

    def list_crypto_receipt_tx_hashes(self) -> List[str]:
        """All ``tx_hash`` values in ``crypto_receipts`` (for reconciliation dedupe)."""
        if use_postgresql_for_onramp_payments():
            from backend.payments import onramp_payments_postgres as opp

            return opp.list_crypto_receipt_tx_hashes()
        with self._conn() as con:
            rows = con.execute("SELECT tx_hash FROM crypto_receipts").fetchall()
            return [str(r[0]) for r in rows]


_store: Optional[OnrampStore] = None


def get_onramp_store() -> OnrampStore:
    global _store
    if _store is None:
        _store = OnrampStore()
        _store.init_schema()
    return _store


def reset_onramp_store_for_tests() -> None:
    global _store
    _store = None
    from backend.payments.onramp_payments_postgres import reset_onramp_payments_schema_cache_for_tests

    reset_onramp_payments_schema_cache_for_tests()
