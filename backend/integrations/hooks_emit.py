"""Fire-and-forget outbound webhooks from product code paths (never blocks request path on failures)."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from backend.integrations.webhook_dispatch import dispatch_webhook_event_async
from backend.utils.enforce import org_id_from_subject

_log = logging.getLogger("claw.integrations.emit")


def claw_emit_integration_event(
    org_id: Optional[str],
    event_type: str,
    object_type: str,
    object_id: str,
    summary: Dict[str, Any],
) -> None:
    oid = (org_id or "").strip()
    if not oid:
        return
    try:
        dispatch_webhook_event_async(oid, event_type, object_type, object_id, summary)
    except Exception:
        _log.exception("claw_emit_integration_event failed org=%s type=%s", oid, event_type)


def claw_emit_integration_event_from_subject(
    subject_ref: Optional[str],
    event_type: str,
    object_type: str,
    object_id: str,
    summary: Dict[str, Any],
) -> None:
    oid = org_id_from_subject(subject_ref or "") if subject_ref else None
    if not oid:
        return
    claw_emit_integration_event(oid, event_type, object_type, object_id, summary)


def claw_org_id_for_registered_agreement(agreement_id: str) -> Optional[str]:
    """Resolve org id from usage-economics owner subject when the agreement is registered."""
    aid = (agreement_id or "").strip()
    if not aid:
        return None
    try:
        from backend.usage_economics.store import get_usage_economics_store

        store = get_usage_economics_store()
        store.init_schema()
        subj = store.owner_subject_for_agreement(aid)
        if not subj:
            return None
        return org_id_from_subject(subj)
    except Exception:
        _log.exception("claw_org_id_for_registered_agreement failed agreement_id=%s", aid)
        return None
