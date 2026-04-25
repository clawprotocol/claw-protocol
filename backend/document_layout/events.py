from __future__ import annotations

import json
import logging
from typing import Any, Dict

_log = logging.getLogger("claw.document_layout.events")


def emit_document_layout_event(event: str, **fields: Any) -> None:
    """
    Structured logs for layout pipeline (searchable in log drains).

    Pass metadata only (ids, counts, hashes, lengths) — never raw document text,
    queries, or model output. See ``backend.security.safe_logging.FORBIDDEN_LOGGING_CONTENT``.
    """
    payload: Dict[str, Any] = {"event": event, **fields}
    _log.info("%s", json.dumps(payload, default=str, ensure_ascii=False))
