"""Capability map for humane downgrade: read/export survive; create/premium mutate paths gate on plan."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict

from fastapi import Request

from backend.agreement_memory.access import agreement_memory_tier_for_subject
from backend.usage_economics import constants as uc
from backend.usage_economics.policy import subject_has_paid_plan, usage_economics_enabled
from backend.usage_economics.store import get_usage_economics_store
from backend.utils.enforce import principal_from_request, resolve_subject_from_request
from backend.utils.tiers import TIERS, Capability
from backend.utils.usage_store import UsageStore


@dataclass(frozen=True)
class HumaneAccessCapabilities:
    can_view_records: bool
    can_export_records: bool
    can_bulk_export: bool
    can_create_records: bool
    can_modify_records: bool
    can_request_anchor_upgrade: bool
    can_request_priority_anchor: bool
    can_use_ai_organization: bool
    can_bulk_archive: bool

    def as_dict(self) -> Dict[str, bool]:
        return {
            "can_view_records": self.can_view_records,
            "can_export_records": self.can_export_records,
            "can_bulk_export": self.can_bulk_export,
            "can_create_records": self.can_create_records,
            "can_modify_records": self.can_modify_records,
            "can_request_anchor_upgrade": self.can_request_anchor_upgrade,
            "can_request_priority_anchor": self.can_request_priority_anchor,
            "can_use_ai_organization": self.can_use_ai_organization,
            "can_bulk_archive": self.can_bulk_archive,
        }


def _abuse_blocked(subject_ref: str) -> bool:
    if not usage_economics_enabled():
        return False
    store = get_usage_economics_store()
    store.init_schema()
    row = store.get_subject_row(subject_ref)
    return bool(row and int(row.get("abuse_flag") or 0))


def _create_allowed(subject_ref: str) -> bool:
    """Approximates draft-create eligibility without raising (for capability hints)."""
    if not usage_economics_enabled():
        return True
    if _abuse_blocked(subject_ref):
        return False
    if subject_has_paid_plan(subject_ref):
        return True
    store = get_usage_economics_store()
    store.init_schema()
    incomplete = store.count_incomplete_agreements(subject_ref)
    return incomplete < uc.FREE_MAX_ACTIVE_DRAFTS


def resolve_humane_capabilities(
    request: Request,
    *,
    usage_store: UsageStore | None = None,
) -> HumaneAccessCapabilities:
    """
    Paid status gates **actions**, not retrieval of existing user-owned records.

    View/export/bulk_export remain allowed so downgraded users keep easy exit.
    """
    subject_ref = resolve_subject_from_request(request)
    principal = principal_from_request(request)
    paid = subject_has_paid_plan(subject_ref)
    limits = TIERS[principal.tier]
    store = usage_store or UsageStore()

    mem_tier = agreement_memory_tier_for_subject(subject_ref)

    allow_anchor = bool(limits.allow_free_anchor)
    priority_ok = Capability.PRIORITY_ANCHOR in limits.allowed
    try:
        if priority_ok:
            snap = store.snapshot(principal.subject)
            if snap.priority_anchors_day >= limits.free_anchor_per_day:
                priority_ok = False
    except Exception:
        priority_ok = False

    force_export = os.getenv("CLAW_FORCE_EXPORT_ALWAYS", "1").strip().lower() not in ("0", "false", "no")

    return HumaneAccessCapabilities(
        can_view_records=True,
        can_export_records=bool(force_export or True),
        can_bulk_export=bool(force_export or True),
        can_create_records=_create_allowed(subject_ref),
        can_modify_records=not _abuse_blocked(subject_ref),
        can_request_anchor_upgrade=allow_anchor,
        can_request_priority_anchor=priority_ok and paid,
        can_use_ai_organization=mem_tier != "none",
        can_bulk_archive=paid,
    )


def assert_can_mutate_premium_or_raise(
    *,
    request: Request,
    capability_key: str,
    detail_code: str = "capability_denied",
) -> None:
    """FastAPI HTTPException 403 when a premium mutation is not allowed."""
    from fastapi import HTTPException

    caps = resolve_humane_capabilities(request).as_dict()
    if caps.get(capability_key):
        return
    raise HTTPException(
        status_code=403,
        detail={
            "code": detail_code,
            "message": "This action requires an active plan or higher tier.",
            "capabilities": caps,
        },
    )


def assert_export_allowed_or_raise(request: Request) -> None:
    """Exports must remain available even when lapsed; only abuse blocks."""
    from fastapi import HTTPException

    subject_ref = resolve_subject_from_request(request)
    if _abuse_blocked(subject_ref):
        raise HTTPException(status_code=403, detail={"code": "usage_restricted", "message": "Export is temporarily restricted."})
