"""Minimal client event ack for optional UX / analytics hooks (joy layer).

No persistence by default — enable logging at the edge if needed.
Set VITE_CLAW_JOY_TELEMETRY=1 on the frontend to POST here.
"""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter

router = APIRouter(prefix="/v1/client", tags=["client"])


@router.post("/events")
async def post_client_event(_body: Dict[str, Any]) -> Dict[str, bool]:
    return {"ok": True}
