"""
Central database URL helpers (Postgres day-one; SQLite paths remain per-store until ported).

**Launch posture:** Prefer a single ``CLAW_DATABASE_URL`` or ``DATABASE_URL`` so every store that
falls through to these keys shares one managed instance; schemas are isolated via
``CLAW_PG_SCHEMA_*`` / libpq ``search_path``. Per-store env vars
(``CLAW_ANCHORING_DATABASE_URL``, ``CLAW_AGREEMENT_DATABASE_URL``, etc.) exist for **intentional**
split-cluster setups only — omit them in the default case to avoid accidental mixed hosts.

See ``docs/ops/LAUNCH_DATABASE_PROFILE.md``.
"""

from __future__ import annotations

import os
from typing import Optional


def anchoring_postgresql_url() -> str:
    """
    DSN for anchoring when using Postgres.

    ``CLAW_ANCHORING_DATABASE_URL`` wins; else ``CLAW_DATABASE_URL`` / ``DATABASE_URL``.
    """
    for key in (
        "CLAW_ANCHORING_DATABASE_URL",
        "CLAW_DATABASE_URL",
        "DATABASE_URL",
    ):
        raw = os.getenv(key, "").strip()
        if raw and raw.split(":", 1)[0].lower() in (
            "postgresql",
            "postgres",
        ):
            return raw
    return ""


def anchoring_postgresql_schema() -> str:
    """Search path schema for anchoring tables (default ``lawdog_anchoring``)."""
    return os.getenv("CLAW_PG_SCHEMA_ANCHORING", "lawdog_anchoring").strip() or "lawdog_anchoring"


def use_postgresql_for_anchoring() -> bool:
    return bool(anchoring_postgresql_url())


def agreement_postgresql_url() -> str:
    """
    DSN for agreement drafts, version rows, and signing-lock snapshots when using Postgres.

    ``CLAW_AGREEMENT_DATABASE_URL`` wins; else ``CLAW_DATABASE_URL`` / ``DATABASE_URL``.
    """
    for key in (
        "CLAW_AGREEMENT_DATABASE_URL",
        "CLAW_DATABASE_URL",
        "DATABASE_URL",
    ):
        raw = os.getenv(key, "").strip()
        if raw and raw.split(":", 1)[0].lower() in (
            "postgresql",
            "postgres",
        ):
            return raw
    return ""


def agreement_postgresql_schema() -> str:
    """Search path schema for agreement tables (default ``lawdog_agreements``)."""
    return os.getenv("CLAW_PG_SCHEMA_AGREEMENTS", "lawdog_agreements").strip() or "lawdog_agreements"


def use_postgresql_for_agreements() -> bool:
    return bool(agreement_postgresql_url())


def affiliate_ledger_postgresql_url() -> str:
    """
    DSN for affiliate earnings + payout batch ledger tables when using Postgres.

    ``CLAW_AFFILIATE_LEDGER_DATABASE_URL`` wins; else ``CLAW_DATABASE_URL`` / ``DATABASE_URL``.
    """
    for key in (
        "CLAW_AFFILIATE_LEDGER_DATABASE_URL",
        "CLAW_DATABASE_URL",
        "DATABASE_URL",
    ):
        raw = os.getenv(key, "").strip()
        if raw and raw.split(":", 1)[0].lower() in (
            "postgresql",
            "postgres",
        ):
            return raw
    return ""


def affiliate_ledger_postgresql_schema() -> str:
    """Search path schema for affiliate ledger (default ``lawdog_affiliate_ledger``)."""
    return (
        os.getenv("CLAW_PG_SCHEMA_AFFILIATE_LEDGER", "lawdog_affiliate_ledger").strip()
        or "lawdog_affiliate_ledger"
    )


def use_postgresql_for_affiliate_ledger() -> bool:
    return bool(affiliate_ledger_postgresql_url())


def operator_alerts_postgresql_url() -> str:
    """
    DSN for persisted operator alerts when using Postgres.

    ``CLAW_OPERATOR_ALERTS_DATABASE_URL`` wins; else ``CLAW_DATABASE_URL`` / ``DATABASE_URL``.
    """
    for key in (
        "CLAW_OPERATOR_ALERTS_DATABASE_URL",
        "CLAW_DATABASE_URL",
        "DATABASE_URL",
    ):
        raw = os.getenv(key, "").strip()
        if raw and raw.split(":", 1)[0].lower() in (
            "postgresql",
            "postgres",
        ):
            return raw
    return ""


def operator_alerts_postgresql_schema() -> str:
    """Search path schema for operator alerts (default ``lawdog_operator_alerts``)."""
    return (
        os.getenv("CLAW_PG_SCHEMA_OPERATOR_ALERTS", "lawdog_operator_alerts").strip()
        or "lawdog_operator_alerts"
    )


def use_postgresql_for_operator_alerts() -> bool:
    return bool(operator_alerts_postgresql_url())


def timeline_postgresql_url() -> str:
    """
    DSN for timeline / receipts / Merkle batch tables when using Postgres.

    ``CLAW_TIMELINE_DATABASE_URL`` wins, then ``CLAW_ANCHORING_DATABASE_URL`` (colocate with proof spine),
    else ``CLAW_DATABASE_URL`` / ``DATABASE_URL``.
    """
    for key in (
        "CLAW_TIMELINE_DATABASE_URL",
        "CLAW_ANCHORING_DATABASE_URL",
        "CLAW_DATABASE_URL",
        "DATABASE_URL",
    ):
        raw = os.getenv(key, "").strip()
        if raw and raw.split(":", 1)[0].lower() in (
            "postgresql",
            "postgres",
        ):
            return raw
    return ""


def timeline_postgresql_schema() -> str:
    """Search path schema for timeline domain (default ``lawdog_timeline``)."""
    return os.getenv("CLAW_PG_SCHEMA_TIMELINE", "lawdog_timeline").strip() or "lawdog_timeline"


def use_postgresql_for_timeline() -> bool:
    return bool(timeline_postgresql_url())


def usage_economics_postgresql_url() -> str:
    """
    DSN for usage economics (metering, subject counters, analytics_events) when using Postgres.

    ``CLAW_USAGE_ECONOMICS_DATABASE_URL`` wins; else ``CLAW_DATABASE_URL`` / ``DATABASE_URL``.
    """
    for key in (
        "CLAW_USAGE_ECONOMICS_DATABASE_URL",
        "CLAW_DATABASE_URL",
        "DATABASE_URL",
    ):
        raw = os.getenv(key, "").strip()
        if raw and raw.split(":", 1)[0].lower() in (
            "postgresql",
            "postgres",
        ):
            return raw
    return ""


def usage_economics_postgresql_schema() -> str:
    """Search path schema for usage economics (default ``lawdog_usage_economics``)."""
    return (
        os.getenv("CLAW_PG_SCHEMA_USAGE_ECONOMICS", "lawdog_usage_economics").strip()
        or "lawdog_usage_economics"
    )


def use_postgresql_for_usage_economics() -> bool:
    return bool(usage_economics_postgresql_url())


def onramp_payments_postgresql_url() -> str:
    """
    DSN for crypto onramp payments store (``OnrampStore``) when using Postgres.

    ``CLAW_ONRAMP_PAYMENTS_DATABASE_URL`` wins; else ``CLAW_DATABASE_URL`` / ``DATABASE_URL``.
    """
    for key in (
        "CLAW_ONRAMP_PAYMENTS_DATABASE_URL",
        "CLAW_DATABASE_URL",
        "DATABASE_URL",
    ):
        raw = os.getenv(key, "").strip()
        if raw and raw.split(":", 1)[0].lower() in (
            "postgresql",
            "postgres",
        ):
            return raw
    return ""


def onramp_payments_postgresql_schema() -> str:
    """Search path schema for onramp payments (default ``lawdog_onramp_payments``)."""
    return (
        os.getenv("CLAW_PG_SCHEMA_ONRAMP_PAYMENTS", "lawdog_onramp_payments").strip()
        or "lawdog_onramp_payments"
    )


def use_postgresql_for_onramp_payments() -> bool:
    return bool(onramp_payments_postgresql_url())


def postgres_connect_timeout_sec() -> int:
    """
    TCP/connect timeout for Postgres clients (anchoring, agreements, readiness).

    Managed instances behind NAT / TLS may need 10–15s; keep bounded.
    """
    raw = os.getenv("CLAW_PG_CONNECT_TIMEOUT_SEC", "10").strip()
    try:
        return max(2, min(int(raw), 120))
    except ValueError:
        return 10


def postgres_statement_timeout_ms() -> Optional[int]:
    """
    Optional server-side ``statement_timeout`` (ms) applied on Postgres store connections.

    Unset = no extra ``-c`` (provider default). Use to cap runaway queries in prod.
    """
    raw = os.getenv("CLAW_PG_STATEMENT_TIMEOUT_MS", "").strip()
    if not raw:
        return None
    try:
        return max(100, min(int(raw), 3_600_000))
    except ValueError:
        return None


def postgres_connection_options_for_schema(schema: str) -> str:
    """Libpq ``options`` string: ``search_path`` + optional ``statement_timeout``."""
    s = (schema or "").strip() or "lawdog_anchoring"
    out = f"-c search_path={s},public"
    st = postgres_statement_timeout_ms()
    if st is not None:
        out += f" -c statement_timeout={st}"
    return out
