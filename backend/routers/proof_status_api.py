"""Proof status, details, upgrade (batched anchoring), and humane export jobs.

Commercial mode: all private proof surfaces require validated owner principal
(or recipient token for agreement/receipt-bound subjects) and server-side
ownership binding. Path subject ids alone are never sufficient.
"""

from __future__ import annotations

import json
import zipfile
from io import BytesIO
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from backend.proof_status.capabilities import (
    assert_export_allowed_or_raise,
    resolve_humane_capabilities,
)
from backend.proof_status.schemas import ExportJobCreateBody
from backend.proof_status.service import get_proof_status_service
from backend.proof_status.store import ProofLayerStore
from backend.security.proof_subject_access import (
    require_proof_subject_access,
    resolve_proof_owner_subject,
)

router = APIRouter(prefix="/v1/proof", tags=["proof"])


class ProofUpgradeBody(BaseModel):
    preference: str = Field(default="batched", description="batched | priority")


@router.get("/{subject_type}/{subject_id}/status")
def api_proof_status(subject_type: str, subject_id: str, request: Request) -> Dict[str, Any]:
    require_proof_subject_access(request, subject_type, subject_id)
    caps = resolve_humane_capabilities(request).as_dict()
    svc = get_proof_status_service()
    payload = svc.build_status_payload(subject_type, subject_id, capabilities=caps)
    return {"ok": True, **payload.model_dump()}


@router.get("/{subject_type}/{subject_id}/details")
def api_proof_details(subject_type: str, subject_id: str, request: Request) -> Dict[str, Any]:
    require_proof_subject_access(request, subject_type, subject_id)
    caps = resolve_humane_capabilities(request).as_dict()
    svc = get_proof_status_service()
    payload = svc.build_details_payload(subject_type, subject_id, capabilities=caps)
    return {"ok": True, **payload.model_dump()}


@router.get("/{subject_type}/{subject_id}/export")
def api_proof_subject_export(subject_type: str, subject_id: str, request: Request) -> Response:
    """
    Stream the VS01 verification bundle for a receipt id (same bytes as GET /v1/receipts/{id}/bundle).
    Agreement/workspace records use POST /v1/proof/exports with scope=record.
    """
    require_proof_subject_access(request, subject_type, subject_id)
    assert_export_allowed_or_raise(request)
    st = (subject_type or "").strip().lower()
    if st != "receipt":
        raise HTTPException(
            status_code=400,
            detail={
                "code": "export_use_post",
                "message": "For agreements and workspace records, use POST /v1/proof/exports with scope=record.",
            },
        )
    from backend.routers.vs01_receipts_api import api_get_receipt_bundle

    return api_get_receipt_bundle(subject_id, request)


@router.post("/{subject_type}/{subject_id}/upgrade")
def api_proof_upgrade(
    subject_type: str,
    subject_id: str,
    request: Request,
    body: ProofUpgradeBody,
) -> Dict[str, Any]:
    require_proof_subject_access(request, subject_type, subject_id)
    caps = resolve_humane_capabilities(request).as_dict()
    svc = get_proof_status_service()
    uid = (request.headers.get("x-claw-user-id") or "").strip() or None
    payload = svc.request_proof_upgrade(
        subject_type,
        subject_id,
        requested_by_user_id=uid,
        preference=body.preference,
        capabilities=caps,
    )
    return {"ok": True, **payload.model_dump()}


@router.post("/exports")
def api_proof_exports_create(request: Request, body: ExportJobCreateBody) -> Dict[str, Any]:
    assert_export_allowed_or_raise(request)
    subject = resolve_proof_owner_subject(request)
    # Record-scoped exports must bind to an agreement the caller can read.
    if (body.scope or "").strip() == "record" and (body.scope_ref or "").strip():
        require_proof_subject_access(request, "agreement", str(body.scope_ref).strip())
    store = ProofLayerStore()
    store.init_schema()
    job = store.create_export_job(
        owner_subject=subject,
        scope=body.scope,
        scope_ref=(body.scope_ref or "").strip() or None,
    )
    eid = str(job["export_id"])
    manifest: Dict[str, Any] = {
        "version": 1,
        "scope": body.scope,
        "scope_ref": body.scope_ref,
        "readme": (
            "LawDog export manifest. Bulk and folder exports may complete asynchronously; "
            "re-download when status is ready. Your existing records remain accessible "
            "even if your plan has lapsed."
        ),
        "folders": [],
    }
    if body.scope == "record" and body.scope_ref:
        manifest["records"] = [{"subject_type": "agreement", "subject_id": body.scope_ref}]
    # Stub packaging is synchronous until bulk/folder workers persist full archives.
    status = "ready"
    store.update_export_job_manifest(eid, status=status, manifest=manifest)
    row = store.get_export_job(eid, subject)
    return {"ok": True, "export": _export_row_api(row, request)}


def _export_row_api(row: Optional[Dict[str, Any]], request: Request) -> Dict[str, Any]:
    if not row:
        return {}
    eid = str(row["export_id"])
    base = str(request.base_url).rstrip("/")
    return {
        "export_id": eid,
        "owner_subject": row.get("owner_subject"),
        "scope": row.get("scope"),
        "scope_ref": row.get("scope_ref"),
        "status": row.get("status"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "download_url": f"{base}/v1/proof/exports/{eid}/download",
    }


@router.get("/exports/{export_id}")
def api_proof_exports_get(export_id: str, request: Request) -> Dict[str, Any]:
    assert_export_allowed_or_raise(request)
    subject = resolve_proof_owner_subject(request)
    store = ProofLayerStore()
    store.init_schema()
    row = store.get_export_job(export_id, subject)
    if not row:
        raise HTTPException(status_code=404, detail="Export not found.")
    raw_m = row.get("manifest_json")
    manifest = None
    if isinstance(raw_m, str) and raw_m.strip():
        try:
            manifest = json.loads(raw_m)
        except json.JSONDecodeError:
            manifest = {"raw": raw_m[:2000]}
    erow = {k: v for k, v in dict(row).items() if k != "manifest_json"}
    return {"ok": True, "export": _export_row_api(erow, request), "manifest": manifest}


@router.get("/exports/{export_id}/download")
def api_proof_exports_download(export_id: str, request: Request) -> Response:
    assert_export_allowed_or_raise(request)
    subject = resolve_proof_owner_subject(request)
    store = ProofLayerStore()
    store.init_schema()
    row = store.get_export_job(export_id, subject)
    if not row:
        raise HTTPException(status_code=404, detail="Export not found.")
    if str(row.get("status") or "") != "ready":
        raise HTTPException(
            status_code=409,
            detail={"code": "export_not_ready", "status": row.get("status")},
        )
    raw_m = row.get("manifest_json")
    manifest: Dict[str, Any] = {}
    if isinstance(raw_m, str) and raw_m.strip():
        try:
            manifest = json.loads(raw_m)
        except json.JSONDecodeError:
            manifest = {"parse_error": True}
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "README.txt",
            "LawDog data export\n"
            "This archive includes an index.json manifest. "
            "For a single receipt, also use GET /v1/receipts/{id}/bundle for the verification zip.\n",
        )
        zf.writestr("index.json", json.dumps(manifest, indent=2, default=str))
    data = buf.getvalue()
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="lawdog-export-{export_id[:12]}.zip"'},
    )


class ProofFolderCreateBody(BaseModel):
    folder_name: str = Field(..., min_length=1, max_length=120)


@router.get("/folders")
def api_proof_folders_list(request: Request) -> Dict[str, Any]:
    """Folder metadata for exports and browsing (base organization without AI)."""
    assert_export_allowed_or_raise(request)
    subject = resolve_proof_owner_subject(request)
    store = ProofLayerStore()
    store.init_schema()
    rows = store.list_folders(subject)
    return {"ok": True, "folders": rows}


@router.post("/folders")
def api_proof_folders_create(request: Request, body: ProofFolderCreateBody) -> Dict[str, Any]:
    assert_export_allowed_or_raise(request)
    subject = resolve_proof_owner_subject(request)
    store = ProofLayerStore()
    store.init_schema()
    row = store.insert_folder(owner_subject=subject, folder_name=body.folder_name.strip())
    if not row.get("folder_id"):
        raise HTTPException(status_code=400, detail="folder_create_failed")
    return {"ok": True, "folder": row}
