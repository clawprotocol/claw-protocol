"""Active Genesis Dog authorization — reusable server authority.

Ordinary authenticated users and paused/revoked Genesis rows are denied.
Privileged operator/admin access is separate (``privileged_ops``).
"""

from __future__ import annotations

import sqlite3
from typing import Any, Dict, Optional

from fastapi import HTTPException

from backend.economics.genesis_referral_store import get_genesis_affiliate_by_user_id

GENESIS_AFFILIATE_ACCESS_DENIED = "genesis_affiliate_access_denied"
_ACTIVE_STATUS = "active"


def resolve_active_genesis_affiliate(
    con: sqlite3.Connection, user_id: str
) -> Optional[Dict[str, Any]]:
    """Return the affiliate row only when ``affiliate_status == active``."""
    uid = (user_id or "").strip()
    if not uid:
        return None
    aff = get_genesis_affiliate_by_user_id(con, uid)
    if not aff:
        return None
    if str(aff.get("affiliate_status") or "").strip().lower() != _ACTIVE_STATUS:
        return None
    return aff


def require_active_genesis_affiliate(con: sqlite3.Connection, user_id: str) -> Dict[str, Any]:
    """Raise 403 with a stable non-sensitive reason when access is not active Genesis."""
    aff = resolve_active_genesis_affiliate(con, user_id)
    if not aff:
        raise HTTPException(
            status_code=403,
            detail={"code": GENESIS_AFFILIATE_ACCESS_DENIED},
        )
    return aff


def active_genesis_access_payload(con: sqlite3.Connection, user_id: str) -> Dict[str, Any]:
    """Minimal authenticated probe for UI gating — no commission/referral fields."""
    allowed = resolve_active_genesis_affiliate(con, user_id) is not None
    if allowed:
        return {"ok": True, "allowed": True}
    return {"ok": True, "allowed": False, "reason": GENESIS_AFFILIATE_ACCESS_DENIED}
