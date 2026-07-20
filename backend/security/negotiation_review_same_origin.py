"""Strict same-origin enforcement for negotiation-review cookie mutations."""

from __future__ import annotations

import os
from typing import Optional, Set, Tuple
from urllib.parse import urlparse

from fastapi import HTTPException, Request

from backend.cors_policy import cors_allowed_origins, normalize_cors_origin
from backend.security.negotiation_review_relaxed_environment import (
    is_negotiation_review_relaxed_environment,
)
from backend.services.negotiation_review_session_store import (
    REVIEW_BOOTSTRAP_INVALID_OR_EXPIRED,
    REVIEW_BOOTSTRAP_INVALID_OR_EXPIRED_MESSAGE,
)


def _uniform_fail(*, status_code: int = 403) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={
            "code": REVIEW_BOOTSTRAP_INVALID_OR_EXPIRED,
            "message": REVIEW_BOOTSTRAP_INVALID_OR_EXPIRED_MESSAGE,
        },
    )


def _referer_origin_fallback_allowed() -> bool:
    """Referer fallback only for exact local/dev/test environments."""
    return is_negotiation_review_relaxed_environment()


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


def _netloc_from_header_url(url: str) -> Optional[Tuple[str, str, int]]:
    raw = (url or "").strip()
    if not raw or raw.lower() == "null":
        return None
    try:
        parsed = urlparse(raw)
        if not parsed.scheme or not parsed.hostname:
            return None
        port = parsed.port
        if port is not None and (port < 0 or port > 65535):
            return None
        return _normalize_netloc(parsed.scheme, parsed.hostname, port)
    except Exception:
        return None


def _trusted_frontend_origin_netlocs() -> Set[Tuple[str, str, int]]:
    """
    Credentials-compatible configured frontend origins only.
    Never trust request-controlled forwarded-host headers.
    """
    trusted: Set[Tuple[str, str, int]] = set()
    allowed = cors_allowed_origins()
    if allowed == ["*"]:
        if is_negotiation_review_relaxed_environment():
            for origin in ("http://testserver", "https://testserver", "http://localhost:5173"):
                netloc = _netloc_from_header_url(origin)
                if netloc:
                    trusted.add(netloc)
        return trusted

    for origin in allowed:
        if origin == "*":
            continue
        netloc = _netloc_from_header_url(origin)
        if netloc:
            trusted.add(netloc)

    app_origin = normalize_cors_origin(os.getenv("CLAW_APP_PUBLIC_ORIGIN", ""))
    if app_origin:
        netloc = _netloc_from_header_url(app_origin)
        if netloc:
            trusted.add(netloc)
    return trusted


def _header_netloc_is_trusted_frontend(header_url: str) -> bool:
    header_netloc = _netloc_from_header_url(header_url)
    if header_netloc is None:
        return False
    return header_netloc in _trusted_frontend_origin_netlocs()


def assert_negotiation_review_same_origin(request: Request) -> None:
    """
    Compare Origin/Referer against the explicit trusted frontend-origin allowlist.
  Production-like environments require a valid Origin from that allowlist.
    Referer fallback is allowed only for exact local/dev/test.
    """
    origin = (request.headers.get("origin") or "").strip()
    if origin:
        if not _header_netloc_is_trusted_frontend(origin):
            raise _uniform_fail(status_code=403)
        return

    if not _referer_origin_fallback_allowed():
        raise _uniform_fail(status_code=403)

    referer = (request.headers.get("referer") or "").strip()
    if referer and _header_netloc_is_trusted_frontend(referer):
        return

    raise _uniform_fail(status_code=403)
