"""
Operator HTTP surface for receipt-batch anchor retries (adaptive ``anchoring.sqlite3``).

Auth: validated operator principal + role + reason; admin secret as second factor only.
"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from backend.ops.break_glass_audit import BreakGlassAction, log_break_glass_event
from backend.anchoring.observability_cycle import gather_anchoring_operator_http_summary
from backend.anchoring.store import AnchoringStore
from backend.security.privileged_ops import (
    PERM_MUTATE_ADMIN,
    PERM_READ_OPS,
    require_privileged_operator,
)

router = APIRouter(prefix="/v1/ops/anchor", tags=["ops-anchor"])


class OpsAnchorRetryJobBody(BaseModel):
    job_id: Optional[str] = Field(default=None, description="anchor_jobs.id (e.g. aj_…)")
    receipt_batch_id: Optional[str] = Field(
        default=None, description="receipt_batches.id when Merkle root matches anchor_jobs.target_root_sha256"
    )
    chain: Optional[str] = Field(
        default=None, description="btc | doge (canonical / mirror batch job)"
    )


def _verifier_write_denied() -> Optional[JSONResponse]:
    if os.getenv("CLAW_NODE_MODE", "api").strip().lower() == "verifier":
        return JSONResponse(
            status_code=403,
            content={
                "error": "verifier_only",
                "hint": "This node is running in verifier-only mode (CLAW_NODE_MODE=verifier).",
            },
        )
    return None


def _log_ops(req: Request, action: str) -> None:
    try:
        log_break_glass_event(req, action, auth_channel="x-claw-admin-secret")
    except Exception:
        pass


@router.get("/summary")
async def ops_anchor_summary(req: Request) -> JSONResponse:
    """Lightweight operator snapshot: summary, grouped recent alerts, run kind (read-only)."""
    deny = _verifier_write_denied()
    if deny:
        return deny

    require_privileged_operator(
        req,
        permission=PERM_READ_OPS,
        action_type="ops_anchor_summary",
        target_type="ops_anchor",
        target_id="summary",
        reason=(req.headers.get("x-claw-admin-reason") or "").strip() or None,
    )
    _log_ops(req, BreakGlassAction.OPS_V1_ANCHOR_SUMMARY)
    return JSONResponse(gather_anchoring_operator_http_summary())


@router.post("/retry-job")
async def ops_anchor_retry_job(req: Request, body: OpsAnchorRetryJobBody) -> JSONResponse:
    deny = _verifier_write_denied()
    if deny:
        return deny

    require_privileged_operator(
        req,
        permission=PERM_MUTATE_ADMIN,
        action_type="ops_anchor_retry_job",
        target_type="ops_anchor",
        target_id=(body.job_id or body.receipt_batch_id or "retry").strip()[:64],
        reason=(req.headers.get("x-claw-admin-reason") or "").strip() or None,
    )
    _log_ops(req, BreakGlassAction.OPS_V1_ANCHOR_RETRY_JOB)

    jid_in = (body.job_id or "").strip()
    rb_in = (body.receipt_batch_id or "").strip()
    ch_in = (body.chain or "").strip()
    if not jid_in and not (rb_in and ch_in):
        return JSONResponse(
            status_code=400,
            content={
                "error": "missing_job_id_or_batch_chain",
                "hint": "Send job_id or both receipt_batch_id and chain.",
            },
        )

    store = AnchoringStore()
    store.init_schema()
    ok, reason, jid_out = store.retry_failed_retryable_batch_anchor_job(
        job_id=jid_in or None,
        receipt_batch_id=rb_in or None,
        chain=ch_in or None,
    )

    status = 200 if ok else 400
    if reason == "job_not_found":
        status = 404
    elif reason == "already_confirmed":
        status = 409

    return JSONResponse(
        {
            "ok": ok,
            "reason": reason,
            "job_id": jid_out or None,
            "requeued": ok,
        },
        status_code=status,
    )
