"""
Staging/local magic-link mint via Supabase Admin API.

Bypasses Supabase Auth email OTP rate limits for allowlisted GTM test accounts.
Never available in production/prod. Does not send email — returns action_link for
the browser to open directly.
"""

from __future__ import annotations

import logging
import os
import re
import time
from typing import Any, Dict, Optional, Set, Tuple

import httpx

from backend.config.deployment_runtime import claw_environment, is_relaxed_claw_environment
from backend.lawdog_dashboard.supabase_config import (
    is_supabase_dashboard_configured,
    supabase_admin_missing_reason,
    supabase_service_role_key,
    supabase_url,
)

log = logging.getLogger("claw.staging_auth_magic_link")

# Hard-coded GTM smoke accounts — always allowed on staging/local when feature is on.
_DEFAULT_ALLOWLIST = frozenset(
    {
        "cryptocurated21+lawdogtest2@gmail.com",
    }
)

# Optional broader GTM plus-address pattern for cryptocurated21+*@gmail.com
_DEFAULT_PLUS_PATTERN = re.compile(r"^cryptocurated21\+[^@]+@gmail\.com$", re.IGNORECASE)

# Soft IP throttle for this endpoint only (not Supabase).
_IP_HITS: Dict[str, list[float]] = {}
_IP_WINDOW_SEC = 3600.0
_IP_MAX_HITS = 40


def staging_auth_magic_link_environment_allowed() -> bool:
    env = claw_environment()
    if env in ("production", "prod"):
        return False
    if is_relaxed_claw_environment():
        return True
    return env == "staging"


def _env_allowlist() -> Set[str]:
    raw = os.getenv("CLAW_STAGING_AUTH_EMAIL_ALLOWLIST", "").strip()
    if not raw:
        return set()
    return {part.strip().lower() for part in raw.split(",") if part.strip()}


def staging_auth_email_allowlisted(email: str) -> bool:
    normalized = (email or "").strip().lower()
    if not normalized or "@" not in normalized:
        return False
    if normalized in _DEFAULT_ALLOWLIST:
        return True
    if normalized in _env_allowlist():
        return True
    # Default GTM plus-address family unless explicitly disabled.
    if os.getenv("CLAW_STAGING_AUTH_ALLOW_CRYPTOCURATED_PLUS", "1").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    ):
        if _DEFAULT_PLUS_PATTERN.match(normalized):
            return True
    return False


def staging_auth_client_ip(request_client_host: Optional[str], forwarded_for: Optional[str]) -> str:
    if forwarded_for:
        first = forwarded_for.split(",")[0].strip()
        if first:
            return first
    return (request_client_host or "unknown").strip() or "unknown"


def staging_auth_ip_rate_limit_ok(ip: str) -> bool:
    now = time.time()
    hits = _IP_HITS.setdefault(ip, [])
    hits[:] = [t for t in hits if now - t < _IP_WINDOW_SEC]
    if len(hits) >= _IP_MAX_HITS:
        return False
    hits.append(now)
    return True


def reset_staging_auth_ip_rate_limit_for_tests() -> None:
    _IP_HITS.clear()


def staging_auth_redirect_allowed(redirect_to: str) -> bool:
    """Allow only auth-callback URLs on non-production hosts (staging/local/Railway)."""
    from urllib.parse import urlparse

    raw = (redirect_to or "").strip()
    if not raw:
        return False
    try:
        parsed = urlparse(raw)
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.hostname or "").strip().lower()
    if not host:
        return False
    path = parsed.path or ""
    if "/app/auth/callback" not in path:
        return False
    if host in ("lawdog.me", "www.lawdog.me", "lawdog.ai", "www.lawdog.ai", "app.lawdog.ai"):
        return False
    if "production" in host:
        return False
    if host in ("localhost", "127.0.0.1", "::1"):
        return True
    if "staging" in host:
        return True
    # Railway static FE (staging service names) — never production-* hosts (checked above).
    if host.endswith(".railway.app") or host.endswith(".up.railway.app"):
        return True
    return False


def mint_staging_auth_magic_link(
    *,
    email: str,
    redirect_to: str,
) -> Tuple[str, Dict[str, Any]]:
    """
    Call Supabase Admin generate_link (magiclink). Returns (action_link, raw_payload).
    Raises ValueError with stable reason codes on failure.
    """
    if not staging_auth_magic_link_environment_allowed():
        raise ValueError("environment_blocked")
    if not is_supabase_dashboard_configured():
        raise ValueError(supabase_admin_missing_reason() or "supabase_not_configured")
    normalized = (email or "").strip().lower()
    if not staging_auth_email_allowlisted(normalized):
        raise ValueError("email_not_allowlisted")
    redirect = (redirect_to or "").strip()
    if not staging_auth_redirect_allowed(redirect):
        raise ValueError("redirect_invalid")

    base = supabase_url().rstrip("/")
    key = supabase_service_role_key()
    url = f"{base}/auth/v1/admin/generate_link"
    body = {
        "type": "magiclink",
        "email": normalized,
        "options": {"redirect_to": redirect},
    }
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=25.0) as client:
            res = client.post(url, headers=headers, json=body)
    except Exception as exc:
        log.warning("staging_auth_magic_link_http_error error=%s", type(exc).__name__)
        raise ValueError("supabase_request_failed") from exc

    if res.status_code >= 400:
        log.warning(
            "staging_auth_magic_link_supabase_status status=%s body=%s",
            res.status_code,
            (res.text or "")[:240],
        )
        raise ValueError(f"supabase_http_{res.status_code}")

    try:
        payload = res.json()
    except Exception as exc:
        raise ValueError("supabase_invalid_json") from exc

    action_link = ""
    if isinstance(payload, dict):
        action_link = str(payload.get("action_link") or "").strip()
        if not action_link:
            props = payload.get("properties")
            if isinstance(props, dict):
                action_link = str(props.get("action_link") or "").strip()

    if not action_link.startswith("http"):
        raise ValueError("action_link_missing")

    log.info(
        "staging_auth_magic_link_minted email=%s redirect_host=%s",
        normalized,
        redirect.split("/")[2] if "://" in redirect else "?",
    )
    return action_link, payload if isinstance(payload, dict) else {}
