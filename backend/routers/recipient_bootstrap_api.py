"""Phase 3C2A recipient bootstrap exchange and session endpoints."""

from __future__ import annotations

import logging
import os
import time
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from backend.security.recipient_bootstrap_session_cookie import (
    attach_recipient_session_cookie,
    clear_recipient_session_cookie,
    read_recipient_session_cookie,
)
from backend.services.recipient_bootstrap_session_store import (
    BOOTSTRAP_INVALID_OR_EXPIRED,
    BOOTSTRAP_INVALID_OR_EXPIRED_MESSAGE,
)
from backend.services.vs01_recipient_bootstrap_exchange import (
    RecipientBootstrapExchangeError,
    exchange_bootstrap_token,
    resolve_recipient_session_status,
    revoke_recipient_session,
)

router = APIRouter(prefix="/api/recipient", tags=["recipient-bootstrap"])
_log = logging.getLogger(__name__)

_rate_buckets: Dict[str, list[float]] = defaultdict(list)


class BootstrapExchangeIn(BaseModel):
    token: str = Field(..., min_length=8, max_length=4096)


def _uniform_fail(*, status_code: int = 403) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={
            "code": BOOTSTRAP_INVALID_OR_EXPIRED,
            "message": BOOTSTRAP_INVALID_OR_EXPIRED_MESSAGE,
        },
    )


def _is_production_environment() -> bool:
    env = os.getenv("CLAW_ENVIRONMENT", "local").strip().lower()
    return env in ("production", "prod")


def _allow_referer_origin_fallback() -> bool:
    return not _is_production_environment()


def _default_port_for_scheme(scheme: str) -> Optional[int]:
    if scheme == "http":
        return 80
    if scheme == "https":
        return 443
    return None


def _normalize_netloc(scheme: str, host: str, port: Optional[int]) -> Tuple[str, str, int]:
    normalized_scheme = (scheme or "").lower()
    normalized_host = (host or "").lower()
    normalized_port = port if port is not None else _default_port_for_scheme(normalized_scheme)
    if normalized_port is None:
        normalized_port = 0
    return normalized_scheme, normalized_host, normalized_port


def _request_effective_netloc(request: Request) -> Tuple[str, str, int]:
    scheme = (request.url.scheme or "").lower()
    host = (request.url.hostname or "").lower()
    return _normalize_netloc(scheme, host, request.url.port)


def _netloc_from_header_url(url: str) -> Optional[Tuple[str, str, int]]:
    raw = (url or "").strip()
    if not raw or raw.lower() == "null":
        return None
    parsed = urlparse(raw)
    if not parsed.scheme or not parsed.hostname:
        return None
    return _normalize_netloc(parsed.scheme, parsed.hostname, parsed.port)


def _header_netloc_matches_request(request: Request, header_url: str) -> bool:
    header_netloc = _netloc_from_header_url(header_url)
    if header_netloc is None:
        return False
    return header_netloc == _request_effective_netloc(request)


def _assert_same_origin(request: Request) -> None:
    origin = (request.headers.get("origin") or "").strip()
    if origin:
        if not _header_netloc_matches_request(request, origin):
            raise _uniform_fail(status_code=403)
        return

    if _is_production_environment():
        raise _uniform_fail(status_code=403)

    if not _allow_referer_origin_fallback():
        raise _uniform_fail(status_code=403)

    referer = (request.headers.get("referer") or "").strip()
    if referer and _header_netloc_matches_request(request, referer):
        return

    raise _uniform_fail(status_code=403)


def _rate_limit_exchange(request: Request) -> None:
    if os.getenv("CLAW_RECIPIENT_BOOTSTRAP_RATE_LIMIT_DISABLED", "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        return
    rps_raw = os.getenv("CLAW_RECIPIENT_BOOTSTRAP_EXCHANGE_RPS", "10").strip()
    try:
        rps = max(1, int(rps_raw))
    except ValueError:
        rps = 10
    client = (request.client.host if request.client else "") or "unknown"
    now = time.time()
    window = _rate_buckets[client]
    window[:] = [t for t in window if now - t < 1.0]
    if len(window) >= rps:
        raise _uniform_fail(status_code=429)
    window.append(now)


def _parse_session_expires_at(status: Dict[str, Any]) -> Optional[datetime]:
    exp_raw = str(status.get("expires_at") or "").strip()
    if not exp_raw:
        return None
    try:
        return datetime.fromisoformat(exp_raw.replace("Z", "+00:00"))
    except Exception:
        return None


def _committed_cookie_max_age_seconds(*, expires_at: str, committed_now_ts: int) -> int:
    exp_raw = str(expires_at or "").strip()
    if not exp_raw:
        return 0
    try:
        exp_dt = datetime.fromisoformat(exp_raw.replace("Z", "+00:00"))
        return max(1, int(exp_dt.timestamp()) - int(committed_now_ts))
    except Exception:
        return 0


@router.post("/bootstrap/exchange")
async def post_bootstrap_exchange(
    body: BootstrapExchangeIn,
    request: Request,
    response: Response,
) -> Dict[str, Any]:
    _assert_same_origin(request)
    _rate_limit_exchange(request)
    try:
        session_secret, status, cookie_max_age = exchange_bootstrap_token(token=body.token)
    except RecipientBootstrapExchangeError as exc:
        raise _uniform_fail(status_code=exc.status_code) from exc
    expires_at = _parse_session_expires_at(status)
    if expires_at is None or cookie_max_age <= 0:
        clear_recipient_session_cookie(response=response, request=request)
        raise _uniform_fail(status_code=403)
    attach_recipient_session_cookie(
        response=response,
        request=request,
        session_secret=session_secret,
        max_age_seconds=cookie_max_age,
        expires_at=expires_at,
    )
    return status


@router.get("/session/status")
async def get_recipient_session_status(request: Request) -> Dict[str, Any]:
    cookie = read_recipient_session_cookie(request)
    if not cookie:
        return {"ok": True, "authenticated": False, "readiness": "unauthenticated"}
    try:
        return resolve_recipient_session_status(session_secret=cookie)
    except RecipientBootstrapExchangeError:
        return {"ok": True, "authenticated": False, "readiness": "unauthenticated"}


@router.post("/session/logout")
async def post_recipient_session_logout(request: Request, response: Response) -> Dict[str, Any]:
    _assert_same_origin(request)
    cookie = read_recipient_session_cookie(request)
    if cookie:
        revoke_recipient_session(session_secret=cookie)
    clear_recipient_session_cookie(response=response, request=request)
    return {"ok": True, "authenticated": False, "readiness": "signed_out"}
