# backend/handlers/liability_api_handler.py
from __future__ import annotations

from fastapi import HTTPException

from backend.utils.timeline_store import TimelineStore
from backend.liability.map_liability_assessment import map_liability_assessment


def get_liability_assessment(event_id: str, store: TimelineStore) -> dict:
    row = store.find_event_row_by_event_id(event_id)
    if not row:
        raise HTTPException(status_code=404, detail="event_not_found")

    notice = store._parse_notice(row.get("notice_json"))
    if not isinstance(notice, dict) or "liability_attestation" not in notice:
        raise HTTPException(status_code=400, detail="missing_liability_attestation")

    return map_liability_assessment(event_id=event_id, notice=notice)
