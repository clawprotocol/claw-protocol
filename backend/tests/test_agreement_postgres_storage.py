"""
Optional integration: set ``CLAW_AGREEMENT_PG_TEST_URL`` to a writable ``postgresql://`` DSN
(schema ``lawdog_agreements`` is created; tables use IF NOT EXISTS).
"""

from __future__ import annotations

import os
import uuid

import pytest

from backend.utils.agreement_version_store import AgreementVersionStore

_PG_RAW = os.getenv("CLAW_AGREEMENT_PG_TEST_URL", "").strip()
# Tolerate accidental `DSN=` / `CLAW_AGREEMENT_PG_TEST_URL=` prefixes from shell helpers.
_PG = _PG_RAW
for _prefix in ("CLAW_AGREEMENT_PG_TEST_URL=", "DSN="):
    if _PG.startswith(_prefix):
        _PG = _PG[len(_prefix) :].strip()


@pytest.mark.skipif(not _PG, reason="CLAW_AGREEMENT_PG_TEST_URL not set")
def test_agreement_postgres_draft_version_lock_roundtrip(monkeypatch):
    monkeypatch.setenv("CLAW_AGREEMENT_DATABASE_URL", _PG)
    monkeypatch.delenv("CLAW_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)

    from backend.services import agreement_draft_store as ads
    from backend.services import agreement_signing_lock_store as als

    if hasattr(ads, "_use_postgres"):
        pass  # ensure module loaded after env set
    from backend.db import agreement_sql

    agreement_sql._pg_migrations_applied = False  # noqa: SLF001 — allow fresh migrate against test DB

    # Unique id so consecutive suite runs against a shared ephemeral PG do not collide.
    aid = f"test_pg_agreement_{uuid.uuid4().hex[:12]}"
    ads.save_draft({"id": aid, "title": "T", "jurisdiction": "TX"})
    got = ads.load_draft(aid)
    assert got["id"] == aid
    assert got["title"] == "T"
    assert ads.draft_exists(aid)

    store = AgreementVersionStore()
    out = store.save_version(
        agreement_id=aid,
        title="T",
        body_markdown="# Hello",
        created_at=None,
        disclaimers=None,
        metadata={"k": "v"},
    )
    assert out["version"] == 1
    assert store.list_versions(agreement_id=aid)[0]["version"] == 1
    v1 = store.get_version(agreement_id=aid, version=1)
    assert v1["body_markdown"] == "# Hello"
    assert v1["metadata"] == {"k": "v"}

    als.write_signing_lock(aid, {"locked_version_id": "lv1"})
    assert als.read_signing_lock(aid) == {"locked_version_id": "lv1"}

    ids = ads.list_draft_agreement_ids_newest_first()
    assert aid in ids
