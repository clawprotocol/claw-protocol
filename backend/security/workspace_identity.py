"""Verified workspace identity — org header must match server-issued credentials."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException, Request

from backend.security.anonymous_session_store import get_anonymous_session_store
from backend.security.anonymous_session_token import (
    ANON_SESSION_COOKIE,
    ANON_SESSION_HEADER,
    verify_anonymous_session_token,
)


def _parse_utc_iso(value: str) -> datetime:
    s = (value or "").strip().replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def extract_anonymous_session_token(request: Request) -> Optional[str]:
    header = (request.headers.get(ANON_SESSION_HEADER) or "").strip()
    if header:
        return header
    cookie = (request.cookies.get(ANON_SESSION_COOKIE) or "").strip()
    return cookie or None


def verify_anonymous_session_from_request(request: Request) -> Dict[str, Any]:
    token = extract_anonymous_session_token(request)
    if not token:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "anonymous_session_required",
                "message": "Anonymous workspace session credential is required.",
            },
        )
    try:
        payload = verify_anonymous_session_token(token)
    except ValueError as exc:
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_anonymous_session", "message": str(exc)},
        ) from exc
    store = get_anonymous_session_store()
    row = store.resolve_token(token)
    if not row:
        raise HTTPException(
            status_code=401,
            detail={"code": "unknown_anonymous_session", "message": "Session not found."},
        )
    if int(row.get("consumed") or 0) == 1:
        raise HTTPException(
            status_code=403,
            detail={"code": "anonymous_session_consumed", "message": "Session already claimed."},
        )
    exp_raw = str(row.get("expires_at") or "")
    if exp_raw:
        try:
            if datetime.now(timezone.utc) > _parse_utc_iso(exp_raw):
                raise HTTPException(
                    status_code=401,
                    detail={"code": "anonymous_session_expired", "message": "Session expired."},
                )
        except HTTPException:
            raise
        except Exception:
            pass
    if str(row.get("session_id") or "") != str(payload.get("sid") or ""):
        raise HTTPException(status_code=401, detail={"code": "session_mismatch"})
    if str(row.get("org_id") or "") != str(payload.get("org") or ""):
        raise HTTPException(status_code=401, detail={"code": "org_mismatch"})
    return row


def anonymous_session_enforcement_enabled() -> bool:
    return os.getenv("CLAW_ANON_SESSION_ENFORCE", "1").strip().lower() not in ("0", "false", "no")


def require_verified_org_id(request: Request) -> str:
    """Return workspace org id after canonical identity verification."""
    from backend.security.request_identity import resolve_workspace_identity

    return resolve_workspace_identity(request).org_id


def assert_agreement_accessible(
    request: Request,
    agreement_id: str,
) -> Tuple[str, str]:
    """Verify caller may access agreement; return (subject_ref, org_id)."""
    from backend.security.request_identity import resolve_workspace_identity
    from backend.usage_economics.policy import usage_economics_enabled
    from backend.usage_economics.store import get_usage_economics_store

    identity = resolve_workspace_identity(request)
    org_id = identity.org_id
    subject = identity.subject_ref
    if not usage_economics_enabled():
        return subject, org_id
    store = get_usage_economics_store()
    store.init_schema()
    owner = store.owner_subject_for_agreement(agreement_id)
    if not owner:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "ownership_not_registered",
                "message": "Agreement ownership is not registered.",
            },
        )
    if owner != subject:
        raise HTTPException(
            status_code=403,
            detail={"code": "workspace_mismatch", "message": "Agreement belongs to another workspace."},
        )
    return subject, org_id
