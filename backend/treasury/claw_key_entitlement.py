"""
Map persisted CLAW Keys → backend ``Tier`` for ``principal_from_request`` when enabled.
"""

from __future__ import annotations

from typing import Optional

from backend.utils.tiers import Tier

# Product tier strings on CLAW Key → existing proof/usage ``Tier`` (API / agent limits).
CLAW_KEY_TIER_TO_BACKEND_TIER: dict[str, Tier] = {
    "free": Tier.PROOF,
    "standard": Tier.ASSISTED,
    "premium": Tier.PRO,
    "admin": Tier.INSTITUTIONAL,
}


def backend_tier_rank(t: Tier) -> int:
    return {
        Tier.PROOF: 0,
        Tier.ASSISTED: 1,
        Tier.BUILDER: 2,
        Tier.PRO: 3,
        Tier.INSTITUTIONAL: 4,
    }.get(t, 0)


def resolve_backend_tier_from_claw_key_row(row: Optional[dict]) -> Optional[Tier]:
    if not row:
        return None
    raw = str(row.get("tier") or "").strip().lower()
    return CLAW_KEY_TIER_TO_BACKEND_TIER.get(raw)
