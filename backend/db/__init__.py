"""
Lean database portability: optional managed Postgres (day-one) with SQLite fallback.

- Set ``CLAW_DATABASE_URL`` or ``CLAW_ANCHORING_DATABASE_URL`` to a ``postgresql://`` DSN to use Postgres for anchoring.
- Set ``CLAW_AGREEMENT_DATABASE_URL`` (or the same shared DSN) for agreement drafts, version history, and signing locks
  (schema ``lawdog_agreements``, override with ``CLAW_PG_SCHEMA_AGREEMENTS``).
- Otherwise agreements use JSON files + ``agreements.sqlite3`` as today.

Other stores may still use SQLite until ported; this package is the shared foundation.
"""

from backend.db.anchoring_sql import open_anchoring_store_connection

__all__ = ["open_anchoring_store_connection"]
