"""USD → USDC (1:1) for Base payouts — ledger stays USD; on-chain uses USDC base units."""

from __future__ import annotations

from decimal import Decimal, ROUND_DOWN
from typing import Tuple

USDC_DECIMALS = 6


def convert_usd_to_usdc(amount_usd: Decimal) -> Tuple[str, str, int]:
    """
    1:1 USD to USDC. USDC on Base uses 6 decimals.

    Returns:
        amount_usdc_decimal_18: string fixed to 18 fractional digits (storage / display)
        amount_usdc_decimal_6: string fixed to 6 fractional digits (token precision)
        amount_base_units: uint256 value for ERC-20 transfer (10**6 per USDC)
    """
    d = Decimal(str(amount_usd))
    if d < 0:
        d = Decimal("0")
    d = d.quantize(Decimal("1").scaleb(-USDC_DECIMALS), rounding=ROUND_DOWN)
    base_units = int((d * Decimal(10**USDC_DECIMALS)).quantize(Decimal(1), rounding=ROUND_DOWN))
    amt = Decimal(base_units) / Decimal(10**USDC_DECIMALS)
    s6 = f"{amt:.{USDC_DECIMALS}f}"
    s18 = f"{amt:.18f}"
    return s18, s6, base_units
