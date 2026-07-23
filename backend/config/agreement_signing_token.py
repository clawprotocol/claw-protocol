"""Resolve ``CLAW_AGREEMENT_SIGNING_TOKEN_SECRET`` for recipient / signer link HMAC.

Explicit operator secret is required for ``staging``, ``production``, and ``prod``.
Shared in-process fallback is permitted only for ``local`` / ``dev`` / ``test``.

Never log or return secret values. Readiness may expose only configured booleans and
source classification (``explicit`` | ``fallback`` | ``absent``).
"""

from __future__ import annotations

import hashlib
import os
from typing import Literal, Optional

SigningTokenSecretSource = Literal["explicit", "fallback", "absent"]

# Environments that may use the deterministic in-process fallback when unset.
_FALLBACK_ALLOWED_ENVIRONMENTS = frozenset({"local", "dev", "test"})

# Environments that must never use shared fallback (fail closed).
_STRICT_SECRET_ENVIRONMENTS = frozenset({"staging", "production", "prod"})


class SigningTokenSecretMissingInProductionError(Exception):
    """Missing or non-explicit signing token secret in a strict CLAW_ENVIRONMENT."""


# Deterministic, non-secret-in-env fallback (namespace-separated from real operator secrets).
_DEV_FALLBACK_SIGNING_TOKEN_RAW = hashlib.sha256(
    b"claw-agreement-signing-token-dev-fallback-v1"
).hexdigest()
_DEV_FALLBACK_NAMESPACE = "claw-agreement-signing-token-dev-fallback-v1"

# Reject trivially short values in strict envs (malformed operator wiring).
_MIN_EXPLICIT_SECRET_LEN = 16


def claw_environment_name() -> str:
    """Fail-closed: empty when unset/blank (never defaults to local)."""
    from backend.config.deployment_runtime import claw_environment

    return claw_environment()


def fallback_signing_token_allowed() -> bool:
    from backend.config.deployment_runtime import is_relaxed_claw_environment

    # Only explicit local/dev/test — never unset/blank/staging/unknown.
    return is_relaxed_claw_environment() and claw_environment_name() in _FALLBACK_ALLOWED_ENVIRONMENTS


def _raw_env_signing_token_secret() -> str:
    return (
        os.getenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "").strip()
        or os.getenv("CLAW_SIGNING_TOKEN_SECRET", "").strip()
    )


def _is_fallback_derived_secret(value: str) -> bool:
    v = (value or "").strip()
    if not v:
        return False
    return v in {_DEV_FALLBACK_SIGNING_TOKEN_RAW, _DEV_FALLBACK_NAMESPACE}


def _is_malformed_explicit_secret(value: str) -> bool:
    """True when a non-empty value is unsuitable as an operator secret."""
    v = (value or "").strip()
    if not v:
        return True
    if _is_fallback_derived_secret(v):
        return True
    if len(v) < _MIN_EXPLICIT_SECRET_LEN:
        return True
    return False


def signing_token_secret_source() -> SigningTokenSecretSource:
    """
    Non-sensitive classification of how the process would resolve the signing secret.

    - ``explicit``: operator-provisioned secret present and usable
    - ``fallback``: local/dev/test will use in-process fallback, OR env is set to fallback material
    - ``absent``: no usable secret (strict envs must fail closed)
    """
    raw = _raw_env_signing_token_secret()
    if raw and not _is_malformed_explicit_secret(raw):
        return "explicit"
    if raw and _is_fallback_derived_secret(raw):
        return "fallback"
    if not raw:
        return "fallback" if fallback_signing_token_allowed() else "absent"
    # Malformed non-fallback value (e.g. too short): local may still use in-process fallback.
    if fallback_signing_token_allowed():
        return "fallback"
    return "absent"


def operator_signing_token_secret_configured() -> bool:
    """True when an explicit operator secret is set (not fallback, not malformed)."""
    return signing_token_secret_source() == "explicit"


def detected_signing_token_env_var() -> Optional[str]:
    """
    Which accepted env var holds a non-empty value (primary wins over alias).

    Safe for operator diagnostics — never returns the secret value.
    Reports the var name even when the value is fallback-derived or malformed so
    operators can see miswiring; pair with ``signing_token_secret_source``.
    """
    if os.getenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "").strip():
        return "CLAW_AGREEMENT_SIGNING_TOKEN_SECRET"
    if os.getenv("CLAW_SIGNING_TOKEN_SECRET", "").strip():
        return "CLAW_SIGNING_TOKEN_SECRET"
    return None


def review_link_mint_enabled() -> bool:
    """
    Whether POST …/recipient-access-token can mint in this process.

    Strict environments require an explicit secret. Local/dev/test may use fallback.
    """
    source = signing_token_secret_source()
    if source == "explicit":
        return True
    if source == "fallback" and fallback_signing_token_allowed():
        return True
    return False


def resolve_signing_token_secret_raw() -> str:
    """
    Return the HMAC secret for tokens and envelope attestation.

    Raises ``SigningTokenSecretMissingInProductionError`` when staging/production/prod
    lack a usable explicit secret (missing, blank, malformed, or fallback-derived).
    """
    raw = _raw_env_signing_token_secret()
    if raw and not _is_malformed_explicit_secret(raw):
        return raw

    env = claw_environment_name()
    if fallback_signing_token_allowed():
        # Ignore fallback-derived env values in local/dev/test — use in-process fallback.
        return _DEV_FALLBACK_SIGNING_TOKEN_RAW

    # Strict environments: staging / production / prod (and any other non-fallback env).
    reason = "unset"
    if raw and _is_fallback_derived_secret(raw):
        reason = "fallback_derived"
    elif raw and len(raw) < _MIN_EXPLICIT_SECRET_LEN:
        reason = "malformed"
    elif raw:
        reason = "malformed"
    raise SigningTokenSecretMissingInProductionError(
        "CLAW_AGREEMENT_SIGNING_TOKEN_SECRET (or CLAW_SIGNING_TOKEN_SECRET) must be set to an "
        f"explicit operator secret when CLAW_ENVIRONMENT is {env!r} (reason={reason}). "
        "Shared fallback is permitted only for local/dev/test. "
        "Recipient/signing links and envelope attestation cannot proceed until configured."
    )


def signing_token_readiness_public() -> dict:
    """Safe readiness fragment — never includes secret or MAC material."""
    return {
        "signing_token_configured": operator_signing_token_secret_configured(),
        "signing_token_secret_source": signing_token_secret_source(),
        "signing_token_env_var_detected": detected_signing_token_env_var(),
        "review_link_mint_enabled": review_link_mint_enabled(),
    }
