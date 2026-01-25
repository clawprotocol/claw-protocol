from __future__ import annotations

from typing import Any, Dict

from fastapi import HTTPException

from backend.utils.timeline_store import TimelineStore


def get_batch(*, store: TimelineStore, batch_id: str) -> Dict[str, Any]:
    c = store._conn()
    try:
        row = c.execute("SELECT * FROM batches WHERE batch_id=?", (batch_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="batch_not_found")
        return dict(row)
    finally:
        c.close()


def get_receipt_for_verify(*, store: TimelineStore, receipt_id: str) -> Dict[str, Any]:
    c = store._conn()
    try:
        row = c.execute("SELECT * FROM receipts WHERE receipt_id=?", (receipt_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="receipt_not_found")
        return store.get_receipt(receipt_id)  # includes merkle_proof_json parsed
    finally:
        c.close()
