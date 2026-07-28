"""Genesis Dog commercial entitlement — admin-granted account state.

Precedence for create access:
1. Active (non-expired) ``genesis_dog_entitlements`` row grants Genesis.
2. Explicit revoked or expired entitlement row denies Genesis (even if affiliate active).
3. Only when no entitlement row exists may an active ``genesis_affiliates`` row
   provide temporary legacy access (``grant_source=legacy_affiliate``).

``support_operator`` bootstrap must never write this table.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("claw.genesis_dog_entitlement")

STATUS_ACTIVE = "active"
STATUS_REVOKED = "revoked"

GRANT_SOURCE_ADMIN = "admin"
GRANT_SOURCE_LEGACY_MIGRATION = "legacy_migration"
GRANT_SOURCE_LEGACY_AFFILIATE = "legacy_affiliate"
GRANT_SOURCE_NONE = "none"

GENESIS_DOG_ENTITLEMENTS_DDL = """
CREATE TABLE IF NOT EXISTS genesis_dog_entitlements (
  user_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT,
  allowance_override INTEGER,
  grant_source TEXT NOT NULL DEFAULT 'admin',
  granted_by TEXT,
  granted_at TEXT NOT NULL,
  revoked_by TEXT,
  revoked_at TEXT,
  revoke_reason TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_genesis_dog_entitlements_status
  ON genesis_dog_entitlements (status);
"""

GENESIS_ACCESS_REQUESTS_DDL = """
CREATE TABLE IF NOT EXISTS genesis_access_requests (
  user_id TEXT PRIMARY KEY,
  requested_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  updated_at TEXT NOT NULL
);
"""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat().replace("+00:00", "Z")


def _parse_iso(ts: Optional[str]) -> Optional[datetime]:
    raw = (ts or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def is_commercially_active(row: Optional[Dict[str, Any]], now: Optional[datetime] = None) -> bool:
    if not row:
        return False
    if str(row.get("status") or "").strip().lower() != STATUS_ACTIVE:
        return False
    exp = _parse_iso(str(row.get("expires_at") or "") or None)
    if exp is None:
        return True
    dt = now or _utc_now()
    return dt < exp


def ensure_genesis_dog_entitlement_schema(con: Any) -> None:
    con.executescript(GENESIS_DOG_ENTITLEMENTS_DDL + GENESIS_ACCESS_REQUESTS_DDL)


def _row_dict(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    if isinstance(row, dict):
        return dict(row)
    return dict(row)


def get_entitlement(user_id: str) -> Optional[Dict[str, Any]]:
    uid = (user_id or "").strip()
    if not uid:
        return None
    from backend.usage_economics.store import get_usage_economics_store

    store = get_usage_economics_store()
    store.init_schema()
    if store._pg:  # noqa: SLF001
        from backend.usage_economics import usage_economics_postgres as uep

        return uep.get_genesis_dog_entitlement(uid)
    with store._conn() as con:  # noqa: SLF001
        ensure_genesis_dog_entitlement_schema(con)
        row = con.execute(
            "SELECT * FROM genesis_dog_entitlements WHERE user_id = ?",
            (uid,),
        ).fetchone()
        return _row_dict(row)


def grant_entitlement(
    *,
    user_id: str,
    granted_by: str,
    grant_source: str = GRANT_SOURCE_ADMIN,
    expires_at: Optional[str] = None,
    allowance_override: Optional[int] = None,
) -> Dict[str, Any]:
    uid = (user_id or "").strip()
    actor = (granted_by or "").strip()
    if not uid:
        raise ValueError("user_id is required")
    src = (grant_source or GRANT_SOURCE_ADMIN).strip() or GRANT_SOURCE_ADMIN
    now = _utc_now_iso()
    from backend.usage_economics.store import get_usage_economics_store

    store = get_usage_economics_store()
    store.init_schema()
    if store._pg:  # noqa: SLF001
        from backend.usage_economics import usage_economics_postgres as uep

        return uep.upsert_genesis_dog_entitlement(
            user_id=uid,
            status=STATUS_ACTIVE,
            expires_at=expires_at,
            allowance_override=allowance_override,
            grant_source=src,
            granted_by=actor or None,
            granted_at=now,
            revoked_by=None,
            revoked_at=None,
            revoke_reason=None,
            updated_at=now,
        )
    with store._conn() as con:  # noqa: SLF001
        ensure_genesis_dog_entitlement_schema(con)
        con.execute(
            """
            INSERT INTO genesis_dog_entitlements (
              user_id, status, expires_at, allowance_override, grant_source,
              granted_by, granted_at, revoked_by, revoked_at, revoke_reason, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              status = excluded.status,
              expires_at = excluded.expires_at,
              allowance_override = excluded.allowance_override,
              grant_source = excluded.grant_source,
              granted_by = excluded.granted_by,
              granted_at = excluded.granted_at,
              revoked_by = NULL,
              revoked_at = NULL,
              revoke_reason = NULL,
              updated_at = excluded.updated_at
            """,
            (uid, STATUS_ACTIVE, expires_at, allowance_override, src, actor or None, now, now),
        )
        row = con.execute(
            "SELECT * FROM genesis_dog_entitlements WHERE user_id = ?",
            (uid,),
        ).fetchone()
        return _row_dict(row) or {}


def revoke_entitlement(
    *,
    user_id: str,
    revoked_by: str,
    reason: str,
) -> Dict[str, Any]:
    uid = (user_id or "").strip()
    actor = (revoked_by or "").strip()
    why = (reason or "").strip()
    if not uid:
        raise ValueError("user_id is required")
    now = _utc_now_iso()
    before = get_entitlement(uid) or {}
    from backend.usage_economics.store import get_usage_economics_store

    store = get_usage_economics_store()
    store.init_schema()
    if store._pg:  # noqa: SLF001
        from backend.usage_economics import usage_economics_postgres as uep

        return uep.upsert_genesis_dog_entitlement(
            user_id=uid,
            status=STATUS_REVOKED,
            expires_at=before.get("expires_at"),
            allowance_override=before.get("allowance_override"),
            grant_source=str(before.get("grant_source") or GRANT_SOURCE_ADMIN),
            granted_by=before.get("granted_by"),
            granted_at=str(before.get("granted_at") or now),
            revoked_by=actor or None,
            revoked_at=now,
            revoke_reason=why or None,
            updated_at=now,
        )
    with store._conn() as con:  # noqa: SLF001
        ensure_genesis_dog_entitlement_schema(con)
        existing = con.execute(
            "SELECT * FROM genesis_dog_entitlements WHERE user_id = ?",
            (uid,),
        ).fetchone()
        if existing:
            con.execute(
                """
                UPDATE genesis_dog_entitlements
                SET status = ?, revoked_by = ?, revoked_at = ?, revoke_reason = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (STATUS_REVOKED, actor or None, now, why or None, now, uid),
            )
        else:
            con.execute(
                """
                INSERT INTO genesis_dog_entitlements (
                  user_id, status, expires_at, allowance_override, grant_source,
                  granted_by, granted_at, revoked_by, revoked_at, revoke_reason, updated_at
                ) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    uid,
                    STATUS_REVOKED,
                    GRANT_SOURCE_ADMIN,
                    actor or None,
                    now,
                    actor or None,
                    now,
                    why or None,
                    now,
                ),
            )
        row = con.execute(
            "SELECT * FROM genesis_dog_entitlements WHERE user_id = ?",
            (uid,),
        ).fetchone()
        return _row_dict(row) or {}


def record_genesis_access_request(user_id: str) -> Dict[str, Any]:
    """Open a Genesis access request without granting entitlement."""
    uid = (user_id or "").strip()
    if not uid:
        raise ValueError("user_id is required")
    now = _utc_now_iso()
    from backend.usage_economics.store import get_usage_economics_store

    store = get_usage_economics_store()
    store.init_schema()
    if store._pg:  # noqa: SLF001
        from backend.usage_economics import usage_economics_postgres as uep

        return uep.upsert_genesis_access_request(uid, now)
    with store._conn() as con:  # noqa: SLF001
        ensure_genesis_dog_entitlement_schema(con)
        con.execute(
            """
            INSERT INTO genesis_access_requests (user_id, requested_at, status, updated_at)
            VALUES (?, ?, 'open', ?)
            ON CONFLICT(user_id) DO UPDATE SET
              status = 'open',
              updated_at = excluded.updated_at
            """,
            (uid, now, now),
        )
        row = con.execute(
            "SELECT * FROM genesis_access_requests WHERE user_id = ?",
            (uid,),
        ).fetchone()
        return _row_dict(row) or {}


def has_open_genesis_access_request(user_id: str) -> bool:
    uid = (user_id or "").strip()
    if not uid:
        return False
    from backend.usage_economics.store import get_usage_economics_store

    store = get_usage_economics_store()
    store.init_schema()
    if store._pg:  # noqa: SLF001
        from backend.usage_economics import usage_economics_postgres as uep

        row = uep.get_genesis_access_request(uid)
        return bool(row and str(row.get("status") or "") == "open")
    with store._conn() as con:  # noqa: SLF001
        ensure_genesis_dog_entitlement_schema(con)
        row = con.execute(
            "SELECT status FROM genesis_access_requests WHERE user_id = ?",
            (uid,),
        ).fetchone()
        return bool(row and str(row[0] or "") == "open")


def list_active_affiliates_without_entitlement() -> List[str]:
    """Active genesis_affiliates user_ids that have no entitlement row (migration candidates)."""
    from backend.economics.genesis_referral_store import ensure_genesis_referral_schema
    from backend.economics.store import get_economics_store
    from backend.usage_economics.store import get_usage_economics_store

    eco = get_economics_store()
    eco.init_schema()
    ustore = get_usage_economics_store()
    ustore.init_schema()
    candidates: List[str] = []
    with eco._conn() as con:  # noqa: SLF001
        ensure_genesis_referral_schema(con)
        rows = con.execute(
            """
            SELECT user_id FROM genesis_affiliates
            WHERE lower(affiliate_status) = 'active'
            """
        ).fetchall()
        for r in rows:
            uid = str(r[0] if not isinstance(r, dict) else r.get("user_id") or "").strip()
            if uid and get_entitlement(uid) is None:
                candidates.append(uid)
    return candidates


def backfill_legacy_affiliate_grants(*, granted_by: str = "legacy_migration") -> Dict[str, int]:
    """Insert legacy_migration grants for active affiliates lacking an entitlement row."""
    inserted = 0
    skipped = 0
    candidates = list_active_affiliates_without_entitlement()
    # Re-query all active affiliates for skip accounting
    from backend.economics.genesis_referral_store import ensure_genesis_referral_schema
    from backend.economics.store import get_economics_store

    eco = get_economics_store()
    eco.init_schema()
    with eco._conn() as con:  # noqa: SLF001
        ensure_genesis_referral_schema(con)
        all_active = con.execute(
            "SELECT user_id FROM genesis_affiliates WHERE lower(affiliate_status) = 'active'"
        ).fetchall()
        active_ids = [
            str(r[0] if not isinstance(r, dict) else r.get("user_id") or "").strip()
            for r in all_active
        ]
    active_ids = [u for u in active_ids if u]
    for uid in active_ids:
        if get_entitlement(uid) is not None:
            skipped += 1
            continue
        grant_entitlement(
            user_id=uid,
            granted_by=granted_by,
            grant_source=GRANT_SOURCE_LEGACY_MIGRATION,
            expires_at=None,
            allowance_override=None,
        )
        inserted += 1
    return {
        "candidates": len(candidates),
        "active_affiliates": len(active_ids),
        "inserted": inserted,
        "skipped": skipped,
    }


def resolve_genesis_dog_access(user_id: str) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Return ``(active, grant_source, entitlement_row_or_none)``.

    ``grant_source`` is admin | legacy_migration | legacy_affiliate | none.
    """
    uid = (user_id or "").strip()
    if not uid:
        return False, GRANT_SOURCE_NONE, None

    row = get_entitlement(uid)
    if row is not None:
        if is_commercially_active(row):
            src = str(row.get("grant_source") or GRANT_SOURCE_ADMIN).strip() or GRANT_SOURCE_ADMIN
            return True, src, row
        # Explicit revoked or expired — deny even if affiliate is active.
        return False, GRANT_SOURCE_NONE, row

    # Temporary dual-read: active affiliate only when no entitlement row exists.
    from backend.economics.genesis_referral_store import ensure_genesis_referral_schema
    from backend.economics.store import get_economics_store
    from backend.security.genesis_affiliate_access import resolve_active_genesis_affiliate

    eco = get_economics_store()
    eco.init_schema()
    with eco._conn() as con:  # noqa: SLF001
        ensure_genesis_referral_schema(con)
        aff = resolve_active_genesis_affiliate(con, uid)
    if aff is not None:
        log.info(
            "genesis_legacy_affiliate_fallback user_id=%s affiliate_id=%s",
            uid,
            aff.get("id") or aff.get("referral_code"),
        )
        return True, GRANT_SOURCE_LEGACY_AFFILIATE, None
    return False, GRANT_SOURCE_NONE, None
