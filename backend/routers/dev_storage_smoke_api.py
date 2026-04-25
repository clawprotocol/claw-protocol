"""
Opt-in artifact storage smoke check (no secrets).

Enable with ``CLAW_DEV_STORAGE_SMOKE=1``. Disabled by default.
"""
from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/internal/dev", tags=["dev-storage"])


@router.get("/storage-smoke")
def storage_smoke_get(request: Request) -> dict:
    if os.getenv("CLAW_DEV_STORAGE_SMOKE", "").strip() != "1":
        raise HTTPException(status_code=404, detail="not_found")
    try:
        from backend.ops.break_glass_audit import BreakGlassAction, log_break_glass_event

        log_break_glass_event(
            request,
            BreakGlassAction.DEV_STORAGE_SMOKE,
            auth_channel="claw_dev_storage_smoke=1",
        )
    except Exception:
        pass
    from backend.config.storage_runtime import public_runtime_storage_summary
    from backend.storage.artifact_repository import get_artifact_repository

    marker = b"claw-dev-storage-smoke"
    logical = "__dev_storage_smoke__"
    repo = get_artifact_repository()
    repo.put_artifact(
        artifact_type="dev_smoke",
        logical_ref=logical,
        data=marker,
        content_type="application/octet-stream",
        visibility="private",
        metadata={},
    )
    got = repo.get_bytes_by_logical_ref(artifact_type="dev_smoke", logical_ref=logical)
    if got != marker:
        raise HTTPException(
            status_code=500,
            detail="round_trip_failed",
        )
    repo.delete_logical_latest(artifact_type="dev_smoke", logical_ref=logical)
    return {"ok": True, "artifact_storage": public_runtime_storage_summary()}
