"""HttpOnly recipient bootstrap session cookie helpers (Phase 3C2A)."""

from __future__ import annotations

from datetime import datetime

from fastapi import Request, Response

from backend.security.claw_environment import is_strict_claw_environment

RECIPIENT_BOOTSTRAP_SESSION_COOKIE = "claw_recipient_session"
RECIPIENT_BOOTSTRAP_SESSION_COOKIE_HOST = "__Host-claw_recipient_session"


def is_production_cookie_environment() -> bool:
    return is_strict_claw_environment()


def recipient_session_cookie_name() -> str:
    if is_production_cookie_environment():
        return RECIPIENT_BOOTSTRAP_SESSION_COOKIE_HOST
    return RECIPIENT_BOOTSTRAP_SESSION_COOKIE


def _cookie_secure_for_request(request: Request) -> bool:
    if is_production_cookie_environment():
        return True
    forwarded = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
    if forwarded == "https":
        return True
    return request.url.scheme == "https"


def _cookie_samesite_for_request(request: Request) -> str:
    return "lax"


def attach_recipient_session_cookie(
    *,
    response: Response,
    request: Request,
    session_secret: str,
    max_age_seconds: int,
    expires_at: datetime | None = None,
) -> None:
    if max_age_seconds <= 0:
        return
    secure = _cookie_secure_for_request(request)
    cookie_name = recipient_session_cookie_name()
    cookie_kwargs: dict[str, object] = {
        "key": cookie_name,
        "value": session_secret,
        "httponly": True,
        "secure": secure,
        "samesite": _cookie_samesite_for_request(request),
        "max_age": int(max_age_seconds),
        "path": "/",
    }
    if cookie_name.startswith("__Host-"):
        cookie_kwargs["path"] = "/"
    if expires_at is not None:
        cookie_kwargs["expires"] = expires_at
    response.set_cookie(**cookie_kwargs)


def clear_recipient_session_cookie(*, response: Response, request: Request) -> None:
    secure = _cookie_secure_for_request(request)
    samesite = _cookie_samesite_for_request(request)
    for name in (RECIPIENT_BOOTSTRAP_SESSION_COOKIE, RECIPIENT_BOOTSTRAP_SESSION_COOKIE_HOST):
        response.delete_cookie(
            key=name,
            path="/",
            secure=secure,
            httponly=True,
            samesite=samesite,
        )


def read_recipient_session_cookie(request: Request) -> str:
    if is_production_cookie_environment():
        return (request.cookies.get(RECIPIENT_BOOTSTRAP_SESSION_COOKIE_HOST) or "").strip()
    value = (request.cookies.get(RECIPIENT_BOOTSTRAP_SESSION_COOKIE) or "").strip()
    if value:
        return value
    return (request.cookies.get(RECIPIENT_BOOTSTRAP_SESSION_COOKIE_HOST) or "").strip()
