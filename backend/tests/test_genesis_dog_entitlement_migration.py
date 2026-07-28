"""Migration/backfill safety for genesis_dog_entitlements dual-read transition."""

from __future__ import annotations

import uuid

import pytest

from backend.affiliates.genesis_referral_service import create_genesis_affiliate
from backend.economics.store import get_economics_store, reset_economics_store_for_tests
from backend.usage_economics.commercial_entitlement import resolve_commercial_entitlement
from backend.usage_economics.genesis_dog_entitlement import (
    GRANT_SOURCE_ADMIN,
    GRANT_SOURCE_LEGACY_AFFILIATE,
    GRANT_SOURCE_LEGACY_MIGRATION,
    backfill_legacy_affiliate_grants,
    get_entitlement,
    grant_entitlement,
    preview_legacy_affiliate_backfill,
    resolve_genesis_dog_access,
    revoke_entitlement,
)
from backend.usage_economics.store import UsageEconomicsStore


@pytest.fixture()
def isolated_mig(tmp_path, monkeypatch: pytest.MonkeyPatch):
    from backend.economics import store as eco_store
    from backend.usage_economics import store as ue_store

    eco_store.reset_economics_store_for_tests()
    ue_store._store = None
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage_eco.sqlite3"))
    reset_economics_store_for_tests()
    eco = get_economics_store()
    eco.init_schema()
    usage = UsageEconomicsStore(str(tmp_path / "usage_eco.sqlite3"))
    usage.init_schema()
    ue_store._store = usage
    yield eco, usage
    eco_store.reset_economics_store_for_tests()
    ue_store._store = None


def _aff(eco, uid: str, *, status: str = "active") -> None:
    create_genesis_affiliate(
        eco,
        user_id=uid,
        display_name=f"Dog {uid}",
        referral_code=f"MIG_{uid[:8].upper()}_{uuid.uuid4().hex[:4]}",
        affiliate_status=status,
    )


def test_migrations_are_additive_via_init_schema(isolated_mig):
    _eco, usage = isolated_mig
    # Tables/columns from 005/006 must exist after init_schema.
    with usage._conn() as con:  # noqa: SLF001
        tables = {
            r[0]
            for r in con.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        assert "genesis_dog_entitlements" in tables
        assert "genesis_access_requests" in tables
        cols = {r[1] for r in con.execute("PRAGMA table_info(agreement_owner)").fetchall()}
        assert "guest_temp" in cols


def test_dry_run_backfill_precise_counts_no_writes(isolated_mig):
    eco, _usage = isolated_mig
    _aff(eco, "mig-a")
    _aff(eco, "mig-b")
    grant_entitlement(user_id="mig-b", granted_by="ops", grant_source=GRANT_SOURCE_ADMIN)
    preview = preview_legacy_affiliate_backfill()
    assert preview["dry_run"] is True
    assert preview["active_affiliates"] == 2
    assert preview["would_insert"] == 1
    assert preview["would_insert_user_ids"] == ["mig-a"]
    assert preview["skipped"] == 1
    assert preview["inserted"] == 0
    assert get_entitlement("mig-a") is None
    dry = backfill_legacy_affiliate_grants(dry_run=True)
    assert dry["inserted"] == 0
    assert get_entitlement("mig-a") is None


def test_backfill_idempotent_and_preserves_access(isolated_mig):
    eco, _usage = isolated_mig
    _aff(eco, "mig-keep")
    # Pre-backfill dual-read keeps access.
    active, src, _ = resolve_genesis_dog_access("mig-keep")
    assert active is True
    assert src == GRANT_SOURCE_LEGACY_AFFILIATE
    first = backfill_legacy_affiliate_grants(granted_by="script")
    assert first["inserted"] == 1
    row = get_entitlement("mig-keep")
    assert row is not None
    assert row["grant_source"] == GRANT_SOURCE_LEGACY_MIGRATION
    assert resolve_commercial_entitlement("org:user-mig-keep")["state"] == "genesis"
    second = backfill_legacy_affiliate_grants(granted_by="script")
    assert second["inserted"] == 0
    assert second["skipped"] >= 1


def test_revoked_entitlement_overrides_active_affiliate_and_skips_backfill(isolated_mig):
    eco, _usage = isolated_mig
    uid = "mig-revoked"
    _aff(eco, uid)
    revoke_entitlement(user_id=uid, revoked_by="ops", reason="deny_customer")
    active, src, row = resolve_genesis_dog_access(uid)
    assert active is False
    assert src == "none"
    assert row is not None
    preview = preview_legacy_affiliate_backfill()
    assert uid not in preview["would_insert_user_ids"]
    assert preview["skipped_revoked_or_expired"] >= 1
    applied = backfill_legacy_affiliate_grants(granted_by="script")
    assert get_entitlement(uid)["status"] == "revoked"
    assert applied["inserted"] == 0 or uid not in (
        preview_legacy_affiliate_backfill().get("would_insert_user_ids") or []
    )
