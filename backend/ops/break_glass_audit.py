"""
Break-glass audit trail — operator / privileged HTTP surfaces.

Append-only JSONL (one object per line). **Never** log secrets, tokens, bodies, or user substance.

Future: call ``log_break_glass_event`` from any route that reads agreement text, exports raw drafts,
or otherwise touches user substance under non-user auth (see module docstring on each action).

Env:
  CLAW_BREAK_GLASS_AUDIT — ``0`` / ``false`` disables writes (default: enabled).
  CLAW_BREAK_GLASS_LOG_PATH — override file path; default ``<data_dir>/logs/break_glass_audit.jsonl``.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import Request

from backend.config.deployment_runtime import claw_environment
from backend.config.runtime_environment import data_dir

log = logging.getLogger(__name__)

SCHEMA = "lawdog.break_glass/v1"


class BreakGlassAction:
    """Stable reason codes for audit queries and alerting (not user-facing)."""

    ADMIN_ANCHOR_RUN = "admin.anchor_run"
    ADMIN_ANCHOR_JOB_REQUEUE = "admin.anchor_job_requeue"
    OPS_V1_ANCHOR_RETRY_JOB = "ops.v1_anchor_retry_job"
    OPS_V1_ANCHOR_SUMMARY = "ops.v1_anchor_summary"
    ADMIN_RUNTIME_SUMMARY = "admin.runtime_summary"
    ADMIN_DEPLOY_READINESS = "admin.deploy_readiness"
    INTERNAL_USAGE_ECONOMICS_OVERVIEW = "internal.usage_economics_overview"
    DEV_STORAGE_SMOKE = "dev.storage_smoke"


def break_glass_audit_enabled() -> bool:
    return os.getenv("CLAW_BREAK_GLASS_AUDIT", "1").strip().lower() not in ("0", "false", "no", "off")


def break_glass_log_path() -> str:
    env = os.getenv("CLAW_BREAK_GLASS_LOG_PATH", "").strip()
    if env:
        return os.path.expanduser(env)
    return os.path.join(data_dir(), "logs", "break_glass_audit.jsonl")


def _client_ip(req: Request) -> Optional[str]:
    try:
        if req.client and req.client.host:
            return req.client.host
    except Exception:
        pass
    return None


def _request_id(req: Request) -> Optional[str]:
    return getattr(req.state, "request_id", None)


def log_break_glass_event(
    request: Request,
    action: str,
    *,
    auth_channel: str,
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Record a privileged operator action. Safe for JSONL SIEM export.

    ``auth_channel`` should name how auth was satisfied, e.g. ``x-claw-admin-secret``,
    ``x-claw-admin-token`` — never pass the secret value.
    """
    if not break_glass_audit_enabled():
        return

    path = break_glass_log_path()
    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    except Exception:
        log.exception("break_glass: could not create log directory")

    row: Dict[str, Any] = {
        "schema": SCHEMA,
        "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "kind": "break_glass",
        "action": action,
        "method": request.method,
        "path": request.url.path,
        "query_keys": sorted(request.query_params.keys()),
        "request_id": _request_id(request),
        "client_ip": _client_ip(request),
        "auth_channel": auth_channel,
        "environment": claw_environment() or "(unset)",
    }
    if extra:
        for k, v in extra.items():
            if k not in row:
                row[k] = v

    try:
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
    except Exception:
        log.exception("break_glass: append failed path=%s", path)


def log_break_glass_substance_access(
    request: Request,
    *,
    action: str,
    resource_type: str,
    resource_ref: str,
    reason_code: str,
    auth_channel: str,
) -> None:
    """
    Reserved for future routes that read user substance (agreement body, uploads, etc.).

    ``resource_ref`` should be non-sensitive: agreement_id prefix, hash prefix, or opaque id —
    never full document text.
    """
    log_break_glass_event(
        request,
        action,
        auth_channel=auth_channel,
        extra={
            "resource_type": resource_type,
            "resource_ref": (resource_ref or "")[:128],
            "reason_code": (reason_code or "")[:64],
            "substance": True,
        },
    )
