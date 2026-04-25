"""
Daily reserve release: marks DB row + emits deterministic ``ReserveReleased`` ledger line.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from backend.payments import canon_events
from backend.payments.service import emit_event
from backend.payments.store import get_onramp_store
from backend.treasury.treasury_store import get_treasury_store


def reserve_release_daily_cycle(*, as_of_iso: str | None = None) -> Dict[str, Any]:
    now = as_of_iso or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    store = get_onramp_store()
    treasury = get_treasury_store()
    store.init_schema()
    treasury.init_schema()

    due: List[Dict[str, Any]] = store.list_reserves_due(as_of_iso=now)
    released = 0
    for row in due:
        rid = str(row["id"])
        store.mark_reserve_released(reserve_id=rid)
        ev = canon_events.reserve_released(reserve_id=rid)
        emit_event(
            store=store,
            treasury=treasury,
            event=ev,
            payment_id=str(row.get("payment_id") or "") or None,
            reserve_id=rid,
            subject_ref=str(row.get("org_id") or "") or None,
            ledger_amount=None,
            currency="USD",
        )
        released += 1
    return {"ok": True, "released_count": released, "as_of": now}
