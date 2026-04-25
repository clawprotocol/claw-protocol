from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest

from backend.economics.store import EconomicsStore, reset_economics_store_for_tests
from backend.payments.service import settle_onramp_payment
from backend.payments.store import OnrampStore, reset_onramp_store_for_tests
from backend.treasury.treasury_store import TreasuryStore


@pytest.fixture
def eco_isolated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite"))
    reset_onramp_store_for_tests()
    reset_economics_store_for_tests()
    o = OnrampStore(path=str(tmp_path / "onramp.sqlite"))
    o.init_schema()
    t = TreasuryStore(path=str(tmp_path / "treasury.sqlite"))
    t.init_schema()
    e = EconomicsStore(path=str(tmp_path / "economics.sqlite"))
    e.init_schema()
    yield o, t, e


def test_subscription_purchase_issues_keys_and_row(eco_isolated) -> None:
    o, t, e = eco_isolated
    out = settle_onramp_payment(
        provider="coinbase",
        provider_payment_id="sub_pay_1",
        org_id="org_sub",
        amount_usd=Decimal("100.00"),
        tx_hash="0xsub1",
        store=o,
        treasury=t,
        subscription_purchase=True,
        plan_code="pro",
        user_id="user_1",
    )
    assert out["ok"] is True
    keys = int(out["keys_allocated"])
    bal = e.get_key_balance("org_sub")
    assert int(bal["keys_available"]) == keys
    sub = e.get_subscription_by_org("org_sub")
    assert sub is not None
    assert sub["plan_code"] == "pro"
    assert sub["user_id"] == "user_1"
    n = o._conn().execute(
        "SELECT COUNT(1) FROM payment_canonical_events WHERE event_type = ?",
        ("SubscriptionPurchased",),
    ).fetchone()[0]
    assert int(n) == 1


def test_subscription_renewal_emits_renewed(eco_isolated) -> None:
    o, t, e = eco_isolated
    settle_onramp_payment(
        provider="coinbase",
        provider_payment_id="sub_a",
        org_id="org_r",
        amount_usd=Decimal("50.00"),
        tx_hash="0xs1",
        store=o,
        treasury=t,
        subscription_purchase=True,
        plan_code="starter",
    )
    settle_onramp_payment(
        provider="coinbase",
        provider_payment_id="sub_b",
        org_id="org_r",
        amount_usd=Decimal("50.00"),
        tx_hash="0xs2",
        store=o,
        treasury=t,
        subscription_purchase=True,
        plan_code="starter",
    )
    n = o._conn().execute(
        "SELECT COUNT(1) FROM payment_canonical_events WHERE event_type = ?",
        ("SubscriptionRenewed",),
    ).fetchone()[0]
    assert int(n) >= 1
