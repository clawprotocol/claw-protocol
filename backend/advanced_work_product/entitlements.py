"""Map billing plan → Advanced Work Product access tier (separate from proof / receipts)."""
from __future__ import annotations

import os
from typing import Literal

from backend.billing import subscriptions as subs
from backend.economics.store import EconomicsStore, get_economics_store

AwpTier = Literal["none", "limited", "full"]


def awp_tier_for_org(org_id: str, economics: EconomicsStore | None = None) -> AwpTier:
    """
    - none: no paid plan or free/trial
    - limited: starter-class (~ entry paid) — executive summary + issue analysis only
    - full: pro / enterprise — entire suite

    Override for tests/ops: CLAW_AWP_FORCE_TIER=none|limited|full
    """
    forced = os.getenv("CLAW_AWP_FORCE_TIER", "").strip().lower()
    if forced in ("none", "limited", "full"):
        return forced  # type: ignore[return-value]

    oid = (org_id or "").strip()
    if not oid:
        return "none"
    eco = economics or get_economics_store()
    eco.init_schema()
    row = subs.get_subscription_for_org(eco, oid)
    if not row:
        return "none"
    if str(row.get("status") or "").lower() != "active":
        return "none"
    code = str(row.get("plan_code") or "").lower().strip()
    if not code or code in ("free", "trial"):
        return "none"
    if code in ("pro", "enterprise", "team", "institutional"):
        return "full"
    if code == "starter":
        return "limited"
    # Unknown paid code: conservative limited
    return "limited"
