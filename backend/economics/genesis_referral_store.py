"""
Genesis Referral Access — persistence helpers (SQLite economics DB).
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def ensure_genesis_referral_schema(con: sqlite3.Connection) -> None:
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS genesis_affiliates (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          referral_code TEXT NOT NULL UNIQUE,
          community_slug TEXT,
          affiliate_status TEXT NOT NULL DEFAULT 'active',
          payout_rate REAL NOT NULL DEFAULT 0.30,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_genesis_affiliates_user ON genesis_affiliates (user_id);
        CREATE INDEX IF NOT EXISTS idx_genesis_affiliates_status ON genesis_affiliates (affiliate_status);

        CREATE TABLE IF NOT EXISTS referral_attributions (
          id TEXT PRIMARY KEY,
          referral_code TEXT NOT NULL,
          referrer_user_id TEXT NOT NULL,
          visitor_id TEXT NOT NULL,
          referred_user_id TEXT,
          referred_org_id TEXT,
          first_seen_at TEXT NOT NULL,
          converted_at TEXT,
          source_path TEXT,
          metadata TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_ref_attr_code ON referral_attributions (referral_code);
        CREATE INDEX IF NOT EXISTS idx_ref_attr_visitor ON referral_attributions (visitor_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_ref_attr_visitor_code
          ON referral_attributions (visitor_id, referral_code);

        CREATE TABLE IF NOT EXISTS affiliate_commissions (
          id TEXT PRIMARY KEY,
          referrer_user_id TEXT NOT NULL,
          referred_user_id TEXT,
          referred_org_id TEXT NOT NULL,
          stripe_customer_id TEXT,
          stripe_subscription_id TEXT,
          stripe_invoice_id TEXT NOT NULL,
          gross_amount REAL NOT NULL,
          commission_rate REAL NOT NULL,
          commission_amount REAL NOT NULL,
          status TEXT NOT NULL,
          period_start TEXT,
          period_end TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          idempotency_key TEXT UNIQUE,
          void_reason TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_aff_comm_referrer_status
          ON affiliate_commissions (referrer_user_id, status);
        CREATE INDEX IF NOT EXISTS idx_aff_comm_invoice ON affiliate_commissions (stripe_invoice_id);

        CREATE TABLE IF NOT EXISTS genesis_payout_batches (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          status TEXT NOT NULL,
          total_commission_usd REAL NOT NULL,
          notes TEXT,
          exported_at TEXT,
          paid_at TEXT
        );

        CREATE TABLE IF NOT EXISTS genesis_payout_batch_items (
          id TEXT PRIMARY KEY,
          batch_id TEXT NOT NULL,
          commission_id TEXT NOT NULL,
          referrer_user_id TEXT NOT NULL,
          amount_usd REAL NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_genesis_payout_items_batch
          ON genesis_payout_batch_items (batch_id);
        """
    )


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {k: row[k] for k in row.keys()}


def normalize_referral_code(code: str) -> str:
    return "".join(ch for ch in (code or "").strip().upper() if ch.isalnum() or ch in "-_")[:64]


def get_genesis_affiliate_by_code(con: sqlite3.Connection, referral_code: str) -> Optional[Dict[str, Any]]:
    code = normalize_referral_code(referral_code)
    if not code:
        return None
    row = con.execute(
        "SELECT * FROM genesis_affiliates WHERE referral_code = ? COLLATE NOCASE",
        (code,),
    ).fetchone()
    return _row_to_dict(row) if row else None


def get_genesis_affiliate_by_user_id(con: sqlite3.Connection, user_id: str) -> Optional[Dict[str, Any]]:
    uid = (user_id or "").strip()
    if not uid:
        return None
    row = con.execute(
        "SELECT * FROM genesis_affiliates WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
        (uid,),
    ).fetchone()
    return _row_to_dict(row) if row else None


def upsert_genesis_affiliate(
    con: sqlite3.Connection,
    *,
    user_id: str,
    display_name: str,
    referral_code: str,
    community_slug: Optional[str] = None,
    affiliate_status: str = "active",
    payout_rate: float = 0.30,
) -> Dict[str, Any]:
    code = normalize_referral_code(referral_code)
    if not code:
        raise ValueError("invalid_referral_code")
    now = _utc_now_iso()
    uid = user_id.strip()
    existing = get_genesis_affiliate_by_code(con, code)
    # Prefer an existing row for this user so re-activate / double-submit cannot
    # create a second affiliate under a different generated code.
    if not existing:
        by_user = get_genesis_affiliate_by_user_id(con, uid)
        if by_user:
            existing = by_user
            code = normalize_referral_code(str(by_user.get("referral_code") or code)) or code
    if existing:
        con.execute(
            """
            UPDATE genesis_affiliates
            SET user_id = ?, display_name = ?, community_slug = ?, affiliate_status = ?,
                payout_rate = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                uid,
                display_name.strip()[:160],
                (community_slug or "").strip()[:80] or None,
                affiliate_status,
                float(payout_rate),
                now,
                existing["id"],
            ),
        )
        row = con.execute("SELECT * FROM genesis_affiliates WHERE id = ?", (existing["id"],)).fetchone()
        return _row_to_dict(row)

    aff_id = str(uuid.uuid4())
    con.execute(
        """
        INSERT INTO genesis_affiliates (
          id, user_id, display_name, referral_code, community_slug,
          affiliate_status, payout_rate, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            aff_id,
            uid,
            display_name.strip()[:160],
            code,
            (community_slug or "").strip()[:80] or None,
            affiliate_status,
            float(payout_rate),
            now,
            now,
        ),
    )
    row = con.execute("SELECT * FROM genesis_affiliates WHERE id = ?", (aff_id,)).fetchone()
    return _row_to_dict(row)


def record_referral_capture(
    con: sqlite3.Connection,
    *,
    referral_code: str,
    referrer_user_id: str,
    visitor_id: str,
    source_path: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    vid = (visitor_id or "").strip()
    code = normalize_referral_code(referral_code)
    if not vid or not code:
        raise ValueError("missing_visitor_or_code")
    now = _utc_now_iso()
    existing = con.execute(
        """
        SELECT * FROM referral_attributions
        WHERE visitor_id = ? AND referral_code = ? COLLATE NOCASE
        """,
        (vid, code),
    ).fetchone()
    if existing:
        return _row_to_dict(existing)
    attr_id = str(uuid.uuid4())
    meta_json = json.dumps(metadata or {}, separators=(",", ":"))
    con.execute(
        """
        INSERT INTO referral_attributions (
          id, referral_code, referrer_user_id, visitor_id,
          referred_user_id, referred_org_id, first_seen_at, converted_at,
          source_path, metadata
        ) VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?)
        """,
        (attr_id, code, referrer_user_id.strip(), vid, now, (source_path or "")[:500] or None, meta_json),
    )
    row = con.execute("SELECT * FROM referral_attributions WHERE id = ?", (attr_id,)).fetchone()
    return _row_to_dict(row)


def convert_referral_attribution(
    con: sqlite3.Connection,
    *,
    visitor_id: str,
    referral_code: str,
    referred_org_id: Optional[str] = None,
    referred_user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    vid = (visitor_id or "").strip()
    code = normalize_referral_code(referral_code)
    if not vid or not code:
        return None
    now = _utc_now_iso()
    row = con.execute(
        """
        SELECT * FROM referral_attributions
        WHERE visitor_id = ? AND referral_code = ? COLLATE NOCASE
        """,
        (vid, code),
    ).fetchone()
    if not row:
        aff = get_genesis_affiliate_by_code(con, code)
        if not aff or str(aff.get("affiliate_status") or "") != "active":
            return None
        return record_referral_capture(
            con,
            referral_code=code,
            referrer_user_id=str(aff["user_id"]),
            visitor_id=vid,
            metadata={"converted_inline": True},
        )
    attr = _row_to_dict(row)
    if attr.get("referrer_user_id") and referred_user_id:
        if str(attr["referrer_user_id"]).strip() == str(referred_user_id).strip():
            attr["self_referral"] = True
    sets: List[str] = ["converted_at = ?"]
    params: List[Any] = [now]
    if referred_user_id:
        sets.append("referred_user_id = ?")
        params.append(referred_user_id.strip())
    if referred_org_id:
        sets.append("referred_org_id = ?")
        params.append(referred_org_id.strip())
    params.append(attr["id"])
    con.execute(
        f"UPDATE referral_attributions SET {', '.join(sets)} WHERE id = ?",
        tuple(params),
    )
    updated = con.execute("SELECT * FROM referral_attributions WHERE id = ?", (attr["id"],)).fetchone()
    out = _row_to_dict(updated) if updated else attr
    if referred_user_id and str(out.get("referrer_user_id") or "").strip() == str(referred_user_id).strip():
        out["self_referral"] = True
    return out


def get_active_attribution_for_org(con: sqlite3.Connection, org_id: str) -> Optional[Dict[str, Any]]:
    oid = (org_id or "").strip()
    if not oid:
        return None
    row = con.execute(
        """
        SELECT * FROM referral_attributions
        WHERE referred_org_id = ? AND converted_at IS NOT NULL
        ORDER BY converted_at DESC LIMIT 1
        """,
        (oid,),
    ).fetchone()
    return _row_to_dict(row) if row else None


def count_non_voided_commissions_for_referred_org(
    con: sqlite3.Connection, referred_org_id: str
) -> int:
    """Non-voided commissions for a referred org — used to enforce first-invoice-only."""
    oid = (referred_org_id or "").strip()
    if not oid:
        return 0
    row = con.execute(
        """
        SELECT COUNT(*) FROM affiliate_commissions
        WHERE referred_org_id = ?
          AND COALESCE(status, '') NOT IN ('voided', 'refunded', 'canceled', 'cancelled')
        """,
        (oid,),
    ).fetchone()
    return int(row[0]) if row else 0


def insert_affiliate_commission(
    con: sqlite3.Connection,
    *,
    referrer_user_id: str,
    referred_org_id: str,
    stripe_invoice_id: str,
    gross_amount: Decimal,
    commission_rate: Decimal,
    commission_amount: Decimal,
    status: str = "pending",
    referred_user_id: Optional[str] = None,
    stripe_customer_id: Optional[str] = None,
    stripe_subscription_id: Optional[str] = None,
    period_start: Optional[str] = None,
    period_end: Optional[str] = None,
    idempotency_key: Optional[str] = None,
) -> Tuple[bool, Optional[str]]:
    now = _utc_now_iso()
    idem = idempotency_key or f"genesis:invoice:{stripe_invoice_id}"
    existing = con.execute(
        "SELECT id FROM affiliate_commissions WHERE idempotency_key = ?",
        (idem,),
    ).fetchone()
    if existing:
        return False, str(existing[0])
    comm_id = str(uuid.uuid4())
    try:
        con.execute(
            """
            INSERT INTO affiliate_commissions (
              id, referrer_user_id, referred_user_id, referred_org_id,
              stripe_customer_id, stripe_subscription_id, stripe_invoice_id,
              gross_amount, commission_rate, commission_amount, status,
              period_start, period_end, created_at, updated_at, idempotency_key
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                comm_id,
                referrer_user_id.strip(),
                (referred_user_id or "").strip() or None,
                referred_org_id.strip(),
                (stripe_customer_id or "").strip() or None,
                (stripe_subscription_id or "").strip() or None,
                stripe_invoice_id.strip(),
                float(gross_amount),
                float(commission_rate),
                float(commission_amount),
                status,
                period_start,
                period_end,
                now,
                now,
                idem,
            ),
        )
        return True, comm_id
    except sqlite3.IntegrityError:
        row = con.execute(
            "SELECT id FROM affiliate_commissions WHERE idempotency_key = ?",
            (idem,),
        ).fetchone()
        return False, str(row[0]) if row else None


def void_commissions_for_invoice(
    con: sqlite3.Connection,
    stripe_invoice_id: str,
    *,
    reason: str = "refunded",
) -> int:
    now = _utc_now_iso()
    cur = con.execute(
        """
        UPDATE affiliate_commissions
        SET status = 'void', void_reason = ?, updated_at = ?
        WHERE stripe_invoice_id = ? AND status IN ('pending', 'payable')
        """,
        (reason, now, stripe_invoice_id.strip()),
    )
    return int(cur.rowcount)


def void_commissions_for_charge_invoice_ids(
    con: sqlite3.Connection,
    invoice_ids: List[str],
    *,
    reason: str = "refunded",
) -> int:
    if not invoice_ids:
        return 0
    n = 0
    for inv in invoice_ids:
        n += void_commissions_for_invoice(con, inv, reason=reason)
    return n


def affiliate_dashboard_summary(con: sqlite3.Connection, referrer_user_id: str) -> Dict[str, Any]:
    """Dashboard summary for an *active* Genesis affiliate only — no data when inactive/absent."""
    from backend.security.genesis_affiliate_access import (
        GENESIS_AFFILIATE_ACCESS_DENIED,
        resolve_active_genesis_affiliate,
    )

    uid = referrer_user_id.strip()
    aff = resolve_active_genesis_affiliate(con, uid)
    if not aff:
        return {"ok": False, "error": GENESIS_AFFILIATE_ACCESS_DENIED}
    code = str(aff["referral_code"])
    referrals = con.execute(
        """
        SELECT COUNT(*) FROM referral_attributions
        WHERE referrer_user_id = ? AND converted_at IS NOT NULL
        """,
        (uid,),
    ).fetchone()[0]
    active_subs = con.execute(
        """
        SELECT COUNT(DISTINCT referred_org_id) FROM affiliate_commissions
        WHERE referrer_user_id = ? AND status IN ('pending', 'payable', 'paid')
        """,
        (uid,),
    ).fetchone()[0]
    pending = con.execute(
        """
        SELECT COALESCE(SUM(commission_amount), 0) FROM affiliate_commissions
        WHERE referrer_user_id = ? AND status = 'pending'
        """,
        (uid,),
    ).fetchone()[0]
    payable = con.execute(
        """
        SELECT COALESCE(SUM(commission_amount), 0) FROM affiliate_commissions
        WHERE referrer_user_id = ? AND status = 'payable'
        """,
        (uid,),
    ).fetchone()[0]
    paid = con.execute(
        """
        SELECT COALESCE(SUM(commission_amount), 0) FROM affiliate_commissions
        WHERE referrer_user_id = ? AND status = 'paid'
        """,
        (uid,),
    ).fetchone()[0]
    return {
        "ok": True,
        "affiliate": aff,
        "referral_link_path": f"/app/create?ref={code}",
        "converted_referrals": int(referrals),
        "active_referred_subscriptions": int(active_subs),
        "pending_commission_usd": round(float(pending), 2),
        "payable_commission_usd": round(float(payable), 2),
        "paid_commission_usd": round(float(paid), 2),
    }


def admin_ops_summary(con: sqlite3.Connection) -> Dict[str, Any]:
    affiliates = con.execute(
        "SELECT * FROM genesis_affiliates ORDER BY created_at DESC"
    ).fetchall()
    rows = []
    for a in affiliates:
        d = _row_to_dict(a)
        uid = str(d["user_id"])
        code = str(d.get("referral_code") or "")
        d["referral_link_path"] = f"/app/create?ref={code}" if code else ""
        d["capture_visits"] = int(
            con.execute(
                "SELECT COUNT(*) FROM referral_attributions WHERE referrer_user_id = ?",
                (uid,),
            ).fetchone()[0]
        )
        d["converted_referrals"] = int(
            con.execute(
                "SELECT COUNT(*) FROM referral_attributions WHERE referrer_user_id = ? AND converted_at IS NOT NULL",
                (uid,),
            ).fetchone()[0]
        )
        d["active_referred_subscriptions"] = int(
            con.execute(
                """
                SELECT COUNT(DISTINCT referred_org_id) FROM affiliate_commissions
                WHERE referrer_user_id = ? AND status IN ('pending', 'payable', 'paid')
                """,
                (uid,),
            ).fetchone()[0]
        )
        for status in ("pending", "payable", "paid", "void"):
            d[f"commission_{status}_usd"] = round(
                float(
                    con.execute(
                        """
                        SELECT COALESCE(SUM(commission_amount), 0)
                        FROM affiliate_commissions WHERE referrer_user_id = ? AND status = ?
                        """,
                        (uid, status),
                    ).fetchone()[0]
                ),
                2,
            )
        d["commission_total_usd"] = round(
            float(d["commission_pending_usd"])
            + float(d["commission_payable_usd"])
            + float(d["commission_paid_usd"]),
            2,
        )
        rows.append(d)
    return {"affiliates": rows, "count": len(rows)}


def commissions_csv_rows(con: sqlite3.Connection) -> List[Dict[str, Any]]:
    cur = con.execute(
        """
        SELECT c.*, a.display_name, a.referral_code
        FROM affiliate_commissions c
        LEFT JOIN genesis_affiliates a ON a.user_id = c.referrer_user_id
        ORDER BY c.created_at DESC
        """
    )
    return [_row_to_dict(r) for r in cur.fetchall()]
