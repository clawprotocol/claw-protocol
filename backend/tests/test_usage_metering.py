from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest

from backend.billing import pricing, usage_metering
from backend.economics.store import EconomicsStore, reset_economics_store_for_tests
from backend.payments.service import settle_onramp_payment
from backend.payments.store import OnrampStore, reset_onramp_store_for_tests
from backend.treasury.treasury_store import TreasuryStore


@pytest.fixture
def meter_isolated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite"))
    monkeypatch.setenv("CLAW_USAGE_METERING_ENABLED", "1")
    reset_onramp_store_for_tests()
    reset_economics_store_for_tests()
    o = OnrampStore(path=str(tmp_path / "onramp.sqlite"))
    o.init_schema()
    t = TreasuryStore(path=str(tmp_path / "treasury.sqlite"))
    t.init_schema()
    e = EconomicsStore(path=str(tmp_path / "economics.sqlite"))
    e.init_schema()
    yield o, t, e


def test_calculate_key_cost_deterministic() -> None:
    assert pricing.calculate_key_cost("esign_create", 1, None) == 1
    assert pricing.calculate_key_cost("agreement_parse", 3, None) == 6


def test_meter_debits_keys(meter_isolated) -> None:
    o, t, e = meter_isolated
    out = settle_onramp_payment(
        provider="ramp",
        provider_payment_id="m1",
        org_id="org_m",
        amount_usd=Decimal("20.00"),
        tx_hash="0xm1",
        store=o,
        treasury=t,
    )
    keys0 = int(out["keys_allocated"])
    r = usage_metering.meter_usage(
        org_id="org_m",
        user_id=None,
        service_type="esign_create",
        unit_count=1.0,
        economics=e,
    )
    assert r["ok"] is True
    bal = e.get_key_balance("org_m")
    assert int(bal["keys_available"]) == keys0 - 1


def test_insufficient_keys_usage_limit(meter_isolated) -> None:
    o, t, e = meter_isolated
    settle_onramp_payment(
        provider="ramp",
        provider_payment_id="m2",
        org_id="org_low",
        amount_usd=Decimal("1.00"),
        tx_hash="0xm2",
        store=o,
        treasury=t,
    )
    bal0 = int(e.get_key_balance("org_low")["keys_available"])
    r = usage_metering.meter_usage(
        org_id="org_low",
        user_id=None,
        service_type="analyst_analyze",
        unit_count=1.0,
        economics=e,
    )
    assert r["ok"] is False
    assert r.get("error") == "insufficient_keys"
    n = o._conn().execute(
        "SELECT COUNT(1) FROM payment_canonical_events WHERE event_type = ?",
        ("UsageLimitReached",),
    ).fetchone()[0]
    assert int(n) >= 1
    bal1 = int(e.get_key_balance("org_low")["keys_available"])
    assert bal1 == bal0


def test_balance_updates_deterministic_repeat_meter(meter_isolated) -> None:
    o, t, e = meter_isolated
    out = settle_onramp_payment(
        provider="ramp",
        provider_payment_id="m3",
        org_id="org_rep",
        amount_usd=Decimal("10.00"),
        tx_hash="0xm3",
        store=o,
        treasury=t,
    )
    k0 = int(out["keys_allocated"])
    for _ in range(3):
        usage_metering.meter_usage(
            org_id="org_rep",
            user_id=None,
            service_type="esign_create",
            unit_count=1.0,
            economics=e,
        )
    bal = int(e.get_key_balance("org_rep")["keys_available"])
    assert bal == k0 - 3
