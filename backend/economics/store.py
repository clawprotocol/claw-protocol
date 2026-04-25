"""SQLite: subscriptions, usage_events, key_balances, affiliates, accruals, payouts."""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.config.runtime_environment import data_dir


def economics_db_path() -> str:
    env = os.getenv("CLAW_ECONOMICS_DB_PATH", "").strip()
    if env:
        return os.path.expanduser(env)
    return os.path.join(data_dir(), "economics.sqlite3")


def _affiliate_ledger_pg() -> bool:
    from backend.db.config import use_postgresql_for_affiliate_ledger

    return use_postgresql_for_affiliate_ledger()


def _operator_alerts_pg() -> bool:
    from backend.db.config import use_postgresql_for_operator_alerts

    return use_postgresql_for_operator_alerts()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class EconomicsStore:
    def __init__(self, path: Optional[str] = None) -> None:
        self._path = path or economics_db_path()
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
                CREATE TABLE IF NOT EXISTS subscriptions (
                  id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL,
                  user_id TEXT,
                  plan_code TEXT NOT NULL,
                  status TEXT NOT NULL,
                  started_at TEXT NOT NULL,
                  renewed_at TEXT,
                  expires_at TEXT,
                  canceled_at TEXT,
                  payment_id TEXT,
                  created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_sub_org ON subscriptions (org_id);

                CREATE TABLE IF NOT EXISTS usage_events (
                  id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL,
                  user_id TEXT,
                  service_type TEXT NOT NULL,
                  unit_count REAL NOT NULL,
                  key_cost INTEGER NOT NULL,
                  reference_id TEXT,
                  created_at TEXT NOT NULL,
                  keys_balance_before INTEGER,
                  keys_balance_after INTEGER
                );
                CREATE INDEX IF NOT EXISTS idx_usage_org ON usage_events (org_id);

                CREATE TABLE IF NOT EXISTS key_balances (
                  org_id TEXT PRIMARY KEY,
                  keys_available INTEGER NOT NULL,
                  keys_reserved INTEGER NOT NULL DEFAULT 0,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS affiliates (
                  id TEXT PRIMARY KEY,
                  affiliate_code TEXT UNIQUE NOT NULL,
                  display_name TEXT,
                  wallet_address TEXT NOT NULL,
                  status TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS affiliate_attributions (
                  id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL,
                  user_id TEXT,
                  affiliate_id TEXT NOT NULL,
                  attribution_type TEXT NOT NULL,
                  attributed_at TEXT NOT NULL,
                  expires_at TEXT
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_attr_org_active
                  ON affiliate_attributions (org_id)
                  WHERE expires_at IS NULL;

                CREATE TABLE IF NOT EXISTS affiliate_accruals (
                  id TEXT PRIMARY KEY,
                  affiliate_id TEXT NOT NULL,
                  org_id TEXT NOT NULL,
                  payment_id TEXT NOT NULL,
                  basis_amount_usd REAL NOT NULL,
                  payout_amount_usd REAL NOT NULL,
                  status TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  matured_at TEXT
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_accrual_aff_pay
                  ON affiliate_accruals (affiliate_id, payment_id);

                CREATE TABLE IF NOT EXISTS economics_payment_hook (
                  payment_id TEXT PRIMARY KEY,
                  keys_credited INTEGER NOT NULL DEFAULT 0,
                  subscription_emitted INTEGER NOT NULL DEFAULT 0,
                  accrual_emitted INTEGER NOT NULL DEFAULT 0,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS key_ledger (
                  id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL,
                  payment_id TEXT NOT NULL,
                  keys_original INTEGER NOT NULL,
                  keys_remaining INTEGER NOT NULL,
                  amount_usd REAL NOT NULL,
                  created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_key_ledger_org_fifo
                  ON key_ledger (org_id, created_at);

                CREATE TABLE IF NOT EXISTS usage_payment_allocation (
                  id TEXT PRIMARY KEY,
                  usage_event_id TEXT NOT NULL,
                  payment_id TEXT NOT NULL,
                  keys_allocated INTEGER NOT NULL,
                  amount_usd REAL NOT NULL,
                  created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_upa_usage ON usage_payment_allocation (usage_event_id);

                CREATE TABLE IF NOT EXISTS usage_receipts (
                  usage_event_id TEXT PRIMARY KEY,
                  receipt_hash_sha256 TEXT NOT NULL,
                  canonical_json TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );
                """
            )
            cols = [
                r[1]
                for r in con.execute("PRAGMA table_info(affiliates)").fetchall()
            ]
            if "owner_org_id" not in cols:
                con.execute("ALTER TABLE affiliates ADD COLUMN owner_org_id TEXT")
            ucols = [r[1] for r in con.execute("PRAGMA table_info(usage_events)").fetchall()]
            if "keys_balance_before" not in ucols:
                con.execute(
                    "ALTER TABLE usage_events ADD COLUMN keys_balance_before INTEGER"
                )
            if "keys_balance_after" not in ucols:
                con.execute(
                    "ALTER TABLE usage_events ADD COLUMN keys_balance_after INTEGER"
                )
            con.executescript(
                """
                CREATE TABLE IF NOT EXISTS affiliate_gamification_profiles (
                  affiliate_id TEXT PRIMARY KEY,
                  avatar_url TEXT,
                  avatar_asset_ref TEXT,
                  tagline TEXT,
                  leaderboard_visible INTEGER NOT NULL DEFAULT 1,
                  badges_json TEXT NOT NULL DEFAULT '[]',
                  streak_days INTEGER NOT NULL DEFAULT 0,
                  last_leaderboard_rank INTEGER,
                  rank_recorded_at TEXT,
                  updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS affiliate_influence_counters (
                  affiliate_id TEXT PRIMARY KEY,
                  agreements_sent_influenced INTEGER NOT NULL DEFAULT 0,
                  updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS affiliate_gamification_daily (
                  affiliate_id TEXT NOT NULL,
                  day_utc TEXT NOT NULL,
                  qualified_signup INTEGER NOT NULL DEFAULT 0,
                  activation INTEGER NOT NULL DEFAULT 0,
                  conversion INTEGER NOT NULL DEFAULT 0,
                  agreement_send INTEGER NOT NULL DEFAULT 0,
                  PRIMARY KEY (affiliate_id, day_utc)
                );
                CREATE INDEX IF NOT EXISTS idx_aff_gam_daily_aff ON affiliate_gamification_daily (affiliate_id, day_utc DESC);

                CREATE TABLE IF NOT EXISTS stripe_customer_org (
                  stripe_customer_id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_stripe_cust_org ON stripe_customer_org (org_id);

                CREATE TABLE IF NOT EXISTS stripe_subscription_org (
                  stripe_subscription_id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL,
                  plan_code TEXT,
                  status TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_stripe_sub_org ON stripe_subscription_org (org_id);

                CREATE TABLE IF NOT EXISTS stripe_webhook_events (
                  id TEXT PRIMARY KEY,
                  received_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS affiliate_access_requests (
                  id TEXT PRIMARY KEY,
                  org_id TEXT,
                  email TEXT,
                  request_type TEXT NOT NULL,
                  doginal_pfp_number INTEGER,
                  dao_name TEXT,
                  x_handle TEXT,
                  note TEXT,
                  status TEXT NOT NULL DEFAULT 'pending',
                  ip_hash TEXT,
                  request_fingerprint TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  reviewed_by TEXT,
                  reviewed_at TEXT,
                  review_note TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_aff_access_org ON affiliate_access_requests (org_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_aff_access_status ON affiliate_access_requests (status, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_aff_access_req_type ON affiliate_access_requests (request_type, created_at DESC);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_aff_access_org_pending
                  ON affiliate_access_requests (org_id)
                  WHERE status = 'pending' AND org_id IS NOT NULL;
                CREATE UNIQUE INDEX IF NOT EXISTS idx_aff_access_fingerprint_pending
                  ON affiliate_access_requests (request_fingerprint)
                  WHERE status = 'pending' AND request_fingerprint IS NOT NULL;
                """
            )
            if not _affiliate_ledger_pg():
                con.executescript(
                    """
                CREATE TABLE IF NOT EXISTS affiliate_payouts (
                  id TEXT PRIMARY KEY,
                  affiliate_id TEXT NOT NULL,
                  wallet_address TEXT NOT NULL,
                  amount_usd REAL NOT NULL,
                  tx_hash TEXT,
                  status TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  paid_at TEXT
                );

                CREATE TABLE IF NOT EXISTS affiliate_earnings (
                  id TEXT PRIMARY KEY,
                  affiliate_id TEXT NOT NULL,
                  referred_org_id TEXT NOT NULL,
                  referred_user_id TEXT,
                  internal_subscription_id TEXT,
                  stripe_subscription_id TEXT,
                  invoice_id TEXT,
                  charge_id TEXT,
                  payment_intent_id TEXT,
                  internal_payment_id TEXT,
                  amount_usd REAL NOT NULL,
                  rate_bps INTEGER NOT NULL,
                  earning_type TEXT NOT NULL,
                  status TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  unlock_at TEXT,
                  paid_at TEXT,
                  cancelled_at TEXT,
                  cancellation_reason TEXT,
                  fraud_score_snapshot REAL,
                  notes TEXT,
                  idempotency_key TEXT UNIQUE,
                  payout_batch_id TEXT,
                  risk_hold INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_ae_affiliate_status ON affiliate_earnings (affiliate_id, status);
                CREATE INDEX IF NOT EXISTS idx_ae_charge ON affiliate_earnings (charge_id);
                CREATE INDEX IF NOT EXISTS idx_ae_invoice ON affiliate_earnings (invoice_id);
                CREATE INDEX IF NOT EXISTS idx_ae_unlock ON affiliate_earnings (status, unlock_at);

                CREATE TABLE IF NOT EXISTS affiliate_payout_methods (
                  id TEXT PRIMARY KEY,
                  affiliate_id TEXT NOT NULL,
                  method_type TEXT NOT NULL,
                  usdc_wallet_address TEXT,
                  status TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  UNIQUE(affiliate_id, method_type)
                );
                CREATE INDEX IF NOT EXISTS idx_apm_aff ON affiliate_payout_methods (affiliate_id);

                CREATE TABLE IF NOT EXISTS affiliate_payout_batches (
                  id TEXT PRIMARY KEY,
                  affiliate_id TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  status TEXT NOT NULL,
                  total_usd REAL NOT NULL,
                  total_usdc TEXT,
                  notes TEXT,
                  exported_at TEXT,
                  paid_at TEXT,
                  payout_record_id TEXT,
                  safe_tx_hash TEXT,
                  paid_network TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_apb_aff_status ON affiliate_payout_batches (affiliate_id, status);

                CREATE TABLE IF NOT EXISTS affiliate_payout_batch_items (
                  id TEXT PRIMARY KEY,
                  batch_id TEXT NOT NULL,
                  earning_id TEXT,
                  accrual_id TEXT,
                  affiliate_id TEXT NOT NULL,
                  amount_usd REAL NOT NULL,
                  wallet_address TEXT,
                  amount_usdc TEXT,
                  payout_status TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_apbi_batch ON affiliate_payout_batch_items (batch_id);

                CREATE TABLE IF NOT EXISTS affiliate_ledger_events (
                  id TEXT PRIMARY KEY,
                  created_at TEXT NOT NULL,
                  affiliate_id TEXT NOT NULL,
                  referral_code TEXT NOT NULL,
                  event_type TEXT NOT NULL,
                  customer_ref_hash TEXT,
                  agreement_id TEXT,
                  gross_revenue_usd REAL,
                  commission_amount_usd REAL NOT NULL,
                  status TEXT NOT NULL DEFAULT 'posted',
                  payout_batch_id TEXT,
                  proof_id TEXT,
                  idempotency_key TEXT UNIQUE,
                  meta_json TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_ale_aff_time ON affiliate_ledger_events (affiliate_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_ale_aff_type ON affiliate_ledger_events (affiliate_id, event_type);
                """
                )
            acols_att = [
                r[1] for r in con.execute("PRAGMA table_info(affiliate_attributions)").fetchall()
            ]
            for col_sql in (
                "momentum_credit_state TEXT NOT NULL DEFAULT 'pending'",
                "signup_ip_hash TEXT",
                "device_fingerprint_hash TEXT",
                "signup_email_domain TEXT",
                "internal_risk_flags_json TEXT NOT NULL DEFAULT '[]'",
                "attribution_source TEXT",
                "attribution_row_status TEXT NOT NULL DEFAULT 'active'",
            ):
                cname = col_sql.split()[0]
                if cname not in acols_att:
                    con.execute(
                        f"ALTER TABLE affiliate_attributions ADD COLUMN {col_sql}"
                    )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_attr_aff_time "
                "ON affiliate_attributions (affiliate_id, attributed_at)"
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_attr_ip_aff "
                "ON affiliate_attributions (affiliate_id, signup_ip_hash)"
            )
            gcols = [
                r[1]
                for r in con.execute(
                    "PRAGMA table_info(affiliate_gamification_profiles)"
                ).fetchall()
            ]
            for col_sql in (
                "progression_tier TEXT",
                "best_streak_days INTEGER NOT NULL DEFAULT 0",
                "streak_last_meaningful_day_utc TEXT",
                "badge_unlocks_json TEXT",
                "weekly_snapshot_json TEXT",
                "doginal_verified INTEGER NOT NULL DEFAULT 0",
                "affiliate_quality_score REAL",
                "affiliate_risk_flag INTEGER NOT NULL DEFAULT 0",
                "affiliate_quality_factors_json TEXT",
            ):
                col_name = col_sql.split()[0]
                if col_name not in gcols:
                    con.execute(
                        f"ALTER TABLE affiliate_gamification_profiles ADD COLUMN {col_sql}"
                    )
            if not _affiliate_ledger_pg():
                pb_cols = [
                    r[1]
                    for r in con.execute("PRAGMA table_info(affiliate_payout_batches)").fetchall()
                ]
                for col_sql in (
                    "total_usdc TEXT",
                    "safe_tx_hash TEXT",
                    "paid_network TEXT",
                    "last_stale_export_alert_at TEXT",
                ):
                    cname = col_sql.split()[0]
                    if cname not in pb_cols:
                        con.execute(
                            f"ALTER TABLE affiliate_payout_batches ADD COLUMN {col_sql}"
                        )
                apm_cols = [
                    r[1]
                    for r in con.execute("PRAGMA table_info(affiliate_payout_methods)").fetchall()
                ]
                if "wallet_updated_at" not in apm_cols:
                    con.execute(
                        "ALTER TABLE affiliate_payout_methods ADD COLUMN wallet_updated_at TEXT"
                    )
                pbi_cols = [
                    r[1]
                    for r in con.execute(
                        "PRAGMA table_info(affiliate_payout_batch_items)"
                    ).fetchall()
                ]
                for col_sql in ("wallet_address TEXT", "amount_usdc TEXT"):
                    cname = col_sql.split()[0]
                    if cname not in pbi_cols:
                        con.execute(
                            f"ALTER TABLE affiliate_payout_batch_items ADD COLUMN {col_sql}"
                        )
            if not _operator_alerts_pg():
                con.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS lawdog_operator_alerts (
                      id TEXT PRIMARY KEY,
                      created_at TEXT NOT NULL,
                      event_type TEXT NOT NULL,
                      severity TEXT NOT NULL,
                      payload_json TEXT NOT NULL,
                      batch_id TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_loa_created ON lawdog_operator_alerts (created_at);
                    CREATE INDEX IF NOT EXISTS idx_loa_type ON lawdog_operator_alerts (event_type);
                    """
                )
            if _affiliate_ledger_pg():
                from backend.economics.affiliate_ledger_postgres import ensure_affiliate_ledger_schema

                ensure_affiliate_ledger_schema()
            if _operator_alerts_pg():
                from backend.economics.operator_alerts_postgres import ensure_operator_alerts_schema

                ensure_operator_alerts_schema()
            self._backfill_key_ledger(con)

    def _backfill_key_ledger(self, con: sqlite3.Connection) -> None:
        rows = con.execute("SELECT org_id, keys_available FROM key_balances").fetchall()
        for r in rows:
            oid = str(r[0])
            bal = int(r[1])
            if bal <= 0:
                continue
            srow = con.execute(
                """
                SELECT COALESCE(SUM(keys_remaining), 0) FROM key_ledger WHERE org_id = ?
                """,
                (oid,),
            ).fetchone()
            summed = int(srow[0]) if srow else 0
            if bal > summed:
                need = bal - summed
                con.execute(
                    """
                    INSERT INTO key_ledger (
                      id, org_id, payment_id, keys_original, keys_remaining, amount_usd, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(uuid.uuid4()),
                        oid,
                        "__legacy_balance__",
                        need,
                        need,
                        0.0,
                        "1970-01-01T00:00:00Z",
                    ),
                )

    # --- subscriptions ---

    def insert_subscription(
        self,
        *,
        sub_id: str,
        org_id: str,
        user_id: Optional[str],
        plan_code: str,
        status: str,
        payment_id: Optional[str],
        expires_at: Optional[str],
    ) -> None:
        now = _utc_now()
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO subscriptions (
                  id, org_id, user_id, plan_code, status, started_at,
                  renewed_at, expires_at, canceled_at, payment_id, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)
                """,
                (sub_id, org_id, user_id, plan_code, status, now, expires_at, payment_id, now),
            )

    def get_subscription_by_org(self, org_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as con:
            row = con.execute(
                "SELECT * FROM subscriptions WHERE org_id = ? ORDER BY created_at DESC LIMIT 1",
                (org_id,),
            ).fetchone()
            return dict(row) if row else None

    def renew_subscription_payment(self, *, org_id: str, payment_id: str, renewed_at: str) -> None:
        with self._conn() as con:
            con.execute(
                """
                UPDATE subscriptions SET renewed_at = ?, payment_id = ?
                WHERE org_id = ? AND id = (
                  SELECT id FROM subscriptions WHERE org_id = ? ORDER BY created_at DESC LIMIT 1
                )
                """,
                (renewed_at, payment_id, org_id, org_id),
            )

    # --- key balances ---

    def get_key_balance(self, org_id: str) -> Dict[str, Any]:
        with self._conn() as con:
            row = con.execute(
                "SELECT * FROM key_balances WHERE org_id = ?", (org_id,)
            ).fetchone()
            if row:
                return dict(row)
            return {"org_id": org_id, "keys_available": 0, "keys_reserved": 0, "updated_at": _utc_now()}

    def credit_keys_tx(
        self,
        con: sqlite3.Connection,
        org_id: str,
        keys: int,
        *,
        payment_id: str = "",
        amount_usd: float = 0.0,
    ) -> None:
        if int(keys) <= 0:
            return
        now = _utc_now()
        row = con.execute(
            "SELECT keys_available, keys_reserved FROM key_balances WHERE org_id = ?",
            (org_id,),
        ).fetchone()
        if row is None:
            con.execute(
                """
                INSERT INTO key_balances (org_id, keys_available, keys_reserved, updated_at)
                VALUES (?, ?, 0, ?)
                """,
                (org_id, int(keys), now),
            )
        else:
            con.execute(
                """
                UPDATE key_balances SET keys_available = keys_available + ?, updated_at = ?
                WHERE org_id = ?
                """,
                (int(keys), now, org_id),
            )
        con.execute(
            """
            INSERT INTO key_ledger (
              id, org_id, payment_id, keys_original, keys_remaining, amount_usd, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                org_id,
                payment_id or "",
                int(keys),
                int(keys),
                float(amount_usd),
                now,
            ),
        )

    def credit_keys(self, org_id: str, keys: int) -> None:
        with self._conn() as con:
            con.execute("BEGIN IMMEDIATE")
            self.credit_keys_tx(con, org_id, keys, payment_id="", amount_usd=0.0)
            con.commit()

    def credit_keys_for_payment(
        self, org_id: str, keys: int, payment_id: str, amount_usd: float
    ) -> None:
        with self._conn() as con:
            con.execute("BEGIN IMMEDIATE")
            self.credit_keys_tx(
                con,
                org_id,
                keys,
                payment_id=payment_id,
                amount_usd=amount_usd,
            )
            con.commit()

    def _fifo_consume(
        self,
        con: sqlite3.Connection,
        org_id: str,
        need: int,
        usage_event_id: str,
    ) -> bool:
        need_left = int(need)
        rows = con.execute(
            """
            SELECT id, keys_remaining, payment_id, amount_usd FROM key_ledger
            WHERE org_id = ? AND keys_remaining > 0
            ORDER BY created_at ASC
            """,
            (org_id,),
        ).fetchall()
        now = _utc_now()
        for r in rows:
            if need_left <= 0:
                break
            rid = str(r[0])
            rem = int(r[1])
            pid = str(r[2])
            ausd = float(r[3])
            take = min(need_left, rem)
            if take <= 0:
                continue
            con.execute(
                "UPDATE key_ledger SET keys_remaining = keys_remaining - ? WHERE id = ?",
                (take, rid),
            )
            con.execute(
                """
                INSERT INTO usage_payment_allocation (
                  id, usage_event_id, payment_id, keys_allocated, amount_usd, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (str(uuid.uuid4()), usage_event_id, pid, take, ausd, now),
            )
            need_left -= take
        return need_left == 0

    def debit_keys(self, org_id: str, keys: int) -> bool:
        raise RuntimeError(
            "Direct key debit is disabled; use billing.usage_metering.meter_usage (receipt-required)"
        )

    def debit_usage_metering_tx(
        self,
        con: sqlite3.Connection,
        *,
        org_id: str,
        user_id: Optional[str],
        service_type: str,
        unit_count: float,
        key_cost: int,
        reference_id: Optional[str],
        usage_event_id: str,
    ) -> bool:
        now = _utc_now()
        row = con.execute(
            "SELECT keys_available FROM key_balances WHERE org_id = ?", (org_id,)
        ).fetchone()
        available = int(row[0]) if row else 0
        if available < int(key_cost):
            return False
        before = available
        after = before - int(key_cost)
        if not self._fifo_consume(con, org_id, int(key_cost), usage_event_id):
            return False
        cur = con.execute(
            """
            UPDATE key_balances SET keys_available = keys_available - ?, updated_at = ?
            WHERE org_id = ? AND keys_available >= ?
            """,
            (int(key_cost), now, org_id, int(key_cost)),
        )
        if cur.rowcount == 0:
            return False
        con.execute(
            """
            INSERT INTO usage_events (
              id, org_id, user_id, service_type, unit_count, key_cost, reference_id,
              created_at, keys_balance_before, keys_balance_after
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                usage_event_id,
                org_id,
                user_id,
                service_type,
                float(unit_count),
                int(key_cost),
                reference_id,
                now,
                before,
                after,
            ),
        )
        try:
            from backend.affiliates.activity_hooks import on_referred_org_usage_metered

            on_referred_org_usage_metered(org_id, now)
        except Exception:
            pass
        return True

    def get_usage_event(self, usage_event_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as con:
            row = con.execute(
                "SELECT * FROM usage_events WHERE id = ?", (usage_event_id,)
            ).fetchone()
            return dict(row) if row else None

    def list_usage_payment_allocations(
        self, usage_event_id: str
    ) -> List[Dict[str, Any]]:
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT * FROM usage_payment_allocation
                WHERE usage_event_id = ? ORDER BY payment_id ASC, id ASC
                """,
                (usage_event_id,),
            ).fetchall()
            return [dict(r) for r in rows]

    def insert_usage_receipt(
        self,
        *,
        usage_event_id: str,
        receipt_hash_sha256: str,
        canonical_json: str,
        created_at: Optional[str] = None,
        con: Optional[sqlite3.Connection] = None,
    ) -> None:
        ts = created_at or _utc_now()

        def _ins(c: sqlite3.Connection) -> None:
            c.execute(
                """
                INSERT INTO usage_receipts (
                  usage_event_id, receipt_hash_sha256, canonical_json, created_at
                ) VALUES (?, ?, ?, ?)
                """,
                (usage_event_id, receipt_hash_sha256, canonical_json, ts),
            )

        if con is not None:
            _ins(con)
        else:
            with self._conn() as c:
                _ins(c)

    def get_usage_receipt(self, usage_event_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as con:
            row = con.execute(
                "SELECT * FROM usage_receipts WHERE usage_event_id = ?",
                (usage_event_id,),
            ).fetchone()
            return dict(row) if row else None

    # --- affiliates ---

    def insert_affiliate(
        self,
        *,
        affiliate_id: str,
        code: str,
        display_name: Optional[str],
        wallet_address: str,
        owner_org_id: Optional[str],
    ) -> None:
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO affiliates (
                  id, affiliate_code, display_name, wallet_address, owner_org_id, status, created_at
                ) VALUES (?, ?, ?, ?, ?, 'active', ?)
                """,
                (affiliate_id, code, display_name, wallet_address, owner_org_id, _utc_now()),
            )

    def get_affiliate_by_code(self, code: str) -> Optional[Dict[str, Any]]:
        with self._conn() as con:
            row = con.execute(
                "SELECT * FROM affiliates WHERE affiliate_code = ?", (code,)
            ).fetchone()
            return dict(row) if row else None

    def get_affiliate(self, affiliate_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as con:
            row = con.execute("SELECT * FROM affiliates WHERE id = ?", (affiliate_id,)).fetchone()
            return dict(row) if row else None

    def insert_attribution(
        self,
        *,
        attr_id: str,
        org_id: str,
        user_id: Optional[str],
        affiliate_id: str,
        attribution_type: str,
        expires_at: Optional[str],
        signup_ip_hash: Optional[str] = None,
        device_fingerprint_hash: Optional[str] = None,
        signup_email_domain: Optional[str] = None,
        momentum_credit_state: str = "pending",
        internal_risk_flags_json: str = "[]",
        attribution_source: Optional[str] = None,
        attribution_row_status: str = "active",
    ) -> bool:
        src = (attribution_source or attribution_type or "").strip() or attribution_type
        try:
            with self._conn() as con:
                con.execute(
                    """
                    INSERT INTO affiliate_attributions (
                      id, org_id, user_id, affiliate_id, attribution_type, attributed_at, expires_at,
                      signup_ip_hash, device_fingerprint_hash, signup_email_domain,
                      momentum_credit_state, internal_risk_flags_json,
                      attribution_source, attribution_row_status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        attr_id,
                        org_id,
                        user_id,
                        affiliate_id,
                        attribution_type,
                        _utc_now(),
                        expires_at,
                        signup_ip_hash,
                        device_fingerprint_hash,
                        (signup_email_domain or "").strip().lower() or None,
                        momentum_credit_state,
                        internal_risk_flags_json,
                        src,
                        attribution_row_status,
                    ),
                )
            return True
        except sqlite3.IntegrityError:
            return False

    def update_attribution_trust(
        self,
        *,
        attr_id: str,
        momentum_credit_state: Optional[str] = None,
        internal_risk_flags_json: Optional[str] = None,
    ) -> None:
        sets: List[str] = []
        args: List[Any] = []
        if momentum_credit_state is not None:
            sets.append("momentum_credit_state = ?")
            args.append(momentum_credit_state)
        if internal_risk_flags_json is not None:
            sets.append("internal_risk_flags_json = ?")
            args.append(internal_risk_flags_json)
        if not sets:
            return
        args.append(attr_id)
        with self._conn() as con:
            con.execute(
                f"UPDATE affiliate_attributions SET {', '.join(sets)} WHERE id = ?",
                tuple(args),
            )

    def count_attributions_in_window(
        self, affiliate_id: str, *, since_iso: str
    ) -> int:
        aid = (affiliate_id or "").strip()
        if not aid:
            return 0
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COUNT(*) FROM affiliate_attributions
                WHERE affiliate_id = ? AND attributed_at >= ?
                """,
                (aid, since_iso),
            ).fetchone()
            return int(row[0]) if row else 0

    def count_attributions_with_ip(
        self,
        affiliate_id: str,
        *,
        signup_ip_hash: str,
        since_iso: str,
    ) -> int:
        if not signup_ip_hash.strip():
            return 0
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COUNT(*) FROM affiliate_attributions
                WHERE affiliate_id = ? AND signup_ip_hash = ? AND attributed_at >= ?
                """,
                (affiliate_id, signup_ip_hash, since_iso),
            ).fetchone()
            return int(row[0]) if row else 0

    def count_attributions_with_device(
        self,
        affiliate_id: str,
        *,
        device_fingerprint_hash: str,
        since_iso: str,
    ) -> int:
        if not device_fingerprint_hash.strip():
            return 0
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COUNT(*) FROM affiliate_attributions
                WHERE affiliate_id = ? AND device_fingerprint_hash = ?
                  AND attributed_at >= ?
                """,
                (affiliate_id, device_fingerprint_hash, since_iso),
            ).fetchone()
            return int(row[0]) if row else 0

    def confirm_attribution_credit_for_org(self, org_id: str) -> Optional[Dict[str, Any]]:
        """Mark active attribution confirmed when meaningful activity exists (internal only)."""
        oid = (org_id or "").strip()
        if not oid:
            return None
        now = _utc_now()
        with self._conn() as con:
            row = con.execute(
                """
                SELECT * FROM affiliate_attributions
                WHERE org_id = ? AND (expires_at IS NULL OR expires_at > ?)
                ORDER BY attributed_at DESC LIMIT 1
                """,
                (oid, now),
            ).fetchone()
            if not row:
                return None
            r = dict(row)
            state = str(r.get("momentum_credit_state") or "pending")
            aff_id = str(r.get("affiliate_id") or "")
            if state == "excluded":
                return {
                    "attr_id": r["id"],
                    "affiliate_id": aff_id,
                    "previous": state,
                    "current": state,
                    "changed": False,
                }
            if state == "confirmed":
                return {
                    "attr_id": r["id"],
                    "affiliate_id": aff_id,
                    "previous": state,
                    "current": state,
                    "changed": False,
                }
            con.execute(
                """
                UPDATE affiliate_attributions
                SET momentum_credit_state = 'confirmed'
                WHERE id = ? AND momentum_credit_state = 'pending'
                """,
                (r["id"],),
            )
            if con.total_changes:
                return {
                    "attr_id": r["id"],
                    "affiliate_id": aff_id,
                    "previous": "pending",
                    "current": "confirmed",
                    "changed": True,
                }
            return {
                "attr_id": r["id"],
                "affiliate_id": aff_id,
                "previous": state,
                "current": state,
                "changed": False,
            }

    def get_active_attribution(self, org_id: str) -> Optional[Dict[str, Any]]:
        now = _utc_now()
        with self._conn() as con:
            row = con.execute(
                """
                SELECT * FROM affiliate_attributions
                WHERE org_id = ? AND (expires_at IS NULL OR expires_at > ?)
                ORDER BY attributed_at DESC LIMIT 1
                """,
                (org_id, now),
            ).fetchone()
            return dict(row) if row else None

    def insert_accrual(
        self,
        *,
        accrual_id: str,
        affiliate_id: str,
        org_id: str,
        payment_id: str,
        basis_amount_usd: float,
        payout_amount_usd: float,
        status: str,
        matured_at: Optional[str],
    ) -> bool:
        try:
            with self._conn() as con:
                con.execute(
                    """
                    INSERT INTO affiliate_accruals (
                      id, affiliate_id, org_id, payment_id, basis_amount_usd, payout_amount_usd,
                      status, created_at, matured_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        accrual_id,
                        affiliate_id,
                        org_id,
                        payment_id,
                        float(basis_amount_usd),
                        float(payout_amount_usd),
                        status,
                        _utc_now(),
                        matured_at,
                    ),
                )
            return True
        except sqlite3.IntegrityError:
            return False

    def list_accruals_for_payment(self, payment_id: str) -> List[Dict[str, Any]]:
        with self._conn() as con:
            rows = con.execute(
                "SELECT * FROM affiliate_accruals WHERE payment_id = ?", (payment_id,)
            ).fetchall()
            return [dict(r) for r in rows]

    def list_matured_accruals(self, *, as_of: str) -> List[Dict[str, Any]]:
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT * FROM affiliate_accruals
                WHERE status = 'accrued' AND matured_at IS NOT NULL AND matured_at <= ?
                """,
                (as_of,),
            ).fetchall()
            return [dict(r) for r in rows]

    def mark_accruals_included_in_payout(self, accrual_ids: List[str]) -> None:
        with self._conn() as con:
            for aid in accrual_ids:
                con.execute(
                    "UPDATE affiliate_accruals SET status = 'paid' WHERE id = ?",
                    (aid,),
                )

    def insert_payout(
        self,
        *,
        payout_id: str,
        affiliate_id: str,
        wallet_address: str,
        amount_usd: float,
        status: str,
        tx_hash: Optional[str],
    ) -> None:
        now = _utc_now()
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            alp.insert_payout(
                payout_id=payout_id,
                affiliate_id=affiliate_id,
                wallet_address=wallet_address,
                amount_usd=float(amount_usd),
                status=status,
                tx_hash=tx_hash,
                now=now,
            )
            return
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO affiliate_payouts (
                  id, affiliate_id, wallet_address, amount_usd, tx_hash, status, created_at, paid_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payout_id,
                    affiliate_id,
                    wallet_address,
                    float(amount_usd),
                    tx_hash,
                    status,
                    now,
                    now if tx_hash else None,
                ),
            )

    def claim_payment_hook_step(self, payment_id: str, step: str) -> bool:
        allowed = {"keys_credited", "subscription_emitted", "accrual_emitted"}
        if step not in allowed:
            raise ValueError(f"invalid hook step: {step}")
        now = _utc_now()
        with self._conn() as con:
            con.execute("BEGIN IMMEDIATE")
            con.execute(
                """
                INSERT OR IGNORE INTO economics_payment_hook (payment_id, created_at)
                VALUES (?, ?)
                """,
                (payment_id, now),
            )
            cur = con.execute(
                f"UPDATE economics_payment_hook SET {step} = 1 WHERE payment_id = ? AND {step} = 0",
                (payment_id,),
            )
            ok = cur.rowcount == 1
            con.commit()
            return ok

    def list_accruals_for_affiliate(self, affiliate_id: str) -> List[Dict[str, Any]]:
        with self._conn() as con:
            rows = con.execute(
                "SELECT * FROM affiliate_accruals WHERE affiliate_id = ? ORDER BY created_at ASC",
                (affiliate_id,),
            ).fetchall()
            return [dict(r) for r in rows]

    # --- affiliate gamification ---

    def get_affiliate_by_owner_org(self, owner_org_id: str) -> Optional[Dict[str, Any]]:
        oid = (owner_org_id or "").strip()
        if not oid:
            return None
        with self._conn() as con:
            row = con.execute(
                "SELECT * FROM affiliates WHERE owner_org_id = ? AND status = 'active' LIMIT 1",
                (oid,),
            ).fetchone()
            return dict(row) if row else None

    def get_gamification_profile(self, affiliate_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as con:
            row = con.execute(
                "SELECT * FROM affiliate_gamification_profiles WHERE affiliate_id = ?",
                (affiliate_id,),
            ).fetchone()
            return dict(row) if row else None

    def upsert_gamification_profile(
        self,
        affiliate_id: str,
        *,
        avatar_url: Optional[str] = None,
        avatar_asset_ref: Optional[str] = None,
        tagline: Optional[str] = None,
        leaderboard_visible: Optional[bool] = None,
        badges_json: Optional[str] = None,
        badge_unlocks_json: Optional[str] = None,
        streak_days: Optional[int] = None,
        best_streak_days: Optional[int] = None,
        streak_last_meaningful_day_utc: Optional[str] = None,
        progression_tier: Optional[str] = None,
        weekly_snapshot_json: Optional[str] = None,
        last_leaderboard_rank: Optional[int] = None,
        doginal_verified: Optional[bool] = None,
        affiliate_quality_score: Optional[float] = None,
        affiliate_risk_flag: Optional[bool] = None,
        affiliate_quality_factors_json: Optional[str] = None,
    ) -> None:
        now = _utc_now()
        aid = (affiliate_id or "").strip()
        if not aid:
            return
        with self._conn() as con:
            con.execute(
                """
                INSERT OR IGNORE INTO affiliate_gamification_profiles (
                  affiliate_id, leaderboard_visible, badges_json, streak_days, updated_at
                ) VALUES (?, 1, '[]', 0, ?)
                """,
                (aid, now),
            )
            sets: List[str] = ["updated_at = ?"]
            vals: List[Any] = [now]
            if avatar_url is not None:
                sets.append("avatar_url = ?")
                vals.append(avatar_url.strip() or None)
            if avatar_asset_ref is not None:
                sets.append("avatar_asset_ref = ?")
                vals.append(avatar_asset_ref.strip() or None)
            if tagline is not None:
                sets.append("tagline = ?")
                vals.append((tagline.strip() or "")[:240] or None)
            if leaderboard_visible is not None:
                sets.append("leaderboard_visible = ?")
                vals.append(1 if leaderboard_visible else 0)
            if badges_json is not None:
                sets.append("badges_json = ?")
                vals.append(badges_json)
            if badge_unlocks_json is not None:
                sets.append("badge_unlocks_json = ?")
                vals.append(badge_unlocks_json)
            if streak_days is not None:
                sets.append("streak_days = ?")
                vals.append(int(streak_days))
            if best_streak_days is not None:
                sets.append("best_streak_days = ?")
                vals.append(int(best_streak_days))
            if streak_last_meaningful_day_utc is not None:
                sets.append("streak_last_meaningful_day_utc = ?")
                vals.append(streak_last_meaningful_day_utc[:10] if streak_last_meaningful_day_utc else None)
            if progression_tier is not None:
                sets.append("progression_tier = ?")
                vals.append(str(progression_tier).strip()[:32] or "Starter")
            if weekly_snapshot_json is not None:
                sets.append("weekly_snapshot_json = ?")
                vals.append(weekly_snapshot_json)
            if last_leaderboard_rank is not None:
                sets.append("last_leaderboard_rank = ?")
                sets.append("rank_recorded_at = ?")
                vals.extend([int(last_leaderboard_rank), now])
            if doginal_verified is not None:
                sets.append("doginal_verified = ?")
                vals.append(1 if doginal_verified else 0)
            if affiliate_quality_score is not None:
                sets.append("affiliate_quality_score = ?")
                vals.append(float(affiliate_quality_score))
            if affiliate_risk_flag is not None:
                sets.append("affiliate_risk_flag = ?")
                vals.append(1 if affiliate_risk_flag else 0)
            if affiliate_quality_factors_json is not None:
                sets.append("affiliate_quality_factors_json = ?")
                vals.append(affiliate_quality_factors_json)
            if len(sets) <= 1:
                return
            vals.append(aid)
            con.execute(
                f"UPDATE affiliate_gamification_profiles SET {', '.join(sets)} WHERE affiliate_id = ?",
                vals,
            )

    def increment_agreements_influenced(self, affiliate_id: str, delta: int = 1) -> None:
        if delta <= 0:
            return
        now = _utc_now()
        aid = (affiliate_id or "").strip()
        if not aid:
            return
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO affiliate_influence_counters (affiliate_id, agreements_sent_influenced, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(affiliate_id) DO UPDATE SET
                  agreements_sent_influenced = agreements_sent_influenced + excluded.agreements_sent_influenced,
                  updated_at = excluded.updated_at
                """,
                (aid, delta, now),
            )
        self.record_affiliate_gamification_day(
            aid, now[:10], agreement_send=True
        )

    def record_affiliate_gamification_day(
        self,
        affiliate_id: str,
        day_utc: str,
        *,
        qualified_signup: bool = False,
        activation: bool = False,
        conversion: bool = False,
        agreement_send: bool = False,
    ) -> None:
        day = (day_utc or "")[:10]
        if len(day) != 10:
            return
        aid = (affiliate_id or "").strip()
        if not aid or not any((qualified_signup, activation, conversion, agreement_send)):
            return
        qs = 1 if qualified_signup else 0
        ac = 1 if activation else 0
        cv = 1 if conversion else 0
        sd = 1 if agreement_send else 0
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO affiliate_gamification_daily (
                  affiliate_id, day_utc, qualified_signup, activation, conversion, agreement_send
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(affiliate_id, day_utc) DO UPDATE SET
                  qualified_signup = MAX(affiliate_gamification_daily.qualified_signup, excluded.qualified_signup),
                  activation = MAX(affiliate_gamification_daily.activation, excluded.activation),
                  conversion = MAX(affiliate_gamification_daily.conversion, excluded.conversion),
                  agreement_send = MAX(affiliate_gamification_daily.agreement_send, excluded.agreement_send)
                """,
                (aid, day, qs, ac, cv, sd),
            )

    def list_affiliate_gamification_days(
        self, affiliate_id: str, *, limit: int = 500
    ) -> List[Dict[str, Any]]:
        aid = (affiliate_id or "").strip()
        if not aid:
            return []
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT * FROM affiliate_gamification_daily
                WHERE affiliate_id = ?
                ORDER BY day_utc DESC
                LIMIT ?
                """,
                (aid, max(1, min(2000, limit))),
            ).fetchall()
            return [dict(r) for r in rows]

    def get_agreements_influenced_count(self, affiliate_id: str) -> int:
        with self._conn() as con:
            row = con.execute(
                "SELECT agreements_sent_influenced FROM affiliate_influence_counters WHERE affiliate_id = ?",
                (affiliate_id,),
            ).fetchone()
            return int(row[0]) if row else 0

    def count_affiliate_excluded_attributions(self, affiliate_id: str) -> int:
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COUNT(*) FROM affiliate_attributions
                WHERE affiliate_id = ?
                  AND COALESCE(momentum_credit_state, 'pending') = 'excluded'
                """,
                (affiliate_id,),
            ).fetchone()
            return int(row[0]) if row else 0

    def count_affiliate_qualified_signups(self, affiliate_id: str) -> int:
        """Trusted referrals only (excluded / sybil-screened attributions omitted)."""
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COUNT(*) FROM affiliate_attributions
                WHERE affiliate_id = ?
                  AND COALESCE(momentum_credit_state, 'pending') != 'excluded'
                """,
                (affiliate_id,),
            ).fetchone()
            return int(row[0]) if row else 0

    def count_affiliate_dormant_attributions(self, affiliate_id: str) -> int:
        """Trusted attributed orgs with no product usage yet (pending activation)."""
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COUNT(*) FROM affiliate_attributions a
                WHERE a.affiliate_id = ?
                  AND COALESCE(a.momentum_credit_state, 'pending') != 'excluded'
                  AND NOT EXISTS (SELECT 1 FROM usage_events u WHERE u.org_id = a.org_id)
                """,
                (affiliate_id,),
            ).fetchone()
            return int(row[0]) if row else 0

    def count_affiliate_activated_orgs(self, affiliate_id: str) -> int:
        """Attributed orgs with at least one usage event (real product use)."""
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COUNT(DISTINCT a.org_id)
                FROM affiliate_attributions a
                WHERE a.affiliate_id = ?
                  AND COALESCE(a.momentum_credit_state, 'pending') != 'excluded'
                  AND EXISTS (SELECT 1 FROM usage_events u WHERE u.org_id = a.org_id)
                """,
                (affiliate_id,),
            ).fetchone()
            return int(row[0]) if row else 0

    def count_affiliate_lifetime_conversions(self, affiliate_id: str) -> int:
        """Paid conversions tied to trusted attributions; reversed payouts excluded."""
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COUNT(*) FROM affiliate_accruals c
                INNER JOIN affiliate_attributions a
                  ON a.org_id = c.org_id AND a.affiliate_id = c.affiliate_id
                WHERE c.affiliate_id = ?
                  AND c.status IN ('accrued', 'paid')
                  AND COALESCE(a.momentum_credit_state, 'pending') != 'excluded'
                """,
                (affiliate_id,),
            ).fetchone()
            return int(row[0]) if row else 0

    def count_affiliate_retained_paid_orgs(self, affiliate_id: str) -> int:
        """Distinct orgs with accrual + active paid plan; trusted attribution only."""
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COUNT(DISTINCT c.org_id)
                FROM affiliate_accruals c
                INNER JOIN affiliate_attributions a
                  ON a.org_id = c.org_id AND a.affiliate_id = c.affiliate_id
                INNER JOIN subscriptions s ON s.org_id = c.org_id
                WHERE c.affiliate_id = ?
                  AND c.status IN ('accrued', 'paid')
                  AND COALESCE(a.momentum_credit_state, 'pending') != 'excluded'
                  AND s.status = 'active'
                  AND LOWER(COALESCE(s.plan_code, '')) NOT IN ('free', 'trial', '')
                """,
                (affiliate_id,),
            ).fetchone()
            return int(row[0]) if row else 0

    # --- Stripe affiliate earnings (parallel to on-ramp affiliate_accruals) ---

    def upsert_stripe_customer_org(self, *, stripe_customer_id: str, org_id: str) -> None:
        cid = (stripe_customer_id or "").strip()
        oid = (org_id or "").strip()
        if not cid or not oid:
            return
        now = _utc_now()
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO stripe_customer_org (stripe_customer_id, org_id, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(stripe_customer_id) DO UPDATE SET
                  org_id = excluded.org_id,
                  updated_at = excluded.updated_at
                """,
                (cid, oid, now),
            )

    def get_org_for_stripe_customer(self, stripe_customer_id: str) -> Optional[str]:
        cid = (stripe_customer_id or "").strip()
        if not cid:
            return None
        with self._conn() as con:
            row = con.execute(
                "SELECT org_id FROM stripe_customer_org WHERE stripe_customer_id = ?",
                (cid,),
            ).fetchone()
            return str(row[0]) if row else None

    def upsert_stripe_subscription_org(
        self,
        *,
        stripe_subscription_id: str,
        org_id: str,
        plan_code: Optional[str],
        status: str,
    ) -> None:
        sid = (stripe_subscription_id or "").strip()
        oid = (org_id or "").strip()
        if not sid or not oid:
            return
        now = _utc_now()
        pc = (plan_code or "").strip() or None
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO stripe_subscription_org (
                  stripe_subscription_id, org_id, plan_code, status, updated_at
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(stripe_subscription_id) DO UPDATE SET
                  org_id = excluded.org_id,
                  plan_code = COALESCE(excluded.plan_code, stripe_subscription_org.plan_code),
                  status = excluded.status,
                  updated_at = excluded.updated_at
                """,
                (sid, oid, pc, (status or "").strip() or "unknown", now),
            )

    def get_stripe_subscription_org(self, stripe_subscription_id: str) -> Optional[Dict[str, Any]]:
        sid = (stripe_subscription_id or "").strip()
        if not sid:
            return None
        with self._conn() as con:
            row = con.execute(
                "SELECT * FROM stripe_subscription_org WHERE stripe_subscription_id = ?",
                (sid,),
            ).fetchone()
            return dict(row) if row else None

    def subscription_qualifies_for_affiliate_earning(self, stripe_subscription_id: Optional[str]) -> bool:
        """When no subscription (one-time invoice), caller decides separately."""
        if not (stripe_subscription_id or "").strip():
            return True
        row = self.get_stripe_subscription_org(stripe_subscription_id.strip())
        if not row:
            return True
        st = str(row.get("status") or "").lower()
        return st in ("active", "trialing", "past_due")

    def insert_stripe_webhook_event_once(self, event_id: str) -> bool:
        eid = (event_id or "").strip()
        if not eid:
            return False
        now = _utc_now()
        try:
            with self._conn() as con:
                con.execute(
                    "INSERT INTO stripe_webhook_events (id, received_at) VALUES (?, ?)",
                    (eid, now),
                )
            return True
        except sqlite3.IntegrityError:
            return False

    def insert_affiliate_earning(
        self,
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
        risk_hold: int = 0,
    ) -> bool:
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.insert_affiliate_earning(
                earning_id=earning_id,
                affiliate_id=affiliate_id,
                referred_org_id=referred_org_id,
                referred_user_id=referred_user_id,
                internal_subscription_id=internal_subscription_id,
                stripe_subscription_id=stripe_subscription_id,
                invoice_id=invoice_id,
                charge_id=charge_id,
                payment_intent_id=payment_intent_id,
                internal_payment_id=internal_payment_id,
                amount_usd=float(amount_usd),
                rate_bps=int(rate_bps),
                earning_type=earning_type,
                status=status,
                unlock_at=unlock_at,
                fraud_score_snapshot=fraud_score_snapshot,
                notes=notes,
                idempotency_key=idempotency_key,
                risk_hold=int(risk_hold),
                created_at=_utc_now(),
            )
        try:
            with self._conn() as con:
                con.execute(
                    """
                    INSERT INTO affiliate_earnings (
                      id, affiliate_id, referred_org_id, referred_user_id, internal_subscription_id,
                      stripe_subscription_id, invoice_id, charge_id, payment_intent_id, internal_payment_id,
                      amount_usd, rate_bps, earning_type, status, created_at, unlock_at,
                      fraud_score_snapshot, notes, idempotency_key, risk_hold
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        float(amount_usd),
                        int(rate_bps),
                        earning_type,
                        status,
                        _utc_now(),
                        unlock_at,
                        fraud_score_snapshot,
                        notes,
                        idempotency_key,
                        int(risk_hold),
                    ),
                )
            return True
        except sqlite3.IntegrityError:
            return False

    def _active_stripe_subscription_ids_for_promote(self) -> List[str]:
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT stripe_subscription_id FROM stripe_subscription_org
                WHERE LOWER(status) IN ('active', 'trialing', 'past_due')
                """
            ).fetchall()
        return [str(r[0]) for r in rows if r and r[0]]

    def promote_affiliate_earnings_pending_to_payable(self, *, as_of_iso: str) -> int:
        """pending -> payable when unlock_at passed, no risk_hold, subscription still qualifying (if any)."""
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.promote_pending_to_payable(
                as_of_iso=as_of_iso,
                active_stripe_subscription_ids=self._active_stripe_subscription_ids_for_promote(),
            )
        with self._conn() as con:
            cur = con.execute(
                """
                UPDATE affiliate_earnings
                SET status = 'payable'
                WHERE status = 'pending'
                  AND risk_hold = 0
                  AND unlock_at IS NOT NULL
                  AND unlock_at <= ?
                  AND (
                    stripe_subscription_id IS NULL
                    OR EXISTS (
                      SELECT 1 FROM stripe_subscription_org s
                      WHERE s.stripe_subscription_id = affiliate_earnings.stripe_subscription_id
                        AND LOWER(s.status) IN ('active', 'trialing', 'past_due')
                    )
                  )
                """,
                (as_of_iso,),
            )
            return int(cur.rowcount)

    def cancel_affiliate_earnings_for_stripe_subscription(
        self, stripe_subscription_id: str, *, reason: str
    ) -> int:
        sid = (stripe_subscription_id or "").strip()
        if not sid:
            return 0
        now = _utc_now()
        reason = (reason or "").strip() or "subscription_ended"
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.cancel_affiliate_earnings_for_stripe_subscription(
                stripe_subscription_id=sid, reason=reason, now=now
            )
        with self._conn() as con:
            cur = con.execute(
                """
                UPDATE affiliate_earnings
                SET status = 'cancelled', cancelled_at = ?, cancellation_reason = ?,
                    payout_batch_id = NULL
                WHERE stripe_subscription_id = ? AND status IN ('pending', 'payable')
                """,
                (now, reason, sid),
            )
            return int(cur.rowcount)

    def list_matured_payable_affiliate_earnings(self, *, as_of_iso: str) -> List[Dict[str, Any]]:
        """Earnings eligible for payout batching (status payable, past affiliate moratorium handled in caller)."""
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            rows = alp.list_matured_payable_affiliate_earnings(as_of_iso=as_of_iso)
            seen_aff: Dict[str, Optional[str]] = {}
            for r in rows:
                aid = str(r.get("affiliate_id") or "")
                if aid not in seen_aff:
                    aff = self.get_affiliate(aid)
                    seen_aff[aid] = (
                        str(aff.get("created_at") or "").strip() if aff else None
                    )
                r["affiliate_created_at"] = seen_aff.get(aid)
            return rows
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT e.*, a.created_at AS affiliate_created_at
                FROM affiliate_earnings e
                INNER JOIN affiliates a ON a.id = e.affiliate_id
                WHERE e.status = 'payable'
                  AND e.risk_hold = 0
                  AND e.unlock_at IS NOT NULL
                  AND e.unlock_at <= ?
                  AND (e.payout_batch_id IS NULL OR TRIM(e.payout_batch_id) = '')
                ORDER BY e.affiliate_id, e.created_at
                """,
                (as_of_iso,),
            ).fetchall()
            return [dict(r) for r in rows]

    def mark_affiliate_earnings_paid(self, earning_ids: List[str], *, payout_batch_id: str) -> int:
        """Returns count of rows moved to paid (each earning at most once; batch id must match)."""
        if not earning_ids:
            return 0
        now = _utc_now()
        pid = (payout_batch_id or "").strip()
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.mark_affiliate_earnings_paid(earning_ids, payout_batch_id=pid, now=now)
        n = 0
        with self._conn() as con:
            for eid in earning_ids:
                cur = con.execute(
                    """
                    UPDATE affiliate_earnings
                    SET status = 'paid', paid_at = ?, payout_batch_id = ?
                    WHERE id = ? AND status = 'payable' AND payout_batch_id = ?
                    """,
                    (now, pid, eid, pid),
                )
                n += int(cur.rowcount)
        return n

    def payout_batch_earnings_integrity_failure(
        self, batch_id: str, items: List[Dict[str, Any]]
    ) -> Optional[Tuple[str, str]]:
        """
        Stripe batch items must reference payable earnings still reserved to this batch with matching amounts.
        Returns (error_code, detail_id) or None if OK.
        """
        bid = (batch_id or "").strip()
        if not bid:
            return ("invalid_batch", "")
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.payout_batch_earnings_integrity_failure(bid, items)
        with self._conn() as con:
            for it in items:
                eid = (it.get("earning_id") or "").strip()
                if not eid:
                    return ("batch_item_missing_earning", str(it.get("id") or ""))
                row = con.execute(
                    """
                    SELECT status, payout_batch_id, amount_usd
                    FROM affiliate_earnings WHERE id = ?
                    """,
                    (eid,),
                ).fetchone()
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
        self,
        *,
        batch_id: str,
        affiliate_id: str,
        earning_ids: List[str],
        wallet_address: str,
        payout_id: str,
        amount_usd: float,
        tx_hash: str,
        paid_network: str,
    ) -> Optional[str]:
        """
        Single transaction: mark earnings paid (exactly once each), insert payout audit row, complete batch.
        Batch must be ``exported``. Returns error code string or None on success.
        """
        bid = (batch_id or "").strip()
        aid = (affiliate_id or "").strip()
        if not bid or not aid or not earning_ids:
            return "invalid_args"
        now = _utc_now()
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.finalize_affiliate_payout_batch_paid(
                batch_id=bid,
                affiliate_id=aid,
                earning_ids=earning_ids,
                wallet_address=wallet_address,
                payout_id=payout_id,
                amount_usd=float(amount_usd),
                tx_hash=tx_hash,
                paid_network=paid_network,
                now=now,
            )
        con = self._conn()
        try:
            con.execute("BEGIN IMMEDIATE")
            brow = con.execute(
                "SELECT status, affiliate_id FROM affiliate_payout_batches WHERE id = ?",
                (bid,),
            ).fetchone()
            if not brow:
                con.rollback()
                return "batch_not_found"
            if str(brow["status"] or "") != "exported":
                con.rollback()
                return "batch_not_exported"
            if str(brow["affiliate_id"] or "") != aid:
                con.rollback()
                return "affiliate_mismatch"
            for eid in earning_ids:
                cur = con.execute(
                    """
                    UPDATE affiliate_earnings
                    SET status = 'paid', paid_at = ?, payout_batch_id = ?
                    WHERE id = ? AND status = 'payable' AND payout_batch_id = ?
                    """,
                    (now, bid, eid, bid),
                )
                if int(cur.rowcount) != 1:
                    con.rollback()
                    return "earning_not_payable_or_already_paid"
            con.execute(
                """
                INSERT INTO affiliate_payouts (
                  id, affiliate_id, wallet_address, amount_usd, tx_hash, status, created_at, paid_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payout_id,
                    aid,
                    wallet_address,
                    float(amount_usd),
                    tx_hash,
                    "completed",
                    now,
                    now,
                ),
            )
            con.execute(
                "UPDATE affiliate_payout_batch_items SET payout_status = ? WHERE batch_id = ?",
                ("paid", bid),
            )
            curb = con.execute(
                """
                UPDATE affiliate_payout_batches
                SET status = 'paid', paid_at = ?, payout_record_id = ?, safe_tx_hash = ?, paid_network = ?
                WHERE id = ? AND status = 'exported'
                """,
                (now, payout_id, tx_hash, paid_network, bid),
            )
            if int(curb.rowcount) != 1:
                con.rollback()
                return "batch_status_race"
            con.commit()
            return None
        except BaseException:
            con.rollback()
            raise
        finally:
            con.close()

    def affiliate_earnings_usd_summary(self, affiliate_id: str) -> Dict[str, float]:
        """Sums affiliate_earnings by lifecycle status (USD)."""
        aid = (affiliate_id or "").strip()
        out = {"pending_usd": 0.0, "payable_usd": 0.0, "paid_usd": 0.0}
        if not aid:
            return out
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.affiliate_earnings_usd_summary(aid)
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT status, COALESCE(SUM(amount_usd), 0) AS s
                FROM affiliate_earnings
                WHERE affiliate_id = ?
                GROUP BY status
                """,
                (aid,),
            ).fetchall()
        for r in rows:
            st = str(r[0] or "")
            amt = float(r[1] or 0)
            if st == "pending":
                out["pending_usd"] += amt
            elif st == "payable":
                out["payable_usd"] += amt
            elif st == "paid":
                out["paid_usd"] += amt
        return out

    def affiliate_earnings_total_credited_usd(self, affiliate_id: str) -> float:
        """Lifetime commission still on-books (excludes cancelled)."""
        aid = (affiliate_id or "").strip()
        if not aid:
            return 0.0
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.affiliate_earnings_total_credited_usd(aid)
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COALESCE(SUM(amount_usd), 0)
                FROM affiliate_earnings
                WHERE affiliate_id = ? AND status NOT IN ('cancelled')
                """,
                (aid,),
            ).fetchone()
            return float(row[0] or 0) if row else 0.0

    def affiliate_earnings_quality_aggregate(self, affiliate_id: str) -> Dict[str, int]:
        """Counts for quality heuristics (cancelled / recovery / refund-ish wording)."""
        aid = (affiliate_id or "").strip()
        if not aid:
            return {"n_all": 0, "n_cancelled": 0, "n_recovery": 0, "n_refundish": 0}
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.affiliate_earnings_quality_aggregate(aid)
        with self._conn() as con:
            row = con.execute(
                """
                SELECT
                  COUNT(*) AS n_all,
                  SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS n_cancelled,
                  SUM(CASE WHEN status = 'recovery_due' THEN 1 ELSE 0 END) AS n_recovery,
                  SUM(
                    CASE
                      WHEN status = 'cancelled'
                        AND (
                          LOWER(COALESCE(cancellation_reason, '')) LIKE '%refund%'
                          OR LOWER(COALESCE(cancellation_reason, '')) LIKE '%void%'
                        )
                      THEN 1 ELSE 0
                    END
                  ) AS n_refundish
                FROM affiliate_earnings
                WHERE affiliate_id = ?
                """,
                (aid,),
            ).fetchone()
        return {
            "n_all": int(row[0] or 0) if row else 0,
            "n_cancelled": int(row[1] or 0) if row else 0,
            "n_recovery": int(row[2] or 0) if row else 0,
            "n_refundish": int(row[3] or 0) if row else 0,
        }

    def list_affiliate_earnings_timeline(
        self, affiliate_id: str, *, limit: int = 40
    ) -> List[Dict[str, Any]]:
        """Earnings rows with resolved on-chain / payout reference when paid."""
        aid = (affiliate_id or "").strip()
        if not aid:
            return []
        lim = max(1, min(80, int(limit)))
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.list_affiliate_earnings_timeline(aid, limit=lim)
        with self._conn() as con:
            rows = con.execute(
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
                WHERE e.affiliate_id = ? AND e.status NOT IN ('cancelled')
                ORDER BY datetime(e.created_at) DESC
                LIMIT ?
                """,
                (aid, lim),
            ).fetchall()
            return [dict(r) for r in rows]

    def get_latest_completed_affiliate_payout(
        self, affiliate_id: str
    ) -> Optional[Dict[str, Any]]:
        aid = (affiliate_id or "").strip()
        if not aid:
            return None
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.get_latest_completed_affiliate_payout(aid)
        with self._conn() as con:
            row = con.execute(
                """
                SELECT id, affiliate_id, wallet_address, amount_usd, tx_hash, status, created_at, paid_at
                FROM affiliate_payouts
                WHERE affiliate_id = ? AND status = 'completed'
                ORDER BY datetime(COALESCE(paid_at, created_at)) DESC
                LIMIT 1
                """,
                (aid,),
            ).fetchone()
            return dict(row) if row else None

    def list_recent_affiliate_earnings(
        self, affiliate_id: str, *, limit: int = 15
    ) -> List[Dict[str, Any]]:
        aid = (affiliate_id or "").strip()
        if not aid:
            return []
        lim = max(1, min(50, int(limit)))
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.list_recent_affiliate_earnings(aid, limit=lim)
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT id, amount_usd, status, earning_type, created_at, unlock_at, paid_at,
                       referred_org_id, cancellation_reason
                FROM affiliate_earnings
                WHERE affiliate_id = ?
                ORDER BY datetime(created_at) DESC
                LIMIT ?
                """,
                (aid, lim),
            ).fetchall()
            return [dict(r) for r in rows]

    def insert_trust_ledger_event(
        self,
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
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.insert_trust_ledger_event(
                event_id=event_id,
                created_at=created_at,
                affiliate_id=affiliate_id,
                referral_code=referral_code,
                event_type=event_type,
                customer_ref_hash=customer_ref_hash,
                agreement_id=agreement_id,
                gross_revenue_usd=gross_revenue_usd,
                commission_amount_usd=commission_amount_usd,
                status=status,
                payout_batch_id=payout_batch_id,
                proof_id=proof_id,
                idempotency_key=idempotency_key,
                meta_json=meta_json,
            )
        meta_s = json.dumps(meta_json, separators=(",", ":")) if meta_json else None
        with self._conn() as con:
            if idempotency_key:
                cur = con.execute(
                    """
                    INSERT OR IGNORE INTO affiliate_ledger_events (
                      id, created_at, affiliate_id, referral_code, event_type,
                      customer_ref_hash, agreement_id, gross_revenue_usd, commission_amount_usd,
                      status, payout_batch_id, proof_id, idempotency_key, meta_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        event_id,
                        created_at,
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
                        meta_s,
                    ),
                )
                return getattr(cur, "rowcount", 0) > 0
            con.execute(
                """
                INSERT INTO affiliate_ledger_events (
                  id, created_at, affiliate_id, referral_code, event_type,
                  customer_ref_hash, agreement_id, gross_revenue_usd, commission_amount_usd,
                  status, payout_batch_id, proof_id, idempotency_key, meta_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    created_at,
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
                    meta_s,
                ),
            )
            return True

    def list_trust_ledger_events_for_affiliate(
        self, affiliate_id: str, *, limit: int = 40
    ) -> List[Dict[str, Any]]:
        aid = (affiliate_id or "").strip()
        if not aid:
            return []
        lim = max(1, min(int(limit), 200))
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.list_trust_ledger_events_for_affiliate(aid, limit=lim)
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT id, created_at, affiliate_id, referral_code, event_type,
                       customer_ref_hash, agreement_id, gross_revenue_usd, commission_amount_usd,
                       status, payout_batch_id, proof_id, idempotency_key, meta_json
                FROM affiliate_ledger_events
                WHERE affiliate_id = ?
                ORDER BY datetime(created_at) DESC
                LIMIT ?
                """,
                (aid, lim),
            ).fetchall()
            out: List[Dict[str, Any]] = []
            for r in rows:
                d = dict(r)
                if d.get("meta_json"):
                    try:
                        d["meta_json"] = json.loads(str(d["meta_json"]))
                    except Exception:
                        pass
                out.append(d)
            return out

    def count_trust_ledger_events(self, affiliate_id: str, event_type: str) -> int:
        aid = (affiliate_id or "").strip()
        et = (event_type or "").strip()
        if not aid or not et:
            return 0
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.count_trust_ledger_events(aid, et)
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COUNT(*) FROM affiliate_ledger_events
                WHERE affiliate_id = ? AND event_type = ?
                """,
                (aid, et),
            ).fetchone()
            return int(row[0]) if row else 0

    def sum_trust_commission_earned_since(self, affiliate_id: str, since_iso: str) -> float:
        aid = (affiliate_id or "").strip()
        if not aid:
            return 0.0
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.sum_trust_commission_earned_since(aid, since_iso)
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COALESCE(SUM(commission_amount_usd), 0) FROM affiliate_ledger_events
                WHERE affiliate_id = ?
                  AND event_type = 'commission_earned'
                  AND datetime(created_at) >= datetime(?)
                """,
                (aid, since_iso),
            ).fetchone()
            return float(row[0] or 0) if row else 0.0

    def list_cancelled_earnings_rows_for_charge(self, charge_id: str) -> List[Dict[str, Any]]:
        cid = (charge_id or "").strip()
        if not cid:
            return []
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.list_affiliate_earnings_rows_for_charge(cid)
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT id, affiliate_id, amount_usd, referred_org_id, invoice_id, charge_id, status, cancelled_at
                FROM affiliate_earnings
                WHERE charge_id = ? AND status = 'cancelled'
                ORDER BY datetime(COALESCE(cancelled_at, created_at)) DESC, datetime(created_at) DESC
                LIMIT 20
                """,
                (cid,),
            ).fetchall()
            return [dict(r) for r in rows]

    def iter_affiliate_ids_for_trust_rollover(self) -> List[Dict[str, Any]]:
        with self._conn() as con:
            rows = con.execute(
                "SELECT id, affiliate_code FROM affiliates ORDER BY created_at ASC"
            ).fetchall()
            return [dict(r) for r in rows]

    def count_affiliate_paying_referred_orgs(self, affiliate_id: str) -> int:
        """Distinct trusted attributed orgs with on-ramp accrual or non-cancelled Stripe earnings."""
        aid = (affiliate_id or "").strip()
        if not aid:
            return 0
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            earning_orgs = set(alp.earning_org_ids_for_affiliate(aid))
            with self._conn() as con:
                org_rows = con.execute(
                    """
                    SELECT DISTINCT org_id FROM affiliate_attributions
                    WHERE affiliate_id = ?
                      AND COALESCE(momentum_credit_state, 'pending') != 'excluded'
                    """,
                    (aid,),
                ).fetchall()
                n = 0
                for (oid,) in org_rows:
                    o = str(oid)
                    acc = con.execute(
                        """
                        SELECT 1 FROM affiliate_accruals
                        WHERE org_id = ? AND affiliate_id = ?
                          AND status IN ('accrued', 'paid')
                        LIMIT 1
                        """,
                        (o, aid),
                    ).fetchone()
                    if acc or o in earning_orgs:
                        n += 1
                return n
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COUNT(DISTINCT a.org_id)
                FROM affiliate_attributions a
                WHERE a.affiliate_id = ?
                  AND COALESCE(a.momentum_credit_state, 'pending') != 'excluded'
                  AND (
                    EXISTS (
                      SELECT 1 FROM affiliate_accruals c
                      WHERE c.org_id = a.org_id AND c.affiliate_id = a.affiliate_id
                        AND c.status IN ('accrued', 'paid')
                    )
                    OR EXISTS (
                      SELECT 1 FROM affiliate_earnings e
                      WHERE e.referred_org_id = a.org_id AND e.affiliate_id = a.affiliate_id
                        AND e.status NOT IN ('cancelled')
                    )
                  )
                """,
                (aid,),
            ).fetchone()
            return int(row[0]) if row else 0

    def get_affiliate_payout_method_row(
        self, affiliate_id: str, method_type: str
    ) -> Optional[Dict[str, Any]]:
        aid = (affiliate_id or "").strip()
        mt = (method_type or "").strip()
        if not aid or not mt:
            return None
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.get_affiliate_payout_method_row(aid, mt)
        with self._conn() as con:
            row = con.execute(
                """
                SELECT * FROM affiliate_payout_methods
                WHERE affiliate_id = ? AND method_type = ?
                LIMIT 1
                """,
                (aid, mt),
            ).fetchone()
            return dict(row) if row else None

    def seed_usdc_wallet_at_affiliate_creation(
        self, affiliate_id: str, wallet_norm: str, wallet_updated_at_iso: str
    ) -> None:
        """Ensure usdc_wallet payout method exists at signup; cooling clock starts at enrollment."""
        from backend.affiliates.evm_wallet import validate_evm_wallet_address

        aid = (affiliate_id or "").strip()
        if not aid:
            return
        addr = validate_evm_wallet_address(wallet_norm)
        wu = (wallet_updated_at_iso or "").strip() or _utc_now()
        now = _utc_now()
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            alp.seed_usdc_wallet_at_affiliate_creation(aid, wallet_norm, wu, now)
            return
        with self._conn() as con:
            row = con.execute(
                """
                SELECT id, COALESCE(usdc_wallet_address, '') AS a
                FROM affiliate_payout_methods
                WHERE affiliate_id = ? AND method_type = 'usdc_wallet'
                LIMIT 1
                """,
                (aid,),
            ).fetchone()
            if row:
                rid = str(row[0])
                if str(row[1] or "").strip():
                    return
                con.execute(
                    """
                    UPDATE affiliate_payout_methods
                    SET usdc_wallet_address = ?, status = 'active', wallet_updated_at = ?
                    WHERE id = ?
                    """,
                    (addr, wu, rid),
                )
                return
            con.execute(
                """
                INSERT INTO affiliate_payout_methods (
                  id, affiliate_id, method_type, usdc_wallet_address, status, created_at, wallet_updated_at
                ) VALUES (?, ?, 'usdc_wallet', ?, 'active', ?, ?)
                """,
                (str(uuid.uuid4()), aid, addr, now, wu),
            )

    def sync_canonical_usdc_payout_wallet(self, affiliate_id: str) -> Tuple[Optional[str], bool]:
        """
        Canonical payout wallet: affiliate_payout_methods usdc_wallet (active, valid address).
        Migrates affiliates.wallet_address when the method row is missing or has no valid address,
        setting wallet_updated_at to affiliates.created_at for cooling.
        """
        from backend.affiliates.evm_wallet import validate_evm_wallet_address

        aid = (affiliate_id or "").strip()
        if not aid:
            return None, False
        aff = self.get_affiliate(aid)
        if not aff:
            return None, False
        created_anchor = str(aff.get("created_at") or "").strip() or _utc_now()

        row = self.get_affiliate_payout_method_row(aid, "usdc_wallet")

        def _addr_from_row(r: Optional[Dict[str, Any]]) -> Optional[str]:
            if not r:
                return None
            raw = (r.get("usdc_wallet_address") or "").strip()
            if not raw:
                return None
            try:
                return validate_evm_wallet_address(raw)
            except ValueError:
                return None

        method_addr = _addr_from_row(row)
        if method_addr:
            st = str(row.get("status") or "").strip() if row else ""
            if st != "active":
                if _affiliate_ledger_pg():
                    from backend.economics import affiliate_ledger_postgres as alp

                    alp.set_payout_method_active_if_present(aid)
                else:
                    with self._conn() as con:
                        con.execute(
                            """
                            UPDATE affiliate_payout_methods
                            SET status = 'active'
                            WHERE affiliate_id = ? AND method_type = 'usdc_wallet'
                            """,
                            (aid,),
                        )
            return method_addr, False

        legacy_raw = str(aff.get("wallet_address") or "").strip()
        if not legacy_raw:
            return None, False
        try:
            legacy_norm = validate_evm_wallet_address(legacy_raw)
        except ValueError:
            return None, False

        now = _utc_now()
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            alp.sync_canonical_usdc_payout_wallet_import_legacy(
                aid, legacy_norm, created_anchor, now
            )
            return legacy_norm, True
        with self._conn() as con:
            hit = con.execute(
                """
                SELECT id FROM affiliate_payout_methods
                WHERE affiliate_id = ? AND method_type = 'usdc_wallet'
                LIMIT 1
                """,
                (aid,),
            ).fetchone()
            if hit:
                con.execute(
                    """
                    UPDATE affiliate_payout_methods
                    SET usdc_wallet_address = ?, status = 'active', wallet_updated_at = ?
                    WHERE affiliate_id = ? AND method_type = 'usdc_wallet'
                    """,
                    (legacy_norm, created_anchor, aid),
                )
            else:
                con.execute(
                    """
                    INSERT INTO affiliate_payout_methods (
                      id, affiliate_id, method_type, usdc_wallet_address, status, created_at, wallet_updated_at
                    ) VALUES (?, ?, 'usdc_wallet', ?, 'active', ?, ?)
                    """,
                    (str(uuid.uuid4()), aid, legacy_norm, now, created_anchor),
                )
        return legacy_norm, True

    def upsert_affiliate_payout_method(
        self,
        *,
        affiliate_id: str,
        method_type: str,
        usdc_wallet_address: Optional[str],
        status: str,
    ) -> str:
        from backend.affiliates.evm_wallet import validate_evm_wallet_address

        rid = str(uuid.uuid4())
        now = _utc_now()
        aid = (affiliate_id or "").strip()
        mt = (method_type or "").strip() or "none"
        st = (status or "").strip() or "active"
        addr: Optional[str] = None
        if usdc_wallet_address is not None and str(usdc_wallet_address).strip():
            addr = validate_evm_wallet_address(usdc_wallet_address)
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.upsert_affiliate_payout_method(
                affiliate_id=aid,
                method_type=mt,
                usdc_wallet_address=usdc_wallet_address,
                status=st,
                now=now,
            )
        with self._conn() as con:
            row = con.execute(
                """
                SELECT id, usdc_wallet_address FROM affiliate_payout_methods
                WHERE affiliate_id = ? AND method_type = ?
                """,
                (aid, mt),
            ).fetchone()
            old_addr = (str(row[1]).strip().lower() if row and row[1] else "") or None
            new_key = (addr or "").strip().lower() if addr else None
            wallet_changed = old_addr != new_key
            wu_val: Optional[str] = None
            if wallet_changed:
                wu_val = now if addr else None
            if row:
                rid = str(row[0])
                if wallet_changed:
                    con.execute(
                        """
                        UPDATE affiliate_payout_methods
                        SET usdc_wallet_address = ?, status = ?, wallet_updated_at = ?
                        WHERE id = ?
                        """,
                        (addr, st, wu_val, rid),
                    )
                else:
                    con.execute(
                        """
                        UPDATE affiliate_payout_methods
                        SET usdc_wallet_address = ?, status = ?
                        WHERE id = ?
                        """,
                        (addr, st, rid),
                    )
            else:
                con.execute(
                    """
                    INSERT INTO affiliate_payout_methods (
                      id, affiliate_id, method_type, usdc_wallet_address, status, created_at, wallet_updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (rid, aid, mt, addr, st, now, now if addr else None),
                )
        return rid

    def create_draft_payout_batch_atomic(
        self,
        *,
        batch_id: str,
        affiliate_id: str,
        now: str,
        total_usd: float,
        total_usdc: str,
        notes: Optional[str],
        item_rows: List[Tuple[Dict[str, Any], str, str]],
    ) -> None:
        """
        Insert draft batch, reserve payable earnings (exactly-once rowcount), insert batch items.
        One transaction (SQLite BEGIN IMMEDIATE or Postgres).
        """
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            alp.create_draft_payout_batch_atomic(
                batch_id=batch_id,
                affiliate_id=affiliate_id,
                now=now,
                total_usd=total_usd,
                total_usdc=total_usdc,
                notes=notes,
                item_rows=item_rows,
            )
            return
        con = self._conn()
        try:
            con.execute("BEGIN IMMEDIATE")
            con.execute(
                """
                INSERT INTO affiliate_payout_batches (
                  id, affiliate_id, created_at, status, total_usd, total_usdc, notes
                ) VALUES (?, ?, ?, 'draft', ?, ?, ?)
                """,
                (batch_id, affiliate_id, now, float(total_usd), total_usdc, notes),
            )
            for er, wallet_norm, s6 in item_rows:
                eid = str(er["id"])
                cur = con.execute(
                    """
                    UPDATE affiliate_earnings
                    SET payout_batch_id = ?
                    WHERE id = ? AND status = 'payable'
                      AND (payout_batch_id IS NULL OR TRIM(payout_batch_id) = '')
                    """,
                    (batch_id, eid),
                )
                if cur.rowcount != 1:
                    raise RuntimeError(f"reserve_failed:{eid}")
                con.execute(
                    """
                    INSERT INTO affiliate_payout_batch_items (
                      id, batch_id, earning_id, accrual_id, affiliate_id, amount_usd,
                      wallet_address, amount_usdc, payout_status, created_at
                    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'reserved', ?)
                    """,
                    (
                        str(uuid.uuid4()),
                        batch_id,
                        eid,
                        affiliate_id,
                        float(er["amount_usd"]),
                        wallet_norm,
                        s6,
                        now,
                    ),
                )
            con.commit()
        except BaseException:
            con.rollback()
            raise
        finally:
            con.close()

    def insert_payout_batch(
        self,
        *,
        batch_id: str,
        affiliate_id: str,
        status: str,
        total_usd: float,
        notes: Optional[str],
    ) -> None:
        now = _utc_now()
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            alp.insert_payout_batch(
                batch_id=batch_id,
                affiliate_id=affiliate_id,
                status=status,
                total_usd=float(total_usd),
                notes=notes,
                now=now,
            )
            return
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO affiliate_payout_batches (
                  id, affiliate_id, created_at, status, total_usd, notes
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (batch_id, affiliate_id, now, status, float(total_usd), notes),
            )

    def insert_payout_batch_item(
        self,
        *,
        item_id: str,
        batch_id: str,
        earning_id: Optional[str],
        accrual_id: Optional[str],
        affiliate_id: str,
        amount_usd: float,
        payout_status: str,
        wallet_address: Optional[str] = None,
        amount_usdc: Optional[str] = None,
    ) -> None:
        now = _utc_now()
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            alp.insert_payout_batch_item(
                item_id=item_id,
                batch_id=batch_id,
                earning_id=earning_id,
                accrual_id=accrual_id,
                affiliate_id=affiliate_id,
                amount_usd=float(amount_usd),
                payout_status=payout_status,
                wallet_address=wallet_address,
                amount_usdc=amount_usdc,
                now=now,
            )
            return
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO affiliate_payout_batch_items (
                  id, batch_id, earning_id, accrual_id, affiliate_id, amount_usd,
                  wallet_address, amount_usdc, payout_status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item_id,
                    batch_id,
                    earning_id,
                    accrual_id,
                    affiliate_id,
                    float(amount_usd),
                    wallet_address,
                    amount_usdc,
                    payout_status,
                    now,
                ),
            )

    def get_payout_batch(self, batch_id: str) -> Optional[Dict[str, Any]]:
        bid = (batch_id or "").strip()
        if not bid:
            return None
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.get_payout_batch(bid)
        with self._conn() as con:
            row = con.execute(
                "SELECT * FROM affiliate_payout_batches WHERE id = ?", (bid,)
            ).fetchone()
            return dict(row) if row else None

    def list_payout_batch_items(self, batch_id: str) -> List[Dict[str, Any]]:
        bid = (batch_id or "").strip()
        if not bid:
            return []
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.list_payout_batch_items(bid)
        with self._conn() as con:
            rows = con.execute(
                "SELECT * FROM affiliate_payout_batch_items WHERE batch_id = ? ORDER BY created_at",
                (bid,),
            ).fetchall()
            return [dict(r) for r in rows]

    def update_payout_batch_fields(
        self,
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
            sets.append("status = ?")
            vals.append(status)
        if exported_at is not None:
            sets.append("exported_at = ?")
            vals.append(exported_at)
        if paid_at is not None:
            sets.append("paid_at = ?")
            vals.append(paid_at)
        if payout_record_id is not None:
            sets.append("payout_record_id = ?")
            vals.append(payout_record_id)
        if notes is not None:
            sets.append("notes = ?")
            vals.append(notes)
        if safe_tx_hash is not None:
            sets.append("safe_tx_hash = ?")
            vals.append(safe_tx_hash)
        if paid_network is not None:
            sets.append("paid_network = ?")
            vals.append(paid_network)
        if total_usdc is not None:
            sets.append("total_usdc = ?")
            vals.append(total_usdc)
        if last_stale_export_alert_at is not None:
            sets.append("last_stale_export_alert_at = ?")
            vals.append(last_stale_export_alert_at)
        if not sets:
            return
        vals.append(bid)
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            kw: Dict[str, Any] = {}
            if status is not None:
                kw["status"] = status
            if exported_at is not None:
                kw["exported_at"] = exported_at
            if paid_at is not None:
                kw["paid_at"] = paid_at
            if payout_record_id is not None:
                kw["payout_record_id"] = payout_record_id
            if notes is not None:
                kw["notes"] = notes
            if safe_tx_hash is not None:
                kw["safe_tx_hash"] = safe_tx_hash
            if paid_network is not None:
                kw["paid_network"] = paid_network
            if total_usdc is not None:
                kw["total_usdc"] = total_usdc
            if last_stale_export_alert_at is not None:
                kw["last_stale_export_alert_at"] = last_stale_export_alert_at
            alp.update_payout_batch_fields(bid, **kw)
            return
        with self._conn() as con:
            con.execute(
                f"UPDATE affiliate_payout_batches SET {', '.join(sets)} WHERE id = ?",
                vals,
            )

    def clear_affiliate_earnings_batch_reservation(self, batch_id: str) -> int:
        bid = (batch_id or "").strip()
        if not bid:
            return 0
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.clear_affiliate_earnings_batch_reservation(bid)
        with self._conn() as con:
            cur = con.execute(
                """
                UPDATE affiliate_earnings
                SET payout_batch_id = NULL
                WHERE payout_batch_id = ? AND status = 'payable'
                """,
                (bid,),
            )
            return int(cur.rowcount)

    def update_batch_items_payout_status(self, batch_id: str, payout_status: str) -> None:
        bid = (batch_id or "").strip()
        if not bid:
            return
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            alp.update_batch_items_payout_status(bid, payout_status)
            return
        with self._conn() as con:
            con.execute(
                "UPDATE affiliate_payout_batch_items SET payout_status = ? WHERE batch_id = ?",
                (payout_status, bid),
            )

    def affiliate_has_completed_payout(self, affiliate_id: str) -> bool:
        aid = (affiliate_id or "").strip()
        if not aid:
            return False
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.affiliate_has_completed_payout(aid)
        with self._conn() as con:
            row = con.execute(
                """
                SELECT 1 FROM affiliate_payouts
                WHERE affiliate_id = ? AND status = 'completed' LIMIT 1
                """,
                (aid,),
            ).fetchone()
            return row is not None

    def cancel_affiliate_earnings_for_charge(
        self, charge_id: str, *, reason: str, touch_paid_as_recovery: bool = False
    ) -> Dict[str, int]:
        """Cancel pending/payable; optionally mark paid rows recovery_due (disputes)."""
        cid = (charge_id or "").strip()
        if not cid:
            return {"cancelled": 0, "recovery": 0}
        now = _utc_now()
        reason = (reason or "").strip() or "refunded"
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.cancel_affiliate_earnings_for_charge(
                cid,
                reason=reason,
                now=now,
                touch_paid_as_recovery=touch_paid_as_recovery,
            )
        cancelled = 0
        recovery = 0
        with self._conn() as con:
            cur = con.execute(
                """
                UPDATE affiliate_earnings
                SET status = 'cancelled', cancelled_at = ?, cancellation_reason = ?,
                    payout_batch_id = NULL
                WHERE charge_id = ? AND status IN ('pending', 'payable')
                """,
                (now, reason, cid),
            )
            cancelled = int(cur.rowcount)
            if touch_paid_as_recovery:
                cur2 = con.execute(
                    """
                    UPDATE affiliate_earnings
                    SET status = 'recovery_due', cancelled_at = ?, cancellation_reason = ?
                    WHERE charge_id = ? AND status = 'paid'
                    """,
                    (now, reason, cid),
                )
                recovery = int(cur2.rowcount)
        return {"cancelled": cancelled, "recovery": recovery}

    def cancel_affiliate_earnings_for_invoice(self, invoice_id: str, *, reason: str) -> int:
        iid = (invoice_id or "").strip()
        if not iid:
            return 0
        now = _utc_now()
        reason = (reason or "").strip() or "refunded"
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.cancel_affiliate_earnings_for_invoice(iid, reason=reason, now=now)
        with self._conn() as con:
            cur = con.execute(
                """
                UPDATE affiliate_earnings
                SET status = 'cancelled', cancelled_at = ?, cancellation_reason = ?,
                    payout_batch_id = NULL
                WHERE invoice_id = ? AND status IN ('pending', 'payable')
                """,
                (now, reason, iid),
            )
            return int(cur.rowcount)

    def reverse_accruals_for_payment(self, payment_id: str, *, reason: str) -> int:
        now = _utc_now()
        rsn = (reason or "refunded")[:80]
        con = self._conn()
        try:
            con.execute("BEGIN IMMEDIATE")
            cur = con.execute(
                """
                UPDATE affiliate_accruals SET status = 'reversed'
                WHERE payment_id = ? AND status = 'accrued'
                """,
                (payment_id,),
            )
            n = int(cur.rowcount)
            if _affiliate_ledger_pg():
                from backend.economics import affiliate_ledger_postgres as alp

                try:
                    alp.cancel_affiliate_earnings_by_internal_payment(
                        payment_id, reason=rsn, now=now
                    )
                except BaseException:
                    con.rollback()
                    raise
            else:
                con.execute(
                    """
                    UPDATE affiliate_earnings
                    SET status = 'cancelled', cancelled_at = ?, cancellation_reason = ?,
                        payout_batch_id = NULL
                    WHERE internal_payment_id = ? AND status IN ('pending', 'payable')
                    """,
                    (now, rsn, payment_id),
                )
            con.commit()
            return n
        except BaseException:
            con.rollback()
            raise
        finally:
            con.close()

    def list_active_affiliate_ids(self) -> List[str]:
        with self._conn() as con:
            rows = con.execute(
                "SELECT id FROM affiliates WHERE status = 'active'"
            ).fetchall()
            return [str(r[0]) for r in rows]

    def list_affiliate_payout_batches(self, *, limit: int = 50) -> List[Dict[str, Any]]:
        lim = max(1, min(int(limit), 200))
        if _affiliate_ledger_pg():
            from backend.economics import affiliate_ledger_postgres as alp

            return alp.list_affiliate_payout_batches(limit=lim)
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT * FROM affiliate_payout_batches
                ORDER BY datetime(created_at) DESC
                LIMIT ?
                """,
                (lim,),
            ).fetchall()
            return [dict(r) for r in rows]

    def insert_operator_alert(
        self,
        *,
        alert_id: str,
        event_type: str,
        severity: str,
        payload: Dict[str, Any],
        batch_id: Optional[str] = None,
    ) -> None:
        now = _utc_now()
        aid = (alert_id or "").strip()
        et = (event_type or "").strip() or "unknown"
        sev = (severity or "info").strip() or "info"
        payload_json = json.dumps(payload, default=str, separators=(",", ":"))
        bid = (batch_id or "").strip() or None
        if _operator_alerts_pg():
            from backend.economics import operator_alerts_postgres as oap

            oap.insert_operator_alert(
                alert_id=aid,
                created_at_iso=now,
                event_type=et,
                severity=sev,
                payload_json=payload_json,
                batch_id=bid,
            )
            return
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO lawdog_operator_alerts (
                  id, created_at, event_type, severity, payload_json, batch_id
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (aid, now, et, sev, payload_json, bid),
            )

    def list_operator_alerts(self, *, limit: int = 100) -> List[Dict[str, Any]]:
        lim = max(1, min(int(limit), 500))
        if _operator_alerts_pg():
            from backend.economics import operator_alerts_postgres as oap

            return oap.list_operator_alerts(limit=lim)
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT id, created_at, event_type, severity, payload_json, batch_id
                FROM lawdog_operator_alerts
                ORDER BY datetime(created_at) DESC
                LIMIT ?
                """,
                (lim,),
            ).fetchall()
        out: List[Dict[str, Any]] = []
        for r in rows:
            d = dict(r)
            raw = d.get("payload_json")
            try:
                d["payload"] = json.loads(raw) if isinstance(raw, str) else {}
            except json.JSONDecodeError:
                d["payload"] = {"parse_error": True}
            del d["payload_json"]
            out.append(d)
        return out

    # --- affiliate access requests (private beta gating) ---

    def create_affiliate_access_request(
        self,
        *,
        request_id: str,
        org_id: Optional[str],
        email: Optional[str],
        request_type: str,
        doginal_pfp_number: Optional[int],
        dao_name: Optional[str],
        x_handle: Optional[str],
        note: Optional[str],
        ip_hash: Optional[str],
        request_fingerprint: Optional[str],
    ) -> Dict[str, Any]:
        rid = (request_id or "").strip() or str(uuid.uuid4())
        oid = (org_id or "").strip() or None
        em = (email or "").strip().lower() or None
        rtype = (request_type or "").strip().lower() or "other"
        dao = (dao_name or "").strip()[:160] or None
        xh = (x_handle or "").strip()[:64] or None
        nt = (note or "").strip()[:500] or None
        iph = (ip_hash or "").strip()[:96] or None
        fp = (request_fingerprint or "").strip()[:160] or None
        now = _utc_now()
        with self._conn() as con:
            con.execute("BEGIN IMMEDIATE")
            if oid:
                existing = con.execute(
                    """
                    SELECT * FROM affiliate_access_requests
                    WHERE org_id = ? AND status = 'pending'
                    ORDER BY datetime(created_at) DESC
                    LIMIT 1
                    """,
                    (oid,),
                ).fetchone()
                if existing:
                    con.commit()
                    return {"created": False, "request": dict(existing)}
            if fp:
                existing = con.execute(
                    """
                    SELECT * FROM affiliate_access_requests
                    WHERE request_fingerprint = ? AND status = 'pending'
                    ORDER BY datetime(created_at) DESC
                    LIMIT 1
                    """,
                    (fp,),
                ).fetchone()
                if existing:
                    con.commit()
                    return {"created": False, "request": dict(existing)}
            con.execute(
                """
                INSERT INTO affiliate_access_requests (
                  id, org_id, email, request_type, doginal_pfp_number, dao_name, x_handle, note,
                  status, ip_hash, request_fingerprint, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
                """,
                (rid, oid, em, rtype, doginal_pfp_number, dao, xh, nt, iph, fp, now, now),
            )
            row = con.execute(
                "SELECT * FROM affiliate_access_requests WHERE id = ? LIMIT 1", (rid,)
            ).fetchone()
            con.commit()
            return {"created": True, "request": dict(row) if row else None}

    def get_latest_affiliate_access_request(
        self, *, org_id: Optional[str], email: Optional[str]
    ) -> Optional[Dict[str, Any]]:
        oid = (org_id or "").strip()
        em = (email or "").strip().lower()
        with self._conn() as con:
            if oid:
                row = con.execute(
                    """
                    SELECT * FROM affiliate_access_requests
                    WHERE org_id = ?
                    ORDER BY datetime(created_at) DESC
                    LIMIT 1
                    """,
                    (oid,),
                ).fetchone()
                if row:
                    return dict(row)
            if em:
                row = con.execute(
                    """
                    SELECT * FROM affiliate_access_requests
                    WHERE email = ?
                    ORDER BY datetime(created_at) DESC
                    LIMIT 1
                    """,
                    (em,),
                ).fetchone()
                if row:
                    return dict(row)
            return None

    def list_affiliate_access_requests(
        self,
        *,
        status: Optional[str] = "pending",
        request_type: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        lim = max(1, min(int(limit), 500))
        clauses: List[str] = []
        vals: List[Any] = []
        st = (status or "").strip().lower()
        rt = (request_type or "").strip().lower()
        if st:
            clauses.append("status = ?")
            vals.append(st)
        if rt:
            clauses.append("request_type = ?")
            vals.append(rt)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._conn() as con:
            rows = con.execute(
                f"""
                SELECT * FROM affiliate_access_requests
                {where}
                ORDER BY datetime(created_at) DESC
                LIMIT ?
                """,
                (*vals, lim),
            ).fetchall()
            return [dict(r) for r in rows]

    def review_affiliate_access_request(
        self,
        *,
        request_id: str,
        status: str,
        reviewed_by: Optional[str],
        review_note: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        rid = (request_id or "").strip()
        if not rid:
            return None
        st = (status or "").strip().lower()
        if st not in ("approved", "declined", "duplicate", "spam"):
            raise ValueError("invalid_status")
        rb = (reviewed_by or "").strip()[:128] or None
        rn = (review_note or "").strip()[:500] or None
        now = _utc_now()
        with self._conn() as con:
            cur = con.execute(
                """
                UPDATE affiliate_access_requests
                SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?, updated_at = ?
                WHERE id = ?
                """,
                (st, rb, now, rn, now, rid),
            )
            if cur.rowcount < 1:
                return None
            row = con.execute(
                "SELECT * FROM affiliate_access_requests WHERE id = ? LIMIT 1", (rid,)
            ).fetchone()
            return dict(row) if row else None


_store: Optional[EconomicsStore] = None


def get_economics_store() -> EconomicsStore:
    global _store
    if _store is None:
        _store = EconomicsStore()
        _store.init_schema()
    return _store


def reset_economics_store_for_tests() -> None:
    global _store
    _store = None
