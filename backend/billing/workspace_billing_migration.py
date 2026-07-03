"""Move entitled billing rows when a browser workspace org binds to a stable user org."""

from __future__ import annotations

import logging
from typing import Optional

from backend.billing.subscription_authority import is_subscription_entitled
from backend.economics.store import EconomicsStore

_log = logging.getLogger("claw.billing.workspace_migration")


def migrate_entitled_subscription_to_org(
    economics: EconomicsStore,
    *,
    from_org_id: str,
    to_org_id: str,
    user_id: Optional[str] = None,
) -> bool:
    """
    Move the entitled subscription (and Stripe org mirrors) from ``from_org_id`` to ``to_org_id``.

    No-op when the source org has no entitled subscription or the destination already has one.
    """
    src = (from_org_id or "").strip()
    dst = (to_org_id or "").strip()
    if not src or not dst or src == dst:
        return False

    economics.init_schema()
    from_row = economics.get_subscription_by_org(src)
    if not is_subscription_entitled(from_row):
        return False

    to_row = economics.get_subscription_by_org(dst)
    if is_subscription_entitled(to_row):
        return False

    uid = (user_id or "").strip() or None
    economics.migrate_workspace_billing_org(from_org_id=src, to_org_id=dst, user_id=uid)
    _log.info("workspace_billing_migrated from=%s to=%s user_id=%s", src, dst, uid or "")
    return True
