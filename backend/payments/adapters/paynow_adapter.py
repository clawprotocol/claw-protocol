from __future__ import annotations

import os
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple


def base_usdc_rpc_url() -> str:
    return os.getenv("PAYNOW_BASE_RPC_URL", "").strip()


def watched_wallet() -> str:
    return os.getenv("PAYNOW_BASE_WATCH_WALLET", "").strip()


def poll_inbound_usdc_stub(
    *,
    org_id: str,
    known_tx_hashes: Optional[set[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Stub watcher: no chain RPC assumed.

    Returns synthetic pending rows only when ``PAYNOW_SMOKE_INBOUND=1`` (non-production helper).
    """
    known = known_tx_hashes or set()
    if os.getenv("PAYNOW_SMOKE_INBOUND", "").strip() != "1":
        return []
    if "paynow_smoke_tx_1" in known:
        return []
    return [
        {
            "amount_usd": Decimal("25.00"),
            "org_id": org_id,
            "provider_payment_id": "paynow_smoke_1",
            "tx_hash": "paynow_smoke_tx_1",
        }
    ]


def normalize_inbound_row(row: Dict[str, Any]) -> Optional[Tuple[str, str, Decimal, str]]:
    pid = str(row.get("provider_payment_id") or "").strip()
    org_id = str(row.get("org_id") or "").strip()
    tx = str(row.get("tx_hash") or "").strip()
    amt = row.get("amount_usd")
    if not pid or not org_id or not tx or amt is None:
        return None
    return (pid, org_id, Decimal(str(amt)), tx)
