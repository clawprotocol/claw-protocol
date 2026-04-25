from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from backend.config.feed_anchor_policy import (
    feed_event_anchor_network_default,
    feed_public_api_enabled,
    settlement_anchor_network_hint,
)
from backend.services.claw_feed_service import list_public_feed_safe

router = APIRouter(prefix="/api/feed", tags=["claw-feed"])


@router.get("/public")
def get_public_feed(limit: int = 50) -> Dict[str, Any]:
    if not feed_public_api_enabled():
        raise HTTPException(status_code=404, detail="not_found")
    lim = max(1, min(int(limit), 200))
    events = list_public_feed_safe(limit=lim)
    return {
        "events": events,
        "policy": {
            "feed_event_anchor_network_default": feed_event_anchor_network_default(),
            "settlement_anchor_network_hint": settlement_anchor_network_hint(),
        },
    }
