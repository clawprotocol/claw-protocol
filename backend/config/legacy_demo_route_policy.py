"""
Centralized fail-closed policy for disconnected legacy/demo HTTP surfaces (P0-1).

Production-like deployments omit these routes entirely (routers not mounted; direct
legacy paths return 404). Relaxed environments (local/dev/test) retain existing behavior.

Re-enable in non-production-like staging via ``CLAW_ENABLE_LEGACY_DEMO_ROUTES=1``.
Production/prod never enable legacy/demo routes, even with an explicit override.
"""

from __future__ import annotations

import logging
import os
from typing import Final, Iterable, Tuple

from backend.config.deployment_runtime import (
    claw_environment,
    is_production_named_claw_environment,
    is_relaxed_claw_environment,
)

log = logging.getLogger("claw.backend.legacy_demo_routes")

ENV_CLAW_ENABLE_LEGACY_DEMO_ROUTES: Final[str] = "CLAW_ENABLE_LEGACY_DEMO_ROUTES"

# Router families omitted from production when containment is active.
LEGACY_DEMO_ROUTER_PREFIXES: Final[Tuple[str, ...]] = (
    "/v1/analyst",
    "/v1/workflow",
    "/v1/esign",
    "/v1/agreements",
    "/v1/liability",
)

# Direct legacy handlers registered on ``backend.main`` (not via include_router).
LEGACY_DEMO_DIRECT_EXACT_PATHS: Final[frozenset[str]] = frozenset(
    {
        "/receipt",
        "/verify",
        "/verify/tree",
        "/propose",
        "/sign",
        "/proof",
        "/anchor",
        "/agent/propose",
        "/agent/sign",
        "/agent/proof",
        "/agent/anchor",
    }
)

# Optional multipart legacy surfaces (also gated by CLAW_ENABLE_MULTIPART).
LEGACY_DEMO_MULTIPART_PREFIXES: Final[Tuple[str, ...]] = (
    "/v1/clauses/extract",
    "/v1/agent_flow",
)


def _truthy(raw: str) -> bool:
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _falsey(raw: str) -> bool:
    return raw.strip().lower() in ("0", "false", "no", "off")


def legacy_demo_routes_enabled() -> bool:
    """
    Fail-closed outside relaxed environments.

    - ``production`` / ``prod``: always disabled (no override).
    - ``local`` / ``dev`` / ``test``: enabled unless ``CLAW_ENABLE_LEGACY_DEMO_ROUTES=0``.
    - Other values (staging, empty, unknown): disabled unless explicit opt-in ``=1``.
    """
    if is_production_named_claw_environment():
        return False

    explicit = os.getenv(ENV_CLAW_ENABLE_LEGACY_DEMO_ROUTES, "").strip()
    if is_relaxed_claw_environment():
        if explicit and _falsey(explicit):
            return False
        return True

    return bool(explicit and _truthy(explicit))


def is_legacy_demo_contained_http_path(path: str) -> bool:
    """True when *path* belongs to a legacy/demo surface covered by P0-1 containment."""
    if path in LEGACY_DEMO_DIRECT_EXACT_PATHS:
        return True

    for prefix in LEGACY_DEMO_ROUTER_PREFIXES:
        if path == prefix or path.startswith(prefix + "/"):
            return True

    if path.startswith("/v1/liability/assessment/"):
        return True

    if path.startswith("/v1/timelines/") and path.endswith("/liability/latest"):
        return True

    for prefix in LEGACY_DEMO_MULTIPART_PREFIXES:
        if path == prefix or path.startswith(prefix + "/"):
            return True

    return False


def legacy_demo_route_families() -> Iterable[str]:
    """Stable labels for tests and operator diagnostics."""
    yield "analyst"
    yield "workflow"
    yield "esign"
    yield "agreements_v1"
    yield "liability"
    yield "legacy_agent_protocol"
    yield "legacy_receipt_verify"
    yield "multipart_legacy"


def log_legacy_demo_route_policy_at_startup() -> None:
    enabled = legacy_demo_routes_enabled()
    env = claw_environment()
    if enabled:
        log.info(
            "[claw] legacy/demo HTTP routes: enabled (env=%r)",
            env,
        )
    else:
        log.info(
            "[claw] legacy/demo HTTP routes: disabled — production containment active (env=%r)",
            env,
        )
