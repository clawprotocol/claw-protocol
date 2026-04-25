# backend/handlers/liability_latest_handler.py
from __future__ import annotations

import json
from typing import Any, Dict, Optional

from fastapi import HTTPException

from backend.utils.timeline_store import TimelineStore
from backend.handlers.liability_api_handler import get_liability_assessment


def get_latest_liability_event_id(store: TimelineStore, timeline_id: str) -> Optional[str]:
    return store.get_latest_liability_event_id(timeline_id)


def get_latest_liability_for_timeline(store: TimelineStore, timeline_id: str) -> Dict[str, Any]:
    # 1) Ensure timeline exists (cleaner error)
    tl = store.get_timeline(timeline_id)
    if not tl:
        raise HTTPException(status_code=404, detail="timeline_not_found")

    # 2) Find newest liability attestation notice event
    event_id = get_latest_liability_event_id(store, timeline_id)
    if not event_id:
        raise HTTPException(status_code=404, detail="missing_liability_attestation")

    # 3) Reuse existing assessment builder (the thing powering /v1/liability/assessment/{event_id})
    assessment = get_liability_assessment(event_id, store)

    # 4) Return combined result for UX
    return {
        "timeline_id": timeline_id,
        "event_id": event_id,
        "assessment": assessment,
    }
