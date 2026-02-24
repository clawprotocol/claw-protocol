from __future__ import annotations

from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, File, UploadFile
from fastapi.responses import StreamingResponse, JSONResponse
import io
import base64
from pydantic import BaseModel

from backend.services import workflow_service
from backend.services import bundle_service
from backend.services import agreement_service
from backend.utils.workflow_state_store import WorkflowStateStore
from backend.utils.agreement_version_store import AgreementVersionStore
from backend.utils import metrics
from backend.utils.canon_json import canon_sha256_hex


router = APIRouter(prefix="/v1/workflow", tags=["workflow"])


class TimelineCreateRequest(BaseModel):
    timeline_id: str
    title: str
    network: str
    created_at: str
    parties: Optional[List[Dict[str, Any]]] = None


class TimelineAppendRequest(BaseModel):
    timeline: Dict[str, Any]
    event_type: str
    event_time: str
    notice: Optional[Dict[str, Any]] = None
    marker: Optional[Dict[str, Any]] = None


class TimelineFreezeRequest(BaseModel):
    timeline: Dict[str, Any]
    frozen_at: str


class TimelineForkRequest(BaseModel):
    timeline: Dict[str, Any]
    created_at: str
    title: Optional[str] = None
    timeline_id: Optional[str] = None
    network: Optional[str] = None


class ReceiptCreateRequest(BaseModel):
    timeline_id: str
    frozen_manifest_sha256: str
    anchor_network: str
    epoch_id: str
    issued_at: str
    btc_txid: str = "pending"


class AttestationEsignRequest(BaseModel):
    signer_id: str
    signer_name: str
    statement: str
    signed_at: str


class AttestationLiabilityRequest(BaseModel):
    subject_id: str
    role: str
    capacity: str
    control_asserted: bool
    access_asserted: bool
    valid_from: str
    valid_to: str
    exclusions: Optional[List[str]] = None
    structuring_notes: Optional[Dict[str, Any]] = None


class AttestationSignRequest(BaseModel):
    attestation: Dict[str, Any]
    algo: str
    signature: str
    signer_id: str
    signed_at: str


class AttestationFreezeRequest(BaseModel):
    attestation: Dict[str, Any]
    frozen_at: str


class AgreementCreateRequest(BaseModel):
    title: str
    parties: Optional[List[str]] = None
    content: str
    created_at: str


class AgreementAcceptRequest(BaseModel):
    agreement: Dict[str, Any]
    version_id: str
    accepted_at: str


class AgreementFreezeRequest(BaseModel):
    agreement: Dict[str, Any]
    frozen_at: str


class DisputePacketRequest(BaseModel):
    claims: List[str]
    references: List[Dict[str, Any]]
    timelines: Optional[List[Dict[str, Any]]] = None
    created_at: str


class BundleExportRequest(BaseModel):
    out_dir: Optional[str] = None
    created_at: str
    timeline: Dict[str, Any]
    receipt: Dict[str, Any]
    attestations: Optional[List[Dict[str, Any]]] = None
    agreement: Optional[Dict[str, Any]] = None
    analysis: Optional[Dict[str, Any]] = None
    note: Optional[str] = None
    agreement_id: Optional[str] = None
    agreement_version: Optional[int] = None
    agreement_diff: Optional[Dict[str, int]] = None


class BundleVerifyRequest(BaseModel):
    bundle_dir: str


class DemoRunRequest(BaseModel):
    created_at: Optional[str] = None
    anchor_network: str = "bitcoin-testnet"
    epoch_id: Optional[str] = None
    timeline_id: Optional[str] = None


class AgreementDraftCreateRequest(BaseModel):
    agreement_id: Optional[str] = None
    title: str
    jurisdiction: str
    parties: List[str]
    effective_date: str
    body_markdown: str
    created_at: str
    updated_at: str


class AgreementDraftRedlineRequest(BaseModel):
    agreement_id: str
    change_text: str
    rationale: str
    author: str
    created_at: str


class AgreementDraftExportRequest(BaseModel):
    agreement_id: str


class AgreementSaveVersionRequest(BaseModel):
    agreement_id: str
    title: str
    body_markdown: str
    created_at: Optional[str] = None
    disclaimers: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None


class AgreementDiffRequest(BaseModel):
    agreement_id: str
    from_version: int
    to_version: int


class StateRecentResponse(BaseModel):
    timelines: List[Dict[str, Any]]
    agreements: List[Dict[str, Any]]
    attestations: List[Dict[str, Any]]


class StateExportRequest(BaseModel):
    timeline_id: Optional[str] = None
    agreement_id: Optional[str] = None


class StateImportRequest(BaseModel):
    state_json: Dict[str, Any]


@router.post("/timeline/create")
def api_create_timeline(body: TimelineCreateRequest) -> Dict[str, Any]:
    tl = workflow_service.create_timeline(**body.model_dump())
    WorkflowStateStore().upsert_timeline(
        timeline_id=tl.get("timeline_id"),
        title=tl.get("title") or "",
        status="draft",
        updated_at=tl.get("created_at") or "",
    )
    return tl


@router.post("/timeline/append")
def api_append_event(body: TimelineAppendRequest) -> Dict[str, Any]:
    if body.timeline.get("frozen") or body.timeline.get("frozen_manifest_sha256"):
        return JSONResponse(
            status_code=409,
            content={
                "error_code": "TIMELINE_FROZEN",
                "message": "Timeline is frozen; appends are not allowed. Create a new version to add events.",
                "detail": {"code": "TIMELINE_FROZEN"},
            },
        )
    tl = workflow_service.append_event(**body.model_dump())
    WorkflowStateStore().upsert_timeline(
        timeline_id=tl.get("timeline_id"),
        title=tl.get("title") or "",
        status="draft",
        updated_at=body.event_time,
    )
    return tl


@router.post("/timeline/freeze")
def api_freeze_timeline(body: TimelineFreezeRequest) -> Dict[str, Any]:
    tl = workflow_service.freeze_timeline(**body.model_dump())
    WorkflowStateStore().upsert_timeline(
        timeline_id=tl.get("timeline_id"),
        title=tl.get("title") or "",
        status="frozen",
        updated_at=body.frozen_at,
    )
    return tl


@router.post("/timeline/fork")
def api_fork_timeline(body: TimelineForkRequest) -> Dict[str, Any]:
    if not body.timeline.get("frozen") and not body.timeline.get("frozen_manifest_sha256"):
        return JSONResponse(
            status_code=409,
            content={
                "error_code": "TIMELINE_NOT_FROZEN",
                "message": "Timeline is not frozen; fork requires a frozen timeline.",
                "detail": {"code": "TIMELINE_NOT_FROZEN"},
            },
        )
    tl = workflow_service.create_timeline_version(
        frozen_timeline=body.timeline,
        created_at=body.created_at,
        title=body.title,
        timeline_id=body.timeline_id,
        network=body.network,
    )
    WorkflowStateStore().upsert_timeline(
        timeline_id=tl.get("timeline_id"),
        title=tl.get("title") or "",
        status="draft",
        updated_at=body.created_at,
    )
    return tl


@router.post("/receipt/create")
def api_create_receipt(body: ReceiptCreateRequest) -> Dict[str, Any]:
    rcpt = workflow_service.create_receipt(**body.model_dump())
    WorkflowStateStore().upsert_timeline(
        timeline_id=body.timeline_id,
        title="",
        status="receipted",
        updated_at=body.issued_at,
    )
    return rcpt


@router.post("/attest/esign/create")
def api_attest_esign(body: AttestationEsignRequest) -> Dict[str, Any]:
    att = workflow_service.create_attestation_esign(**body.model_dump())
    WorkflowStateStore().upsert_attestation(
        attestation_id=att.get("attestation_id") or att.get("attestation_sha256") or "",
        attestation_type="esign",
        updated_at=body.signed_at,
        notes_included=False,
    )
    return att


@router.post("/attest/liability/create")
def api_attest_liability(body: AttestationLiabilityRequest) -> Dict[str, Any]:
    att = workflow_service.create_attestation_liability(**body.model_dump())
    notes_included = bool(body.structuring_notes)
    WorkflowStateStore().upsert_attestation(
        attestation_id=att.get("attestation_id") or att.get("attestation_sha256") or "",
        attestation_type="liability",
        updated_at=body.valid_from,
        notes_included=notes_included,
    )
    return att


@router.post("/attest/sign")
def api_attest_sign(body: AttestationSignRequest) -> Dict[str, Any]:
    return workflow_service.sign_attestation(**body.model_dump())


@router.post("/attest/freeze")
def api_attest_freeze(body: AttestationFreezeRequest) -> Dict[str, Any]:
    return workflow_service.freeze_attestation(**body.model_dump())


@router.post("/agreement/create")
def api_agreement_create(body: AgreementCreateRequest) -> Dict[str, Any]:
    return workflow_service.create_agreement(**body.model_dump())


@router.post("/agreement/accept")
def api_agreement_accept(body: AgreementAcceptRequest) -> Dict[str, Any]:
    return workflow_service.accept_version(**body.model_dump())


@router.post("/agreement/freeze")
def api_agreement_freeze(body: AgreementFreezeRequest) -> Dict[str, Any]:
    return workflow_service.freeze_agreement(**body.model_dump())


@router.post("/agreement/draft")
def api_agreement_draft(body: AgreementDraftCreateRequest) -> Dict[str, Any]:
    ag = agreement_service.create_draft(body.model_dump())
    WorkflowStateStore().upsert_agreement(
        agreement_id=ag.get("agreement_id"),
        title=ag.get("title") or "",
        updated_at=ag.get("updated_at") or ag.get("created_at") or "",
    )
    return ag


@router.post("/agreement/redline")
def api_agreement_draft_redline(body: AgreementDraftRedlineRequest) -> Dict[str, Any]:
    ag = agreement_service.append_redline(
        body.agreement_id,
        {
            "change_text": body.change_text,
            "rationale": body.rationale,
            "author": body.author,
            "created_at": body.created_at,
        },
    )
    WorkflowStateStore().upsert_agreement(
        agreement_id=ag.get("agreement_id"),
        title=ag.get("title") or "",
        updated_at=ag.get("updated_at") or body.created_at,
    )
    return ag


@router.get("/agreement/{agreement_id}")
def api_agreement_get(agreement_id: str) -> Dict[str, Any]:
    return agreement_service.get_draft(agreement_id)


@router.post("/agreement/export")
def api_agreement_export(body: AgreementDraftExportRequest) -> Dict[str, Any]:
    return agreement_service.export_bundle(body.agreement_id)


@router.post("/agreement/save_version")
def api_agreement_save_version(body: AgreementSaveVersionRequest) -> Dict[str, Any]:
    store = AgreementVersionStore()
    return store.save_version(
        agreement_id=body.agreement_id,
        title=body.title,
        body_markdown=body.body_markdown,
        created_at=body.created_at,
        disclaimers=body.disclaimers,
        metadata=body.metadata,
    )


@router.get("/agreement/versions")
def api_agreement_versions(agreement_id: str) -> Dict[str, Any]:
    store = AgreementVersionStore()
    return {"versions": store.list_versions(agreement_id=agreement_id)}


@router.post("/agreement/diff")
def api_agreement_diff(body: AgreementDiffRequest) -> Dict[str, Any]:
    store = AgreementVersionStore()
    return store.diff_versions(
        agreement_id=body.agreement_id,
        from_version=body.from_version,
        to_version=body.to_version,
    )


@router.get("/agreement/get")
def api_agreement_get_version(agreement_id: str, version: int) -> Dict[str, Any]:
    store = AgreementVersionStore()
    return store.get_version(agreement_id=agreement_id, version=version)


@router.get("/state/recent", response_model=StateRecentResponse)
def api_state_recent(limit: int = 25) -> Dict[str, Any]:
    return WorkflowStateStore().list_recent(limit=limit)


@router.post("/state/export")
def api_state_export(body: StateExportRequest) -> Dict[str, Any]:
    state = WorkflowStateStore().export_state(
        timeline_id=body.timeline_id,
        agreement_id=body.agreement_id,
    )
    return {"state_json": state}


@router.post("/state/import")
def api_state_import(body: StateImportRequest) -> Dict[str, Any]:
    WorkflowStateStore().import_state(state_json=body.state_json)
    return {"ok": True}


@router.post("/dispute/create")
def api_dispute_create(body: DisputePacketRequest) -> Dict[str, Any]:
    return workflow_service.build_dispute_packet(**body.model_dump())


@router.post("/bundle/export")
def api_bundle_export(body: BundleExportRequest) -> Dict[str, Any]:
    out_dir = Path(body.out_dir) if body.out_dir else None
    if not out_dir:
        return {"ok": False, "error": "out_dir required"}
    bundle_service.export_bundle_dir(
        out_dir=out_dir,
        created_at=body.created_at,
        timeline=body.timeline,
        receipt=body.receipt,
        attestations=body.attestations,
        agreement=body.agreement,
        analysis=body.analysis,
        note=body.note,
        agreement_id=body.agreement_id,
        agreement_version=body.agreement_version,
        agreement_diff=body.agreement_diff,
    )
    return {"ok": True, "out_dir": str(out_dir)}


@router.post("/bundle/verify")
def api_bundle_verify(
    body: Optional[BundleVerifyRequest] = Body(None),
    bundle_zip: Optional[UploadFile] = File(None),
) -> Dict[str, Any]:
    if bundle_zip is not None:
        data = bundle_zip.file.read()
        result = bundle_service.verify_bundle_zip(data)
        if not result.get("ok"):
            metrics.inc("verify_upload_rejected_total")
        return result
    if body is None:
        return {"ok": False, "checks": [], "summary": {"error": "no input"}, "recomputed": {}}
    return bundle_service.verify_bundle_dir(Path(body.bundle_dir))


@router.post("/bundle/export_zip")
def api_bundle_export_zip(body: BundleExportRequest):
    data = bundle_service.export_bundle_zip(
        created_at=body.created_at,
        timeline=body.timeline,
        receipt=body.receipt,
        attestations=body.attestations,
        agreement=body.agreement,
        analysis=body.analysis,
        note=body.note,
        agreement_id=body.agreement_id,
        agreement_version=body.agreement_version,
        agreement_diff=body.agreement_diff,
    )
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=claw-bundle-v0.zip"},
    )


def _iso_plus_seconds(iso_ts: str, seconds: int) -> str:
    base = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
    return (base + timedelta(seconds=seconds)).isoformat().replace("+00:00", "Z")


@router.post("/demo/run")
def api_demo_run(body: DemoRunRequest, format: Optional[str] = None):
    created_at = body.created_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    epoch_id = body.epoch_id or f"epoch-demo-{created_at.replace('-', '').replace(':', '')[-6:]}"
    timeline_id = body.timeline_id or f"tl_demo_{canon_sha256_hex({'created_at': created_at, 'epoch_id': epoch_id, 'anchor_network': body.anchor_network})[:16]}"
    t1 = created_at
    t2 = _iso_plus_seconds(created_at, 1)
    t3 = _iso_plus_seconds(created_at, 2)

    timeline = workflow_service.create_timeline(
        timeline_id=timeline_id,
        title="One-click Demo Timeline",
        network="testnet",
        created_at=created_at,
        parties=[{"role": "author", "id": "demo-author", "display_name": "Demo Author"}],
    )
    timeline = workflow_service.append_event(
        timeline=timeline,
        event_type="notice",
        event_time=t1,
        notice={"text": "Demo event 1"},
        marker=None,
        references=None,
    )
    timeline = workflow_service.append_event(
        timeline=timeline,
        event_type="notice",
        event_time=t2,
        notice={"text": "Demo event 2"},
        marker=None,
        references=None,
    )
    timeline = workflow_service.append_event(
        timeline=timeline,
        event_type="notice",
        event_time=t3,
        notice={"text": "Demo event 3"},
        marker=None,
        references=None,
    )
    timeline = workflow_service.freeze_timeline(timeline=timeline, frozen_at=created_at)
    receipt = workflow_service.create_receipt(
        timeline_id=timeline["timeline_id"],
        frozen_manifest_sha256=timeline["frozen_manifest_sha256"],
        anchor_network=body.anchor_network,
        epoch_id=epoch_id,
        issued_at=created_at,
        btc_txid="pending",
    )
    esign = workflow_service.create_attestation_esign(
        signer_id="signer_demo",
        signer_name="Demo Signer",
        statement="I attest to the facts stated in this record.",
        signed_at=created_at,
    )
    liability = workflow_service.create_attestation_liability(
        subject_id="subject_demo",
        role="operator",
        capacity="individual",
        control_asserted=True,
        access_asserted=True,
        valid_from=created_at,
        valid_to="2027-01-01T00:00:00Z",
        exclusions=["No authority to bind third parties"],
    )

    zip_bytes = bundle_service.export_bundle_zip(
        created_at=created_at,
        timeline=timeline,
        receipt=receipt,
        attestations=[esign, liability],
        agreement=None,
        analysis=None,
        note="demo_run",
    )
    if format == "zip":
        return StreamingResponse(
            io.BytesIO(zip_bytes),
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=claw-bundle-v0.zip"},
        )
    verify_report = bundle_service.verify_bundle_zip(zip_bytes)
    summary = {
        "timeline_id": timeline["timeline_id"],
        "epoch_id": epoch_id,
        "frozen_manifest_sha256": timeline["frozen_manifest_sha256"],
        "receipt_commitment": receipt.get("commitment"),
        "merkle_root_sha256": receipt.get("merkle_root_sha256"),
        "verify_ok": bool(verify_report.get("ok")),
    }
    return {
        "ok": bool(verify_report.get("ok")),
        "inputs": {
            "created_at": created_at,
            "epoch_id": epoch_id,
            "anchor_network": body.anchor_network,
            "timeline_id": timeline_id,
        },
        "summary": summary,
        "verify_report": verify_report,
        "zip_filename": "claw-bundle-v0.zip",
        "zip_b64": base64.b64encode(zip_bytes).decode("ascii"),
    }
