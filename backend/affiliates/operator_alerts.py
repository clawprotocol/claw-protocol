"""Operator-facing alert feed — metadata-only payloads.

Affiliate payout events and **anchoring observability** (see ``backend/anchoring/anchor_alert_dispatch.py``)
both persist here. Optional Slack for anchoring: ``CLAW_ANCHOR_ALERT_SLACK_WEBHOOK_URL``.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any, Dict, Optional

from backend.economics.store import EconomicsStore, get_economics_store

_log = logging.getLogger(__name__)

# Event names (stable contract for integrations)
AFFILIATE_BATCH_PREPARED = "affiliate_batch_prepared"
AFFILIATE_BATCH_EXPORTED = "affiliate_batch_exported"
AFFILIATE_BATCH_PAID = "affiliate_batch_paid"
AFFILIATE_BATCH_FAILED = "affiliate_batch_failed"
AFFILIATE_TREASURY_SHORTFALL = "affiliate_treasury_shortfall"
AFFILIATE_EARNING_CREATED = "affiliate_earning_created"
AFFILIATE_EARNING_PAYABLE = "affiliate_earning_payable"
AFFILIATE_WALLET_INVALID = "affiliate_wallet_invalid"
AFFILIATE_WALLET_COOLING_PERIOD = "affiliate_wallet_cooling_period"
AFFILIATE_PAYOUT_WALLET_LEGACY_IMPORT = "affiliate_payout_wallet_legacy_import"
AFFILIATE_BATCH_STALE_EXPORT = "affiliate_batch_stale_export"


def emit_operator_alert(
    event_type: str,
    payload: Dict[str, Any],
    *,
    severity: str = "info",
    batch_id: Optional[str] = None,
    economics: Optional[EconomicsStore] = None,
) -> str:
    """
    Persist alert + structured log. Payload must be metadata-only (ids, amounts, statuses).
    """
    aid = str(uuid.uuid4())
    eco = economics or get_economics_store()
    eco.init_schema()
    eco.insert_operator_alert(
        alert_id=aid,
        event_type=event_type,
        severity=severity,
        payload=payload,
        batch_id=batch_id,
    )
    try:
        _log.info(
            "operator_alert %s",
            json.dumps({"event": event_type, "severity": severity, "payload": payload}, default=str),
        )
    except Exception:
        _log.info("operator_alert %s %s", event_type, payload)
    return aid


def emit_operator_alert_safe(
    event_type: str,
    payload: Dict[str, Any],
    *,
    severity: str = "info",
    batch_id: Optional[str] = None,
    economics: Optional[EconomicsStore] = None,
) -> Optional[str]:
    try:
        return emit_operator_alert(
            event_type, payload, severity=severity, batch_id=batch_id, economics=economics
        )
    except Exception:
        _log.warning("operator_alert_persist_failed", exc_info=True)
        return None
