"""Phase 3C1B signing invite delivery feature gates (fail-closed by default)."""

from __future__ import annotations

import os

from backend.config.agreement_signing_token import operator_signing_token_secret_configured
from backend.config.email_config import email_configured


def signing_invite_delivery_enabled() -> bool:
    """Explicit operator opt-in for signing invite delivery orchestration."""
    return os.getenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )


def recipient_bootstrap_certified() -> bool:
    """Phase 3C2 gate: fragment bootstrap token exchange must be certified before real send."""
    return os.getenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )


def signing_invite_delivery_allowed() -> bool:
    """All gates required for real provider invocation in production."""
    return (
        signing_invite_delivery_enabled()
        and recipient_bootstrap_certified()
        and email_configured()
        and operator_signing_token_secret_configured()
    )
