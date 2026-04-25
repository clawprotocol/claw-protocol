from __future__ import annotations

import os
from typing import Literal

FeedVisibility = Literal["private", "link_only", "public"]

# Layer 1 — frequent, feed-visible commitments (Dogecoin-first).
# Override with CLAW_FEED_EVENT_ANCHOR_NETWORK (must be in ALLOWED_AGREEMENT_ANCHOR_NETWORKS).


def feed_event_anchor_network_default() -> str:
    return os.getenv("CLAW_FEED_EVENT_ANCHOR_NETWORK", "dogecoin-testnet").strip()


# Layer 2 — stronger periodic settlement (Bitcoin); cadence is operator-driven (e.g. monthly).


def settlement_anchor_network_hint() -> str:
    """Display / config hint for Merkle settlement receipts (not the feed OP_RETURN lane)."""
    return os.getenv("CLAW_SETTLEMENT_ANCHOR_NETWORK_HINT", "bitcoin-testnet").strip()


def feed_public_api_enabled() -> bool:
    return os.getenv("CLAW_FEED_PUBLIC_API_ENABLED", "1").strip().lower() not in (
        "0",
        "false",
        "no",
    )


def feed_anchor_max_attempts() -> int:
    return max(1, int(os.getenv("CLAW_FEED_ANCHOR_MAX_ATTEMPTS", "8")))
