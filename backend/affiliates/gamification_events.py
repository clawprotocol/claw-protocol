"""Structured logs for affiliate gamification (searchable in drains)."""
from __future__ import annotations

import json
import logging
from typing import Any

_log = logging.getLogger("claw.affiliates.gamification")


def emit_affiliate_gamification_event(event: str, **fields: Any) -> None:
    payload = {"event": event, **fields}
    try:
        _log.info("%s", json.dumps(payload, default=str, ensure_ascii=False))
    except Exception:
        _log.info("%s %s", event, fields)
