"""Stripe-sourced affiliate earnings ledger (webhook handlers + unlock + payout integration)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest

from backend.affiliates import payout_batches as affiliate_payout_batches
from backend.affiliates import service as affiliate_service
from backend.affiliates.earnings_unlock_job import run_affiliate_earning_unlock_cycle
from backend.affiliates.stripe_earnings_handlers import (
    handle_charge_dispute_created,
    handle_invoice_paid,
)
from backend.economics.store import EconomicsStore
from backend.payments.service import settle_onramp_payment
from backend.payments.store import OnrampStore
from backend.treasury.treasury_store import TreasuryStore


def _stores(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[OnrampStore, TreasuryStore, EconomicsStore]:
    root = tmp_path / "econ"
    root.mkdir()
    db = str(root / "economics.sqlite3")
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", db)
    o = OnrampStore(str(tmp_path / "onramp.sqlite3"))
    t = TreasuryStore(str(tmp_path / "treasury.sqlite3"))
    e = EconomicsStore(db)
    e.init_schema()
    return o, t, e


def _invoice_paid_payload(*, customer: str, org_id: str, amount_cents: int = 2900) -> dict:
    return {
        "id": "in_test_1",
        "customer": customer,
        "amount_paid": amount_cents,
        "billing_reason": "subscription_create",
        "metadata": {"org_id": org_id},
        "subscription": None,
        "charge": None,
        "payment_intent": None,
    }


def test_invoice_paid_creates_pending_earning(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_AFFILIATE_STRIPE_HOLD_DAYS", "7")
    o, t, e = _stores(tmp_path, monkeypatch)
    cr = affiliate_service.create_affiliate(
        affiliate_code="STX",
        wallet_address="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        economics=e,
    )
    assert cr["ok"]
    aid = cr["affiliate_id"]
    affiliate_service.attribute_affiliate(
        org_id="org_stripe_1",
        affiliate_code="STX",
        attribution_type="stripe",
        attribution_source="stripe_checkout",
        store=o,
        treasury=t,
        economics=e,
        emit_event=False,
    )
    e.upsert_stripe_customer_org(stripe_customer_id="cus_123", org_id="org_stripe_1")
    inv = _invoice_paid_payload(customer="cus_123", org_id="org_stripe_1")
    r1 = handle_invoice_paid(e, inv)
    assert r1.get("ok") and r1.get("earning_id")
    r2 = handle_invoice_paid(e, inv)
    assert r2.get("duplicate")

    row = e._conn().execute("SELECT status, risk_hold FROM affiliate_earnings LIMIT 1").fetchone()
    assert row[0] == "pending"
    assert row[1] == 0


def test_promote_pending_to_payable(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_AFFILIATE_STRIPE_HOLD_DAYS", "0")
    o, t, e = _stores(tmp_path, monkeypatch)
    cr = affiliate_service.create_affiliate(
        affiliate_code="STY",
        wallet_address="0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        economics=e,
    )
    assert cr["ok"]
    affiliate_service.attribute_affiliate(
        org_id="org_stripe_2",
        affiliate_code="STY",
        attribution_type="stripe",
        store=o,
        treasury=t,
        economics=e,
        emit_event=False,
    )
    e.upsert_stripe_customer_org(stripe_customer_id="cus_456", org_id="org_stripe_2")
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat().replace("+00:00", "Z")
    handle_invoice_paid(
        e,
        {
            "id": "in_unlock",
            "customer": "cus_456",
            "amount_paid": 2900,
            "billing_reason": "subscription_create",
            "metadata": {"org_id": "org_stripe_2"},
            "subscription": None,
            "charge": None,
            "payment_intent": None,
        },
    )
    with e._conn() as con:
        con.execute(
            "UPDATE affiliate_earnings SET unlock_at = ? WHERE invoice_id = ?",
            (past, "in_unlock"),
        )
    out = run_affiliate_earning_unlock_cycle(economics=e, as_of=datetime.now(timezone.utc))
    assert out["promoted_to_payable"] >= 1
    st = e._conn().execute("SELECT status FROM affiliate_earnings WHERE invoice_id = ?", ("in_unlock",)).fetchone()[0]
    assert st == "payable"


def test_dispute_marks_recovery_for_paid(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _, _, e = _stores(tmp_path, monkeypatch)
    with e._conn() as con:
        con.execute(
            """
            INSERT INTO affiliates (id, affiliate_code, display_name, wallet_address, status, created_at)
            VALUES ('aff1', 'Z1', 'x', '0xcccccccccccccccccccccccccccccccccccccccc', 'active', '2020-01-01T00:00:00Z')
            """
        )
        con.execute(
            """
            INSERT INTO affiliate_earnings (
              id, affiliate_id, referred_org_id, amount_usd, rate_bps, earning_type, status,
              created_at, unlock_at, charge_id, idempotency_key
            ) VALUES (
              'e1', 'aff1', 'orgx', 5.0, 1000, 'initial', 'paid',
              '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z', 'ch_dispute', 'k1'
            )
            """
        )
    handle_charge_dispute_created(e, {"charge": "ch_dispute"})
    st = e._conn().execute("SELECT status, cancellation_reason FROM affiliate_earnings WHERE id = 'e1'").fetchone()
    assert st[0] == "recovery_due"
    assert st[1] == "disputed"


def test_payout_includes_stripe_earnings_after_moratorium(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_AFFILIATE_FIRST_PAYOUT_DELAY_DAYS", "0")
    monkeypatch.setenv("CLAW_AFFILIATE_PAYOUT_THRESHOLD_USD", "1")
    o, t, e = _stores(tmp_path, monkeypatch)
    cr = affiliate_service.create_affiliate(
        affiliate_code="STZ",
        wallet_address="0xdddddddddddddddddddddddddddddddddddddddd",
        economics=e,
    )
    assert cr["ok"]
    aid = cr["affiliate_id"]
    affiliate_service.attribute_affiliate(
        org_id="org_stripe_3",
        affiliate_code="STZ",
        attribution_type="stripe",
        store=o,
        treasury=t,
        economics=e,
        emit_event=False,
    )
    e.upsert_stripe_customer_org(stripe_customer_id="cus_789", org_id="org_stripe_3")
    handle_invoice_paid(
        e,
        {
            "id": "in_big",
            "customer": "cus_789",
            "amount_paid": 100_00,
            "billing_reason": "subscription_create",
            "metadata": {"org_id": "org_stripe_3"},
            "subscription": None,
            "charge": None,
            "payment_intent": None,
        },
    )
    past = "2000-01-01T00:00:00Z"
    with e._conn() as con:
        con.execute(
            "UPDATE affiliate_earnings SET status = 'payable', unlock_at = ? WHERE invoice_id = ?",
            (past, "in_big"),
        )
        con.execute(
            "UPDATE affiliates SET created_at = ? WHERE id = ?",
            ("2000-01-01T00:00:00Z", aid),
        )
    prep = affiliate_payout_batches.prepare_draft_earning_batches(
        as_of_iso="2099-01-01T00:00:00Z", economics=e
    )
    assert prep.get("ok") and prep.get("batches_created", 0) >= 1
    batch_id = prep["batch_ids"][0]
    assert affiliate_payout_batches.mark_batch_exported(batch_id=batch_id, economics=e).get("ok")
    fin = affiliate_payout_batches.mark_batch_paid(batch_id=batch_id, economics=e)
    assert fin.get("ok")
    paid = e._conn().execute("SELECT status FROM affiliate_earnings WHERE invoice_id = ?", ("in_big",)).fetchone()[0]
    assert paid == "paid"


def test_onramp_reverse_also_cancels_linked_earning(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    o, t, e = _stores(tmp_path, monkeypatch)
    cr = affiliate_service.create_affiliate(
        affiliate_code="RV",
        wallet_address="0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        economics=e,
    )
    assert cr["ok"]
    aid = cr["affiliate_id"]
    affiliate_service.attribute_affiliate(
        org_id="org_rv",
        affiliate_code="RV",
        attribution_type="first_payment",
        store=o,
        treasury=t,
        economics=e,
        emit_event=False,
    )
    settle_onramp_payment(
        provider="ramp",
        provider_payment_id="pay_rv",
        org_id="org_rv",
        amount_usd=Decimal("120.00"),
        tx_hash="0xrv",
        store=o,
        treasury=t,
        affiliate_code="RV",
    )
    with e._conn() as con:
        con.execute(
            """
            INSERT INTO affiliate_earnings (
              id, affiliate_id, referred_org_id, amount_usd, rate_bps, earning_type, status,
              created_at, unlock_at, internal_payment_id, idempotency_key
            ) VALUES (
              'e2', ?, 'org_rv', 1.0, 1000, 'initial', 'pending',
              '2024-01-01T00:00:00Z', '2099-01-01T00:00:00Z', 'pay_rv', 'k2'
            )
            """,
            (aid,),
        )
    e.reverse_accruals_for_payment("pay_rv", reason="refunded")
    st = e._conn().execute("SELECT status FROM affiliate_earnings WHERE id = 'e2'").fetchone()[0]
    assert st == "cancelled"
