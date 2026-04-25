from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

ProofVerificationStatus = Literal["ready", "processing", "unavailable"]
ProofAnchorUxStatus = Literal[
    "not_started",
    "available",
    "queued",
    "pending",
    "confirmed",
    "failed",
]
AnchorPreference = Literal["batched", "priority"]


class ProofStatusPayload(BaseModel):
    """Shape consumed by the frontend Proof Status card."""

    recorded_at: Optional[str] = None
    verification_status: ProofVerificationStatus = "unavailable"
    verification_ready_at: Optional[str] = None
    receipt_id: Optional[str] = None
    receipt_hash_sha256: Optional[str] = None
    manifest_hash_sha256: Optional[str] = None
    anchor_status: ProofAnchorUxStatus = "not_started"
    anchor_requested_at: Optional[str] = None
    anchor_confirmed_at: Optional[str] = None
    anchor_network: Optional[str] = None
    anchor_reference: Optional[str] = None
    proof_export_url: Optional[str] = None
    view_details_url: Optional[str] = None
    capabilities: Dict[str, bool] = Field(default_factory=dict)


class ProofDetailsPayload(ProofStatusPayload):
    event_id: Optional[str] = None
    timeline_id: Optional[str] = None
    event_hash: Optional[str] = None
    actor_id: Optional[str] = None
    anchor_error: Optional[str] = None
    batch_id: Optional[str] = None
    batch_root_hash: Optional[str] = None
    batch_anchor_status: Optional[str] = None
    merkle_leaf_index: Optional[int] = None
    merkle_path_json: Optional[List[Any]] = None
    anchor_jobs: List[Dict[str, Any]] = Field(default_factory=list)


class ExportJobCreateBody(BaseModel):
    scope: Literal["user_all", "folder", "record"]
    scope_ref: Optional[str] = None


class ExportJobRecord(BaseModel):
    export_id: str
    owner_subject: str
    scope: str
    scope_ref: Optional[str] = None
    status: str
    created_at: str
    updated_at: str
    download_url: Optional[str] = None
