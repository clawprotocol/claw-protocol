from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from backend.integrations.constants import CLAW_WEBHOOK_SCHEMA_VERSION


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def build_webhook_payload(
    *,
    event_type: str,
    org_id: str,
    object_type: str,
    object_id: str,
    summary: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "event_id": f"evt_{uuid.uuid4().hex}",
        "event_type": event_type,
        "occurred_at": _utc_now_iso(),
        "org_id": org_id,
        "object_type": object_type,
        "object_id": object_id,
        "summary": summary,
        "version": CLAW_WEBHOOK_SCHEMA_VERSION,
    }


def canonical_json_bytes(payload: Dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
