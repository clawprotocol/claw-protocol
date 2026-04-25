from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest

from backend.affiliates import payouts as affiliate_payouts
from backend.affiliates import service as affiliate_service
from backend.economics.store import EconomicsStore, reset_economics_store_for_tests
from backend.payments.service import settle_onramp_payment
from backend.payments.store import OnrampStore, reset_onramp_store_for_tests
from backend.treasury.treasury_store import TreasuryStore


def _stores(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite"))
    monkeypatch.setenv("CLAW_AFFILIATE_PAYOUT_THRESHOLD_USD", "1.00")
    reset_onramp_store_for_tests()
    reset_economics_store_for_tests()
    o = OnrampStore(path=str(tmp_path / "onramp.sqlite"))
    o.init_schema()
    t = TreasuryStore(path=str(tmp_path / "treasury.sqlite"))
    t.init_schema()
    e = EconomicsStore(path=str(tmp_path / "economics.sqlite"))
    e.init_schema()
    return o, t, e


@pytest.fixture
def aff_isolated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    return _stores(tmp_path, monkeypatch)


def test_attribute_and_accrual_on_payment(aff_isolated) -> None:
    o, t, e = aff_isolated
    a = affiliate_service.create_affiliate(
        affiliate_code="PARTNER1",
        wallet_address="0x1111111111111111111111111111111111111111",
        economics=e,
    )
    assert a["ok"] is True
    aid = a["affiliate_id"]
    out = settle_onramp_payment(
        provider="coinbase",
        provider_payment_id="aff_p1",
        org_id="org_buyer",
        amount_usd=Decimal("100.00"),
        tx_hash="0xa1",
        store=o,
        treasury=t,
        plan_code="starter",
        affiliate_code="PARTNER1",
    )
    pid = out["payment_id"]
    rows = e._conn().execute(
        "SELECT * FROM affiliate_accruals WHERE payment_id = ?", (pid,)
    ).fetchall()
    assert len(rows) == 1
    assert rows[0]["affiliate_id"] == aid
    n_ev = o._conn().execute(
        "SELECT COUNT(1) FROM payment_canonical_events WHERE event_type = ?",
        ("AffiliateAccrued",),
    ).fetchone()[0]
    assert int(n_ev) == 1


def test_duplicate_webhook_no_double_accrual(aff_isolated) -> None:
    o, t, e = aff_isolated
    affiliate_service.create_affiliate(
        affiliate_code="P2",
        wallet_address="0x2222222222222222222222222222222222222222",
        economics=e,
    )
    settle_onramp_payment(
        provider="ramp",
        provider_payment_id="dup_aff",
        org_id="org_d",
        amount_usd=Decimal("80.00"),
        tx_hash="0xd0",
        store=o,
        treasury=t,
        affiliate_code="P2",
    )
    settle_onramp_payment(
        provider="ramp",
        provider_payment_id="dup_aff",
        org_id="org_d",
        amount_usd=Decimal("80.00"),
        tx_hash="0xd0",
        store=o,
        treasury=t,
        affiliate_code="P2",
    )
    n = e._conn().execute("SELECT COUNT(1) FROM affiliate_accruals").fetchone()[0]
    assert int(n) == 1


def test_chargeback_reverses_unpaid(aff_isolated) -> None:
    o, t, e = aff_isolated
    affiliate_service.create_affiliate(
        affiliate_code="P3",
        wallet_address="0x3333333333333333333333333333333333333333",
        economics=e,
    )
    out = settle_onramp_payment(
        provider="ramp",
        provider_payment_id="cb1",
        org_id="org_cb",
        amount_usd=Decimal("40.00"),
        tx_hash="0xcb",
        store=o,
        treasury=t,
        affiliate_code="P3",
    )
    pid = out["payment_id"]
    affiliate_service.record_chargeback(payment_id=pid, economics=e, store=o, treasury=t)
    row = e._conn().execute(
        "SELECT status FROM affiliate_accruals WHERE payment_id = ?", (pid,)
    ).fetchone()
    assert row[0] == "reversed"
    n_rev = o._conn().execute(
        "SELECT COUNT(1) FROM payment_canonical_events WHERE event_type = ?",
        ("AffiliateReversed",),
    ).fetchone()[0]
    assert int(n_rev) >= 1


def test_payout_run_aggregates_matured(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    o, t, e = _stores(tmp_path, monkeypatch)
    cr = affiliate_service.create_affiliate(
        affiliate_code="P4",
        wallet_address="0x4444444444444444444444444444444444444444",
        economics=e,
    )
    assert cr["ok"]
    aid = cr["affiliate_id"]
    settle_onramp_payment(
        provider="ramp",
        provider_payment_id="py1",
        org_id="org_p",
        amount_usd=Decimal("200.00"),
        tx_hash="0xp1",
        store=o,
        treasury=t,
        affiliate_code="P4",
    )
    settle_onramp_payment(
        provider="ramp",
        provider_payment_id="py2",
        org_id="org_p2",
        amount_usd=Decimal("200.00"),
        tx_hash="0xp2",
        store=o,
        treasury=t,
        affiliate_code="P4",
    )
    with e._conn() as con:
        con.execute(
            "UPDATE affiliate_accruals SET matured_at = '2000-01-01T00:00:00Z' WHERE affiliate_id = ?",
            (aid,),
        )
    res = affiliate_payouts.run_payout_cycle(
        as_of_iso="2099-01-01T00:00:00Z", economics=e
    )
    assert res["payouts_created"] >= 1
    prow = e._conn().execute(
        "SELECT amount_usd FROM affiliate_payouts WHERE affiliate_id = ?", (aid,)
    ).fetchone()
    assert prow is not None
    assert float(prow[0]) > 0


def test_self_referral_rejected(aff_isolated) -> None:
    o, t, e = aff_isolated
    affiliate_service.create_affiliate(
        affiliate_code="SELF",
        wallet_address="0x5555555555555555555555555555555555555555",
        owner_org_id="org_self",
        economics=e,
    )
    out = affiliate_service.attribute_affiliate(
        org_id="org_self",
        affiliate_code="SELF",
        attribution_type="signup",
        store=o,
        treasury=t,
        economics=e,
        emit_event=False,
    )
    assert out.get("ok") is False
    assert out.get("error") == "self_referral"
