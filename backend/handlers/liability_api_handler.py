# backend/handlers/liability_api_handler.py
from __future__ import annotations

from fastapi import HTTPException

from backend.utils.timeline_store import TimelineStore
from backend.liability.map_liability_assessment import map_liability_assessment


def get_liability_assessment(event_id: str, store: TimelineStore) -> dict:
    # Find the event by event_id (timeline_id unknown). Minimal DB query.
    c = store._conn()
    try:
        row = c.execute(
            "SELECT timeline_id, event_id, notice_json FROM events WHERE event_id = ?",
            (event_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="event_not_found")

        # Parse notice JSON using store helper
        notice = store._parse_notice(row["notice_json"])
        if not isinstance(notice, dict) or "liability_attestation" not in notice:
            raise HTTPException(status_code=400, detail="missing_liability_attestation")

        return map_liability_assessment(event_id=event_id, notice=notice)
    finally:
        c.close()
