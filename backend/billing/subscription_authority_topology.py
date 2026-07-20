"""
Production guard for SQLite-backed subscription authority under horizontal scale.

Subscriptions live in ``EconomicsStore`` (SQLite). Multiple web processes or replicas
must not serve production traffic against that authority without a shared transactional store.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

from backend.config.deployment_runtime import is_production_like_claw_environment


def subscription_authority_uses_sqlite() -> bool:
    """Canonical subscription rows are persisted in economics SQLite (no Postgres backend yet)."""
    return True


def _parse_positive_int(raw: str, *, default: int = 1) -> int:
    s = (raw or "").strip()
    if not s:
        return default
    try:
        return max(1, int(s))
    except ValueError:
        return default


def configured_web_worker_count() -> int:
    """Gunicorn/Uvicorn workers per process (``WEB_CONCURRENCY``)."""
    return _parse_positive_int(os.getenv("WEB_CONCURRENCY", "1"))


def configured_web_replica_count() -> int:
    """
    Horizontal replica instances when explicitly configured.

    ``CLAW_WEB_REPLICA_COUNT`` is the operator-facing knob; ``RAILWAY_REPLICA_COUNT`` is honored
    when present on Railway-style hosts.
    """
    explicit = os.getenv("CLAW_WEB_REPLICA_COUNT", "").strip()
    if explicit:
        return _parse_positive_int(explicit)
    railway = os.getenv("RAILWAY_REPLICA_COUNT", "").strip()
    if railway:
        return _parse_positive_int(railway)
    return 1


def configured_serving_process_count() -> int:
    """Total concurrent serving processes that may write subscription authority."""
    return configured_web_worker_count() * configured_web_replica_count()


def subscription_authority_topology_detail() -> str:
    workers = configured_web_worker_count()
    replicas = configured_web_replica_count()
    total = configured_serving_process_count()
    return (
        "SQLite subscription authority cannot be shared safely across multiple serving processes. "
        f"Detected WEB_CONCURRENCY={workers}, replica_count={replicas} "
        f"(effective_serving_processes={total}). "
        "Launch with exactly one replica and WEB_CONCURRENCY=1, or migrate subscription "
        "authority to a shared transactional store (PostgreSQL) before horizontal scale."
    )


def assess_subscription_authority_topology() -> Dict[str, Any]:
    """
    Readiness/startup assessment for subscription authority topology.

    Relaxed environments (``local``, ``dev``, ``test``) always skip.
    Production-like environments fail when SQLite authority would serve >1 process.
    """
    if not subscription_authority_uses_sqlite():
        return {
            "status": "skipped",
            "backend": "transactional_store",
            "detail": "subscription authority not on SQLite",
        }

    workers = configured_web_worker_count()
    replicas = configured_web_replica_count()
    total = configured_serving_process_count()
    base = {
        "backend": "sqlite",
        "web_concurrency": workers,
        "replica_count": replicas,
        "effective_serving_processes": total,
        "economics_db_path_explicit": bool(os.getenv("CLAW_ECONOMICS_DB_PATH", "").strip()),
    }

    if not is_production_like_claw_environment():
        return {
            **base,
            "status": "skipped",
            "detail": "non-production-like environment",
        }

    if total > 1:
        return {
            **base,
            "status": "error",
            "detail": subscription_authority_topology_detail(),
        }

    return {
        **base,
        "status": "ok",
        "detail": "single serving process for SQLite subscription authority",
    }


def assert_subscription_authority_topology_at_startup() -> None:
    """Fail closed during process boot in production-like environments."""
    result = assess_subscription_authority_topology()
    if result.get("status") == "error":
        raise SystemExit(result.get("detail") or "subscription_authority_topology_invalid")


class SubscriptionAuthorityTopologyError(RuntimeError):
    """Raised when production topology violates SQLite subscription authority constraints."""


def require_subscription_authority_topology_or_raise() -> None:
    """Imperative guard for tests and internal callers."""
    result = assess_subscription_authority_topology()
    if result.get("status") == "error":
        raise SubscriptionAuthorityTopologyError(str(result.get("detail") or "topology_invalid"))
