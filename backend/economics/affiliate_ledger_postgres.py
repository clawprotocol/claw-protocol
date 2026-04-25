"""
Postgres implementation for affiliate earnings + payout batch ledger tables.

Used when ``use_postgresql_for_affiliate_ledger()``; cross-references ``stripe_subscription_org``
and ``affiliates`` remain on the economics SQLite DB via the caller.
"""

from __future__ import annotations

import json
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from backend.db.config import (
    affiliate_ledger_postgresql_schema,
    affiliate_ledger_postgresql_url,
    postgres_connect_timeout_sec,
    postgres_connection_options_for_schema,
    use_postgresql_for_affiliate_ledger,
)
from backend.db.sql_split import split_sql_statements

_schema_lock = threading.Lock()
_schema_done = False


class _PostgresLedgerAdminConn:
    def __init__(self, url: str, schema: str) -> None:
        self._url = url
        self._schema = schema
        self._cx: Any = None

    def __enter__(self) -> _PostgresLedgerAdminConn:
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


def ensure_affiliate_ledger_schema() -> None:
    global _schema_done
    if not use_postgresql_for_affiliate_ledger():
        return
    if _schema_done:
        return
    with _schema_lock:
        if _schema_done:
            return
        mig_dir = Path(__file__).resolve().parent / "migrations" / "postgres"
        url = affiliate_ledger_postgresql_url()
        schema = affiliate_ledger_postgresql_schema()
        with _PostgresLedgerAdminConn(url, schema) as adm:
            for path in sorted(mig_dir.glob("*.sql")):
                script = path.read_text(encoding="utf-8")
                for stmt in split_sql_statements(script):
                    adm.execute(stmt)
            adm.commit()
        _schema_done = True


def reset_affiliate_ledger_schema_cache_for_tests() -> None:
    global _schema_done
    with _schema_lock:
        _schema_done = False


def _iso(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return v


def _money(v: Any) -> float:
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


def _row_dict(row: Any) -> Dict[str, Any]:
    if row is None:
        return {}
    d = dict(row)
    out: Dict[str, Any] = {}
    for k, v in d.items():
        if isinstance(v, datetime):
            out[k] = _iso(v)
        elif isinstance(v, Decimal):
            out[k] = float(v)
        else:
            out[k] = v
    return out


@contextmanager
def _ledger_tx() -> Any:
    ensure_affiliate_ledger_schema()
    import psycopg

    url = affiliate_ledger_postgresql_url()
    schema = affiliate_ledger_postgresql_schema()
    conn = psycopg.connect(
        url,
        options=postgres_connection_options_for_schema(schema),
        connect_timeout=postgres_connect_timeout_sec(),
    )
    try:
        with conn.transaction():
            yield conn
    finally:
        conn.close()


def _ts_or_none(s: Optional[str]) -> Any:
    if s is None or str(s).strip() == "":
        return None
    t = str(s).strip()
    return t.replace("Z", "+00:00") if t.endswith("Z") else t


def insert_affiliate_earning(
    *,
    earning_id: str,
    affiliate_id: str,
    referred_org_id: str,
    referred_user_id: Optional[str],
    internal_subscription_id: Optional[str],
    stripe_subscription_id: Optional[str],
    invoice_id: Optional[str],
    charge_id: Optional[str],
    payment_intent_id: Optional[str],
    internal_payment_id: Optional[str],
    amount_usd: float,
    rate_bps: int,
    earning_type: str,
    status: str,
    unlock_at: Optional[str],
    fraud_score_snapshot: Optional[float],
    notes: Optional[str],
    idempotency_key: str,
    risk_hold: int,
    created_at: str,
) -> bool:
    import psycopg

    try:
        with _ledger_tx() as conn:
            conn.execute(
                """
                INSERT INTO affiliate_earnings (
                  id, affiliate_id, referred_org_id, referred_user_id, internal_subscription_id,
                  stripe_subscription_id, invoice_id, charge_id, payment_intent_id, internal_payment_id,
                  amount_usd, rate_bps, earning_type, status, created_at, unlock_at,
                  fraud_score_snapshot, notes, idempotency_key, risk_hold
                ) VALUES (
                  %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                """,
                (
                    earning_id,
                    affiliate_id,
                    referred_org_id,
                    referred_user_id,
                    internal_subscription_id,
                    stripe_subscription_id,
                    invoice_id,
                    charge_id,
                    payment_intent_id,
                    internal_payment_id,
                    str(Decimal(str(amount_usd)).quantize(Decimal("0.000001"))),
                    int(rate_bps),
                    earning_type,
                    status,
                    _ts_or_none(created_at),
                    _ts_or_none(unlock_at),
                    fraud_score_snapshot,
                    notes,
                    idempotency_key,
                    int(risk_hold),
                ),
            )
        return True
    except psycopg.errors.UniqueViolation:
        return False


def promote_pending_to_payable(*, as_of_iso: str, active_stripe_subscription_ids: List[str]) -> int:
    asof = as_of_iso.replace("Z", "+00:00") if as_of_iso.endswith("Z") else as_of_iso
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            UPDATE affiliate_earnings
            SET status = 'payable'
            WHERE status = 'pending'
              AND risk_hold = 0
              AND unlock_at IS NOT NULL
              AND unlock_at <= %s::timestamptz
              AND (
                stripe_subscription_id IS NULL
                OR TRIM(stripe_subscription_id) = ''
                OR stripe_subscription_id = ANY(%s::text[])
              )
            """,
            (asof, active_stripe_subscription_ids),
        )
        return int(cur.rowcount or 0)


def cancel_affiliate_earnings_for_stripe_subscription(
    *, stripe_subscription_id: str, reason: str, now: str
) -> int:
    sid = (stripe_subscription_id or "").strip()
    if not sid:
        return 0
    now_ts = now.replace("Z", "+00:00") if now.endswith("Z") else now
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            UPDATE affiliate_earnings
            SET status = 'cancelled', cancelled_at = %s::timestamptz, cancellation_reason = %s,
                payout_batch_id = NULL
            WHERE stripe_subscription_id = %s AND status IN ('pending', 'payable')
            """,
            (now_ts, (reason or "").strip() or "subscription_ended", sid),
        )
        return int(cur.rowcount or 0)


def list_matured_payable_affiliate_earnings(*, as_of_iso: str) -> List[Dict[str, Any]]:
    asof = as_of_iso.replace("Z", "+00:00") if as_of_iso.endswith("Z") else as_of_iso
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            SELECT * FROM affiliate_earnings
            WHERE status = 'payable'
              AND risk_hold = 0
              AND unlock_at IS NOT NULL
              AND unlock_at <= %s::timestamptz
              AND (payout_batch_id IS NULL OR TRIM(payout_batch_id) = '')
            ORDER BY affiliate_id, created_at
            """,
            (asof,),
        )
        rows = cur.fetchall()
    return [_row_dict(r) for r in rows]


def mark_affiliate_earnings_paid(
    earning_ids: List[str], *, payout_batch_id: str, now: str
) -> int:
    if not earning_ids:
        return 0
    pid = (payout_batch_id or "").strip()
    now_ts = now.replace("Z", "+00:00") if now.endswith("Z") else now
    n = 0
    with _ledger_tx() as conn:
        for eid in earning_ids:
            cur = conn.execute(
                """
                UPDATE affiliate_earnings
                SET status = 'paid', paid_at = %s::timestamptz, payout_batch_id = %s
                WHERE id = %s AND status = 'payable' AND payout_batch_id = %s
                """,
                (now_ts, pid, eid, pid),
            )
            n += int(cur.rowcount or 0)
    return n


def payout_batch_earnings_integrity_failure(
    batch_id: str, items: List[Dict[str, Any]]
) -> Optional[Tuple[str, str]]:
    bid = (batch_id or "").strip()
    if not bid:
        return ("invalid_batch", "")
    with _ledger_tx() as conn:
        for it in items:
            eid = (it.get("earning_id") or "").strip()
            if not eid:
                return ("batch_item_missing_earning", str(it.get("id") or ""))
            cur = conn.execute(
                """
                SELECT status, payout_batch_id, amount_usd
                FROM affiliate_earnings WHERE id = %s
                """,
                (eid,),
            )
            row = cur.fetchone()
            if not row:
                return ("earning_not_found", eid)
            st = str(row["status"] or "")
            if st != "payable":
                return ("earning_not_payable", eid)
            pb = str(row["payout_batch_id"] or "").strip()
            if pb != bid:
                return ("earning_batch_mismatch", eid)
            try:
                er_amt = float(row["amount_usd"] or 0)
                it_amt = float(it.get("amount_usd") or 0)
            except (TypeError, ValueError):
                return ("earning_amount_mismatch", eid)
            if round(abs(er_amt - it_amt), 4) > 0.0001:
                return ("earning_amount_mismatch", eid)
    return None


def finalize_affiliate_payout_batch_paid(
    *,
    batch_id: str,
    affiliate_id: str,
    earning_ids: List[str],
    wallet_address: str,
    payout_id: str,
    amount_usd: float,
    tx_hash: str,
    paid_network: str,
    now: str,
) -> Optional[str]:
    bid = (batch_id or "").strip()
    aid = (affiliate_id or "").strip()
    if not bid or not aid or not earning_ids:
        return "invalid_args"
    now_ts = now.replace("Z", "+00:00") if now.endswith("Z") else now
    with _ledger_tx() as conn:
        cur = conn.execute(
            "SELECT status, affiliate_id FROM affiliate_payout_batches WHERE id = %s FOR UPDATE",
            (bid,),
        )
        brow = cur.fetchone()
        if not brow:
            return "batch_not_found"
        if str(brow["status"] or "") != "exported":
            return "batch_not_exported"
        if str(brow["affiliate_id"] or "") != aid:
            return "affiliate_mismatch"
        for eid in earning_ids:
            u = conn.execute(
                """
                UPDATE affiliate_earnings
                SET status = 'paid', paid_at = %s::timestamptz, payout_batch_id = %s
                WHERE id = %s AND status = 'payable' AND payout_batch_id = %s
                """,
                (now_ts, bid, eid, bid),
            )
            if int(u.rowcount or 0) != 1:
                return "earning_not_payable_or_already_paid"
        conn.execute(
            """
            INSERT INTO affiliate_payouts (
              id, affiliate_id, wallet_address, amount_usd, tx_hash, status, created_at, paid_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s::timestamptz, %s::timestamptz)
            """,
            (
                payout_id,
                aid,
                wallet_address,
                str(Decimal(str(amount_usd)).quantize(Decimal("0.000001"))),
                tx_hash,
                "completed",
                now_ts,
                now_ts,
            ),
        )
        conn.execute(
            "UPDATE affiliate_payout_batch_items SET payout_status = %s WHERE batch_id = %s",
            ("paid", bid),
        )
        curb = conn.execute(
            """
            UPDATE affiliate_payout_batches
            SET status = 'paid', paid_at = %s::timestamptz, payout_record_id = %s,
                safe_tx_hash = %s, paid_network = %s
            WHERE id = %s AND status = 'exported'
            """,
            (now_ts, payout_id, tx_hash, paid_network, bid),
        )
        if int(curb.rowcount or 0) != 1:
            return "batch_status_race"
    return None


def create_draft_payout_batch_atomic(
    *,
    batch_id: str,
    affiliate_id: str,
    now: str,
    total_usd: float,
    total_usdc: str,
    notes: Optional[str],
    item_rows: List[Tuple[Dict[str, Any], str, str]],
) -> None:
    """Each tuple: (earning_row dict, wallet_norm, amount_usdc_s6)."""
    now_ts = now.replace("Z", "+00:00") if now.endswith("Z") else now
    with _ledger_tx() as conn:
        conn.execute(
            """
            INSERT INTO affiliate_payout_batches (
              id, affiliate_id, created_at, status, total_usd, total_usdc, notes
            ) VALUES (%s, %s, %s::timestamptz, 'draft', %s, %s, %s)
            """,
            (
                batch_id,
                affiliate_id,
                now_ts,
                str(Decimal(str(total_usd)).quantize(Decimal("0.000001"))),
                total_usdc,
                notes,
            ),
        )
        for er, wallet_norm, s6 in item_rows:
            eid = str(er["id"])
            cur = conn.execute(
                """
                UPDATE affiliate_earnings
                SET payout_batch_id = %s
                WHERE id = %s AND status = 'payable'
                  AND (payout_batch_id IS NULL OR TRIM(payout_batch_id) = '')
                """,
                (batch_id, eid),
            )
            if int(cur.rowcount or 0) != 1:
                raise RuntimeError(f"reserve_failed:{eid}")
            conn.execute(
                """
                INSERT INTO affiliate_payout_batch_items (
                  id, batch_id, earning_id, accrual_id, affiliate_id, amount_usd,
                  wallet_address, amount_usdc, payout_status, created_at
                ) VALUES (%s, %s, %s, NULL, %s, %s, %s, %s, 'reserved', %s::timestamptz)
                """,
                (
                    str(uuid.uuid4()),
                    batch_id,
                    eid,
                    affiliate_id,
                    str(Decimal(str(er["amount_usd"])).quantize(Decimal("0.000001"))),
                    wallet_norm,
                    s6,
                    now_ts,
                ),
            )


def affiliate_earnings_usd_summary(affiliate_id: str) -> Dict[str, float]:
    aid = (affiliate_id or "").strip()
    out = {"pending_usd": 0.0, "payable_usd": 0.0, "paid_usd": 0.0}
    if not aid:
        return out
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            SELECT status, COALESCE(SUM(amount_usd), 0) AS s
            FROM affiliate_earnings
            WHERE affiliate_id = %s
            GROUP BY status
            """,
            (aid,),
        )
        rows = cur.fetchall()
    for r in rows:
        st = str(r["status"] or "")
        amt = _money(r["s"])
        if st == "pending":
            out["pending_usd"] += amt
        elif st == "payable":
            out["payable_usd"] += amt
        elif st == "paid":
            out["paid_usd"] += amt
    return out


def affiliate_earnings_total_credited_usd(affiliate_id: str) -> float:
    aid = (affiliate_id or "").strip()
    if not aid:
        return 0.0
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            SELECT COALESCE(SUM(amount_usd), 0) AS s
            FROM affiliate_earnings
            WHERE affiliate_id = %s AND status NOT IN ('cancelled')
            """,
            (aid,),
        )
        row = cur.fetchone()
    return _money(row["s"]) if row else 0.0


def list_affiliate_earnings_timeline(affiliate_id: str, *, limit: int) -> List[Dict[str, Any]]:
    aid = (affiliate_id or "").strip()
    if not aid:
        return []
    lim = max(1, min(80, int(limit)))
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            SELECT
              e.id,
              e.amount_usd,
              e.status,
              e.earning_type,
              e.created_at,
              e.unlock_at,
              e.paid_at,
              e.risk_hold,
              COALESCE(
                (
                  SELECT ap.tx_hash
                  FROM affiliate_payout_batches pb
                  INNER JOIN affiliate_payouts ap ON ap.id = pb.payout_record_id
                  WHERE pb.id = e.payout_batch_id
                  LIMIT 1
                ),
                (
                  SELECT ap.tx_hash
                  FROM affiliate_payouts ap
                  WHERE ap.id = e.payout_batch_id
                  LIMIT 1
                )
              ) AS payout_tx_hash
            FROM affiliate_earnings e
            WHERE e.affiliate_id = %s AND e.status NOT IN ('cancelled')
            ORDER BY e.created_at DESC
            LIMIT %s
            """,
            (aid, lim),
        )
        rows = cur.fetchall()
    return [_row_dict(r) for r in rows]


def get_latest_completed_affiliate_payout(affiliate_id: str) -> Optional[Dict[str, Any]]:
    aid = (affiliate_id or "").strip()
    if not aid:
        return None
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            SELECT id, affiliate_id, wallet_address, amount_usd, tx_hash, status, created_at, paid_at
            FROM affiliate_payouts
            WHERE affiliate_id = %s AND status = 'completed'
            ORDER BY COALESCE(paid_at, created_at) DESC
            LIMIT 1
            """,
            (aid,),
        )
        row = cur.fetchone()
    return _row_dict(row) if row else None


def list_recent_affiliate_earnings(affiliate_id: str, *, limit: int) -> List[Dict[str, Any]]:
    aid = (affiliate_id or "").strip()
    if not aid:
        return []
    lim = max(1, min(50, int(limit)))
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            SELECT id, amount_usd, status, earning_type, created_at, unlock_at, paid_at,
                   referred_org_id, cancellation_reason
            FROM affiliate_earnings
            WHERE affiliate_id = %s
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (aid, lim),
        )
        rows = cur.fetchall()
    return [_row_dict(r) for r in rows]


def get_affiliate_payout_method_row(affiliate_id: str, method_type: str) -> Optional[Dict[str, Any]]:
    aid = (affiliate_id or "").strip()
    mt = (method_type or "").strip()
    if not aid or not mt:
        return None
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            SELECT * FROM affiliate_payout_methods
            WHERE affiliate_id = %s AND method_type = %s
            LIMIT 1
            """,
            (aid, mt),
        )
        row = cur.fetchone()
    return _row_dict(row) if row else None


def seed_usdc_wallet_at_affiliate_creation(
    affiliate_id: str, wallet_norm: str, wallet_updated_at_iso: str, now: str
) -> None:
    from backend.affiliates.evm_wallet import validate_evm_wallet_address

    aid = (affiliate_id or "").strip()
    if not aid:
        return
    addr = validate_evm_wallet_address(wallet_norm)
    wu = (wallet_updated_at_iso or "").strip() or now
    wu_ts = wu.replace("Z", "+00:00") if wu.endswith("Z") else wu
    now_ts = now.replace("Z", "+00:00") if now.endswith("Z") else now
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            SELECT id, COALESCE(usdc_wallet_address, '') AS a
            FROM affiliate_payout_methods
            WHERE affiliate_id = %s AND method_type = 'usdc_wallet'
            LIMIT 1
            """,
            (aid,),
        )
        row = cur.fetchone()
        if row:
            rid = str(row["id"])
            if str(row["a"] or "").strip():
                return
            conn.execute(
                """
                UPDATE affiliate_payout_methods
                SET usdc_wallet_address = %s, status = 'active', wallet_updated_at = %s::timestamptz
                WHERE id = %s
                """,
                (addr, wu_ts, rid),
            )
            return
        conn.execute(
            """
            INSERT INTO affiliate_payout_methods (
              id, affiliate_id, method_type, usdc_wallet_address, status, created_at, wallet_updated_at
            ) VALUES (%s, %s, 'usdc_wallet', %s, 'active', %s::timestamptz, %s::timestamptz)
            """,
            (str(uuid.uuid4()), aid, addr, now_ts, wu_ts),
        )


def sync_canonical_usdc_payout_wallet_import_legacy(
    affiliate_id: str,
    legacy_norm: str,
    created_anchor_iso: str,
    now: str,
) -> None:
    """Insert or update usdc_wallet row from legacy affiliates.wallet_address."""
    aid = (affiliate_id or "").strip()
    if not aid:
        return
    ca = (created_anchor_iso or "").strip() or now
    ca_ts = ca.replace("Z", "+00:00") if ca.endswith("Z") else ca
    now_ts = now.replace("Z", "+00:00") if now.endswith("Z") else now
    with _ledger_tx() as conn:
        hit = conn.execute(
            """
            SELECT id FROM affiliate_payout_methods
            WHERE affiliate_id = %s AND method_type = 'usdc_wallet'
            LIMIT 1
            """,
            (aid,),
        ).fetchone()
        if hit:
            conn.execute(
                """
                UPDATE affiliate_payout_methods
                SET usdc_wallet_address = %s, status = 'active', wallet_updated_at = %s::timestamptz
                WHERE affiliate_id = %s AND method_type = 'usdc_wallet'
                """,
                (legacy_norm, ca_ts, aid),
            )
        else:
            conn.execute(
                """
                INSERT INTO affiliate_payout_methods (
                  id, affiliate_id, method_type, usdc_wallet_address, status, created_at, wallet_updated_at
                ) VALUES (%s, %s, 'usdc_wallet', %s, 'active', %s::timestamptz, %s::timestamptz)
                """,
                (str(uuid.uuid4()), aid, legacy_norm, now_ts, ca_ts),
            )


def set_payout_method_active_if_present(affiliate_id: str) -> None:
    aid = (affiliate_id or "").strip()
    if not aid:
        return
    with _ledger_tx() as conn:
        conn.execute(
            """
            UPDATE affiliate_payout_methods SET status = 'active'
            WHERE affiliate_id = %s AND method_type = 'usdc_wallet'
            """,
            (aid,),
        )


def upsert_affiliate_payout_method(
    *,
    affiliate_id: str,
    method_type: str,
    usdc_wallet_address: Optional[str],
    status: str,
    now: str,
) -> str:
    from backend.affiliates.evm_wallet import validate_evm_wallet_address

    rid = str(uuid.uuid4())
    aid = (affiliate_id or "").strip()
    mt = (method_type or "").strip() or "none"
    st = (status or "").strip() or "active"
    now_ts = now.replace("Z", "+00:00") if now.endswith("Z") else now
    addr: Optional[str] = None
    if usdc_wallet_address is not None and str(usdc_wallet_address).strip():
        addr = validate_evm_wallet_address(usdc_wallet_address)
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            SELECT id, usdc_wallet_address FROM affiliate_payout_methods
            WHERE affiliate_id = %s AND method_type = %s
            """,
            (aid, mt),
        )
        row = cur.fetchone()
        old_addr = (str(row["usdc_wallet_address"]).strip().lower() if row and row["usdc_wallet_address"] else "") or None
        new_key = (addr or "").strip().lower() if addr else None
        wallet_changed = old_addr != new_key
        wu_val: Optional[str] = now_ts if wallet_changed and addr else None
        if row:
            rid = str(row["id"])
            if wallet_changed:
                conn.execute(
                    """
                    UPDATE affiliate_payout_methods
                    SET usdc_wallet_address = %s, status = %s, wallet_updated_at = %s
                    WHERE id = %s
                    """,
                    (addr, st, wu_val, rid),
                )
            else:
                conn.execute(
                    """
                    UPDATE affiliate_payout_methods
                    SET usdc_wallet_address = %s, status = %s
                    WHERE id = %s
                    """,
                    (addr, st, rid),
                )
        else:
            conn.execute(
                """
                INSERT INTO affiliate_payout_methods (
                  id, affiliate_id, method_type, usdc_wallet_address, status, created_at, wallet_updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s::timestamptz, %s)
                """,
                (
                    rid,
                    aid,
                    mt,
                    addr,
                    st,
                    now_ts,
                    now_ts if addr else None,
                ),
            )
    return rid


def insert_payout(
    *,
    payout_id: str,
    affiliate_id: str,
    wallet_address: str,
    amount_usd: float,
    status: str,
    tx_hash: Optional[str],
    now: str,
) -> None:
    now_ts = now.replace("Z", "+00:00") if now.endswith("Z") else now
    paid_ts = now_ts if tx_hash else None
    with _ledger_tx() as conn:
        conn.execute(
            """
            INSERT INTO affiliate_payouts (
              id, affiliate_id, wallet_address, amount_usd, tx_hash, status, created_at, paid_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s::timestamptz, %s)
            """,
            (
                payout_id,
                affiliate_id,
                wallet_address,
                str(Decimal(str(amount_usd)).quantize(Decimal("0.000001"))),
                tx_hash,
                status,
                now_ts,
                paid_ts,
            ),
        )


def insert_payout_batch(
    *,
    batch_id: str,
    affiliate_id: str,
    status: str,
    total_usd: float,
    notes: Optional[str],
    now: str,
) -> None:
    now_ts = now.replace("Z", "+00:00") if now.endswith("Z") else now
    with _ledger_tx() as conn:
        conn.execute(
            """
            INSERT INTO affiliate_payout_batches (
              id, affiliate_id, created_at, status, total_usd, notes
            ) VALUES (%s, %s, %s::timestamptz, %s, %s, %s)
            """,
            (
                batch_id,
                affiliate_id,
                now_ts,
                status,
                str(Decimal(str(total_usd)).quantize(Decimal("0.000001"))),
                notes,
            ),
        )


def insert_payout_batch_item(
    *,
    item_id: str,
    batch_id: str,
    earning_id: Optional[str],
    accrual_id: Optional[str],
    affiliate_id: str,
    amount_usd: float,
    payout_status: str,
    wallet_address: Optional[str],
    amount_usdc: Optional[str],
    now: str,
) -> None:
    now_ts = now.replace("Z", "+00:00") if now.endswith("Z") else now
    with _ledger_tx() as conn:
        conn.execute(
            """
            INSERT INTO affiliate_payout_batch_items (
              id, batch_id, earning_id, accrual_id, affiliate_id, amount_usd,
              wallet_address, amount_usdc, payout_status, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::timestamptz)
            """,
            (
                item_id,
                batch_id,
                earning_id,
                accrual_id,
                affiliate_id,
                str(Decimal(str(amount_usd)).quantize(Decimal("0.000001"))),
                wallet_address,
                amount_usdc,
                payout_status,
                now_ts,
            ),
        )


def get_payout_batch(batch_id: str) -> Optional[Dict[str, Any]]:
    bid = (batch_id or "").strip()
    if not bid:
        return None
    with _ledger_tx() as conn:
        cur = conn.execute(
            "SELECT * FROM affiliate_payout_batches WHERE id = %s",
            (bid,),
        )
        row = cur.fetchone()
    return _row_dict(row) if row else None


def list_payout_batch_items(batch_id: str) -> List[Dict[str, Any]]:
    bid = (batch_id or "").strip()
    if not bid:
        return []
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            SELECT * FROM affiliate_payout_batch_items
            WHERE batch_id = %s ORDER BY created_at
            """,
            (bid,),
        )
        rows = cur.fetchall()
    return [_row_dict(r) for r in rows]


def update_payout_batch_fields(
    batch_id: str,
    *,
    status: Optional[str] = None,
    exported_at: Optional[str] = None,
    paid_at: Optional[str] = None,
    payout_record_id: Optional[str] = None,
    notes: Optional[str] = None,
    safe_tx_hash: Optional[str] = None,
    paid_network: Optional[str] = None,
    total_usdc: Optional[str] = None,
    last_stale_export_alert_at: Optional[str] = None,
) -> None:
    bid = (batch_id or "").strip()
    if not bid:
        return
    sets: List[str] = []
    vals: List[Any] = []
    if status is not None:
        sets.append("status = %s")
        vals.append(status)
    if exported_at is not None:
        sets.append("exported_at = %s")
        vals.append(
            exported_at.replace("Z", "+00:00") if exported_at.endswith("Z") else exported_at
        )
    if paid_at is not None:
        sets.append("paid_at = %s")
        vals.append(paid_at.replace("Z", "+00:00") if paid_at.endswith("Z") else paid_at)
    if payout_record_id is not None:
        sets.append("payout_record_id = %s")
        vals.append(payout_record_id)
    if notes is not None:
        sets.append("notes = %s")
        vals.append(notes)
    if safe_tx_hash is not None:
        sets.append("safe_tx_hash = %s")
        vals.append(safe_tx_hash)
    if paid_network is not None:
        sets.append("paid_network = %s")
        vals.append(paid_network)
    if total_usdc is not None:
        sets.append("total_usdc = %s")
        vals.append(total_usdc)
    if last_stale_export_alert_at is not None:
        sets.append("last_stale_export_alert_at = %s")
        vals.append(
            last_stale_export_alert_at.replace("Z", "+00:00")
            if last_stale_export_alert_at.endswith("Z")
            else last_stale_export_alert_at
        )
    if not sets:
        return
    vals.append(bid)
    with _ledger_tx() as conn:
        conn.execute(
            f"UPDATE affiliate_payout_batches SET {', '.join(sets)} WHERE id = %s",
            vals,
        )


def clear_affiliate_earnings_batch_reservation(batch_id: str) -> int:
    bid = (batch_id or "").strip()
    if not bid:
        return 0
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            UPDATE affiliate_earnings
            SET payout_batch_id = NULL
            WHERE payout_batch_id = %s AND status = 'payable'
            """,
            (bid,),
        )
        return int(cur.rowcount or 0)


def update_batch_items_payout_status(batch_id: str, payout_status: str) -> None:
    bid = (batch_id or "").strip()
    if not bid:
        return
    with _ledger_tx() as conn:
        conn.execute(
            "UPDATE affiliate_payout_batch_items SET payout_status = %s WHERE batch_id = %s",
            (payout_status, bid),
        )


def affiliate_has_completed_payout(affiliate_id: str) -> bool:
    aid = (affiliate_id or "").strip()
    if not aid:
        return False
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            SELECT 1 FROM affiliate_payouts
            WHERE affiliate_id = %s AND status = 'completed' LIMIT 1
            """,
            (aid,),
        )
        return cur.fetchone() is not None


def cancel_affiliate_earnings_for_charge(
    charge_id: str, *, reason: str, now: str, touch_paid_as_recovery: bool
) -> Dict[str, int]:
    cid = (charge_id or "").strip()
    if not cid:
        return {"cancelled": 0, "recovery": 0}
    now_ts = now.replace("Z", "+00:00") if now.endswith("Z") else now
    reason = (reason or "").strip() or "refunded"
    cancelled = 0
    recovery = 0
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            UPDATE affiliate_earnings
            SET status = 'cancelled', cancelled_at = %s, cancellation_reason = %s,
                payout_batch_id = NULL
            WHERE charge_id = %s AND status IN ('pending', 'payable')
            """,
            (now_ts, reason, cid),
        )
        cancelled = int(cur.rowcount or 0)
        if touch_paid_as_recovery:
            cur2 = conn.execute(
                """
                UPDATE affiliate_earnings
                SET status = 'recovery_due', cancelled_at = %s, cancellation_reason = %s
                WHERE charge_id = %s AND status = 'paid'
                """,
                (now_ts, reason, cid),
            )
            recovery = int(cur2.rowcount or 0)
    return {"cancelled": cancelled, "recovery": recovery}


def cancel_affiliate_earnings_for_invoice(invoice_id: str, *, reason: str, now: str) -> int:
    iid = (invoice_id or "").strip()
    if not iid:
        return 0
    now_ts = now.replace("Z", "+00:00") if now.endswith("Z") else now
    reason = (reason or "").strip() or "refunded"
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            UPDATE affiliate_earnings
            SET status = 'cancelled', cancelled_at = %s, cancellation_reason = %s,
                payout_batch_id = NULL
            WHERE invoice_id = %s AND status IN ('pending', 'payable')
            """,
            (now_ts, reason, iid),
        )
        return int(cur.rowcount or 0)


def cancel_affiliate_earnings_by_internal_payment(
    payment_id: str, *, reason: str, now: str
) -> None:
    now_ts = now.replace("Z", "+00:00") if now.endswith("Z") else now
    with _ledger_tx() as conn:
        conn.execute(
            """
            UPDATE affiliate_earnings
            SET status = 'cancelled', cancelled_at = %s, cancellation_reason = %s,
                payout_batch_id = NULL
            WHERE internal_payment_id = %s AND status IN ('pending', 'payable')
            """,
            (now_ts, (reason or "refunded")[:80], payment_id),
        )


def list_affiliate_payout_batches(*, limit: int) -> List[Dict[str, Any]]:
    lim = max(1, min(int(limit), 200))
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            SELECT * FROM affiliate_payout_batches
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (lim,),
        )
        rows = cur.fetchall()
    return [_row_dict(r) for r in rows]


def affiliate_earnings_quality_aggregate(affiliate_id: str) -> Dict[str, int]:
    aid = (affiliate_id or "").strip()
    out = {"n_all": 0, "n_cancelled": 0, "n_recovery": 0, "n_refundish": 0}
    if not aid:
        return out
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            SELECT
              COUNT(*) AS n_all,
              SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS n_cancelled,
              SUM(CASE WHEN status = 'recovery_due' THEN 1 ELSE 0 END) AS n_recovery,
              SUM(
                CASE
                  WHEN status = 'cancelled'
                    AND (
                      LOWER(COALESCE(cancellation_reason, '')) LIKE '%%refund%%'
                      OR LOWER(COALESCE(cancellation_reason, '')) LIKE '%%void%%'
                    )
                  THEN 1 ELSE 0
                END
              ) AS n_refundish
            FROM affiliate_earnings
            WHERE affiliate_id = %s
            """,
            (aid,),
        )
        row = cur.fetchone()
    if row:
        out["n_all"] = int(row["n_all"] or 0)
        out["n_cancelled"] = int(row["n_cancelled"] or 0)
        out["n_recovery"] = int(row["n_recovery"] or 0)
        out["n_refundish"] = int(row["n_refundish"] or 0)
    return out


def earning_org_ids_for_affiliate(affiliate_id: str) -> List[str]:
    aid = (affiliate_id or "").strip()
    if not aid:
        return []
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            SELECT DISTINCT referred_org_id FROM affiliate_earnings
            WHERE affiliate_id = %s AND status NOT IN ('cancelled')
            """,
            (aid,),
        )
        return [str(r[0]) for r in cur.fetchall() if r[0]]


def insert_trust_ledger_event(
    *,
    event_id: str,
    created_at: str,
    affiliate_id: str,
    referral_code: str,
    event_type: str,
    customer_ref_hash: Optional[str],
    agreement_id: Optional[str],
    gross_revenue_usd: Optional[float],
    commission_amount_usd: float,
    status: str,
    payout_batch_id: Optional[str],
    proof_id: Optional[str],
    idempotency_key: Optional[str],
    meta_json: Optional[Dict[str, Any]],
) -> bool:
    """Returns True if a new row was inserted."""
    from psycopg.types.json import Json

    meta_val: Any = Json(meta_json) if meta_json is not None else None
    created_ts = created_at.replace("Z", "+00:00") if created_at.endswith("Z") else created_at
    with _ledger_tx() as conn:
        if idempotency_key:
            cur = conn.execute(
                """
                INSERT INTO affiliate_ledger_events (
                  id, created_at, affiliate_id, referral_code, event_type,
                  customer_ref_hash, agreement_id, gross_revenue_usd, commission_amount_usd,
                  status, payout_batch_id, proof_id, idempotency_key, meta_json
                ) VALUES (
                  %s, %s::timestamptz, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                ON CONFLICT (idempotency_key) DO NOTHING
                RETURNING id
                """,
                (
                    event_id,
                    created_ts,
                    affiliate_id,
                    referral_code,
                    event_type,
                    customer_ref_hash,
                    agreement_id,
                    gross_revenue_usd,
                    commission_amount_usd,
                    status,
                    payout_batch_id,
                    proof_id,
                    idempotency_key,
                    meta_val,
                ),
            )
            row = cur.fetchone()
            return row is not None
        cur = conn.execute(
            """
            INSERT INTO affiliate_ledger_events (
              id, created_at, affiliate_id, referral_code, event_type,
              customer_ref_hash, agreement_id, gross_revenue_usd, commission_amount_usd,
              status, payout_batch_id, proof_id, idempotency_key, meta_json
            ) VALUES (
              %s, %s::timestamptz, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            RETURNING id
            """,
            (
                event_id,
                created_ts,
                affiliate_id,
                referral_code,
                event_type,
                customer_ref_hash,
                agreement_id,
                gross_revenue_usd,
                commission_amount_usd,
                status,
                payout_batch_id,
                proof_id,
                None,
                meta_val,
            ),
        )
        return cur.fetchone() is not None


def list_trust_ledger_events_for_affiliate(affiliate_id: str, *, limit: int = 40) -> List[Dict[str, Any]]:
    lim = max(1, min(int(limit), 200))
    aid = (affiliate_id or "").strip()
    if not aid:
        return []
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            SELECT id, created_at, affiliate_id, referral_code, event_type,
                   customer_ref_hash, agreement_id, gross_revenue_usd, commission_amount_usd,
                   status, payout_batch_id, proof_id, idempotency_key, meta_json
            FROM affiliate_ledger_events
            WHERE affiliate_id = %s
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (aid, lim),
        )
        rows = cur.fetchall()
    out: List[Dict[str, Any]] = []
    for r in rows:
        d = _row_dict(r)
        if d.get("meta_json") and isinstance(d["meta_json"], str):
            try:
                d["meta_json"] = json.loads(d["meta_json"])
            except Exception:
                pass
        out.append(d)
    return out


def count_trust_ledger_events(affiliate_id: str, event_type: str) -> int:
    aid = (affiliate_id or "").strip()
    et = (event_type or "").strip()
    if not aid or not et:
        return 0
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            SELECT COUNT(*)::bigint AS c FROM affiliate_ledger_events
            WHERE affiliate_id = %s AND event_type = %s
            """,
            (aid, et),
        )
        row = cur.fetchone()
        return int(row["c"] or 0) if row else 0


def sum_trust_commission_earned_since(affiliate_id: str, since_iso: str) -> float:
    aid = (affiliate_id or "").strip()
    if not aid:
        return 0.0
    since_ts = since_iso.replace("Z", "+00:00") if since_iso.endswith("Z") else since_iso
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            SELECT COALESCE(SUM(commission_amount_usd), 0)::float AS s
            FROM affiliate_ledger_events
            WHERE affiliate_id = %s
              AND event_type = 'commission_earned'
              AND created_at >= %s::timestamptz
            """,
            (aid, since_ts),
        )
        row = cur.fetchone()
        return float(row["s"] or 0) if row else 0.0


def list_affiliate_earnings_rows_for_charge(charge_id: str) -> List[Dict[str, Any]]:
    cid = (charge_id or "").strip()
    if not cid:
        return []
    with _ledger_tx() as conn:
        cur = conn.execute(
            """
            SELECT id, affiliate_id, amount_usd, referred_org_id, invoice_id, charge_id, status, cancelled_at
            FROM affiliate_earnings
            WHERE charge_id = %s AND status = 'cancelled'
            ORDER BY cancelled_at DESC NULLS LAST, created_at DESC
            LIMIT 20
            """,
            (cid,),
        )
        return [_row_dict(r) for r in cur.fetchall()]
