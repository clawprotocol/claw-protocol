"""
Treasury persistence: **separate** tables for payments, ledger, splits, and CLAW Keys.

SQLite under ``CLAW_TREASURY_DB_PATH`` or ``{CLAW_DATA_DIR}/treasury.sqlite3``.
"""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from backend.config.runtime_environment import data_dir


def _db_path() -> str:
    env = os.getenv("CLAW_TREASURY_DB_PATH", "").strip()
    if env:
        return os.path.expanduser(env)
    return os.path.join(data_dir(), "treasury.sqlite3")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _json_dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True, default=str)


class TreasuryStore:
    def __init__(self, path: Optional[str] = None) -> None:
        self._path = path or _db_path()
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
                CREATE TABLE IF NOT EXISTS payment_records (
                  id TEXT PRIMARY KEY,
                  source_type TEXT NOT NULL,
                  source_reference TEXT NOT NULL,
                  payer_ref TEXT NOT NULL,
                  gross_amount TEXT NOT NULL,
                  currency TEXT NOT NULL,
                  normalized_usd_amount TEXT,
                  status TEXT NOT NULL,
                  received_at TEXT NOT NULL,
                  metadata TEXT NOT NULL DEFAULT '{}',
                  solana_wallet TEXT,
                  solana_signature TEXT,
                  solana_memo TEXT,
                  solana_token_mint TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_payments_status ON payment_records (status);
                CREATE INDEX IF NOT EXISTS idx_payments_payer ON payment_records (payer_ref);
                CREATE INDEX IF NOT EXISTS idx_payments_source ON payment_records (source_type, source_reference);

                CREATE TABLE IF NOT EXISTS ledger_events (
                  id TEXT PRIMARY KEY,
                  event_type TEXT NOT NULL,
                  payment_id TEXT,
                  subject_ref TEXT,
                  amount TEXT,
                  currency TEXT,
                  agreement_id TEXT,
                  claw_key_id TEXT,
                  created_at TEXT NOT NULL,
                  metadata TEXT NOT NULL DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger_events (event_type);
                CREATE INDEX IF NOT EXISTS idx_ledger_payment ON ledger_events (payment_id);
                CREATE INDEX IF NOT EXISTS idx_ledger_subject ON ledger_events (subject_ref);
                CREATE INDEX IF NOT EXISTS idx_ledger_agreement ON ledger_events (agreement_id);

                CREATE TABLE IF NOT EXISTS treasury_split_events (
                  id TEXT PRIMARY KEY,
                  payment_id TEXT NOT NULL,
                  gross_amount TEXT NOT NULL,
                  currency TEXT NOT NULL,
                  ops_amount TEXT NOT NULL,
                  reserve_amount TEXT NOT NULL,
                  pool_amount TEXT NOT NULL,
                  split_policy_version TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  metadata TEXT NOT NULL DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_split_payment ON treasury_split_events (payment_id);

                CREATE TABLE IF NOT EXISTS claw_keys (
                  id TEXT PRIMARY KEY,
                  subject_ref TEXT NOT NULL,
                  tier TEXT NOT NULL,
                  status TEXT NOT NULL,
                  source_payment_id TEXT,
                  source_payment_type TEXT,
                  usage_units_remaining INTEGER,
                  expires_at TEXT,
                  issued_at TEXT NOT NULL,
                  metadata TEXT NOT NULL DEFAULT '{}',
                  wallet_ref TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_claw_keys_subject ON claw_keys (subject_ref);
                CREATE INDEX IF NOT EXISTS idx_claw_keys_status ON claw_keys (status);
                """
            )

    # --- payments ---

    def insert_payment(
        self,
        *,
        source_type: str,
        source_reference: str,
        payer_ref: str,
        gross_amount: Decimal,
        currency: str,
        normalized_usd_amount: Optional[Decimal],
        status: str,
        received_at: str,
        metadata: Dict[str, Any],
        solana_wallet: Optional[str] = None,
        solana_signature: Optional[str] = None,
        solana_memo: Optional[str] = None,
        solana_token_mint: Optional[str] = None,
        payment_id: Optional[str] = None,
    ) -> str:
        pid = payment_id or str(uuid.uuid4())
        now = _utc_now()
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO payment_records (
                  id, source_type, source_reference, payer_ref, gross_amount, currency,
                  normalized_usd_amount, status, received_at, metadata,
                  solana_wallet, solana_signature, solana_memo, solana_token_mint,
                  created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    pid,
                    source_type,
                    source_reference,
                    payer_ref,
                    str(gross_amount),
                    currency,
                    str(normalized_usd_amount) if normalized_usd_amount is not None else None,
                    status,
                    received_at,
                    _json_dumps(metadata),
                    solana_wallet,
                    solana_signature,
                    solana_memo,
                    solana_token_mint,
                    now,
                    now,
                ),
            )
        return pid

    def update_payment_status(self, *, payment_id: str, status: str) -> None:
        now = _utc_now()
        with self._conn() as con:
            con.execute(
                "UPDATE payment_records SET status = ?, updated_at = ? WHERE id = ?",
                (status, now, payment_id),
            )

    def get_payment(self, payment_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as con:
            row = con.execute(
                "SELECT * FROM payment_records WHERE id = ?", (payment_id,)
            ).fetchone()
            return dict(row) if row else None

    def list_payments(self, *, limit: int = 100) -> List[Dict[str, Any]]:
        with self._conn() as con:
            rows = con.execute(
                "SELECT * FROM payment_records ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [dict(r) for r in rows]

    # --- ledger ---

    def insert_ledger_event(
        self,
        *,
        event_type: str,
        payment_id: Optional[str],
        subject_ref: Optional[str],
        amount: Optional[Decimal],
        currency: Optional[str],
        agreement_id: Optional[str],
        claw_key_id: Optional[str],
        metadata: Dict[str, Any],
        ledger_id: Optional[str] = None,
    ) -> str:
        lid = ledger_id or str(uuid.uuid4())
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO ledger_events (
                  id, event_type, payment_id, subject_ref, amount, currency,
                  agreement_id, claw_key_id, created_at, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    lid,
                    event_type,
                    payment_id,
                    subject_ref,
                    str(amount) if amount is not None else None,
                    currency,
                    agreement_id,
                    claw_key_id,
                    _utc_now(),
                    _json_dumps(metadata),
                ),
            )
        return lid

    def list_ledger_events(self, *, limit: int = 200) -> List[Dict[str, Any]]:
        with self._conn() as con:
            rows = con.execute(
                "SELECT * FROM ledger_events ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [dict(r) for r in rows]

    # --- treasury splits ---

    def insert_treasury_split(
        self,
        *,
        payment_id: str,
        gross_amount: Decimal,
        currency: str,
        ops_amount: Decimal,
        reserve_amount: Decimal,
        pool_amount: Decimal,
        split_policy_version: str,
        metadata: Dict[str, Any],
        split_id: Optional[str] = None,
    ) -> str:
        sid = split_id or str(uuid.uuid4())
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO treasury_split_events (
                  id, payment_id, gross_amount, currency,
                  ops_amount, reserve_amount, pool_amount,
                  split_policy_version, created_at, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    sid,
                    payment_id,
                    str(gross_amount),
                    currency,
                    str(ops_amount),
                    str(reserve_amount),
                    str(pool_amount),
                    split_policy_version,
                    _utc_now(),
                    _json_dumps(metadata),
                ),
            )
        return sid

    def list_treasury_splits(self, *, limit: int = 100) -> List[Dict[str, Any]]:
        with self._conn() as con:
            rows = con.execute(
                "SELECT * FROM treasury_split_events ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [dict(r) for r in rows]

    # --- claw keys ---

    def insert_claw_key(
        self,
        *,
        subject_ref: str,
        tier: str,
        status: str,
        source_payment_id: Optional[str],
        source_payment_type: Optional[str],
        usage_units_remaining: Optional[int],
        expires_at: Optional[str],
        metadata: Dict[str, Any],
        wallet_ref: Optional[str] = None,
        claw_key_id: Optional[str] = None,
    ) -> str:
        kid = claw_key_id or str(uuid.uuid4())
        now = _utc_now()
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO claw_keys (
                  id, subject_ref, tier, status, source_payment_id, source_payment_type,
                  usage_units_remaining, expires_at, issued_at, metadata, wallet_ref
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    kid,
                    subject_ref,
                    tier,
                    status,
                    source_payment_id,
                    source_payment_type,
                    usage_units_remaining,
                    expires_at,
                    now,
                    _json_dumps(metadata),
                    wallet_ref,
                ),
            )
        return kid

    def update_claw_key(
        self,
        *,
        claw_key_id: str,
        status: Optional[str] = None,
        usage_units_remaining: Optional[int] = None,
        expires_at: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        sets: List[str] = []
        args: List[Any] = []
        if status is not None:
            sets.append("status = ?")
            args.append(status)
        if usage_units_remaining is not None:
            sets.append("usage_units_remaining = ?")
            args.append(usage_units_remaining)
        if expires_at is not None:
            sets.append("expires_at = ?")
            args.append(expires_at)
        if metadata is not None:
            sets.append("metadata = ?")
            args.append(_json_dumps(metadata))
        if not sets:
            return
        args.append(claw_key_id)
        with self._conn() as con:
            con.execute(
                f"UPDATE claw_keys SET {', '.join(sets)} WHERE id = ?",
                tuple(args),
            )

    def get_active_claw_key_for_subject(self, subject_ref: str) -> Optional[Dict[str, Any]]:
        """Most recently issued active key for subject (not expired by ``expires_at``)."""
        now = _utc_now()
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT * FROM claw_keys
                WHERE subject_ref = ? AND status = 'active'
                  AND (expires_at IS NULL OR expires_at > ?)
                ORDER BY issued_at DESC
                LIMIT 1
                """,
                (subject_ref, now),
            ).fetchall()
            return dict(rows[0]) if rows else None

    def list_claw_keys(self, *, limit: int = 100) -> List[Dict[str, Any]]:
        with self._conn() as con:
            rows = con.execute(
                "SELECT * FROM claw_keys ORDER BY issued_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [dict(r) for r in rows]


_store: Optional[TreasuryStore] = None


def get_treasury_store() -> TreasuryStore:
    global _store
    if _store is None:
        _store = TreasuryStore()
        _store.init_schema()
    return _store
