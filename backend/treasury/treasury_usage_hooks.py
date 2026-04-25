"""
Optional metered **ledger** lines for product usage (distinct from ``UsageStore`` counters).

Enable with ``CLAW_RECORD_USAGE_LEDGER=1``. Does not debit CLAW Key usage units automatically.
"""

from __future__ import annotations

import os
from decimal import Decimal
from typing import Any, Dict, Optional

from backend.treasury.treasury_store import get_treasury_store

USAGE_EVENT_TYPES = frozenset(
    {
        "revision_preview_used",
        "agreement_created",
        "recipient_invite_sent",
        "signature_request_sent",
        "usage_debited",
    }
)


def record_usage_ledger_event(
    *,
    subject_ref: str,
    event_type: str,
    agreement_id: Optional[str] = None,
    amount: Decimal = Decimal("0"),
    currency: str = "USD",
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    if os.getenv("CLAW_RECORD_USAGE_LEDGER", "0").strip().lower() not in ("1", "true", "yes"):
        return None
    et = (event_type or "").strip()
    if et not in USAGE_EVENT_TYPES:
        return None
    store = get_treasury_store()
    return store.insert_ledger_event(
        event_type=et,
        payment_id=None,
        subject_ref=subject_ref,
        amount=amount,
        currency=currency,
        agreement_id=agreement_id,
        claw_key_id=None,
        metadata=dict(metadata or {}),
    )
