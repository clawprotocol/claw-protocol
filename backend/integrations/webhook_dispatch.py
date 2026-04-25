from __future__ import annotations

import json
import logging
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from backend.integrations.constants import CLAW_WEBHOOK_SCHEMA_VERSION, CLAW_WEBHOOK_USER_AGENT
from backend.integrations.webhook_payload import build_webhook_payload, canonical_json_bytes
from backend.integrations.webhook_signing import sign_webhook_body
from backend.integrations import webhook_store

_log = logging.getLogger("claw.integrations.webhooks")


def _emit_audit(event: str, **fields: Any) -> None:
    try:
        payload = json.dumps({"event": event, **fields}, default=str, ensure_ascii=False)
        _log.info("%s", payload)
    except Exception:
        pass


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def deliver_webhook(
    org_id: str,
    hook: Dict[str, Any],
    *,
    event_type: str,
    object_type: str,
    object_id: str,
    summary: Dict[str, Any],
    delivery_id: Optional[str] = None,
) -> None:
    """Synchronous delivery + store updates (invoke from worker thread)."""
    hid = str(hook.get("hook_id") or "")
    secret = str(hook.get("secret") or "")
    url = str(hook.get("url") or "").strip()
    if not url or not secret:
        return

    payload = build_webhook_payload(
        event_type=event_type,
        org_id=org_id,
        object_type=object_type,
        object_id=object_id,
        summary=summary,
    )
    event_id = str(payload["event_id"])
    body = canonical_json_bytes(payload)
    ts = str(int(time.time()))
    sig = sign_webhook_body(secret, ts, body)

    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": CLAW_WEBHOOK_USER_AGENT,
        "X-Claw-Webhook-Id": event_id,
        "X-Claw-Webhook-Timestamp": ts,
        "X-Claw-Webhook-Signature": sig,
        "X-Claw-Webhook-Event-Type": event_type,
        "X-Claw-Webhook-Schema": CLAW_WEBHOOK_SCHEMA_VERSION,
    }

    d_id = delivery_id or f"wdel_{uuid.uuid4().hex[:14]}"
    webhook_store.append_delivery(
        org_id,
        {
            "delivery_id": d_id,
            "hook_id": hid,
            "event_id": event_id,
            "event_type": event_type,
            "object_type": object_type,
            "object_id": object_id,
            "summary": dict(summary),
            "status": "pending",
            "http_status": None,
            "attempts": 0,
            "last_error": None,
            "last_attempt_at": None,
            "created_at": _utc_now(),
            "completed_at": None,
        },
    )

    delays = (0.0, 1.0, 4.0)
    last_code: Optional[int] = None
    last_err: Optional[str] = None
    for attempt_index, delay in enumerate(delays):
        if delay:
            time.sleep(delay)
        n = attempt_index + 1
        try:
            req = urllib.request.Request(url, data=body, method="POST", headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                code = int(getattr(resp, "status", None) or resp.getcode())
                last_code = code
                last_err = None
        except urllib.error.HTTPError as e:
            last_code = int(e.code)
            last_err = f"http_{e.code}"
            try:
                e.read()
            except Exception:
                pass
        except Exception as e:
            last_code = None
            last_err = str(e)[:500]

        webhook_store.update_delivery(
            org_id,
            d_id,
            attempts=n,
            last_attempt_at=_utc_now(),
            http_status=last_code,
            last_error=last_err,
        )

        if last_code is not None and 200 <= last_code < 300:
            webhook_store.update_delivery(org_id, d_id, status="success", completed_at=_utc_now())
            _emit_audit(
                "webhook_delivery_succeeded",
                org_id=org_id,
                hook_id=hid,
                event_type=event_type,
                delivery_id=d_id,
                attempts=n,
            )
            return

    webhook_store.update_delivery(org_id, d_id, status="failed", completed_at=_utc_now())
    _emit_audit(
        "webhook_delivery_failed",
        org_id=org_id,
        hook_id=hid,
        event_type=event_type,
        delivery_id=d_id,
        error=last_err,
        http_status=last_code,
        attempts=len(delays),
    )


def dispatch_webhook_event_async(
    org_id: str,
    event_type: str,
    object_type: str,
    object_id: str,
    summary: Dict[str, Any],
) -> None:
    if not org_id.strip():
        return
    hooks = webhook_store.iter_hooks_for_event(org_id.strip(), event_type)
    if not hooks:
        return

    oid = org_id.strip()

    def _run() -> None:
        for h in hooks:
            try:
                deliver_webhook(oid, h, event_type=event_type, object_type=object_type, object_id=object_id, summary=summary)
            except Exception as exc:
                _emit_audit(
                    "webhook_delivery_failed",
                    org_id=oid,
                    hook_id=str(h.get("hook_id")),
                    event_type=event_type,
                    error=str(exc)[:500],
                )

    t = threading.Thread(target=_run, name=f"claw-webhook-{event_type}", daemon=True)
    t.start()


def retry_delivery(org_id: str, delivery_id: str) -> bool:
    rec = webhook_store.get_delivery_record(org_id, delivery_id)
    if not rec:
        return False
    hid = str(rec.get("hook_id") or "")
    hook = webhook_store.get_hook_row(org_id, hid)
    if not hook:
        return False
    et = str(rec.get("event_type") or "")
    eid = str(rec.get("event_id") or "")
    ot = str(rec.get("object_type") or "")
    oid = str(rec.get("object_id") or "")
    raw_sum = rec.get("summary")
    if et and ot and oid and isinstance(raw_sum, dict):
        summary = {
            **raw_sum,
            "admin_delivery_replay": True,
            "replay_of_delivery_id": delivery_id,
            "original_event_id": eid,
        }
        deliver_webhook(
            org_id,
            hook,
            event_type=et,
            object_type=ot,
            object_id=oid,
            summary=summary,
            delivery_id=f"{delivery_id}_r{int(time.time())}",
        )
        return True
    summary = {
        "admin_delivery_replay": True,
        "retry_of_delivery": delivery_id,
        "original_event_id": eid,
        "note": "Legacy delivery row had no stored summary; payload minimal — prefer fresh events when possible.",
    }
    deliver_webhook(
        org_id,
        hook,
        event_type=et or "unknown",
        object_type="replay",
        object_id=delivery_id,
        summary=summary,
        delivery_id=f"{delivery_id}_r{int(time.time())}",
    )
    return True
