"""
Server-validated operator principals for admin/ops mutations.

Actor identity always comes from a verified JWT (or relaxed-env test auth).
Client headers such as ``x-claw-admin-user-id`` are never trusted as actor.
"""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass
from typing import FrozenSet, Optional

from fastapi import HTTPException, Request

from backend.admin_console.store import get_admin_console_store
from backend.config.deployment_runtime import is_relaxed_claw_environment
from backend.security.commercial_auth import correlation_id_from_request, test_auth_headers_allowed
from backend.security.supabase_jwt import require_supabase_user_id

# Role vocabulary (least → most privilege among operators).
ROLE_CUSTOMER = "customer"
ROLE_RECIPIENT = "recipient"
ROLE_GENESIS_AFFILIATE = "genesis_affiliate"
ROLE_SUPPORT_OPERATOR = "support_operator"
ROLE_ADMIN = "admin"

OPERATOR_ROLES: FrozenSet[str] = frozenset({ROLE_SUPPORT_OPERATOR, ROLE_ADMIN})

# Permissions
PERM_READ_OPS = "ops:read"
PERM_MUTATE_SUPPORT = "ops:mutate_support"
PERM_MUTATE_ADMIN = "ops:mutate_admin"
PERM_MUTATE_FINANCIAL = "ops:mutate_financial"


@dataclass(frozen=True)
class OperatorPrincipal:
    user_id: str
    email: Optional[str]
    role: str
    permissions: FrozenSet[str]
    correlation_id: str

    def require_permission(self, permission: str) -> None:
        if permission not in self.permissions:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "operator_permission_denied",
                    "message": f"Role {self.role} lacks permission {permission}.",
                },
            )


def _permissions_for_role(role: str) -> FrozenSet[str]:
    r = (role or "").strip().lower()
    if r == ROLE_ADMIN:
        return frozenset({PERM_READ_OPS, PERM_MUTATE_SUPPORT, PERM_MUTATE_ADMIN, PERM_MUTATE_FINANCIAL})
    if r == ROLE_SUPPORT_OPERATOR:
        return frozenset({PERM_READ_OPS, PERM_MUTATE_SUPPORT})
    return frozenset()


def _require_admin_secret_second_factor(request: Request) -> None:
    """Optional shared secret as second factor when configured (never sole identity)."""
    secret = os.getenv("CLAW_ADMIN_SECRET", "").strip()
    if not secret:
        if is_relaxed_claw_environment():
            return
        raise HTTPException(
            status_code=403,
            detail={"code": "admin_secret_required", "message": "Operator secret not configured."},
        )
    presented = (request.headers.get("x-claw-admin-secret") or "").strip()
    if not presented or not secrets.compare_digest(secret, presented):
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Invalid operator secret."})


def _lookup_operator_role(user_id: str) -> Optional[str]:
    store = get_admin_console_store()
    store.init_schema()
    row = store.get_admin_user(user_id)
    if not row:
        return None
    if not int(row.get("is_active") or 0):
        return None
    role = str(row.get("role") or "").strip().lower()
    # Normalize legacy "operator" → support_operator
    if role == "operator":
        role = ROLE_SUPPORT_OPERATOR
    if role not in OPERATOR_ROLES:
        return None
    return role


def resolve_operator_principal(
    request: Request,
    *,
    require_permission: Optional[str] = None,
) -> OperatorPrincipal:
    """
    Resolve operator principal from verified JWT + admin_users role registry.

    In relaxed environments only, ``X-Claw-Test-Operator-Role`` may assign a role
    for an already-verified test auth user (never staging/production).
    """
    _require_admin_secret_second_factor(request)
    user_id = require_supabase_user_id(request)
    role = _lookup_operator_role(user_id)

    if role is None and test_auth_headers_allowed():
        test_role = (request.headers.get("X-Claw-Test-Operator-Role") or "").strip().lower()
        if test_role == "operator":
            test_role = ROLE_SUPPORT_OPERATOR
        if test_role in OPERATOR_ROLES:
            email = (request.headers.get("X-Claw-Test-Operator-Email") or "").strip() or None
            store = get_admin_console_store()
            store.init_schema()
            store.touch_admin_user(admin_user_id=user_id, email=email, role=test_role)
            role = test_role

    if role is None:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "operator_role_required",
                "message": "Authenticated principal is not an active operator.",
            },
        )

    principal = OperatorPrincipal(
        user_id=user_id,
        email=None,
        role=role,
        permissions=_permissions_for_role(role),
        correlation_id=correlation_id_from_request(request),
    )
    if require_permission:
        principal.require_permission(require_permission)
    return principal


def require_nonempty_reason(reason: Optional[str], *, field: str = "reason") -> str:
    text = (reason or "").strip()
    if len(text) < 3:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "reason_required",
                "message": f"A non-empty {field} (min 3 characters) is required for this action.",
            },
        )
    return text[:500]
