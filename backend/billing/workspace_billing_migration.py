"""Move entitled billing rows when a browser workspace org binds to a stable user org."""

from __future__ import annotations

import logging
from typing import Optional, Sequence

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
    Idempotent when destination already holds the same entitled row.
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
    verified_anon_source_org_id: Optional[str] = None,
    bind_previous_org_id: Optional[str] = None,
) -> bool:
    """
    Server-side migration guard. Never trusts client-supplied repair org lists.

    Allows migration when the source subscription is entitled and:
    - ``user_id`` on the subscription row matches the bound user, or
    - source is a verified anonymous org from the bind/checkout session.
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

    if src.startswith("anon-"):
        verified = normalize_workspace_org_id(verified_anon_source_org_id or "")
        bind_prev = normalize_workspace_org_id(bind_previous_org_id or "")
        if verified and verified == src:
            return True
        if bind_prev == src and verified == src:
            return True
        return False

    return False


def derive_server_migration_source_orgs(
    *,
    bound_org_id: str,
    user_id: str,
    bind_previous_org_id: Optional[str] = None,
    verified_anon_org_id: Optional[str] = None,
    usage_store=None,
) -> list[str]:
    """Derive migration source org candidates from server-verified bind context only."""
    bound = normalize_workspace_org_id(bound_org_id)
    uid = (user_id or "").strip()
    if not bound or not uid or not bound.startswith("user-"):
        return []

    out: list[str] = []
    prev = normalize_workspace_org_id(bind_previous_org_id or "")
    if prev and prev != bound and prev not in out:
        out.append(prev)
    verified = normalize_workspace_org_id(verified_anon_org_id or "")
    if verified and verified != bound and verified not in out:
        out.append(verified)
    return out


def repair_bound_user_workspace_entitlement(
    economics: EconomicsStore,
    *,
    user_id: str,
    bound_org_id: str,
    candidate_source_org_ids: Sequence[str],
    usage_store=None,
    verified_anon_source_org_id: Optional[str] = None,
    bind_previous_org_id: Optional[str] = None,
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
            verified_anon_source_org_id=verified_anon_source_org_id,
            bind_previous_org_id=bind_previous_org_id,
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
    """
    Legacy header parser — ignored for authority. Kept for compatibility/logging only.
    """
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
