"""
SQLite / Postgres persistence for receipt-batch anchoring (batches, receipts, anchor_jobs).

SQL uses ``?`` placeholders; Postgres connections rewrite via ``backend.db.anchoring_sql``.
"""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.db.anchoring_sql import (
    PostgresAnchoringConnection,
    apply_postgres_anchoring_migrations,
    open_anchoring_store_connection,
)
def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(12)}"


def _row_to_dict(row: Any) -> Dict[str, Any]:
    if row is None:
        return {}
    if hasattr(row, "keys"):
        return {str(k): row[k] for k in row.keys()}  # type: ignore[attr-defined]
    if isinstance(row, dict):
        return dict(row)
    return {}


def _parse_ts(raw: Any) -> Optional[datetime]:
    if not isinstance(raw, str) or not raw.strip():
        return None
    s = raw.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def _failure_status(failure_kind: str) -> str:
    fk = (failure_kind or "").lower()
    if "retryable" in fk:
        return "failed_retryable"
    if "terminal" in fk:
        return "failed_terminal"
    return "failed"


def _normalize_chain(chain: str) -> str:
    c = (chain or "").strip().lower()
    if c in ("bitcoin", "btc"):
        return "btc"
    if c in ("dogecoin", "doge"):
        return "doge"
    return c


_SQLITE_SCHEMA_STATEMENTS: Tuple[str, ...] = (
    """
    CREATE TABLE IF NOT EXISTS anchoring_schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
    """,
    "INSERT OR IGNORE INTO anchoring_schema_meta (key, value) VALUES ('version', '1')",
    """
    CREATE TABLE IF NOT EXISTS anchoring_ops_counters (
      name TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS receipt_batches (
      id TEXT PRIMARY KEY,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      receipt_count INTEGER NOT NULL DEFAULT 0,
      merkle_root_sha256 TEXT,
      status TEXT NOT NULL,
      adaptive_window_minutes INTEGER NOT NULL,
      min_receipts_at_close INTEGER,
      hourly_rate_at_close REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS batch_receipts (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      receipt_id TEXT NOT NULL,
      leaf_index INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      CONSTRAINT uq_batch_receipts_receipt_id UNIQUE (receipt_id),
      CONSTRAINT fk_batch_receipts_batch FOREIGN KEY (batch_id) REFERENCES receipt_batches (id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS anchor_jobs (
      id TEXT PRIMARY KEY,
      chain TEXT NOT NULL,
      anchor_type TEXT NOT NULL,
      target_root_sha256 TEXT NOT NULL,
      status TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      txid TEXT,
      fee_usd REAL,
      block_height INTEGER,
      confirmations INTEGER NOT NULL DEFAULT 0,
      queued_at TEXT NOT NULL,
      broadcast_at TEXT,
      confirmed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      network TEXT,
      failure_kind TEXT,
      provider_type TEXT,
      provider_job_id TEXT,
      provider_response_summary TEXT,
      failure_history_json TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS periodic_anchor_sets (
      id TEXT PRIMARY KEY,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      super_root_sha256 TEXT,
      included_batch_count INTEGER NOT NULL DEFAULT 0,
      btc_cadence_days INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS anchor_wallet_status (
      id TEXT PRIMARY KEY,
      chain TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      balance_native REAL,
      balance_usd_estimate REAL,
      low_threshold_usd REAL NOT NULL,
      target_refill_usd REAL NOT NULL,
      last_checked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CONSTRAINT uq_anchor_wallet_chain_address UNIQUE (chain, wallet_address)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS anchor_alert_events (
      id TEXT PRIMARY KEY,
      alert_type TEXT NOT NULL,
      chain TEXT,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata_json TEXT,
      sent_at TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_receipt_batches_status_opened ON receipt_batches (status, opened_at)",
    "CREATE INDEX IF NOT EXISTS idx_batch_receipts_batch_leaf ON batch_receipts (batch_id, leaf_index)",
    "CREATE INDEX IF NOT EXISTS idx_anchor_jobs_status_queued ON anchor_jobs (status, queued_at)",
)


class AnchoringStore:
    def __init__(self, sqlite_path: Optional[str] = None) -> None:
        self._sqlite_path = sqlite_path or self._default_sqlite_path()

    @staticmethod
    def _default_sqlite_path() -> str:
        raw = os.getenv("CLAW_ANCHORING_DB_PATH", "").strip()
        if raw:
            return raw
        base = os.getenv("CLAW_DATA_DIR", "").strip() or "."
        return os.path.join(base, "anchoring.sqlite3")

    def init_schema(self) -> None:
        with open_anchoring_store_connection(self._sqlite_path) as conn:
            if isinstance(conn, PostgresAnchoringConnection):
                apply_postgres_anchoring_migrations(conn)
            else:
                for stmt in _SQLITE_SCHEMA_STATEMENTS:
                    conn.execute(stmt.strip())
            conn.commit()

    # --- receipt batches / proof status ---

    def count_receipts_last_24h(self) -> int:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        with open_anchoring_store_connection(self._sqlite_path) as conn:
            cur = conn.execute("SELECT created_at FROM batch_receipts")
            rows = cur.fetchall()
        n = 0
        for row in rows:
            d = _row_to_dict(row)
            ts = _parse_ts(d.get("created_at"))
            if ts and ts.replace(tzinfo=timezone.utc) >= cutoff:
                n += 1
        return n

    def append_open_batch_receipt(
        self,
        *,
        receipt_id: str,
        receipt_hash_sha256: str,
        mode: Dict[str, Any],
    ) -> None:
        rid = (receipt_id or "").strip()
        if not rid:
            raise ValueError("receipt_id_required")
        _ = (receipt_hash_sha256 or "").strip()  # validated by caller; Merkle close uses receipts later
        win = int(mode.get("adaptive_window_minutes") or 1440)
        min_close = mode.get("min_receipts_at_close")
        min_close_i = int(min_close) if min_close is not None else 1
        hr = mode.get("hourly_rate_at_close")
        hr_v: Optional[float] = float(hr) if hr is not None else None
        now = _utc_now()

        with open_anchoring_store_connection(self._sqlite_path) as conn:
            try:
                conn.begin_immediate()
                cur = conn.execute(
                    "SELECT * FROM receipt_batches WHERE lower(status) = ? ORDER BY opened_at ASC LIMIT 1",
                    ("open",),
                )
                row = cur.fetchone()
                batch = _row_to_dict(row) if row else {}
                bid = str(batch.get("id") or "")
                if not bid:
                    bid = _new_id("rb")
                    conn.execute(
                        """
                        INSERT INTO receipt_batches (
                          id, opened_at, closed_at, receipt_count, merkle_root_sha256, status,
                          adaptive_window_minutes, min_receipts_at_close, hourly_rate_at_close,
                          created_at, updated_at
                        ) VALUES (?, ?, NULL, 0, NULL, ?, ?, ?, ?, ?, ?)
                        """,
                        (bid, now, "open", win, min_close_i, hr_v, now, now),
                    )
                cur2 = conn.execute(
                    "SELECT COALESCE(MAX(leaf_index), -1) AS m FROM batch_receipts WHERE batch_id = ?",
                    (bid,),
                )
                mx = cur2.fetchone()
                dmx = _row_to_dict(mx) if mx else {}
                next_leaf = int(dmx.get("m") if dmx.get("m") is not None else -1) + 1
                brid = _new_id("br")
                conn.execute(
                    """
                    INSERT INTO batch_receipts (id, batch_id, receipt_id, leaf_index, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (brid, bid, rid, next_leaf, now),
                )
                conn.execute(
                    "UPDATE receipt_batches SET receipt_count = receipt_count + 1, updated_at = ? WHERE id = ?",
                    (now, bid),
                )
                conn.commit()
            except sqlite3.IntegrityError:
                conn.rollback()
                raise
            except Exception:
                conn.rollback()
                raise

    def find_batch_context_for_receipt(self, receipt_id: str) -> Optional[Dict[str, Any]]:
        rid = (receipt_id or "").strip()
        if not rid:
            return None
        with open_anchoring_store_connection(self._sqlite_path) as conn:
            cur = conn.execute(
                """
                SELECT br.batch_id AS batch_id, br.leaf_index AS leaf_index, br.receipt_id AS receipt_id,
                       rb.status AS batch_status, rb.merkle_root_sha256 AS merkle_root_sha256
                FROM batch_receipts br
                JOIN receipt_batches rb ON rb.id = br.batch_id
                WHERE br.receipt_id = ?
                LIMIT 1
                """,
                (rid,),
            )
            row = cur.fetchone()
        if not row:
            return None
        d = _row_to_dict(row)
        root = d.get("merkle_root_sha256")
        root_s = str(root).strip().lower() if isinstance(root, str) else ""
        btc_job = None
        if len(root_s) == 64:
            btc_job = self.get_anchor_job_by_root_and_chain(root_s, "btc", "batch")
        return {
            "batch_id": d.get("batch_id"),
            "batch_status": d.get("batch_status"),
            "leaf_index": d.get("leaf_index"),
            "merkle_root_sha256": d.get("merkle_root_sha256"),
            "btc_anchor_job": btc_job,
        }

    # --- anchor jobs ---

    def insert_anchor_job(
        self,
        *,
        chain: str,
        anchor_type: str,
        target_root_sha256: str,
        network: str,
        provider_type: str,
    ) -> Dict[str, Any]:
        jid = _new_id("aj")
        now = _utc_now()
        root = (target_root_sha256 or "").strip().lower()
        with open_anchoring_store_connection(self._sqlite_path) as conn:
            conn.execute(
                """
                INSERT INTO anchor_jobs (
                  id, chain, anchor_type, target_root_sha256, status, attempt_count,
                  confirmations, queued_at, created_at, updated_at, network, provider_type
                ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)
                """,
                (
                    jid,
                    _normalize_chain(chain),
                    (anchor_type or "batch").strip().lower(),
                    root,
                    "queued",
                    now,
                    now,
                    now,
                    network.strip(),
                    provider_type.strip(),
                ),
            )
            conn.commit()
        row = self._get_anchor_job_by_id(jid)
        return row or {"id": jid}

    def _get_anchor_job_by_id(self, job_id: str) -> Optional[Dict[str, Any]]:
        with open_anchoring_store_connection(self._sqlite_path) as conn:
            cur = conn.execute("SELECT * FROM anchor_jobs WHERE id = ?", (job_id.strip(),))
            row = cur.fetchone()
        return _row_to_dict(row) if row else None

    def get_anchor_job_by_root_and_chain(
        self, target_root_sha256: str, chain: str, anchor_type: str
    ) -> Optional[Dict[str, Any]]:
        root = (target_root_sha256 or "").strip().lower()
        ch = _normalize_chain(chain)
        at = (anchor_type or "batch").strip().lower()
        with open_anchoring_store_connection(self._sqlite_path) as conn:
            cur = conn.execute(
                """
                SELECT * FROM anchor_jobs
                WHERE lower(target_root_sha256) = ? AND lower(chain) = ? AND lower(anchor_type) = ?
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (root, ch, at),
            )
            row = cur.fetchone()
        return _row_to_dict(row) if row else None

    def list_anchor_jobs_for_root(self, target_root_sha256: str) -> List[Dict[str, Any]]:
        root = (target_root_sha256 or "").strip().lower()
        with open_anchoring_store_connection(self._sqlite_path) as conn:
            cur = conn.execute(
                """
                SELECT * FROM anchor_jobs
                WHERE lower(target_root_sha256) = ? AND lower(anchor_type) = ?
                ORDER BY chain ASC, created_at ASC
                """,
                (root, "batch"),
            )
            rows = cur.fetchall()
        return [_row_to_dict(r) for r in rows]

    def list_ordered_queued_batch_anchor_jobs(self, limit: int) -> List[Dict[str, Any]]:
        lim = max(1, min(500, int(limit)))
        with open_anchoring_store_connection(self._sqlite_path) as conn:
            cur = conn.execute(
                """
                SELECT * FROM anchor_jobs
                WHERE lower(anchor_type) = 'batch' AND lower(status) = 'queued'
                ORDER BY target_root_sha256 ASC, chain ASC, queued_at ASC
                LIMIT ?
                """,
                (lim,),
            )
            rows = cur.fetchall()
        return [_row_to_dict(r) for r in rows]

    def list_batch_anchor_jobs_pending_confirmation(self, limit: int) -> List[Dict[str, Any]]:
        lim = max(1, min(500, int(limit)))
        with open_anchoring_store_connection(self._sqlite_path) as conn:
            cur = conn.execute(
                """
                SELECT * FROM anchor_jobs
                WHERE lower(anchor_type) = 'batch'
                  AND lower(status) IN ('submitted_unconfirmed', 'broadcast', 'building')
                ORDER BY updated_at ASC
                LIMIT ?
                """,
                (lim,),
            )
            rows = cur.fetchall()
        return [_row_to_dict(r) for r in rows]

    def update_anchor_job_submitted(self, job_id: str, *, txid: str) -> None:
        now = _utc_now()
        with open_anchoring_store_connection(self._sqlite_path) as conn:
            conn.execute(
                """
                UPDATE anchor_jobs
                SET status = ?, txid = ?, broadcast_at = ?, updated_at = ?, last_error = NULL, failure_kind = NULL
                WHERE id = ?
                """,
                ("submitted_unconfirmed", txid.strip(), now, now, job_id.strip()),
            )
            conn.commit()

    def update_anchor_job_failed(self, job_id: str, *, error: str, failure_kind: str) -> None:
        now = _utc_now()
        st = _failure_status(failure_kind)
        with open_anchoring_store_connection(self._sqlite_path) as conn:
            conn.execute(
                """
                UPDATE anchor_jobs
                SET status = ?, last_error = ?, failure_kind = ?, updated_at = ?
                WHERE id = ?
                """,
                (st, (error or "")[:4000], (failure_kind or "")[:512], now, job_id.strip()),
            )
            conn.commit()

    def mark_anchor_job_confirmed(self, job_id: str) -> None:
        now = _utc_now()
        with open_anchoring_store_connection(self._sqlite_path) as conn:
            conn.execute(
                """
                UPDATE anchor_jobs
                SET status = ?, confirmed_at = ?, updated_at = ?, confirmations = 100
                WHERE id = ?
                """,
                ("confirmed", now, now, job_id.strip()),
            )
            conn.commit()

    def count_batch_anchor_jobs_with_status(self, status: str) -> int:
        st = (status or "").strip().lower()
        with open_anchoring_store_connection(self._sqlite_path) as conn:
            cur = conn.execute(
                """
                SELECT COUNT(*) AS c FROM anchor_jobs
                WHERE lower(anchor_type) = 'batch' AND lower(status) = ?
                """,
                (st,),
            )
            row = cur.fetchone()
        d = _row_to_dict(row) if row else {}
        try:
            return int(d.get("c", 0))
        except (TypeError, ValueError):
            return 0

    def count_stale_unconfirmed_batch_anchor_jobs(self, *, older_than_hours: float) -> int:
        hours = max(0.0, float(older_than_hours))
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        with open_anchoring_store_connection(self._sqlite_path) as conn:
            cur = conn.execute(
                """
                SELECT id, broadcast_at FROM anchor_jobs
                WHERE lower(anchor_type) = 'batch'
                  AND lower(status) IN ('submitted_unconfirmed', 'broadcast', 'building')
                  AND broadcast_at IS NOT NULL
                """,
            )
            rows = cur.fetchall()
        n = 0
        for row in rows:
            d = _row_to_dict(row)
            ts = _parse_ts(d.get("broadcast_at"))
            if ts and ts.replace(tzinfo=timezone.utc) <= cutoff:
                n += 1
        return n

    def count_receipt_batches_ready_overdue(self, *, older_than_days: float) -> int:
        days = max(0.0, float(older_than_days))
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        with open_anchoring_store_connection(self._sqlite_path) as conn:
            cur = conn.execute(
                """
                SELECT closed_at FROM receipt_batches
                WHERE lower(status) = 'ready_to_anchor' AND closed_at IS NOT NULL
                """,
            )
            rows = cur.fetchall()
        n = 0
        for row in rows:
            d = _row_to_dict(row)
            ts = _parse_ts(d.get("closed_at"))
            if ts and ts.replace(tzinfo=timezone.utc) <= cutoff:
                n += 1
        return n

    def get_latest_fully_anchored_receipt_batch(self) -> Optional[Dict[str, Any]]:
        with open_anchoring_store_connection(self._sqlite_path) as conn:
            cur = conn.execute(
                """
                SELECT * FROM receipt_batches
                WHERE lower(status) = 'fully_anchored'
                ORDER BY updated_at DESC
                LIMIT 1
                """,
            )
            row = cur.fetchone()
        return _row_to_dict(row) if row else None

    def retry_failed_retryable_batch_anchor_job(
        self,
        *,
        job_id: Optional[str] = None,
        receipt_batch_id: Optional[str] = None,
        chain: Optional[str] = None,
    ) -> Tuple[bool, str, Optional[str]]:
        jid_in = (job_id or "").strip()
        rb_in = (receipt_batch_id or "").strip()
        ch_in = (chain or "").strip()

        row: Optional[Dict[str, Any]] = None
        if jid_in:
            row = self._get_anchor_job_by_id(jid_in)
        elif rb_in and ch_in:
            with open_anchoring_store_connection(self._sqlite_path) as conn:
                cur = conn.execute("SELECT merkle_root_sha256 FROM receipt_batches WHERE id = ?", (rb_in,))
                r = cur.fetchone()
            bd = _row_to_dict(r) if r else {}
            root = str(bd.get("merkle_root_sha256") or "").strip().lower()
            if len(root) != 64:
                return False, "job_not_found", None
            row = self.get_anchor_job_by_root_and_chain(root, ch_in, "batch")
        else:
            return False, "job_not_found", None

        if not row:
            return False, "job_not_found", None
        jid = str(row.get("id") or "")
        st = str(row.get("status") or "").strip().lower()
        if st == "confirmed":
            return False, "already_confirmed", jid or None
        if st != "failed_retryable":
            return False, "job_not_found", jid or None
        now = _utc_now()
        with open_anchoring_store_connection(self._sqlite_path) as conn:
            conn.execute(
                """
                UPDATE anchor_jobs
                SET status = 'queued', last_error = NULL, failure_kind = NULL,
                    attempt_count = attempt_count + 1, updated_at = ?, txid = NULL,
                    broadcast_at = NULL, confirmed_at = NULL
                WHERE id = ?
                """,
                (now, jid),
            )
            conn.commit()
        return True, "requeued", jid or None
