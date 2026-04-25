"""
Canonical ledger event payloads for crypto onramp (sorted keys, stable decimals as strings).

Hashes use ``utils.canon_json.canon_sha256_hex`` — same family as CLAW proof code.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, Optional

from backend.utils.canon_json import canon_sha256_hex


def _money_str(v: Decimal) -> str:
    return str(v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def payment_received(*, payment_id: str, provider: str, amount_usd: Decimal) -> Dict[str, Any]:
    return {
        "amount_usd": _money_str(amount_usd),
        "currency": "USD",
        "payment_id": payment_id,
        "provider": provider,
        "type": "PaymentReceived",
    }


def crypto_received(*, payment_id: str, tx_hash: str, amount_usd: Decimal) -> Dict[str, Any]:
    return {
        "amount_usd": _money_str(amount_usd),
        "currency": "USD",
        "payment_id": payment_id,
        "tx_hash": tx_hash,
        "type": "CryptoReceived",
    }


def reserve_allocated(
    *, payment_id: str, org_id: str, amount_usd: Decimal
) -> Dict[str, Any]:
    return {
        "amount_usd": _money_str(amount_usd),
        "currency": "USD",
        "org_id": org_id,
        "payment_id": payment_id,
        "type": "ReserveAllocated",
    }


def claw_key_issued(*, org_id: str, payment_id: str, keys: int) -> Dict[str, Any]:
    return {
        "keys": int(keys),
        "org_id": org_id,
        "payment_id": payment_id,
        "type": "ClawKeyIssued",
    }


def reserve_released(*, reserve_id: str) -> Dict[str, Any]:
    return {
        "reserve_id": reserve_id,
        "type": "ReserveReleased",
    }


def event_sha256(event: Dict[str, Any]) -> str:
    return canon_sha256_hex(event)
