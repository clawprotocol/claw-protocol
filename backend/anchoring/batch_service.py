"""Adaptive receipt-batch anchoring: open batches, activity-based windows."""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional, TYPE_CHECKING

from backend.services import receipt_service

if TYPE_CHECKING:
    from backend.anchoring.store import AnchoringStore


def compute_activity_mode(receipt_count_last_24h: int) -> Dict[str, Any]:
    """
    Map recent receipt volume to batching parameters.

    Higher traffic → shorter collection windows (still conservative for launch).
    """
    n = max(0, int(receipt_count_last_24h))
    if n < 10:
        return {"adaptive_window_minutes": 1440, "min_receipts_at_close": 1}
    if n < 100:
        return {"adaptive_window_minutes": 360, "min_receipts_at_close": 2}
    return {"adaptive_window_minutes": 60, "min_receipts_at_close": 5}


class AdaptiveBatchAnchorService:
    def __init__(
        self,
        store: "AnchoringStore",
        get_receipt: Optional[Callable[[str], Optional[Dict[str, Any]]]] = None,
    ) -> None:
        self._store = store
        self._get_receipt = get_receipt

    def append_receipt_to_open_batch(self, receipt_id: str, *, mode: Optional[Dict[str, Any]] = None) -> None:
        getter = self._get_receipt or receipt_service.get_receipt
        rec = getter((receipt_id or "").strip()) or {}
        h = rec.get("receipt_hash_sha256") if isinstance(rec, dict) else None
        if not isinstance(h, str) or len(h.strip()) != 64:
            raise ValueError("missing_or_invalid_receipt_hash_sha256")
        m = mode if isinstance(mode, dict) else compute_activity_mode(0)
        self._store.append_open_batch_receipt(
            receipt_id=(receipt_id or "").strip(),
            receipt_hash_sha256=h.strip().lower(),
            mode=m,
        )
