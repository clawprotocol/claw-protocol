"""Resolve ``CLAW_AGREEMENT_SIGNING_TOKEN_SECRET`` for recipient / signer link HMAC.

Production (``CLAW_ENVIRONMENT`` ``production``/``prod``) requires an explicit secret.
All other environments use a deterministic dev-only fallback when unset so QA/staging/local
installs do not fail mint/validate with 503 solely for missing operator wiring.
"""

from __future__ import annotations

import hashlib
import os


class SigningTokenSecretMissingInProductionError(Exception):
    """Unset signing token secret in a production-like CLAW_ENVIRONMENT."""


# Deterministic, non-secret-in-env fallback (namespace-separated from real operator secrets).
_DEV_FALLBACK_SIGNING_TOKEN_RAW = hashlib.sha256(
    b"claw-agreement-signing-token-dev-fallback-v1"
).hexdigest()


def operator_signing_token_secret_configured() -> bool:
    """True when an explicit operator secret is set (either accepted env name)."""
    return bool(
        os.getenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "").strip()
        or os.getenv("CLAW_SIGNING_TOKEN_SECRET", "").strip()
    )


def review_link_mint_enabled() -> bool:
    """
    Whether POST …/recipient-access-token can mint in this process.

    Production-like ``CLAW_ENVIRONMENT`` requires an explicit secret; other envs may use the dev fallback.
    """
    if operator_signing_token_secret_configured():
        return True
    env = os.getenv("CLAW_ENVIRONMENT", "local").strip().lower()
    return env not in ("production", "prod")


def resolve_signing_token_secret_raw() -> str:
    s = (
        os.getenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "").strip()
        or os.getenv("CLAW_SIGNING_TOKEN_SECRET", "").strip()
    )
    if s:
        return s
    env = os.getenv("CLAW_ENVIRONMENT", "local").strip().lower()
    if env in ("production", "prod"):
        raise SigningTokenSecretMissingInProductionError(
            "CLAW_AGREEMENT_SIGNING_TOKEN_SECRET (or CLAW_SIGNING_TOKEN_SECRET) must be set when "
            "CLAW_ENVIRONMENT is production or prod. Recipient/signing links cannot be minted until configured."
        )
    return _DEV_FALLBACK_SIGNING_TOKEN_RAW
