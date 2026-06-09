"""Supabase-aware workspace-index helpers (Phase A)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

from backend.lawdog_dashboard.supabase_config import is_supabase_dashboard_configured
from backend.lawdog_dashboard.supabase_service import (
    list_agreement_parties_for_agreement,
    list_agreements_for_organization,
)
from backend.utils.enforce import org_id_from_subject


def supabase_agreement_ids_for_subject(subject_ref: str) -> List[str]:
    org_id = org_id_from_subject(subject_ref)
    if not org_id or not is_supabase_dashboard_configured():
        return []
    rows = list_agreements_for_organization(org_id)
    out: List[str] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        aid = str(row.get("id") or "").strip()
        if aid:
            out.append(aid)
    return out


def merge_workspace_index_agreement_ids(
    *,
    subject_ref: str,
    local_ids_newest_first: List[str],
) -> List[str]:
    """
    When Supabase is configured, union Supabase org rows with local ids (Supabase first).
    Local-only fallback when Supabase env vars are missing.
    """
    if not is_supabase_dashboard_configured():
        return list(local_ids_newest_first)
    remote_ids = supabase_agreement_ids_for_subject(subject_ref)
    seen: Set[str] = set()
    merged: List[str] = []
    for aid in [*remote_ids, *local_ids_newest_first]:
        if aid in seen:
            continue
        seen.add(aid)
        merged.append(aid)
    return merged


def fallback_summary_from_supabase_row(
    row: Dict[str, Any],
    *,
    parties: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Workspace-index row when draft load fails but Supabase metadata exists."""
    aid = str(row.get("id") or "").strip()
    party_rows = list(parties or [])
    if not party_rows and aid:
        party_rows = list_agreement_parties_for_agreement(aid)
    signer_count = sum(
        1
        for p in party_rows
        if str((p or {}).get("role") or "").lower() == "signer"
    )
    review_sent_at = row.get("review_sent_at")
    return {
        "id": aid,
        "title": str(row.get("title") or "").strip() or "Untitled agreement",
        "created_at": str(row.get("created_at") or ""),
        "updated_at": str(row.get("updated_at") or row.get("created_at") or ""),
        "party_count": len(party_rows),
        "signer_count": signer_count,
        "version_ledger_count": 0,
        "completed_signed": False,
        "has_server_signing_lock": False,
        "locked_version_id": None,
        "workspace_archived_at": row.get("workspace_archived_at"),
        "review_sent_at": review_sent_at,
        "reviewer_approved": False,
        "review_approvals_completed": 0,
        "review_approvals_required": max(len(party_rows), 1),
        "all_reviewers_approved": False,
        "workspace_folder_id": None,
        "workspace_folder_name": None,
        "workspace_tags": [],
        "dashboard_source": "supabase_fallback",
        "content_unavailable": True,
        "content_unavailable_reason": "draft_load_failed",
    }


def supabase_rows_by_id_for_subject(subject_ref: str) -> Dict[str, Dict[str, Any]]:
    org_id = org_id_from_subject(subject_ref)
    if not org_id or not is_supabase_dashboard_configured():
        return {}
    rows = list_agreements_for_organization(org_id)
    out: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        aid = str(row.get("id") or "").strip()
        if aid:
            out[aid] = row
    return out
