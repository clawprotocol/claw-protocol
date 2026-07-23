"""
Unified privileged-operation gate for legacy /admin, ops-anchor, affiliate-ops,
and internal operator surfaces.

Requires:
  - validated operator principal (JWT/test-auth + role registry)
  - explicit permission
  - nonempty reason
  - immutable admin_console audit row
  - shared secret only as second factor (via resolve_operator_principal)
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException, Request

from backend.admin_console.store import get_admin_console_store
from backend.security.operator_principal import (
    PERM_MUTATE_ADMIN,
    PERM_MUTATE_FINANCIAL,
    PERM_MUTATE_SUPPORT,
    PERM_READ_OPS,
    OperatorPrincipal,
    require_nonempty_reason,
    resolve_operator_principal,
)


def require_privileged_operator(
    request: Request,
    *,
    permission: str,
    action_type: str,
    target_type: str = "ops",
    target_id: str = "global",
    reason: Optional[str] = None,
) -> OperatorPrincipal:
    principal = resolve_operator_principal(request, require_permission=permission)
    reason_text = require_nonempty_reason(
        reason
        or (request.headers.get("x-claw-admin-reason") or "").strip()
        or (request.query_params.get("reason") if hasattr(request, "query_params") else None)
    )
    get_admin_console_store().append_admin_action_audit(
        admin_user_id=principal.user_id,
        action_type=action_type[:64],
        target_type=(target_type or "ops")[:64],
        target_id=(target_id or "global")[:128],
        reason=reason_text,
        before_snapshot_json=None,
        after_snapshot_json=None,
        actor_role=principal.role,
        correlation_id=principal.correlation_id or None,
    )
    return principal


def reason_from_body(body: Any) -> Optional[str]:
    if body is None:
        return None
    if isinstance(body, dict):
        return (body.get("reason") or "").strip() or None
    return (getattr(body, "reason", None) or "").strip() or None


__all__ = [
    "PERM_READ_OPS",
    "PERM_MUTATE_SUPPORT",
    "PERM_MUTATE_ADMIN",
    "PERM_MUTATE_FINANCIAL",
    "require_privileged_operator",
    "reason_from_body",
]
