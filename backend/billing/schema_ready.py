"""Production startup hook: economics/billing schema must exist before traffic."""

from __future__ import annotations

from backend.economics.store import get_economics_store


def ensure_billing_schema_ready() -> None:
    """Initialize the economics store, including checkout-attempt tables.

    This is the supported production startup/migration path. Concurrent
    request traffic must not be the first writer of ALTER migrations.
    """
    eco = get_economics_store()
    eco.init_schema()
