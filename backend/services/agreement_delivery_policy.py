"""Server-controlled agreement delivery policy.

``CLAW_AGREEMENT_DELIVERY_MODE`` unset keeps today's per-channel behavior.
``manual`` suppresses every agreement provider channel before queueing or
network calls. ``provider`` keeps that same per-channel behavior explicitly.
An unknown explicit value is rejected and never treated as provider delivery.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict

_log = logging.getLogger(__name__)

AGREEMENT_DELIVERY_MODES = frozenset({"manual", "provider"})
AGREEMENT_WEBHOOK_EVENT_PREFIX = "agreement."


class AgreementDeliveryConfigError(RuntimeError):
    code = "agreement_delivery_mode_invalid"

    def __init__(self, raw: str) -> None:
        self.raw = raw
        super().__init__(self.code)


@dataclass(frozen=True)
class AgreementDeliveryDecision:
    channel: str
    status: str
    provider_allowed: bool
    retry_eligible: bool
    reason: str


def agreement_delivery_mode_label() -> str:
    """Non-raising label for operator summaries. Never returns a secret."""
    raw = os.getenv("CLAW_AGREEMENT_DELIVERY_MODE")
    if raw is None or not str(raw).strip():
        return "unset"
    text = str(raw).strip().lower()
    if text not in AGREEMENT_DELIVERY_MODES:
        return "invalid"
    return text


def resolve_agreement_delivery(channel: str) -> AgreementDeliveryDecision:
    """Decide one channel from server configuration only."""
    name = (channel or "").strip() or "agreement_delivery"
    raw = os.getenv("CLAW_AGREEMENT_DELIVERY_MODE")
    if raw is None or not str(raw).strip():
        return AgreementDeliveryDecision(
            channel=name,
            status="provider",
            provider_allowed=True,
            retry_eligible=True,
            reason="agreement_delivery_unset",
        )
    mode = str(raw).strip().lower()
    if mode not in AGREEMENT_DELIVERY_MODES:
        raise AgreementDeliveryConfigError(mode)
    if mode == "manual":
        return AgreementDeliveryDecision(
            channel=name,
            status="suppressed_manual",
            provider_allowed=False,
            retry_eligible=False,
            reason="agreement_delivery_manual",
        )
    return AgreementDeliveryDecision(
        channel=name,
        status="provider",
        provider_allowed=True,
        retry_eligible=True,
        reason="agreement_delivery_provider",
    )


def suppressed_manual(channel: str) -> bool:
    return resolve_agreement_delivery(channel).status == "suppressed_manual"


def log_suppressed(channel: str) -> None:
    decision = resolve_agreement_delivery(channel)
    _log.info(
        "[agreement-delivery] status=%s channel=%s reason=%s retry_eligible=%s",
        decision.status,
        decision.channel,
        decision.reason,
        decision.retry_eligible,
    )


def suppressed_delivery_event(event_type: str, channel: str, **extra: Any) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    value: Dict[str, Any] = {
        "status": "suppressed_manual",
        "channel": channel,
        "retry_eligible": False,
        "sent_count": 0,
        "failed_count": 0,
    }
    value.update(extra)
    return {
        "event_type": event_type,
        "at": now,
        "field": channel,
        "status": "suppressed_manual",
        "retry_eligible": False,
        "value": value,
    }


def delivery_event_is_suppressed(event: Any) -> bool:
    if not isinstance(event, dict):
        return False
    if str(event.get("status") or "") == "suppressed_manual":
        return True
    value = event.get("value")
    return isinstance(value, dict) and str(value.get("status") or "") == "suppressed_manual"


def is_agreement_webhook_event(event_type: str) -> bool:
    return str(event_type or "").startswith(AGREEMENT_WEBHOOK_EVENT_PREFIX)
