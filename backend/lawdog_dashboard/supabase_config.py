"""Supabase env detection for LawDog dashboard Phase A."""

from __future__ import annotations

import os


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
