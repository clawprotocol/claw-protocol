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
    signing_token_secret_source,
)
from backend.config.deployment_runtime import is_production_like_claw_environment
from backend.cors_policy import cors_env_raw_meta, cors_startup_diagnostics

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
                "CLAW_AGREEMENT_SIGNING_TOKEN_SECRET (or CLAW_SIGNING_TOKEN_SECRET) unset or not explicit — "
                "review/signing link mint and envelope attestation return 422 "
                "signing_token_secret_not_configured in staging/production "
                f"(source={signing_token_secret_source()})."
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
        if not _is_set("CLAW_ECONOMICS_DB_PATH"):
            warnings.append(
                "CLAW_ECONOMICS_DB_PATH unset — economics subscriptions/affiliates use default SQLite "
                "path (ephemeral on PaaS); deploy-readiness fails in production until set."
            )
        if not _is_set("STRIPE_SECRET_KEY"):
            warnings.append("STRIPE_SECRET_KEY unset — Stripe checkout unavailable.")
        if not _is_set("CLAW_API_BASE") and not _is_set("LAWDOG_API_ORIGIN"):
            warnings.append("CLAW_API_BASE unset — webhook return URLs may be misconfigured.")
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
    cors = cors_startup_diagnostics()
    return {
        "claw_environment": os.getenv("CLAW_ENVIRONMENT", "local").strip().lower(),
        "cors_configured": _is_set("CLAW_CORS_ALLOW_ORIGINS"),
        "cors_origin_count": cors.get("resolved_origin_count"),
        "cors_allow_wildcard": cors.get("allow_wildcard"),
        "cors_env_shape": cors_env_raw_meta(),
        "stripe_webhook_secret_configured": _is_set("STRIPE_WEBHOOK_SECRET"),
        "admin_secret_configured": _is_set("CLAW_ADMIN_SECRET"),
        "database_url_configured": _is_set("CLAW_DATABASE_URL") or _is_set("DATABASE_URL"),
        "economics_db_path_explicit": _is_set("CLAW_ECONOMICS_DB_PATH"),
        "stripe_checkout_configured": __import__(
            "backend.billing.stripe_config", fromlist=["is_stripe_checkout_configured"]
        ).is_stripe_checkout_configured(),
        "openai_configured": _is_set("OPENAI_API_KEY"),
        "signing_token_secret_configured": operator_signing_token_secret_configured(),
        "signing_token_configured": operator_signing_token_secret_configured(),
        "signing_token_secret_source": signing_token_secret_source(),
        "signing_token_env_var_detected": detected_signing_token_env_var(),
        "review_link_mint_enabled": review_link_mint_enabled(),
    }
