"""Generate and persist UsageReceipt records (proof-coupled metering)."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

import sqlite3

from backend.billing.receipts import aggregate_payment_sources, normalize_unit_count
from backend.economics.store import EconomicsStore, get_economics_store
from backend.proof.receipt import USAGE_RECEIPT_VERSION, build_usage_receipt_body_and_hash
from backend.utils.canon_json import canon_json_bytes


def _row_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return dict(row)


def build_usage_receipt_from_db_row(
    usage_row: Dict[str, Any], allocation_rows: List[Dict[str, Any]]
) -> Tuple[Dict[str, Any], str]:
    before = usage_row.get("keys_balance_before")
    after = usage_row.get("keys_balance_after")
    if before is None or after is None:
        raise ValueError("usage event missing balance snapshots")
    payment_sources = aggregate_payment_sources(allocation_rows)
    uc = normalize_unit_count(float(usage_row["unit_count"]))
    return build_usage_receipt_body_and_hash(
        usage_event_id=str(usage_row["id"]),
        org_id=str(usage_row["org_id"]),
        user_id=usage_row.get("user_id"),
        service_type=str(usage_row["service_type"]),
        unit_count=uc,
        key_cost=int(usage_row["key_cost"]),
        keys_balance_before=int(before),
        keys_balance_after=int(after),
        payment_sources=payment_sources,
        timestamp=str(usage_row["created_at"]),
        version=USAGE_RECEIPT_VERSION,
    )


def persist_usage_receipt_tx(con: sqlite3.Connection, usage_event_id: str) -> Tuple[str, str]:
    row = con.execute(
        "SELECT * FROM usage_events WHERE id = ?", (usage_event_id,)
    ).fetchone()
    if row is None:
        raise ValueError("usage_event not found")
    u = _row_dict(row)
    allocs = [
        _row_dict(r)
        for r in con.execute(
            """
            SELECT payment_id, keys_allocated, amount_usd FROM usage_payment_allocation
            WHERE usage_event_id = ? ORDER BY payment_id ASC, id ASC
            """,
            (usage_event_id,),
        ).fetchall()
    ]
    body, h = build_usage_receipt_from_db_row(u, allocs)
    payload = canon_json_bytes(body).decode("utf-8")
    con.execute(
        """
        INSERT INTO usage_receipts (
          usage_event_id, receipt_hash_sha256, canonical_json, created_at
        ) VALUES (?, ?, ?, ?)
        """,
        (usage_event_id, h, payload, u["created_at"]),
    )
    return h, payload


def generate_usage_receipt(
    usage_event_id: str, economics: Optional[EconomicsStore] = None
) -> Dict[str, Any]:
    """Load from DB, build canonical body + hash (idempotent if already stored)."""
    eco = economics or get_economics_store()
    eco.init_schema()
    existing = eco.get_usage_receipt(usage_event_id)
    if existing:
        body = json.loads(existing["canonical_json"])
        return {
            "usage_event_id": usage_event_id,
            "receipt_hash_sha256": existing["receipt_hash_sha256"],
            "usage_receipt": body,
        }
    row = eco.get_usage_event(usage_event_id)
    if not row:
        raise ValueError("usage_event not found")
    allocs = eco.list_usage_payment_allocations(usage_event_id)
    body, h = build_usage_receipt_from_db_row(row, allocs)
    payload = canon_json_bytes(body).decode("utf-8")
    eco.insert_usage_receipt(
        usage_event_id=usage_event_id,
        receipt_hash_sha256=h,
        canonical_json=payload,
        created_at=str(row["created_at"]),
    )
    return {
        "usage_event_id": usage_event_id,
        "receipt_hash_sha256": h,
        "usage_receipt": body,
    }
