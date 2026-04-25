"""
Org-scoped webhook configuration and delivery log (filesystem, separate from proof store).

Path: ``{data_dir}/integrations/webhooks/{org_id}/state.json``
"""
from __future__ import annotations

import json
import os
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.config.runtime_environment import data_dir

from backend.integrations.constants import CLAW_WEBHOOK_EVENT_TYPES

_MAX_DELIVERIES = 500


def _org_dir(org_id: str) -> Path:
    oid = (org_id or "").strip()
    if not oid or "/" in oid or ".." in oid:
        raise ValueError("invalid_org_id")
    root = Path(data_dir()) / "integrations" / "webhooks" / oid
    root.mkdir(parents=True, exist_ok=True)
    return root


def list_org_ids_with_webhook_state(limit: int = 200) -> List[str]:
    root = Path(data_dir()) / "integrations" / "webhooks"
    if not root.is_dir():
        return []
    out: List[str] = []
    for p in root.iterdir():
        if not p.is_dir():
            continue
        oid = p.name.strip()
        if not oid:
            continue
        if not (p / "state.json").is_file():
            continue
        out.append(oid)
    out.sort()
    return out[: max(1, min(limit, 2000))]


def _state_path(org_id: str) -> Path:
    return _org_dir(org_id) / "state.json"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _load_state(org_id: str) -> Dict[str, Any]:
    p = _state_path(org_id)
    if not p.is_file():
        return {"version": 1, "hooks": [], "deliveries": []}
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            raw.setdefault("hooks", [])
            raw.setdefault("deliveries", [])
            return raw
    except (OSError, json.JSONDecodeError):
        pass
    return {"version": 1, "hooks": [], "deliveries": []}


def _save_state(org_id: str, state: Dict[str, Any]) -> None:
    p = _state_path(org_id)
    tmp = p.with_suffix(".tmp")
    data = json.dumps(state, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    tmp.write_text(data, encoding="utf-8")
    tmp.replace(p)


def validate_event_types(events: List[str]) -> List[str]:
    allowed = set(CLAW_WEBHOOK_EVENT_TYPES)
    out: List[str] = []
    for e in events:
        s = str(e).strip()
        if s in allowed:
            out.append(s)
    return sorted(set(out))


def list_hooks(org_id: str) -> List[Dict[str, Any]]:
    st = _load_state(org_id)
    hooks: List[Dict[str, Any]] = []
    for h in st.get("hooks") or []:
        if not isinstance(h, dict):
            continue
        sec = str(h.get("secret") or "")
        preview = ""
        if sec.startswith("whsec_") and len(sec) > 10:
            preview = sec[:6] + "…" + sec[-4:]
        hooks.append(
            {
                "hook_id": h.get("hook_id"),
                "url": h.get("url"),
                "events": list(h.get("events") or []),
                "enabled": bool(h.get("enabled", True)),
                "created_at": h.get("created_at"),
                "secret_preview": preview,
            }
        )
    return hooks


def create_hook(org_id: str, *, url: str, events: List[str]) -> Dict[str, Any]:
    st = _load_state(org_id)
    hooks = [h for h in st.get("hooks") or [] if isinstance(h, dict)]
    hid = f"wh_{uuid.uuid4().hex[:12]}"
    secret = "whsec_" + secrets.token_hex(24)
    row = {
        "hook_id": hid,
        "url": url.strip(),
        "secret": secret,
        "events": validate_event_types(events),
        "enabled": True,
        "created_at": _utc_now(),
    }
    hooks.append(row)
    st["hooks"] = hooks
    _save_state(org_id, st)
    return {
        "hook_id": hid,
        "url": row["url"],
        "events": row["events"],
        "enabled": True,
        "signing_secret": secret,
        "created_at": row["created_at"],
    }


def get_hook_secret(org_id: str, hook_id: str) -> Optional[str]:
    st = _load_state(org_id)
    for h in st.get("hooks") or []:
        if isinstance(h, dict) and str(h.get("hook_id")) == hook_id:
            return str(h.get("secret") or "")
    return None


def update_hook(org_id: str, hook_id: str, *, url: Optional[str], events: Optional[List[str]], enabled: Optional[bool]) -> None:
    st = _load_state(org_id)
    hooks = st.get("hooks") or []
    found = False
    for h in hooks:
        if not isinstance(h, dict) or str(h.get("hook_id")) != hook_id:
            continue
        found = True
        if url is not None:
            h["url"] = url.strip()
        if events is not None:
            h["events"] = validate_event_types(events)
        if enabled is not None:
            h["enabled"] = bool(enabled)
    if not found:
        raise KeyError("hook_not_found")
    st["hooks"] = hooks
    _save_state(org_id, st)


def rotate_hook_secret(org_id: str, hook_id: str) -> str:
    st = _load_state(org_id)
    hooks = st.get("hooks") or []
    new_sec = "whsec_" + secrets.token_hex(24)
    found = False
    for h in hooks:
        if isinstance(h, dict) and str(h.get("hook_id")) == hook_id:
            h["secret"] = new_sec
            h["secret_rotated_at"] = _utc_now()
            found = True
            break
    if not found:
        raise KeyError("hook_not_found")
    st["hooks"] = hooks
    _save_state(org_id, st)
    return new_sec


def delete_hook(org_id: str, hook_id: str) -> None:
    st = _load_state(org_id)
    hooks = [h for h in st.get("hooks") or [] if isinstance(h, dict) and str(h.get("hook_id")) != hook_id]
    if len(hooks) == len(st.get("hooks") or []):
        raise KeyError("hook_not_found")
    st["hooks"] = hooks
    _save_state(org_id, st)


def append_delivery(org_id: str, record: Dict[str, Any]) -> None:
    st = _load_state(org_id)
    dels = [d for d in st.get("deliveries") or [] if isinstance(d, dict)]
    dels.append(record)
    if len(dels) > _MAX_DELIVERIES:
        dels = dels[-_MAX_DELIVERIES:]
    st["deliveries"] = dels
    _save_state(org_id, st)


def update_delivery(org_id: str, delivery_id: str, **fields: Any) -> None:
    st = _load_state(org_id)
    dels = st.get("deliveries") or []
    for d in dels:
        if isinstance(d, dict) and str(d.get("delivery_id")) == delivery_id:
            d.update(fields)
            break
    st["deliveries"] = dels
    _save_state(org_id, st)


def list_deliveries(org_id: str, *, hook_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    st = _load_state(org_id)
    dels = [d for d in st.get("deliveries") or [] if isinstance(d, dict)]
    if hook_id:
        dels = [d for d in dels if str(d.get("hook_id")) == hook_id]
    dels.sort(key=lambda x: str(x.get("created_at") or ""), reverse=True)
    out: List[Dict[str, Any]] = []
    for d in dels[: max(1, min(200, limit))]:
        attempts = d.get("attempts")
        http_status = d.get("http_status")
        last_error = d.get("last_error")
        out.append(
            {
                "delivery_id": d.get("delivery_id"),
                "hook_id": d.get("hook_id"),
                "event_id": d.get("event_id"),
                "event_type": d.get("event_type"),
                "object_type": d.get("object_type"),
                "object_id": d.get("object_id"),
                "status": d.get("status"),
                "http_status": http_status,
                "response_code": http_status,
                "attempts": attempts,
                "retry_count": attempts,
                "last_error": last_error,
                "error_summary": last_error,
                "last_attempt_at": d.get("last_attempt_at"),
                "created_at": d.get("created_at"),
                "completed_at": d.get("completed_at"),
            }
        )
    return out


def list_all_org_deliveries(*, limit: int = 200) -> List[Dict[str, Any]]:
    lim = max(1, min(int(limit), 2000))
    out: List[Dict[str, Any]] = []
    for oid in list_org_ids_with_webhook_state(limit=500):
        for row in list_deliveries(oid, limit=lim):
            r = dict(row)
            r["org_id"] = oid
            out.append(r)
    out.sort(key=lambda x: str(x.get("created_at") or ""), reverse=True)
    return out[:lim]


def iter_hooks_for_event(org_id: str, event_type: str) -> List[Dict[str, Any]]:
    st = _load_state(org_id)
    out: List[Dict[str, Any]] = []
    for h in st.get("hooks") or []:
        if not isinstance(h, dict) or not h.get("enabled", True):
            continue
        evs = h.get("events") or []
        if event_type not in evs:
            continue
        out.append(h)
    return out


def get_delivery_record(org_id: str, delivery_id: str) -> Optional[Dict[str, Any]]:
    st = _load_state(org_id)
    for d in st.get("deliveries") or []:
        if isinstance(d, dict) and str(d.get("delivery_id")) == delivery_id:
            return d
    return None


def get_hook_row(org_id: str, hook_id: str) -> Optional[Dict[str, Any]]:
    st = _load_state(org_id)
    for h in st.get("hooks") or []:
        if isinstance(h, dict) and str(h.get("hook_id")) == hook_id:
            return h
    return None
