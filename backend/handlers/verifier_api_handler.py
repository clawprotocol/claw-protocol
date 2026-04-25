from __future__ import annotations

from typing import Any, Dict

from fastapi import HTTPException

from backend.utils.timeline_store import TimelineStore


def get_batch(*, store: TimelineStore, batch_id: str) -> Dict[str, Any]:
    row = store.get_merkle_batch_row(batch_id)
    if not row:
        raise HTTPException(status_code=404, detail="batch_not_found")
    return row


def get_receipt_for_verify(*, store: TimelineStore, receipt_id: str) -> Dict[str, Any]:
    try:
        return store.get_receipt(receipt_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="receipt_not_found") from None
