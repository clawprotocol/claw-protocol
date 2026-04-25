"""Deterministic onramp pricing constants (verifier-reproducible)."""

from __future__ import annotations

import os
from decimal import Decimal


def reserve_rate_monthly() -> Decimal:
    return Decimal("0.02")


def hold_days() -> int:
    return 120


def keys_per_usd() -> Decimal:
    raw = os.getenv("CLAW_KEYS_PER_USD", "").strip()
    if raw:
        return Decimal(raw)
    return Decimal("1")


def reserve_fraction() -> Decimal:
    """R = reserve_rate_monthly * (hold_days / 30)."""
    return reserve_rate_monthly() * (Decimal(hold_days()) / Decimal("30"))
