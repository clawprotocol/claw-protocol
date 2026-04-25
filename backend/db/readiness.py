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


def launch_postgres_readiness_for_readyz() -> Dict[str, Any]:
    """
    Domains that should fail ``GET /v1/readyz`` (503) when Postgres is configured but unreachable.

    Excludes usage-economics metering (degraded UX, not full-app hard dependency for LB drain).
    """
    return {
        "anchoring_database": anchoring_database_readiness(),
        "agreements_database": agreement_database_readiness(),
        "timeline_database": timeline_database_readiness(),
        "affiliate_ledger_database": affiliate_ledger_database_readiness(),
        "operator_alerts_database": operator_alerts_database_readiness(),
        "onramp_payments_database": onramp_payments_database_readiness(),
    }
