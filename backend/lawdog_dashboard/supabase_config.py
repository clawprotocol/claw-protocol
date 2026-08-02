"""Supabase env detection for LawDog dashboard Phase A."""

from __future__ import annotations

import os
from typing import Any, Dict


def _clean_env_value(raw: str) -> str:
    """Strip whitespace and accidental surrounding quotes from Railway/dashboard paste."""
    value = (raw or "").strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        value = value[1:-1].strip()
    return value


def supabase_url() -> str:
    value = _clean_env_value(
        os.getenv("SUPABASE_URL", "") or os.getenv("CLAW_SUPABASE_URL", "")
    )
    value = value.rstrip("/")
    # Operators sometimes paste REST/Auth base paths; Admin calls need project origin.
    for suffix in ("/rest/v1", "/auth/v1", "/rest", "/auth"):
        if value.lower().endswith(suffix):
            value = value[: -len(suffix)].rstrip("/")
            break
    return value


def supabase_service_role_key() -> str:
    return _clean_env_value(
        os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        or os.getenv("CLAW_SUPABASE_SERVICE_ROLE_KEY", "")
    )


def is_supabase_dashboard_configured() -> bool:
    return bool(supabase_url() and supabase_service_role_key())


def supabase_admin_missing_reason() -> str:
    """Stable non-secret reason when Admin REST (service role) is not configured."""
    url_ok = bool(supabase_url())
    key_ok = bool(supabase_service_role_key())
    if url_ok and key_ok:
        return ""
    if not url_ok and not key_ok:
        return "supabase_not_configured:missing_url_and_service_role"
    if not url_ok:
        return "supabase_not_configured:missing_url"
    return "supabase_not_configured:missing_service_role"


def public_supabase_admin_readiness() -> Dict[str, Any]:
    """Booleans only — never include URL or key material."""
    return {
        "supabase_url_configured": bool(supabase_url()),
        "supabase_service_role_configured": bool(supabase_service_role_key()),
        "supabase_admin_configured": is_supabase_dashboard_configured(),
    }
