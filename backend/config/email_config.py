"""Resend / review-invite email configuration (no secrets in logs or runtime summary)."""

from __future__ import annotations

import os

from backend.config.runtime_environment import review_delivery_mode as _review_delivery_mode


def resend_api_key() -> str | None:
    raw = os.getenv("RESEND_API_KEY", "").strip()
    return raw or None


def email_from() -> str | None:
    raw = os.getenv("EMAIL_FROM", "").strip()
    return raw or None


def app_public_origin() -> str | None:
    """SPA origin for absolute review links (scheme + host, no trailing slash)."""
    raw = os.getenv("CLAW_APP_PUBLIC_ORIGIN", "").strip().rstrip("/")
    return raw or None


def email_configured() -> bool:
    return bool(resend_api_key() and email_from() and app_public_origin())


def review_delivery_mode() -> str:
    return _review_delivery_mode()
