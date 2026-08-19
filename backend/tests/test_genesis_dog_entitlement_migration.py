"""Migration inventory for retired Genesis create grants (dry-run only; no irreversible writes)."""

from __future__ import annotations

import uuid

import pytest

from backend.affiliates.genesis_referral_service import create_genesis_affiliate
from backend.economics.store import get_economics_store, reset_economics_store_for_tests
from backend.usage_economics.commercial_entitlement import (
    AFFILIATE_STATUS_GENESIS,
    STATE_NONE,
    resolve_commercial_entitlement,
)
from backend.usage_economics.genesis_dog_entitlement import (
    GRANT_SOURCE_ADMIN,
    GRANT_SOURCE_LEGACY_MIGRATION,
    GenesisCreateGrantIssuanceRetired,
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


def test_dry_run_backfill_precise_counts_no_writes(isolated_mig, monkeypatch):
    eco, _usage = isolated_mig
    _aff(eco, "mig-a")
    _aff(eco, "mig-b")
    # Seed an existing legacy row without product grant issuance.
    monkeypatch.setenv("CLAW_ALLOW_GENESIS_CREATE_GRANT_ISSUANCE", "1")
    grant_entitlement(user_id="mig-b", granted_by="ops", grant_source=GRANT_SOURCE_ADMIN)
    monkeypatch.delenv("CLAW_ALLOW_GENESIS_CREATE_GRANT_ISSUANCE", raising=False)

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
    assert dry["dry_run"] is True
    assert get_entitlement("mig-a") is None


def test_apply_backfill_retired_reports_inventory_without_create_grants(isolated_mig):
    eco, _usage = isolated_mig
    uid = "mig-keep"
    _aff(eco, uid)

    # Affiliate commission status remains; create access stays False.
    active, src, row = resolve_genesis_dog_access(uid)
    assert active is False
    assert src == "none"
    assert row is None

    preview = preview_legacy_affiliate_backfill()
    assert uid in preview["would_insert_user_ids"]

    applied = backfill_legacy_affiliate_grants(granted_by="script", dry_run=False)
    assert applied.get("issuance_retired") is True
    assert applied["inserted"] == 0
    assert get_entitlement(uid) is None

    decision = resolve_commercial_entitlement(f"org:user-{uid}")
    assert decision["state"] == STATE_NONE
    assert decision["affiliate_status"] == AFFILIATE_STATUS_GENESIS
    assert decision["can_create_persisted_agreement"] is False
    assert decision.get("legacy_genesis_create_grant") is None

    with pytest.raises(GenesisCreateGrantIssuanceRetired):
        grant_entitlement(
            user_id=uid, granted_by="script", grant_source=GRANT_SOURCE_LEGACY_MIGRATION
        )


def test_revoked_entitlement_overrides_active_affiliate_and_skips_backfill(
    isolated_mig, monkeypatch
):
    eco, _usage = isolated_mig
    uid = "mig-revoked"
    _aff(eco, uid)
    monkeypatch.setenv("CLAW_ALLOW_GENESIS_CREATE_GRANT_ISSUANCE", "1")
    grant_entitlement(user_id=uid, granted_by="ops", grant_source=GRANT_SOURCE_ADMIN)
    monkeypatch.delenv("CLAW_ALLOW_GENESIS_CREATE_GRANT_ISSUANCE", raising=False)
    revoke_entitlement(user_id=uid, revoked_by="ops", reason="deny_customer")

    active, src, row = resolve_genesis_dog_access(uid)
    assert active is False
    assert src == "none"
    assert row is not None
    assert row["status"] == "revoked"

    preview = preview_legacy_affiliate_backfill()
    assert uid not in preview["would_insert_user_ids"]
    assert preview["skipped_revoked_or_expired"] >= 1

    applied = backfill_legacy_affiliate_grants(granted_by="script", dry_run=False)
    assert get_entitlement(uid)["status"] == "revoked"
    assert applied["inserted"] == 0
    assert applied.get("issuance_retired") is True
