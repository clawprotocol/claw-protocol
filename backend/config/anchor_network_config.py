from __future__ import annotations

"""
Anchor network labels and block-count hints for timeline / Merkle / feed paths.

**Canonical proof chain** for launch is **Bitcoin**; Dogecoin is **mirror-only** when enabled
(see ``backend/anchoring/config.py`` and ``docs/ops/ANCHORING_LAUNCH_RUNBOOK.md``).
"""

import os
from dataclasses import dataclass
from typing import Literal, Mapping

AnchorMode = Literal["batch"]

# 24-hour-equivalent block counts (production scheduling hints; operators drive actual cron/block checks).
BITCOIN_DAILY_EQUIVALENT_BLOCK_COUNT_DEFAULT = 144
DOGECOIN_DAILY_EQUIVALENT_BLOCK_COUNT_DEFAULT = 1440


@dataclass(frozen=True)
class AnchorNetworkConfig:
    """Config-driven anchor target (remote RPC / hosted nodes)."""

    network: str
    enabled: bool
    rpc_url: str | None
    rpc_user: str | None
    rpc_password: str | None
    cookie_path: str | None
    daily_equivalent_block_count: int
    anchor_mode: AnchorMode


def daily_equivalent_block_count_for_network(network: str) -> int:
    n = (network or "").strip().lower()
    if n.startswith("dogecoin"):
        return DOGECOIN_DAILY_EQUIVALENT_BLOCK_COUNT_DEFAULT
    return BITCOIN_DAILY_EQUIVALENT_BLOCK_COUNT_DEFAULT


def anchor_cadence_summary() -> Mapping[str, int]:
    """Stable defaults for API/version responses."""
    return {
        "bitcoin-mainnet": BITCOIN_DAILY_EQUIVALENT_BLOCK_COUNT_DEFAULT,
        "bitcoin-testnet": BITCOIN_DAILY_EQUIVALENT_BLOCK_COUNT_DEFAULT,
        "dogecoin-mainnet": DOGECOIN_DAILY_EQUIVALENT_BLOCK_COUNT_DEFAULT,
        "dogecoin-testnet": DOGECOIN_DAILY_EQUIVALENT_BLOCK_COUNT_DEFAULT,
    }


def agreement_receipt_protocol_version() -> str:
    return os.getenv("CLAW_AGREEMENT_RECEIPT_PROTOCOL_VERSION", "agreement_receipt.v1").strip()


ALLOWED_AGREEMENT_ANCHOR_NETWORKS = frozenset(
    {
        "bitcoin-mainnet",
        "bitcoin-testnet",
        "dogecoin-mainnet",
        "dogecoin-testnet",
    }
)
