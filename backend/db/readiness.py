"""
Lightweight database readiness probes (no secrets in responses).

Used by ``GET /v1/readyz`` (configured Postgres domains) and ``gather_deploy_readiness``.
"""

from __future__ import annotations

from typing import Any, Dict

from backend.db.config import (
    agreement_postgresql_schema,
    agreement_postgresql_url,
    affiliate_ledger_postgresql_schema,
    affiliate_ledger_postgresql_url,
    anchoring_postgresql_schema,
    anchoring_postgresql_url,
    onramp_payments_postgresql_schema,
    onramp_payments_postgresql_url,
    operator_alerts_postgresql_schema,
    operator_alerts_postgresql_url,
    postgres_connect_timeout_sec,
    postgres_connection_options_for_schema,
    timeline_postgresql_schema,
    timeline_postgresql_url,
    usage_economics_postgresql_schema,
    usage_economics_postgresql_url,
    use_postgresql_for_agreements,
    use_postgresql_for_affiliate_ledger,
    use_postgresql_for_anchoring,
    use_postgresql_for_onramp_payments,
    use_postgresql_for_operator_alerts,
    use_postgresql_for_timeline,
    use_postgresql_for_usage_economics,
)


def anchoring_database_readiness() -> Dict[str, Any]:
    """
    Ping the anchoring database backend.

    - **SQLite:** ``status=skipped`` (file checks remain in deploy_readiness SQLite keys).
    - **Postgres:** ``SELECT 1`` with ``connect_timeout`` from env.
    """
    if not use_postgresql_for_anchoring():
        return {
            "status": "skipped",
            "backend": "sqlite",
            "detail": "no postgresql DSN for anchoring",
        }
    url = anchoring_postgresql_url()
    schema = anchoring_postgresql_schema()
    timeout = postgres_connect_timeout_sec()
    try:
        import psycopg

        with psycopg.connect(
            url,
            connect_timeout=timeout,
            autocommit=True,
            options=postgres_connection_options_for_schema(schema),
        ) as conn:
            conn.execute("SELECT 1")
        return {
            "status": "ok",
            "backend": "postgresql",
            "schema": schema,
            "connect_timeout_sec": timeout,
        }
    except Exception as e:
        return {
            "status": "error",
            "backend": "postgresql",
            "schema": schema,
            "connect_timeout_sec": timeout,
            "detail": str(e)[:400],
        }


def usage_economics_database_readiness() -> Dict[str, Any]:
    if not use_postgresql_for_usage_economics():
        return {
            "status": "skipped",
            "backend": "sqlite",
            "detail": "no postgresql DSN for usage economics",
        }
    url = usage_economics_postgresql_url()
    schema = usage_economics_postgresql_schema()
    timeout = postgres_connect_timeout_sec()
    try:
        import psycopg

        with psycopg.connect(
            url,
            connect_timeout=timeout,
            autocommit=True,
            options=postgres_connection_options_for_schema(schema),
        ) as conn:
            conn.execute("SELECT 1")
        return {
            "status": "ok",
            "backend": "postgresql",
            "schema": schema,
            "connect_timeout_sec": timeout,
        }
    except Exception as e:
        return {
            "status": "error",
            "backend": "postgresql",
            "schema": schema,
            "connect_timeout_sec": timeout,
            "detail": str(e)[:400],
        }


def onramp_payments_database_readiness() -> Dict[str, Any]:
    if not use_postgresql_for_onramp_payments():
        return {
            "status": "skipped",
            "backend": "sqlite",
            "detail": "no postgresql DSN for onramp payments",
        }
    url = onramp_payments_postgresql_url()
    schema = onramp_payments_postgresql_schema()
    timeout = postgres_connect_timeout_sec()
    try:
        import psycopg

        with psycopg.connect(
            url,
            connect_timeout=timeout,
            autocommit=True,
            options=postgres_connection_options_for_schema(schema),
        ) as conn:
            conn.execute("SELECT 1")
        return {
            "status": "ok",
            "backend": "postgresql",
            "schema": schema,
            "connect_timeout_sec": timeout,
        }
    except Exception as e:
        return {
            "status": "error",
            "backend": "postgresql",
            "schema": schema,
            "connect_timeout_sec": timeout,
            "detail": str(e)[:400],
        }


def agreement_database_readiness() -> Dict[str, Any]:
    if not use_postgresql_for_agreements():
        return {
            "status": "skipped",
            "backend": "sqlite",
            "detail": "no postgresql DSN for agreements",
        }
    url = agreement_postgresql_url()
    schema = agreement_postgresql_schema()
    timeout = postgres_connect_timeout_sec()
    try:
        import psycopg

        with psycopg.connect(
            url,
            connect_timeout=timeout,
            autocommit=True,
            options=postgres_connection_options_for_schema(schema),
        ) as conn:
            conn.execute("SELECT 1")
        return {
            "status": "ok",
            "backend": "postgresql",
            "schema": schema,
            "connect_timeout_sec": timeout,
        }
    except Exception as e:
        return {
            "status": "error",
            "backend": "postgresql",
            "schema": schema,
            "connect_timeout_sec": timeout,
            "detail": str(e)[:400],
        }


def affiliate_ledger_database_readiness() -> Dict[str, Any]:
    if not use_postgresql_for_affiliate_ledger():
        return {
            "status": "skipped",
            "backend": "sqlite",
            "detail": "no postgresql DSN for affiliate ledger",
        }
    url = affiliate_ledger_postgresql_url()
    schema = affiliate_ledger_postgresql_schema()
    timeout = postgres_connect_timeout_sec()
    try:
        import psycopg

        with psycopg.connect(
            url,
            connect_timeout=timeout,
            autocommit=True,
            options=postgres_connection_options_for_schema(schema),
        ) as conn:
            conn.execute("SELECT 1")
        return {
            "status": "ok",
            "backend": "postgresql",
            "schema": schema,
            "connect_timeout_sec": timeout,
        }
    except Exception as e:
        return {
            "status": "error",
            "backend": "postgresql",
            "schema": schema,
            "connect_timeout_sec": timeout,
            "detail": str(e)[:400],
        }


def operator_alerts_database_readiness() -> Dict[str, Any]:
    if not use_postgresql_for_operator_alerts():
        return {
            "status": "skipped",
            "backend": "sqlite",
            "detail": "no postgresql DSN for operator alerts",
        }
    url = operator_alerts_postgresql_url()
    schema = operator_alerts_postgresql_schema()
    timeout = postgres_connect_timeout_sec()
    try:
        import psycopg

        with psycopg.connect(
            url,
            connect_timeout=timeout,
            autocommit=True,
            options=postgres_connection_options_for_schema(schema),
        ) as conn:
            conn.execute("SELECT 1")
        return {
            "status": "ok",
            "backend": "postgresql",
            "schema": schema,
            "connect_timeout_sec": timeout,
        }
    except Exception as e:
        return {
            "status": "error",
            "backend": "postgresql",
            "schema": schema,
            "connect_timeout_sec": timeout,
            "detail": str(e)[:400],
        }


def timeline_database_readiness() -> Dict[str, Any]:
    """Ping the timeline/receipt Postgres backend when a timeline DSN is configured."""
    if not use_postgresql_for_timeline():
        return {
            "status": "skipped",
            "backend": "sqlite",
            "detail": "no postgresql DSN for timeline",
        }
    url = timeline_postgresql_url()
    schema = timeline_postgresql_schema()
    timeout = postgres_connect_timeout_sec()
    try:
        import psycopg

        with psycopg.connect(
            url,
            connect_timeout=timeout,
            autocommit=True,
            options=postgres_connection_options_for_schema(schema),
        ) as conn:
            conn.execute("SELECT 1")
        return {
            "status": "ok",
            "backend": "postgresql",
            "schema": schema,
            "connect_timeout_sec": timeout,
        }
    except Exception as e:
        return {
            "status": "error",
            "backend": "postgresql",
            "schema": schema,
            "connect_timeout_sec": timeout,
            "detail": str(e)[:400],
        }


def economics_persistence_readiness() -> Dict[str, Any]:
    """
    Production must not silently rely on default ephemeral economics SQLite.

    Requires ``CLAW_ECONOMICS_DB_PATH`` on a persistent volume, or non-production environment.
    """
    import os
    import sqlite3

    from backend.config.deployment_runtime import is_production_named_claw_environment
    from backend.economics.store import economics_db_path

    if not is_production_named_claw_environment():
        return {"status": "skipped", "detail": "non-production environment"}

    explicit = os.getenv("CLAW_ECONOMICS_DB_PATH", "").strip()
    path = economics_db_path()
    if not explicit:
        return {
            "status": "error",
            "backend": "sqlite",
            "path": path,
            "explicit_path_configured": False,
            "detail": (
                "production requires CLAW_ECONOMICS_DB_PATH on persistent storage "
                "(default economics SQLite path is ephemeral on PaaS)"
            ),
        }
    try:
        with sqlite3.connect(os.path.expanduser(path), timeout=10.0) as con:
            con.execute("SELECT 1")
        return {
            "status": "ok",
            "backend": "sqlite",
            "path": path,
            "explicit_path_configured": True,
        }
    except Exception as e:
        return {
            "status": "error",
            "backend": "sqlite",
            "path": path,
            "explicit_path_configured": True,
            "detail": str(e)[:400],
        }


def production_launch_config_readiness() -> Dict[str, Any]:
    """Fail closed when production-critical env is missing (no secret values)."""
    import os

    from backend.billing.stripe_config import is_stripe_checkout_configured
    from backend.config.agreement_signing_token import operator_signing_token_secret_configured

    env = os.getenv("CLAW_ENVIRONMENT", "").strip().lower() or "local"
    pg_configured = bool(
        os.getenv("CLAW_DATABASE_URL", "").strip() or os.getenv("DATABASE_URL", "").strip()
    )

    if env not in ("production", "prod"):
        if pg_configured and env in ("local", ""):
            return {
                "status": "error",
                "detail": "managed Postgres configured but CLAW_ENVIRONMENT is not production/prod",
                "missing_keys": ["CLAW_ENVIRONMENT"],
                "configured_environment": env,
            }
        return {"status": "skipped", "detail": f"CLAW_ENVIRONMENT={env}"}

    missing: list[str] = []
    if not os.getenv("CLAW_ECONOMICS_DB_PATH", "").strip():
        missing.append("CLAW_ECONOMICS_DB_PATH")
    if not (os.getenv("CLAW_DATABASE_URL", "").strip() or os.getenv("DATABASE_URL", "").strip()):
        missing.append("CLAW_DATABASE_URL")
    if not os.getenv("CLAW_CORS_ALLOW_ORIGINS", "").strip():
        missing.append("CLAW_CORS_ALLOW_ORIGINS")
    if not operator_signing_token_secret_configured():
        missing.append("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET")
    if not os.getenv("CLAW_ADMIN_SECRET", "").strip():
        missing.append("CLAW_ADMIN_SECRET")
    if not os.getenv("STRIPE_WEBHOOK_SECRET", "").strip():
        missing.append("STRIPE_WEBHOOK_SECRET")
    if not is_stripe_checkout_configured():
        missing.append("STRIPE_SECRET_KEY")
        missing.append("STRIPE_PRICE_PRO_MONTHLY")
    api_base = os.getenv("CLAW_API_BASE", "").strip() or os.getenv("LAWDOG_API_ORIGIN", "").strip()
    if not api_base:
        missing.append("CLAW_API_BASE")

    if missing:
        return {
            "status": "error",
            "detail": "missing production-critical configuration",
            "missing_keys": missing,
        }
    return {"status": "ok", "missing_keys": []}


def launch_postgres_readiness_for_readyz() -> Dict[str, Any]:
    """
    Domains that should fail ``GET /v1/readyz`` (503) when Postgres is configured but unreachable.

    Excludes usage-economics metering (degraded UX, not full-app hard dependency for LB drain).
    """
    from backend.billing.subscription_authority_topology import assess_subscription_authority_topology

    return {
        "anchoring_database": anchoring_database_readiness(),
        "agreements_database": agreement_database_readiness(),
        "timeline_database": timeline_database_readiness(),
        "affiliate_ledger_database": affiliate_ledger_database_readiness(),
        "operator_alerts_database": operator_alerts_database_readiness(),
        "onramp_payments_database": onramp_payments_database_readiness(),
        "subscription_authority_topology": assess_subscription_authority_topology(),
    }
