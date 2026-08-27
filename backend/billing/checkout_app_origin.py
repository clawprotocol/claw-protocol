"""Canonical frontend origin for Stripe Checkout success/cancel URLs.

Never derived from request Origin, Host, forwarded headers, or an arbitrary return URL.
"""

from __future__ import annotations

import os
from typing import Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlsplit, urlunsplit

from backend.config.deployment_runtime import claw_environment
from backend.security.safe_redirect import (
    CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
    is_allowlisted_internal_path,
    resolve_safe_redirect_path,
)

AFTER_PAY_RESTORE_AGREEMENT_ID_PARAM = "restoreAgreementId"

STAGING_CANONICAL_ORIGIN = "https://believable-gentleness-staging.up.railway.app"
PRODUCTION_CANONICAL_ORIGIN = "https://lawdog.me"
LOCAL_DEFAULT_ORIGIN = "http://localhost:5173"

TRUSTED_STAGING_ORIGINS = frozenset({STAGING_CANONICAL_ORIGIN})
TRUSTED_PRODUCTION_ORIGINS = frozenset(
    {
        PRODUCTION_CANONICAL_ORIGIN,
        "https://www.lawdog.me",
        "https://believable-gentleness-production-3ab6.up.railway.app",
    }
)


def _normalize_origin(raw: str) -> str:
    return (raw or "").strip().rstrip("/")


def _configured_origin() -> str:
    return _normalize_origin(
        os.getenv("LAWDOG_APP_ORIGIN", "") or os.getenv("VITE_LAWDOG_APP_ORIGIN", "")
    )


def _is_local_origin(origin: str) -> bool:
    parsed = urlparse(_normalize_origin(origin))
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.hostname or "").lower()
    if host not in {"localhost", "127.0.0.1"}:
        return False
    return parsed.path in ("", "/") and not parsed.query and not parsed.fragment


def resolve_checkout_app_origin(
    *,
    environment: Optional[str] = None,
    configured: Optional[str] = None,
) -> str:
    env = (environment if environment is not None else claw_environment()).strip().lower()
    configured_origin = _normalize_origin(configured if configured is not None else _configured_origin())

    if env in {"local", "dev", "test"}:
        if configured_origin and _is_local_origin(configured_origin):
            return configured_origin
        return LOCAL_DEFAULT_ORIGIN

    if env == "staging":
        if configured_origin in TRUSTED_STAGING_ORIGINS:
            return configured_origin
        return STAGING_CANONICAL_ORIGIN

    if configured_origin in TRUSTED_PRODUCTION_ORIGINS:
        return configured_origin
    return PRODUCTION_CANONICAL_ORIGIN


def inject_after_pay_restore_agreement_id(path: str, agreement_id: Optional[str]) -> str:
    """Keep after-pay return on the paid persist. Drop restore=starterReview remint."""
    aid = (agreement_id or "").strip()
    if not aid or aid == CREATE_FLOW_CHECKOUT_AGREEMENT_ID:
        return path
    parts = urlsplit(path)
    if parts.path != "/app/create" and not parts.path.startswith("/app/create/"):
        return path
    pairs = [
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if not (k == "restore" and v == "starterReview")
        and k != AFTER_PAY_RESTORE_AGREEMENT_ID_PARAM
    ]
    pairs.append((AFTER_PAY_RESTORE_AGREEMENT_ID_PARAM, aid))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(pairs), parts.fragment))


def build_checkout_success_url(
    *,
    return_to: str,
    origin: Optional[str] = None,
    agreement_id: Optional[str] = None,
) -> str:
    app_origin = _normalize_origin(origin or resolve_checkout_app_origin())
    path = resolve_safe_redirect_path(return_to, "/app/create")
    if not is_allowlisted_internal_path(path):
        path = "/app/create"
    path = inject_after_pay_restore_agreement_id(path, agreement_id)
    extras = []
    if "premiumCompletion=" not in path:
        extras.append("premiumCompletion=1")
    extras.append("checkout_session_id={CHECKOUT_SESSION_ID}")
    sep = "&" if "?" in path else "?"
    return f"{app_origin}{path}{sep}{'&'.join(extras)}"


def build_checkout_cancel_url(*, agreement_id: str, origin: Optional[str] = None) -> str:
    app_origin = _normalize_origin(origin or resolve_checkout_app_origin())
    aid = (agreement_id or "").strip() or "__claw_create_checkout__"
    return f"{app_origin}/app/checkout/{aid}"
