"""
Non-production escape hatch for the AI airlock (privilege / protected-mode block).

``PROTECTED_MODE_EXTERNAL_AI`` blocks *all* user content that matches legal-sensitive
heuristics (e.g. "settlement", "attorney") from reaching OpenAI. That is correct in
production but blocks normal LawDog Pro drafting locally when intake contains those
words.

Set ``CLAW_ALLOW_EXTERNAL_AI_LOCAL=1`` with ``CLAW_ENVIRONMENT`` in
``local`` / ``dev`` / ``test`` / ``staging`` only. **Never** set in production:
``production`` / ``prod`` always disable the bypass regardless of the flag.
"""

from __future__ import annotations

import logging
import os
from typing import Final

from backend.config.deployment_runtime import claw_environment

log = logging.getLogger("claw.backend.external_ai")

# Env var: explicit opt-in; must be combined with a non-production CLAW_ENVIRONMENT.
ENV_CLAW_ALLOW_EXTERNAL_AI_LOCAL: Final[str] = "CLAW_ALLOW_EXTERNAL_AI_LOCAL"

# Environments where the bypass may be considered (never includes production).
_NON_PROD_BYPASS_ENVS: Final[frozenset[str]] = frozenset(
    {
        "local",
        "dev",
        "test",
        "staging",
    }
)

# Always refuse bypass when deployment identifies as production.
_PROD_DENY: Final[frozenset[str]] = frozenset(
    {
        "production",
        "prod",
    }
)


def claw_environment_normalized() -> str:
    """Fail-closed: empty when CLAW_ENVIRONMENT is unset/blank (never defaults to local)."""
    return claw_environment()


def is_non_production_external_ai_bypass_active() -> bool:
    """
    True only when:
    - CLAW_ENVIRONMENT is one of local/dev/test/staging, and
    - CLAW_ALLOW_EXTERNAL_AI_LOCAL is a truthy flag, and
    - CLAW_ENVIRONMENT is not production/prod.
    """
    env = claw_environment_normalized()
    if env in _PROD_DENY:
        return False
    if env not in _NON_PROD_BYPASS_ENVS:
        return False
    raw = os.getenv(ENV_CLAW_ALLOW_EXTERNAL_AI_LOCAL, "").strip().lower()
    return raw in ("1", "true", "yes", "on")


def log_external_ai_policy_at_startup() -> None:
    """Idempotent friendly log for operators (no secrets). Call once from app startup."""
    env = claw_environment_normalized()
    flag = os.getenv(ENV_CLAW_ALLOW_EXTERNAL_AI_LOCAL, "")
    active = is_non_production_external_ai_bypass_active()
    if active:
        log.warning(
            "[claw] external AI: PROTECTED_MODE airlock bypass ENABLED for env=%r (%s=1). "
            "Content still passes redaction/minimization before OpenAI. "
            "Not available in production.",
            env,
            ENV_CLAW_ALLOW_EXTERNAL_AI_LOCAL,
        )
    else:
        log.info(
            "[claw] external AI: default airlock (protected heuristics may block; "
            "e.g. settlement/attorney in intake). For local Pro drafting set %s=1 and "
            "CLAW_ENVIRONMENT=local|dev|test|staging. env=%r %s=%r",
            ENV_CLAW_ALLOW_EXTERNAL_AI_LOCAL,
            env,
            ENV_CLAW_ALLOW_EXTERNAL_AI_LOCAL,
            flag,
        )
