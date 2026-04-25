"""Proof status resolution, upgrade requests (batched adaptive anchoring), export job stubs."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from backend.anchoring.batch_service import AdaptiveBatchAnchorService, compute_activity_mode
from backend.anchoring.store import AnchoringStore
from backend.proof_status.schemas import ProofDetailsPayload, ProofStatusPayload
from backend.proof_status.store import ProofLayerStore
from backend.services import receipt_service

logger = logging.getLogger(__name__)


def _receipt_recorded_at(rec: Dict[str, Any]) -> Optional[str]:
    for k in ("created_at", "issued_at", "recorded_at", "persisted_at"):
        v = rec.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _verification_ready_at(rec: Dict[str, Any]) -> Optional[str]:
    v = rec.get("verification_ready_at")
    if isinstance(v, str) and v.strip():
        return v.strip()
    h = rec.get("receipt_hash_sha256")
    if isinstance(h, str) and len(h.strip()) == 64:
        return _receipt_recorded_at(rec)
    return None


def _manifest_hash(rec: Dict[str, Any]) -> Optional[str]:
    for k in ("manifest_hash_sha256", "manifest_content_sha256"):
        v = rec.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _ux_anchor_from_chain(batch_ctx: Optional[Dict[str, Any]]) -> Optional[str]:
    if not batch_ctx:
        return None
    job = batch_ctx.get("btc_anchor_job") or {}
    jst = str(job.get("status") or "").lower()
    bst = str(batch_ctx.get("batch_status") or "").lower()
    if jst == "confirmed":
        return "confirmed"
    if jst.startswith("failed"):
        return "failed"
    if jst in ("building", "broadcast", "submitted_unconfirmed"):
        return "pending"
    if jst == "queued":
        return "queued"
    if bst in ("ready_to_anchor", "doge_pending", "doge_anchored", "btc_finalized"):
        return "queued" if bst == "ready_to_anchor" else "pending"
    if bst == "open":
        return "queued"
    if bst == "fully_anchored":
        return "confirmed"
    if bst == "failed":
        return "failed"
    return None


class ProofStatusService:
    def __init__(
        self,
        *,
        layer_store: Optional[ProofLayerStore] = None,
        anchoring_store: Optional[AnchoringStore] = None,
    ) -> None:
        self._layer = layer_store or ProofLayerStore()
        self._layer.init_schema()
        self._anchor = anchoring_store or AnchoringStore()
        self._anchor.init_schema()

    def _load_receipt_subject(self, subject_type: str, subject_id: str) -> Optional[Dict[str, Any]]:
        st = (subject_type or "").strip().lower()
        sid = (subject_id or "").strip()
        if st != "receipt" or not sid:
            return None
        return receipt_service.get_receipt(sid)

    def build_status_payload(
        self,
        subject_type: str,
        subject_id: str,
        *,
        capabilities: Dict[str, bool],
        include_urls: bool = True,
    ) -> ProofStatusPayload:
        rec = self._load_receipt_subject(subject_type, subject_id)
        batch_ctx = self._anchor.find_batch_context_for_receipt(subject_id) if rec else None
        stored = self._layer.get_anchor_request(subject_type, subject_id)

        recorded_at: Optional[str] = None
        receipt_id: Optional[str] = None
        receipt_hash: Optional[str] = None
        verification_status: str = "unavailable"
        verification_ready_at: Optional[str] = None
        manifest_hash: Optional[str] = None

        if rec:
            receipt_id = str(rec.get("receipt_id") or subject_id)
            receipt_hash = rec.get("receipt_hash_sha256") if isinstance(rec.get("receipt_hash_sha256"), str) else None
            recorded_at = _receipt_recorded_at(rec)
            verification_ready_at = _verification_ready_at(rec)
            manifest_hash = _manifest_hash(rec)
            h = receipt_hash or ""
            if len(h.strip()) == 64:
                verification_status = "ready"
            else:
                verification_status = "processing"

        chain_ux = _ux_anchor_from_chain(batch_ctx)
        if chain_ux:
            anchor_status = chain_ux
        elif stored:
            anchor_status = str(stored.get("anchor_status") or "not_started")
        elif capabilities.get("can_request_anchor_upgrade"):
            anchor_status = "available"
        else:
            anchor_status = "not_started"

        anchor_requested_at: Optional[str] = None
        anchor_confirmed_at: Optional[str] = None
        anchor_network: Optional[str] = None
        anchor_reference: Optional[str] = None

        if batch_ctx:
            job = batch_ctx.get("btc_anchor_job") or {}
            anchor_network = job.get("network") if isinstance(job.get("network"), str) else anchor_network
            tx = job.get("txid") if isinstance(job.get("txid"), str) else None
            if tx:
                anchor_reference = tx
            if isinstance(job.get("confirmed_at"), str):
                anchor_confirmed_at = job["confirmed_at"]
            if isinstance(job.get("queued_at"), str):
                anchor_requested_at = job["queued_at"]

        if stored:
            if isinstance(stored.get("anchor_requested_at"), str):
                anchor_requested_at = stored["anchor_requested_at"]
            if isinstance(stored.get("anchor_confirmed_at"), str):
                anchor_confirmed_at = stored["anchor_confirmed_at"]
            if isinstance(stored.get("network"), str) and not anchor_network:
                anchor_network = stored["network"]
            if isinstance(stored.get("txid"), str) and not anchor_reference:
                anchor_reference = stored["txid"]

        proof_export_url: Optional[str] = None
        view_details_url: Optional[str] = None
        if include_urls and receipt_id:
            proof_export_url = f"/v1/receipts/{receipt_id}/bundle"
            view_details_url = f"/v1/proof/receipt/{receipt_id}/details"

        return ProofStatusPayload(
            recorded_at=recorded_at,
            verification_status=verification_status,  # type: ignore[arg-type]
            verification_ready_at=verification_ready_at,
            receipt_id=receipt_id,
            receipt_hash_sha256=receipt_hash,
            manifest_hash_sha256=manifest_hash,
            anchor_status=anchor_status,  # type: ignore[arg-type]
            anchor_requested_at=anchor_requested_at,
            anchor_confirmed_at=anchor_confirmed_at,
            anchor_network=anchor_network,
            anchor_reference=anchor_reference,
            proof_export_url=proof_export_url,
            view_details_url=view_details_url,
            capabilities=capabilities,
        )

    def build_details_payload(
        self,
        subject_type: str,
        subject_id: str,
        *,
        capabilities: Dict[str, bool],
    ) -> ProofDetailsPayload:
        base = self.build_status_payload(
            subject_type, subject_id, capabilities=capabilities, include_urls=True
        )
        ev = self._layer.latest_event_for_subject(subject_type, subject_id)
        batch_ctx = self._anchor.find_batch_context_for_receipt(subject_id)
        stored = self._layer.get_anchor_request(subject_type, subject_id)

        anchor_jobs: List[Dict[str, Any]] = []
        if batch_ctx and batch_ctx.get("merkle_root_sha256"):
            root = str(batch_ctx["merkle_root_sha256"])
            anchor_jobs = self._anchor.list_anchor_jobs_for_root(root)

        merkle_path_json: Optional[List[Any]] = None
        # Inclusion path computation deferred — extensible once leaf set is enumerated per request.

        return ProofDetailsPayload(
            **base.model_dump(),
            event_id=str(ev["event_id"]) if ev and ev.get("event_id") else None,
            timeline_id=str(ev["timeline_id"]) if ev and ev.get("timeline_id") else None,
            event_hash=str(ev["event_hash"]) if ev and ev.get("event_hash") else None,
            actor_id=str(ev["actor_id"]) if ev and ev.get("actor_id") else None,
            anchor_error=str(stored["anchor_error"]) if stored and stored.get("anchor_error") else None,
            batch_id=str(batch_ctx["batch_id"]) if batch_ctx and batch_ctx.get("batch_id") else None,
            batch_root_hash=str(batch_ctx["merkle_root_sha256"]) if batch_ctx and batch_ctx.get("merkle_root_sha256") else None,
            batch_anchor_status=str(batch_ctx["batch_status"]) if batch_ctx and batch_ctx.get("batch_status") else None,
            merkle_leaf_index=int(batch_ctx["leaf_index"]) if batch_ctx and batch_ctx.get("leaf_index") is not None else None,
            merkle_path_json=merkle_path_json,
            anchor_jobs=anchor_jobs,
        )

    def request_proof_upgrade(
        self,
        subject_type: str,
        subject_id: str,
        *,
        requested_by_user_id: Optional[str],
        preference: str,
        capabilities: Dict[str, bool],
    ) -> ProofStatusPayload:
        pref = (preference or "batched").strip().lower()
        if pref not in ("batched", "priority"):
            pref = "batched"
        if pref == "priority" and not capabilities.get("can_request_priority_anchor"):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=403,
                detail={"code": "priority_anchor_not_allowed", "message": "Priority anchoring requires a qualifying plan."},
            )
        if not capabilities.get("can_request_anchor_upgrade"):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=403,
                detail={"code": "anchor_upgrade_not_allowed", "message": "Anchoring is not enabled for this workspace tier."},
            )

        rec = self._load_receipt_subject(subject_type, subject_id)
        if not rec:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail={"code": "subject_not_found", "message": "Receipt not found."})

        rid = str(rec.get("receipt_id") or subject_id)
        batch_ctx = self._anchor.find_batch_context_for_receipt(rid)
        stored = self._layer.get_anchor_request(subject_type, subject_id)
        ux = _ux_anchor_from_chain(batch_ctx)
        if ux in ("confirmed", "queued", "pending"):
            if batch_ctx and not stored:
                self._layer.upsert_anchor_request(
                    subject_type=subject_type,
                    subject_id=subject_id,
                    anchor_status="queued",
                    requested_by_user_id=requested_by_user_id,
                    anchor_preference=pref,
                    batch_id=str(batch_ctx.get("batch_id") or "") or None,
                )
            return self.build_status_payload(subject_type, subject_id, capabilities=capabilities)

        if not batch_ctx:
            n = self._anchor.count_receipts_last_24h()
            mode = compute_activity_mode(n)
            svc = AdaptiveBatchAnchorService(self._anchor)
            try:
                svc.append_receipt_to_open_batch(rid, mode=mode)
            except Exception as e:
                msg = str(e).lower()
                if "unique" in msg or "integrity" in msg:
                    logger.info("receipt already in adaptive batch: %s", rid)
                else:
                    logger.exception("append_receipt_to_open_batch failed for %s", rid)
                    from fastapi import HTTPException

                    raise HTTPException(status_code=503, detail={"code": "anchor_queue_unavailable"}) from None

        batch_ctx = self._anchor.find_batch_context_for_receipt(rid)
        batch_id = str(batch_ctx["batch_id"]) if batch_ctx and batch_ctx.get("batch_id") else None

        self._layer.upsert_anchor_request(
            subject_type=subject_type,
            subject_id=subject_id,
            anchor_status="queued",
            requested_by_user_id=requested_by_user_id,
            anchor_preference=pref,
            batch_id=batch_id,
        )

        return self.build_status_payload(subject_type, subject_id, capabilities=capabilities)


_proof_service_singleton: Optional[ProofStatusService] = None


def get_proof_status_service() -> ProofStatusService:
    global _proof_service_singleton
    if _proof_service_singleton is None:
        _proof_service_singleton = ProofStatusService()
    return _proof_service_singleton
