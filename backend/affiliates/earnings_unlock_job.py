"""
Scheduled job: pending affiliate_earnings → payable after hold window.

Run from cron / worker (e.g. hourly). Actual USDC disbursement remains in ``payouts.run_payout_cycle``.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from backend.affiliates import operator_alerts as op_alerts
from backend.economics.store import EconomicsStore, get_economics_store


def run_affiliate_earning_unlock_cycle(
    *,
    economics: Optional[EconomicsStore] = None,
    as_of: Optional[datetime] = None,
) -> Dict[str, Any]:
    eco = economics or get_economics_store()
    eco.init_schema()
    dt = as_of or datetime.now(timezone.utc)
    as_of_iso = dt.isoformat().replace("+00:00", "Z")
    n = eco.promote_affiliate_earnings_pending_to_payable(as_of_iso=as_of_iso)
    if n > 0:
        op_alerts.emit_operator_alert_safe(
            op_alerts.AFFILIATE_EARNING_PAYABLE,
            {"promoted_to_payable": int(n), "as_of": as_of_iso},
            economics=eco,
        )
    return {"ok": True, "promoted_to_payable": n, "as_of": as_of_iso}
