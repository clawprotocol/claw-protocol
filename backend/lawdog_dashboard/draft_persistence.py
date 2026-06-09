"""Persist agreement drafts and sync Phase A Supabase dashboard metadata."""

from __future__ import annotations

from typing import Any, Dict, Optional

from backend.lawdog_dashboard.supabase_service import sync_agreement_draft_to_supabase
from backend.services.agreement_draft_store import save_draft
from backend.utils.enforce import org_id_from_subject


def resolve_organization_id_for_draft_sync(
    draft: Dict[str, Any],
    *,
    subject_ref: Optional[str] = None,
    organization_id: Optional[str] = None,
) -> Optional[str]:
    """Resolve org id for Supabase sync from explicit args, subject, or draft owner registry."""
    oid = (organization_id or "").strip()
    if oid:
        return oid
    if subject_ref:
        oid = (org_id_from_subject(subject_ref) or "").strip()
        if oid:
            return oid
    aid = str(draft.get("id") or "").strip()
    if not aid:
        return None
    try:
        from backend.usage_economics.store import get_usage_economics_store

        store = get_usage_economics_store()
        store.init_schema()
        owner = store.owner_subject_for_agreement(aid)
        if owner:
            oid = (org_id_from_subject(owner) or "").strip()
            if oid:
                return oid
    except Exception:
        pass
    return None


def save_draft_and_sync_dashboard_metadata(
    draft: Dict[str, Any],
    *,
    subject_ref: Optional[str] = None,
    organization_id: Optional[str] = None,
) -> None:
    """
    Write canonical draft storage, then upsert Supabase dashboard metadata when configured.

    Agreement content authority remains in draft storage; Supabase receives metadata only.
    """
    save_draft(draft)
    org_id = resolve_organization_id_for_draft_sync(
        draft,
        subject_ref=subject_ref,
        organization_id=organization_id,
    )
    if org_id:
        sync_agreement_draft_to_supabase(organization_id=org_id, draft=draft)
