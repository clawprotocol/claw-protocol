"""Move entitled billing rows when a browser workspace org binds to a stable user org."""

from __future__ import annotations

import logging
from typing import Iterable, Optional, Sequence

from backend.billing.subscription_authority import is_subscription_entitled
from backend.economics.store import EconomicsStore

_log = logging.getLogger("claw.billing.workspace_migration")

ENTITLEMENT_REPAIR_REQUEST_HEADER = "X-Claw-Entitlement-Repair-Org"


def normalize_workspace_org_id(raw: str) -> str:
    """Accept bare org ids and ``org:`` subject prefixes from clients."""
    s = (raw or "").strip()
    if s.startswith("org:"):
        s = s[4:].strip()
    return s


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
    src = normalize_workspace_org_id(from_org_id)
    dst = normalize_workspace_org_id(to_org_id)
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


def _bound_org_has_workspace_agreements(*, subject_ref: str, usage_store) -> bool:
    try:
        usage_store.init_schema()
        incomplete = int(usage_store.count_incomplete_agreements(subject_ref) or 0)
        completed = int(usage_store.count_completed_agreements(subject_ref) or 0)
        return incomplete + completed > 0
    except Exception:
        _log.exception("workspace_agreement_count_failed subject=%s", subject_ref)
        return False


def can_migrate_subscription_source(
    economics: EconomicsStore,
    *,
    source_org_id: str,
    bound_org_id: str,
    user_id: str,
    usage_store=None,
    require_client_repair_signal: bool = False,
) -> bool:
    """
    Guard migration so free users cannot inherit a stranger's ``local-org`` subscription.

    Allows migration when the source subscription is entitled and either:
    - ``user_id`` on the subscription row matches the bound user, or
    - the client explicitly supplied the source org for repair, or
    - ``local-org`` has an anonymous subscription and the bound org already owns agreements.
    """
    src = normalize_workspace_org_id(source_org_id)
    dst = normalize_workspace_org_id(bound_org_id)
    uid = (user_id or "").strip()
    if not src or not dst or src == dst or not uid:
        return False

    economics.init_schema()
    row = economics.get_subscription_by_org(src)
    if not is_subscription_entitled(row):
        return False

    sub_uid = str(row.get("user_id") or "").strip()
    if sub_uid:
        return sub_uid == uid

    if require_client_repair_signal:
        return True

    if src == "local-org" and usage_store is not None:
        return _bound_org_has_workspace_agreements(subject_ref=f"org:{dst}", usage_store=usage_store)

    return False


def repair_bound_user_workspace_entitlement(
    economics: EconomicsStore,
    *,
    user_id: str,
    bound_org_id: str,
    candidate_source_org_ids: Sequence[str],
    usage_store=None,
    require_client_repair_signal: bool = False,
) -> bool:
    """Repair orphaned Pro subscriptions for already-bound ``user-{id}`` workspaces."""
    bound = normalize_workspace_org_id(bound_org_id)
    uid = (user_id or "").strip()
    if not bound or not uid or not bound.startswith("user-"):
        return False

    economics.init_schema()
    if is_subscription_entitled(economics.get_subscription_by_org(bound)):
        return False

    seen: set[str] = set()
    for raw in candidate_source_org_ids:
        src = normalize_workspace_org_id(raw)
        if not src or src == bound or src in seen:
            continue
        seen.add(src)
        if not can_migrate_subscription_source(
            economics,
            source_org_id=src,
            bound_org_id=bound,
            user_id=uid,
            usage_store=usage_store,
            require_client_repair_signal=require_client_repair_signal,
        ):
            continue
        if migrate_entitled_subscription_to_org(
            economics,
            from_org_id=src,
            to_org_id=bound,
            user_id=uid,
        ):
            return True
    return False


def entitlement_repair_candidates_from_header(request) -> list[str]:
    """Parse optional repair org header(s) from agreement API requests."""
    out: list[str] = []
    single = normalize_workspace_org_id(request.headers.get(ENTITLEMENT_REPAIR_REQUEST_HEADER) or "")
    if single:
        out.append(single)
    multi_raw = (request.headers.get("X-Claw-Entitlement-Repair-Orgs") or "").strip()
    if multi_raw:
        for part in multi_raw.split(","):
            oid = normalize_workspace_org_id(part)
            if oid and oid not in out:
                out.append(oid)
    return out
