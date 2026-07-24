"""Commercial deny for legacy user-facing economics/gamification affiliate APIs.

Genesis Dogs use ``/v1/genesis-referral/affiliate/*`` only.
Privileged operator/admin affiliate routes are not gated here.
"""

from __future__ import annotations

from fastapi import HTTPException, Request

from backend.security.commercial_auth import commercial_mode_enforced

LEGACY_AFFILIATE_COMMERCIAL_DISABLED = "legacy_affiliate_commercial_disabled"


def deny_legacy_private_affiliate_in_commercial(request: Request) -> None:
    """Reject legacy private affiliate surfaces under commercial / production-like mode."""
    del request
    if not commercial_mode_enforced():
        return
    raise HTTPException(
        status_code=403,
        detail={"code": LEGACY_AFFILIATE_COMMERCIAL_DISABLED},
    )
