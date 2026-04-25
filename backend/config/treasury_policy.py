"""
Configurable treasury allocation (application-side accounting only — no on-chain movement here).

Policy version string bumps when percentages change; persisted on split events for auditability.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from decimal import Decimal
from typing import Tuple


DEFAULT_SPLIT_POLICY_VERSION = "treasury_split.v1"


@dataclass(frozen=True)
class TreasurySplitPolicy:
    """Fractions must sum to 1.0. Expressed as decimals for deterministic accounting."""

    version: str
    ops_bps: int
    reserve_bps: int
    pool_bps: int

    def validate(self) -> None:
        total = self.ops_bps + self.reserve_bps + self.pool_bps
        if total != 10_000:
            raise ValueError(f"treasury bps must sum to 10000, got {total}")


def treasury_split_policy_from_env() -> TreasurySplitPolicy:
    """
    Basis points (bps): 4000 = 40%. Defaults: ops 40%, reserve 30%, pool 30%.

    Env: ``CLAW_TREASURY_OPS_BPS``, ``CLAW_TREASURY_RESERVE_BPS``, ``CLAW_TREASURY_POOL_BPS``,
    ``CLAW_TREASURY_SPLIT_POLICY_VERSION``.
    """
    ops = int(os.getenv("CLAW_TREASURY_OPS_BPS", "4000"))
    reserve = int(os.getenv("CLAW_TREASURY_RESERVE_BPS", "3000"))
    pool = int(os.getenv("CLAW_TREASURY_POOL_BPS", "3000"))
    ver = os.getenv("CLAW_TREASURY_SPLIT_POLICY_VERSION", DEFAULT_SPLIT_POLICY_VERSION).strip() or DEFAULT_SPLIT_POLICY_VERSION
    p = TreasurySplitPolicy(version=ver, ops_bps=ops, reserve_bps=reserve, pool_bps=pool)
    p.validate()
    return p


def apply_split(*, gross: Decimal, policy: TreasurySplitPolicy) -> Tuple[Decimal, Decimal, Decimal]:
    """Return (ops, reserve, pool) amounts. Rounding: last bucket absorbs remainder."""
    if gross < 0:
        raise ValueError("gross amount must be non-negative")
    ops_amt = (gross * Decimal(policy.ops_bps) / Decimal(10_000)).quantize(Decimal("0.000001"))
    reserve_amt = (gross * Decimal(policy.reserve_bps) / Decimal(10_000)).quantize(Decimal("0.000001"))
    pool_amt = gross - ops_amt - reserve_amt
    return ops_amt, reserve_amt, pool_amt
