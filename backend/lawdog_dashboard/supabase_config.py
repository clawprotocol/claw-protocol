"""Supabase env detection for LawDog dashboard Phase A."""

from __future__ import annotations

import os
from typing import Any, Dict


def supabase_url() -> str:
    return (
        os.getenv("SUPABASE_URL", "").strip()
        or os.getenv("CLAW_SUPABASE_URL", "").strip()
    )


def supabase_service_role_key() -> str:
    return (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or os.getenv("CLAW_SUPABASE_SERVICE_ROLE_KEY", "").strip()
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
