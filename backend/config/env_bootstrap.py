"""
Startup env validation — warnings only (no crash) for solo-founder deploy ergonomics.

Secrets are never logged. See docs/ENVIRONMENT.md for the full inventory.
"""

from __future__ import annotations

import logging
import os
from typing import List

from backend.config.agreement_signing_token import (
    detected_signing_token_env_var,
    operator_signing_token_secret_configured,
    review_link_mint_enabled,
)
from backend.config.deployment_runtime import is_production_like_claw_environment

_log = logging.getLogger("claw.env")


def _is_set(name: str) -> bool:
    return bool(os.getenv(name, "").strip())


def collect_env_warnings() -> List[str]:
    """Non-fatal issues operators should fix before/at production launch."""
    warnings: List[str] = []
    env = os.getenv("CLAW_ENVIRONMENT", "local").strip().lower()

    if is_production_like_claw_environment():
        if not _is_set("CLAW_CORS_ALLOW_ORIGINS"):
            warnings.append(
                "CLAW_CORS_ALLOW_ORIGINS unset — browsers cannot call a split-origin API until configured."
            )
        if not operator_signing_token_secret_configured():
            warnings.append(
                "CLAW_AGREEMENT_SIGNING_TOKEN_SECRET (or CLAW_SIGNING_TOKEN_SECRET) unset — "
                "review/signing link mint returns 422 signing_token_secret_not_configured in production."
            )
        if not _is_set("STRIPE_WEBHOOK_SECRET"):
            warnings.append(
                "STRIPE_WEBHOOK_SECRET unset — POST /webhook/stripe returns 503 until configured."
            )
        if not _is_set("CLAW_ADMIN_SECRET"):
            warnings.append(
                "CLAW_ADMIN_SECRET unset — admin/ops HTTP surfaces are unauthenticated (unsafe in production)."
            )
        pg = _is_set("CLAW_DATABASE_URL") or _is_set("DATABASE_URL")
        if not pg:
            warnings.append(
                "CLAW_DATABASE_URL unset — launch Postgres domains use SQLite fallback (ephemeral on PaaS)."
            )
    else:
        if _is_set("CLAW_STRIPE_WEBHOOK_DEV_UNSIGNED"):
            warnings.append(
                "CLAW_STRIPE_WEBHOOK_DEV_UNSIGNED is enabled — Stripe webhooks accept unsigned bodies (dev only)."
            )

    if env not in ("local", "dev", "test", "staging", "production", "prod"):
        warnings.append(f"CLAW_ENVIRONMENT={env!r} is non-standard — prefer local|dev|test|staging|production.")

    return warnings


def log_env_warnings_at_startup() -> None:
    for msg in collect_env_warnings():
        _log.warning("[env] %s", msg)


def public_env_snapshot() -> dict:
    """Safe for /version and operator summaries — no secret values."""
    return {
        "claw_environment": os.getenv("CLAW_ENVIRONMENT", "local").strip().lower(),
        "cors_configured": _is_set("CLAW_CORS_ALLOW_ORIGINS"),
        "stripe_webhook_secret_configured": _is_set("STRIPE_WEBHOOK_SECRET"),
        "admin_secret_configured": _is_set("CLAW_ADMIN_SECRET"),
        "database_url_configured": _is_set("CLAW_DATABASE_URL") or _is_set("DATABASE_URL"),
        "openai_configured": _is_set("OPENAI_API_KEY"),
        "signing_token_secret_configured": operator_signing_token_secret_configured(),
        "signing_token_env_var_detected": detected_signing_token_env_var(),
        "review_link_mint_enabled": review_link_mint_enabled(),
    }
