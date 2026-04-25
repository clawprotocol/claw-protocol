from __future__ import annotations

import os
from decimal import Decimal
from typing import Optional


def subscription_enabled() -> bool:
    return os.getenv("CLAW_SUBSCRIPTION_ENABLED", "1").strip().lower() not in ("0", "false", "no")


def usage_metering_enabled() -> bool:
    return os.getenv("CLAW_USAGE_METERING_ENABLED", "1").strip().lower() not in ("0", "false", "no")


def affiliate_default_bps() -> int:
    return max(0, min(10_000, int(os.getenv("CLAW_AFFILIATE_DEFAULT_BPS", "1000"))))


def affiliate_payout_threshold_usd() -> Decimal:
    """Weekly batch minimum (aligned with affiliate trust v1 default $25)."""
    return Decimal(os.getenv("CLAW_AFFILIATE_PAYOUT_THRESHOLD_USD", "25.00"))


def affiliate_maturity_days() -> int:
    return max(0, int(os.getenv("CLAW_AFFILIATE_MATURITY_DAYS", "14")))


def affiliate_stripe_hold_days() -> int:
    """Days after invoice.paid before a Stripe-sourced earning may become payable."""
    return max(0, int(os.getenv("CLAW_AFFILIATE_STRIPE_HOLD_DAYS", "21")))


def affiliate_first_payout_delay_days() -> int:
    """New affiliates: no disbursement until this many days after affiliate record creation."""
    return max(0, int(os.getenv("CLAW_AFFILIATE_FIRST_PAYOUT_DELAY_DAYS", "45")))


def payout_network() -> str:
    return os.getenv("CLAW_AFFILIATE_PAYOUT_NETWORK", "base").strip() or "base"


def payout_asset() -> str:
    return os.getenv("CLAW_AFFILIATE_PAYOUT_ASSET", "USDC").strip() or "USDC"


def affiliate_payout_chain_id() -> int:
    """EIP-155 chain id (Base mainnet = 8453)."""
    try:
        return int(os.getenv("CLAW_AFFILIATE_PAYOUT_CHAIN_ID", "8453").strip())
    except ValueError:
        return 8453


def affiliate_base_usdc_contract() -> str:
    """Native USDC on Base (Circle). Override for testnets."""
    return (
        os.getenv(
            "CLAW_AFFILIATE_BASE_USDC",
            "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        )
        .strip()
        or "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    )


def affiliate_payout_explorer_tx_url_template() -> str:
    return (
        os.getenv(
            "CLAW_AFFILIATE_EXPLORER_TX_URL",
            "https://basescan.org/tx/{tx_hash}",
        )
        .strip()
        or "https://basescan.org/tx/{tx_hash}"
    )


def affiliate_payout_safe_multisig_address() -> str:
    """Safe that executes USDC batches (for deep links / ops UI only; no keys in backend)."""
    return os.getenv("CLAW_AFFILIATE_PAYOUT_SAFE_ADDRESS", "").strip()


def affiliate_treasury_safe_balance_usdc_stub() -> Optional[Decimal]:
    """
    Optional stub for treasury requirement vs Safe USDC balance.

    - Unset env → None (unknown); summaries set safe_balance_usdc / shortfall_usdc to null.
    - Set to a decimal string → treated as on-chain USDC balance for shortfall math only.

    Live RPC balance lookup is intentionally not implemented here; wire CLAW_AFFILIATE_TREASURY_SAFE_USDC_BALANCE_STUB
    during weekly ops or replace with a future indexer.
    """
    raw = os.getenv("CLAW_AFFILIATE_TREASURY_SAFE_USDC_BALANCE_STUB", "").strip()
    if not raw:
        return None
    return Decimal(raw)


def affiliate_payout_wallet_cooling_days() -> int:
    """Days after a payout-wallet change before batch prepare may include the affiliate."""
    return max(0, int(os.getenv("CLAW_AFFILIATE_PAYOUT_WALLET_COOLING_DAYS", "7")))


def affiliate_require_tx_hash_for_mark_paid() -> bool:
    """Production-oriented paths should require a real 0x tx hash before marking paid."""
    env = os.getenv("CLAW_ENV", "").strip().lower()
    if env in ("production", "prod", "staging"):
        return True
    flag = os.getenv("CLAW_AFFILIATE_REQUIRE_PAID_TX_HASH", "").strip().lower()
    return flag in ("1", "true", "yes")
