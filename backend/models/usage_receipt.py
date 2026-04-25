from __future__ import annotations

from typing import Any, List, Optional, TypedDict


class UsagePaymentSourceDict(TypedDict):
    amount_usd: str
    payment_id: str


class UsageReceiptBodyDict(TypedDict):
    key_cost: int
    keys_balance_after: int
    keys_balance_before: int
    org_id: str
    payment_sources: List[UsagePaymentSourceDict]
    service_type: str
    timestamp: str
    type: str
    unit_count: Any
    usage_event_id: str
    user_id: Optional[str]
    version: str
