"""Shared helpers for commercial entitlement / checkout authority tests."""

from __future__ import annotations

import os
import uuid
from typing import Optional

from backend.billing.subscription_authority import demo_expiry_iso
from backend.billing.subscriptions import sync_subscription_from_payment
from backend.economics.store import EconomicsStore, get_economics_store
from backend.payments.store import get_onramp_store
from backend.treasury.treasury_store import get_treasury_store

_COMMERCIAL_PG_ENV_KEYS = (
    "CLAW_USAGE_ECONOMICS_DATABASE_URL",
    "CLAW_DATABASE_URL",
    "DATABASE_URL",
)


def commercial_postgres_dsn() -> str:
    """Resolve a PostgreSQL DSN from the environment (never hard-coded in repo)."""
    for key in _COMMERCIAL_PG_ENV_KEYS:
        raw = os.getenv(key, "").strip()
        if raw.split(":", 1)[0].lower() in ("postgresql", "postgres"):
            return raw
    return ""


def configure_commercial_postgres_usage(
    monkeypatch,
    dsn: str,
    *,
    schema: str = "lawdog_commercial_test",
) -> None:
    """Point usage economics (ownership + anonymous sessions) at disposable Postgres."""
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DATABASE_URL", dsn)
    monkeypatch.setenv("CLAW_PG_SCHEMA_USAGE_ECONOMICS", schema)
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_STRICT_IN_DEV", "1")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    import backend.security.anonymous_session_store as anon_store_mod
    import backend.usage_economics.store as ue_store_mod
    import backend.usage_economics.usage_economics_postgres as uep_mod

    ue_store_mod._store = None
    anon_store_mod._store = None
    uep_mod._schema_done = False


def reset_commercial_postgres_usage_schema() -> None:
    """Truncate commercial usage-economics tables in the configured Postgres schema."""
    from backend.db.config import usage_economics_postgresql_schema, usage_economics_postgresql_url
    from backend.usage_economics.usage_economics_postgres import ensure_usage_economics_schema

    url = usage_economics_postgresql_url()
    if not url:
        raise RuntimeError("commercial_postgres_dsn_required")
    ensure_usage_economics_schema()
    schema = usage_economics_postgresql_schema()
    import psycopg
    from psycopg import sql as psql

    tables = (
        "agreement_owner_repair_log",
        "auth_continuation_transactions",
        "anonymous_sessions",
        "ip_draft_burst",
        "analytics_events",
        "ip_subject_day",
        "subject_counters",
        "agreement_owner",
    )
    with psycopg.connect(url) as con:
        for table in tables:
            con.execute(
                psql.SQL("DELETE FROM {}.{}").format(
                    psql.Identifier(schema),
                    psql.Identifier(table),
                )
            )
        con.commit()


def activate_pro_on_org(
    eco: EconomicsStore,
    org_id: str,
    *,
    user_id: Optional[str] = None,
    status: str = "active",
) -> None:
    sync_subscription_from_payment(
        economics=eco,
        store=get_onramp_store(),
        treasury=get_treasury_store(),
        payment_id=f"test:pro:{uuid.uuid4().hex[:8]}",
        org_id=org_id,
        user_id=user_id,
        plan_code="pro",
        current_period_end=demo_expiry_iso(30),
    )
    row = eco.get_subscription_by_org(org_id)
    if row and status != "active":
        eco.upsert_subscription_authority(
            org_id=org_id,
            user_id=user_id,
            plan_code="pro",
            status=status,
            expires_at=row.get("expires_at"),
            current_period_end=row.get("current_period_end"),
            canceled_at=row.get("canceled_at"),
            stripe_subscription_id=row.get("stripe_subscription_id"),
            stripe_customer_id=row.get("stripe_customer_id"),
            payment_id=row.get("payment_id"),
            renewed_at=row.get("renewed_at"),
        )


def isolated_economics_store(tmp_path, monkeypatch) -> EconomicsStore:
    eco_path = str(tmp_path / "economics.sqlite3")
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", eco_path)
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite3"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite3"))
    import backend.economics.store as eco_store_mod

    eco_store_mod._store = None
    eco = get_economics_store()
    eco.init_schema()
    return eco
