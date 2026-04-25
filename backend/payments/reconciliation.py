"""
Hourly-style reconciliation: stub provider pull + idempotent backfill via ``process_payment``.

Safe to run repeatedly; duplicates are suppressed by ``provider_payment_id`` UNIQUE.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, List

from backend.payments.adapters import paynow_adapter
from backend.payments.service import process_payment
from backend.payments.store import get_onramp_store


def list_stale_provider_orders_stub(*, provider: str) -> List[Dict[str, Any]]:
    """Stub: replace with real Coinbase/Ramp API polling when credentials exist."""
    _ = provider
    return []


def reconcile_hourly_cycle() -> Dict[str, Any]:
    """
    One reconciliation pass: merge stub provider rows + PayNow stub inbound.

    Returns summary counts (deterministic logging only).
    """
    applied = 0
    skipped = 0
    store = get_onramp_store()
    store.init_schema()

    for row in list_stale_provider_orders_stub(provider="coinbase"):
        r = process_payment("coinbase", row)
        if r.get("duplicate"):
            skipped += 1
        elif r.get("ok"):
            applied += 1
        else:
            skipped += 1

    known = set(store.list_crypto_receipt_tx_hashes())

    for row in paynow_adapter.poll_inbound_usdc_stub(org_id="reconcile_org", known_tx_hashes=known):
        norm = paynow_adapter.normalize_inbound_row(row)
        if not norm:
            continue
        pid, org_id, amt, txh = norm
        r = process_payment(
            "paynow",
            {
                "provider_payment_id": pid,
                "org_id": org_id,
                "amount_usd": amt,
                "tx_hash": txh,
            },
        )
        if r.get("duplicate"):
            skipped += 1
        elif r.get("ok"):
            applied += 1
        else:
            skipped += 1

    return {"ok": True, "applied": applied, "skipped_duplicates": skipped}
