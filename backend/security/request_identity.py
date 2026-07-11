"""Canonical request identity — single authority for workspace authentication."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

from fastapi import HTTPException, Request

from backend.security.supabase_jwt import require_supabase_user_id
from backend.security.workspace_identity import (
    anonymous_session_enforcement_enabled,
    extract_anonymous_session_token,
    verify_anonymous_session_from_request,
)

WorkspaceKind = Literal["anonymous", "authenticated", "legacy"]


@dataclass(frozen=True)
class WorkspaceIdentity:
    kind: WorkspaceKind
    org_id: str
    subject_ref: str
    user_id: Optional[str] = None


def resolve_workspace_identity(request: Request) -> WorkspaceIdentity:
    """
    Resolve verified workspace identity for agreement and billing routes.

    - anon-* orgs require a valid server-issued anonymous session credential.
    - user-* orgs require a verified Supabase JWT (or test auth header in non-prod).
      Client org header must match server-derived user-{sub}; anonymous credentials are rejected.
    - Other org ids (local-org, test fixtures) pass through for dev compatibility.
    """
    from backend.usage_economics.policy import _raw_org_id_from_request

    org_id = _raw_org_id_from_request(request)

    if org_id.startswith("anon-"):
        if anonymous_session_enforcement_enabled():
            row = verify_anonymous_session_from_request(request)
            session_org = str(row.get("org_id") or "").strip()
            if session_org != org_id:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "code": "org_session_mismatch",
                        "message": "Workspace org does not match anonymous session.",
                    },
                )
        return WorkspaceIdentity(
            kind="anonymous",
            org_id=org_id,
            subject_ref=f"org:{org_id}",
        )

    if org_id.startswith("user-"):
        if extract_anonymous_session_token(request):
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "anonymous_credential_on_user_workspace",
                    "message": "Anonymous session credential cannot authorize a user workspace.",
                },
            )
        user_id = require_supabase_user_id(request)
        canonical = f"user-{user_id}"
        if org_id != canonical:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "user_org_mismatch",
                    "message": "Authenticated user does not match requested workspace.",
                },
            )
        return WorkspaceIdentity(
            kind="authenticated",
            org_id=canonical,
            subject_ref=f"org:{canonical}",
            user_id=user_id,
        )

    return WorkspaceIdentity(
        kind="legacy",
        org_id=org_id,
        subject_ref=f"org:{org_id}",
    )


def resolve_verified_subject_from_request(request: Request) -> str:
    """Return economics subject_ref after workspace credential verification."""
    return resolve_workspace_identity(request).subject_ref
