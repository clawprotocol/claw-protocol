"""GTM Security Slice 3B negotiation-review bootstrap exchange and session endpoints."""

from __future__ import annotations

import logging
import os
import time
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from backend.security.negotiation_review_same_origin import assert_negotiation_review_same_origin

from backend.security.negotiation_review_session_cookie import (
    attach_negotiation_review_session_cookie,
    clear_negotiation_review_session_cookie,
    read_negotiation_review_session_cookie,
)
from backend.services.negotiation_review_bootstrap_exchange import (
    NegotiationReviewBootstrapExchangeError,
    exchange_review_bootstrap_token,
    resolve_negotiation_review_session_status,
    revoke_negotiation_review_session,
)
from backend.services.negotiation_review_session_store import (
    REVIEW_BOOTSTRAP_INVALID_OR_EXPIRED,
    REVIEW_BOOTSTRAP_INVALID_OR_EXPIRED_MESSAGE,
)

router = APIRouter(prefix="/api/negotiation-review", tags=["negotiation-review-bootstrap"])
_log = logging.getLogger(__name__)

_rate_buckets: Dict[str, list[float]] = defaultdict(list)


class ReviewBootstrapExchangeIn(BaseModel):
    token: str = Field(..., min_length=8, max_length=4096)


def _uniform_fail(*, status_code: int = 403) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={
            "code": REVIEW_BOOTSTRAP_INVALID_OR_EXPIRED,
            "message": REVIEW_BOOTSTRAP_INVALID_OR_EXPIRED_MESSAGE,
        },
    )


def _assert_same_origin(request: Request) -> None:
    assert_negotiation_review_same_origin(request)


def _rate_limit_exchange(request: Request) -> None:
    if os.getenv("CLAW_NEGOTIATION_REVIEW_BOOTSTRAP_RATE_LIMIT_DISABLED", "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        return
    rps_raw = os.getenv("CLAW_NEGOTIATION_REVIEW_BOOTSTRAP_EXCHANGE_RPS", "10").strip()
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
        return max(0, int(exp_dt.timestamp()) - int(committed_now_ts))
    except Exception:
        return 0


def _no_store_headers() -> Dict[str, str]:
    return {"Cache-Control": "no-store, private"}


@router.post("/bootstrap/exchange")
async def post_review_bootstrap_exchange(
    body: ReviewBootstrapExchangeIn,
    request: Request,
    response: Response,
) -> Dict[str, Any]:
    _assert_same_origin(request)
    _rate_limit_exchange(request)
    response.headers.update(_no_store_headers())
    committed_now_ts = int(time.time())
    try:
        session_secret, status, _exchange_cookie_hint = exchange_review_bootstrap_token(token=body.token)
    except NegotiationReviewBootstrapExchangeError as exc:
        raise _uniform_fail(status_code=exc.status_code) from exc
    expires_at = _parse_session_expires_at(status)
    cookie_max_age = _committed_cookie_max_age_seconds(
        expires_at=str(status.get("expires_at") or ""),
        committed_now_ts=committed_now_ts,
    )
    if expires_at is None or cookie_max_age <= 0:
        clear_negotiation_review_session_cookie(response=response, request=request)
        raise _uniform_fail(status_code=403)
    attach_negotiation_review_session_cookie(
        response=response,
        request=request,
        session_secret=session_secret,
        max_age_seconds=cookie_max_age,
        expires_at=expires_at,
    )
    return status


@router.get("/session/status")
async def get_negotiation_review_session_status(request: Request, response: Response) -> Dict[str, Any]:
    response.headers.update(_no_store_headers())
    cookie = read_negotiation_review_session_cookie(request)
    if not cookie:
        return {"ok": True, "authenticated": False, "readiness": "unauthenticated"}
    try:
        return resolve_negotiation_review_session_status(session_secret=cookie)
    except NegotiationReviewBootstrapExchangeError:
        return {
            "ok": True,
            "authenticated": False,
            "readiness": "session_invalid",
        }


@router.post("/session/logout")
async def post_negotiation_review_session_logout(request: Request, response: Response) -> Dict[str, Any]:
    _assert_same_origin(request)
    response.headers.update(_no_store_headers())
    cookie = read_negotiation_review_session_cookie(request)
    if cookie:
        revoke_negotiation_review_session(session_secret=cookie)
    clear_negotiation_review_session_cookie(response=response, request=request)
    return {"ok": True, "authenticated": False, "readiness": "signed_out"}
