"""Supabase REST service wrapper for LawDog dashboard Phase A (service role)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from backend.lawdog_dashboard.supabase_config import (
    is_supabase_dashboard_configured,
    supabase_service_role_key,
    supabase_url,
)

log = logging.getLogger("claw.lawdog_dashboard.supabase")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _rest_base() -> Optional[str]:
    base = supabase_url().rstrip("/")
    if not base:
        return None
    return f"{base}/rest/v1"


def _service_headers(*, merge_duplicates: bool = False) -> Dict[str, str]:
    key = supabase_service_role_key()
    prefer = "return=minimal,resolution=merge-duplicates" if merge_duplicates else "return=minimal"
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


def _request(
    method: str,
    path: str,
    *,
    params: Optional[Dict[str, str]] = None,
    json_body: Any = None,
    merge_duplicates: bool = False,
) -> bool:
    rest = _rest_base()
    if rest is None or not is_supabase_dashboard_configured():
        return False
    url = f"{rest}/{path.lstrip('/')}"
    try:
        with httpx.Client(timeout=20.0) as client:
            res = client.request(
                method,
                url,
                headers=_service_headers(merge_duplicates=merge_duplicates),
                params=params,
                **({"json": json_body} if json_body is not None else {}),
            )
        if res.status_code >= 400:
            log.warning(
                "[lawdog-supabase] request_failed method=%s path=%s status=%s body=%s",
                method,
                path,
                res.status_code,
                (res.text or "")[:240],
            )
            return False
        return True
    except Exception as exc:
        log.warning(
            "[lawdog-supabase] request_error method=%s path=%s error=%s",
            method,
            path,
            type(exc).__name__,
        )
        return False


def ensure_organization(org_id: str, *, name: str = "") -> None:
    oid = (org_id or "").strip()
    if not oid:
        return
    now = _utc_now_iso()
    _request(
        "POST",
        "organizations",
        params={"on_conflict": "id"},
        json_body={
            "id": oid,
            "name": (name or oid).strip() or oid,
            "updated_at": now,
        },
        merge_duplicates=True,
    )


def upsert_agreement_dashboard_row(
    *,
    organization_id: str,
    agreement_id: str,
    title: str,
    created_at: Optional[str] = None,
    updated_at: Optional[str] = None,
    agreement_type: Optional[str] = None,
    workspace_archived_at: Optional[str] = None,
    review_sent_at: Optional[str] = None,
) -> None:
    org_id = (organization_id or "").strip()
    aid = (agreement_id or "").strip()
    if not org_id or not aid:
        return
    ensure_organization(org_id)
    now = _utc_now_iso()
    payload: Dict[str, Any] = {
        "id": aid,
        "organization_id": org_id,
        "title": (title or "").strip() or "Untitled agreement",
        "created_at": created_at or now,
        "updated_at": updated_at or now,
    }
    if agreement_type:
        payload["agreement_type"] = agreement_type
    if workspace_archived_at is not None:
        payload["workspace_archived_at"] = workspace_archived_at
    if review_sent_at is not None:
        payload["review_sent_at"] = review_sent_at
    ok = _request(
        "POST",
        "agreements",
        params={"on_conflict": "id"},
        json_body=payload,
        merge_duplicates=True,
    )
    if ok:
        log.info(
            "[lawdog-supabase] agreement_upserted agreement_id=%s organization_id=%s",
            aid,
            org_id,
        )


def replace_agreement_parties(
    *,
    agreement_id: str,
    parties: List[Dict[str, Any]],
) -> None:
    aid = (agreement_id or "").strip()
    if not aid:
        return
    _request("DELETE", "agreement_parties", params={"agreement_id": f"eq.{aid}"})
    rows: List[Dict[str, Any]] = []
    for idx, party in enumerate(parties):
        if not isinstance(party, dict):
            continue
        name = str(party.get("name") or "").strip()
        if not name:
            continue
        rows.append(
            {
                "agreement_id": aid,
                "party_id": str(party.get("id") or "").strip() or None,
                "display_name": name,
                "role": str(party.get("role") or "party").strip() or "party",
                "email": str(party.get("email") or "").strip() or None,
                "phone": str(party.get("phone") or "").strip() or None,
                "sort_order": idx,
            }
        )
    if rows:
        _request("POST", "agreement_parties", json_body=rows)


def sync_agreement_draft_to_supabase(*, organization_id: str, draft: Dict[str, Any]) -> None:
    """Persist dashboard metadata after canonical draft save (Phase A)."""
    if not is_supabase_dashboard_configured():
        return
    aid = str(draft.get("id") or "").strip()
    if not aid:
        return
    upsert_agreement_dashboard_row(
        organization_id=organization_id,
        agreement_id=aid,
        title=str(draft.get("title") or "").strip() or "Untitled agreement",
        created_at=str(draft.get("created_at") or "").strip() or None,
        updated_at=str(draft.get("updated_at") or draft.get("created_at") or "").strip() or None,
        workspace_archived_at=draft.get("workspace_archived_at"),
        review_sent_at=draft.get("review_sent_at"),
    )
    parties = draft.get("parties") if isinstance(draft.get("parties"), list) else []
    replace_agreement_parties(agreement_id=aid, parties=parties)


def list_agreement_parties_for_agreement(agreement_id: str) -> List[Dict[str, Any]]:
    aid = (agreement_id or "").strip()
    rest = _rest_base()
    if rest is None or not aid or not is_supabase_dashboard_configured():
        return []
    try:
        with httpx.Client(timeout=20.0) as client:
            res = client.get(
                f"{rest}/agreement_parties",
                headers={
                    **_service_headers(),
                    "Accept": "application/json",
                },
                params={
                    "agreement_id": f"eq.{aid}",
                    "order": "sort_order.asc",
                    "select": "*",
                },
            )
        if res.status_code >= 400:
            log.warning(
                "[lawdog-supabase] list_parties_failed agreement_id=%s status=%s",
                aid,
                res.status_code,
            )
            return []
        data = res.json()
        return list(data) if isinstance(data, list) else []
    except Exception as exc:
        log.warning(
            "[lawdog-supabase] list_parties_failed agreement_id=%s error=%s",
            aid,
            type(exc).__name__,
        )
        return []


def list_agreements_for_organization(organization_id: str) -> List[Dict[str, Any]]:
    org_id = (organization_id or "").strip()
    rest = _rest_base()
    if rest is None or not org_id or not is_supabase_dashboard_configured():
        return []
    try:
        with httpx.Client(timeout=20.0) as client:
            res = client.get(
                f"{rest}/agreements",
                headers={
                    **_service_headers(),
                    "Accept": "application/json",
                },
                params={
                    "organization_id": f"eq.{org_id}",
                    "order": "updated_at.desc",
                    "select": "*",
                },
            )
        if res.status_code >= 400:
            log.warning(
                "[lawdog-supabase] list_agreements_failed organization_id=%s status=%s",
                org_id,
                res.status_code,
            )
            return []
        data = res.json()
        return list(data) if isinstance(data, list) else []
    except Exception as exc:
        log.warning(
            "[lawdog-supabase] list_agreements_failed organization_id=%s error=%s",
            org_id,
            type(exc).__name__,
        )
        return []
