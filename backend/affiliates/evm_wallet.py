"""EVM payout wallet validation (no keys, no execution)."""

from __future__ import annotations

import re
from typing import Optional

_HEX_ADDR_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
_TX_HASH_RE = re.compile(r"^0x[a-fA-F0-9]{64}$")


def validate_evm_wallet_address(address: Optional[str]) -> str:
    """
    Require 0x + 40 hex chars. Normalize to EIP-55 checksum when possible.
    Raises ValueError with short code on failure.
    """
    if address is None:
        raise ValueError("invalid_wallet_empty")
    s = address.strip()
    if not s:
        raise ValueError("invalid_wallet_empty")
    if not _HEX_ADDR_RE.match(s):
        raise ValueError("invalid_wallet_format")
    try:
        from eth_utils import to_checksum_address

        return to_checksum_address(s)
    except Exception:
        return "0x" + s[2:].lower()


def is_valid_evm_wallet_address(address: Optional[str]) -> bool:
    try:
        validate_evm_wallet_address(address)
        return True
    except ValueError:
        return False


def is_valid_evm_tx_hash(value: Optional[str]) -> bool:
    s = (value or "").strip()
    return bool(_TX_HASH_RE.match(s))
