"""
Anchoring operator alerts: economics DB feed + optional Slack incoming webhook.

SMS / PagerDuty: not implemented; operators can fan out from Slack or JSONL log shipping.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

import requests

from backend.affiliates.operator_alerts import emit_operator_alert_safe

_log = logging.getLogger(__name__)


def anchoring_slack_webhook_url() -> str:
    return os.getenv("CLAW_ANCHOR_ALERT_SLACK_WEBHOOK_URL", "").strip()


def anchoring_observability_alerts_enabled() -> bool:
    return os.getenv("CLAW_ANCHOR_OBSERVABILITY_ALERTS", "1").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


def _maybe_slack(*, severity: str, event_type: str, payload: Dict[str, Any]) -> None:
    url = anchoring_slack_webhook_url()
    if not url:
        return
    try:
        body = {
            "text": f"[{severity}] {event_type}\n```{json.dumps(payload, default=str)[:2800]}```",
        }
        r = requests.post(url, json=body, timeout=12)
        r.raise_for_status()
    except Exception:
        _log.warning("anchoring_slack_webhook_failed", exc_info=True)


def dispatch_anchoring_operator_alert(
    event_type: str,
    severity: str,
    payload: Dict[str, Any],
    *,
    batch_id: Optional[str] = None,
) -> Optional[str]:
    """
    Persist to operator_alerts (always) and optionally mirror to Slack.

    ``payload`` must be metadata-only (ids, counts, statuses — no secrets, no user substance).
    """
    aid = emit_operator_alert_safe(
        event_type,
        payload,
        severity=severity,
        batch_id=batch_id,
    )
    _maybe_slack(severity=severity, event_type=event_type, payload=payload)
    return aid


__all__ = [
    "anchoring_observability_alerts_enabled",
    "anchoring_slack_webhook_url",
    "dispatch_anchoring_operator_alert",
]
