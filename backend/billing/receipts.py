"""Helpers for deterministic usage receipt fields (no floats in hashed payloads)."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Tuple, Union


def money_decimal_str(amount: float) -> str:
    return str(Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def normalize_unit_count(unit_count: float) -> Union[int, str]:
    d = Decimal(str(unit_count))
    if d == d.to_integral_value():
        return int(d)
    return str(d.normalize())


def aggregate_payment_sources(
    rows: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Rows with payment_id, amount_usd — one entry per payment_id, sorted."""
    by_pay: Dict[str, float] = {}
    for r in rows:
        pid = str(r.get("payment_id") or "")
        if pid not in by_pay:
            by_pay[pid] = float(r.get("amount_usd") or 0.0)
    out: List[Dict[str, Any]] = []
    for pid in sorted(by_pay.keys()):
        out.append(
            {
                "amount_usd": money_decimal_str(by_pay[pid]),
                "payment_id": pid,
            }
        )
    return out
