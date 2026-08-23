"""Draft affiliate earning payout batches (operator workflow)."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from backend.affiliates import payout_batches as batches
from backend.affiliates import safe_batch_export
from backend.affiliates import service as affiliate_service
from backend.affiliates.stripe_earnings_handlers import handle_invoice_paid
from backend.economics.store import EconomicsStore, _utc_now
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


def test_cancel_draft_batch_releases_earnings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_AFFILIATE_FIRST_PAYOUT_DELAY_DAYS", "0")
    monkeypatch.setenv("CLAW_AFFILIATE_PAYOUT_THRESHOLD_USD", "1")
    o, t, e = _stores(tmp_path, monkeypatch)
    cr = affiliate_service.create_affiliate(
        affiliate_code="BAT",
        wallet_address="0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        economics=e,
    )
    assert cr["ok"]
    aid = cr["affiliate_id"]
    affiliate_service.attribute_affiliate(
        org_id="org_b",
        affiliate_code="BAT",
        attribution_type="stripe",
        store=o,
        treasury=t,
        economics=e,
        emit_event=False,
    )
    e.upsert_stripe_customer_org(stripe_customer_id="cus_b", org_id="org_b")
    handle_invoice_paid(
        e,
        {
            "id": "in_b",
            "customer": "cus_b",
            "amount_paid": 5000,
            "billing_reason": "subscription_create",
            "metadata": {"org_id": "org_b"},
            "subscription": None,
            "charge": None,
            "payment_intent": None,
        },
    )
    past = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat().replace("+00:00", "Z")
    with e._conn() as con:
        con.execute(
            "UPDATE affiliate_earnings SET status = 'payable', unlock_at = ? WHERE invoice_id = ?",
            (past, "in_b"),
        )
        con.execute("UPDATE affiliates SET created_at = ? WHERE id = ?", ("2000-01-01T00:00:00Z", aid))

    prep = batches.prepare_draft_earning_batches(as_of_iso="2099-01-01T00:00:00Z", economics=e)
    assert prep["batches_created"] == 1
    bid = prep["batch_ids"][0]
    row = e._conn().execute(
        "SELECT payout_batch_id FROM affiliate_earnings WHERE invoice_id = ?", ("in_b",)
    ).fetchone()
    assert row[0] == bid

    can = batches.cancel_draft_batch(batch_id=bid, economics=e)
    assert can["ok"]
    row2 = e._conn().execute(
        "SELECT payout_batch_id, status FROM affiliate_earnings WHERE invoice_id = ?", ("in_b",)
    ).fetchone()
    assert row2[0] is None or str(row2[0]).strip() == ""
    assert row2[1] == "payable"


def test_export_payout_batch_csv(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_AFFILIATE_FIRST_PAYOUT_DELAY_DAYS", "0")
    monkeypatch.setenv("CLAW_AFFILIATE_PAYOUT_THRESHOLD_USD", "1")
    o, t, e = _stores(tmp_path, monkeypatch)
    cr = affiliate_service.create_affiliate(
        affiliate_code="CSV",
        wallet_address="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        economics=e,
    )
    assert cr["ok"]
    aid = cr["affiliate_id"]
    affiliate_service.attribute_affiliate(
        org_id="org_csv",
        affiliate_code="CSV",
        attribution_type="stripe",
        store=o,
        treasury=t,
        economics=e,
        emit_event=False,
    )
    e.upsert_stripe_customer_org(stripe_customer_id="cus_csv", org_id="org_csv")
    handle_invoice_paid(
        e,
        {
            "id": "in_csv",
            "customer": "cus_csv",
            "amount_paid": 8000,
            "billing_reason": "subscription_create",
            "metadata": {"org_id": "org_csv"},
            "subscription": None,
            "charge": None,
            "payment_intent": None,
        },
    )
    past = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat().replace("+00:00", "Z")
    with e._conn() as con:
        con.execute(
            "UPDATE affiliate_earnings SET status = 'payable', unlock_at = ? WHERE invoice_id = ?",
            (past, "in_csv"),
        )
        con.execute("UPDATE affiliates SET created_at = ? WHERE id = ?", ("2000-01-01T00:00:00Z", aid))

    prep = batches.prepare_draft_earning_batches(as_of_iso="2099-01-01T00:00:00Z", economics=e)
    assert prep["batches_created"] == 1
    bid = prep["batch_ids"][0]
    _, body = batches.build_payout_batch_csv(batch_id=bid, economics=e)
    text = body.decode("utf-8")
    assert "affiliate_id,wallet_address,amount_usd" in text.replace("\r\n", "\n").split("\n")[0]
    lines = [ln for ln in text.strip().split("\n") if ln.strip()]
    assert len(lines) == 2
    assert aid in lines[1]
    assert "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" in lines[1].lower()


def test_sync_migrates_legacy_wallet_uses_affiliate_created_at_for_cooling(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "econ"
    root.mkdir()
    db = str(root / "economics.sqlite3")
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", db)
    e = EconomicsStore(db)
    e.init_schema()
    aid = str(uuid.uuid4())
    with e._conn() as con:
        con.execute(
            """
            INSERT INTO affiliates (
              id, affiliate_code, display_name, wallet_address, status, created_at
            ) VALUES (?, 'LGW', NULL, ?, 'active', '2010-06-01T00:00:00Z')
            """,
            (aid, "0x1111111111111111111111111111111111111111"),
        )
    w, leg = e.sync_canonical_usdc_payout_wallet(aid)
    assert leg is True
    assert w
    row = e.get_affiliate_payout_method_row(aid, "usdc_wallet")
    assert row is not None
    assert str(row.get("wallet_updated_at") or "") == "2010-06-01T00:00:00Z"
    assert str(row.get("status") or "") == "active"
    w2, leg2 = e.sync_canonical_usdc_payout_wallet(aid)
    assert leg2 is False
    assert w2 == w


def test_create_affiliate_seeds_usdc_payout_method(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = tmp_path / "econ"
    root.mkdir()
    db = str(root / "economics.sqlite3")
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", db)
    e = EconomicsStore(db)
    e.init_schema()
    cr = affiliate_service.create_affiliate(
        affiliate_code="SEED",
        wallet_address="0x2222222222222222222222222222222222222222",
        economics=e,
    )
    assert cr["ok"]
    aid = cr["affiliate_id"]
    aff = e.get_affiliate(aid)
    assert aff is not None
    row = e.get_affiliate_payout_method_row(aid, "usdc_wallet")
    assert row is not None
    assert str(row.get("usdc_wallet_address") or "").lower() == str(
        aff.get("wallet_address") or ""
    ).lower()
    assert str(row.get("wallet_updated_at") or "") == str(aff.get("created_at") or "")


def test_prepare_skips_wallet_in_cooling_period(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_AFFILIATE_FIRST_PAYOUT_DELAY_DAYS", "0")
    monkeypatch.setenv("CLAW_AFFILIATE_PAYOUT_THRESHOLD_USD", "1")
    monkeypatch.setenv("CLAW_AFFILIATE_PAYOUT_WALLET_COOLING_DAYS", "7")
    o, t, e = _stores(tmp_path, monkeypatch)
    cr = affiliate_service.create_affiliate(
        affiliate_code="COOL",
        wallet_address="0xdddddddddddddddddddddddddddddddddddddddd",
        economics=e,
    )
    assert cr["ok"]
    aid = cr["affiliate_id"]
    e.upsert_affiliate_payout_method(
        affiliate_id=aid,
        method_type="usdc_wallet",
        usdc_wallet_address="0xdddddddddddddddddddddddddddddddddddddddd",
        status="active",
    )
    now = _utc_now()
    with e._conn() as con:
        con.execute(
            "UPDATE affiliate_payout_methods SET wallet_updated_at = ? WHERE affiliate_id = ? AND method_type = ?",
            (now, aid, "usdc_wallet"),
        )
    affiliate_service.attribute_affiliate(
        org_id="org_cool",
        affiliate_code="COOL",
        attribution_type="stripe",
        store=o,
        treasury=t,
        economics=e,
        emit_event=False,
    )
    e.upsert_stripe_customer_org(stripe_customer_id="cus_cool", org_id="org_cool")
    handle_invoice_paid(
        e,
        {
            "id": "in_cool",
            "customer": "cus_cool",
            "amount_paid": 9000,
            "billing_reason": "subscription_create",
            "metadata": {"org_id": "org_cool"},
            "subscription": None,
            "charge": None,
            "payment_intent": None,
        },
    )
    past = "2019-06-01T00:00:00Z"
    with e._conn() as con:
        con.execute(
            "UPDATE affiliate_earnings SET status = 'payable', unlock_at = ? WHERE invoice_id = ?",
            (past, "in_cool"),
        )
        con.execute("UPDATE affiliates SET created_at = ? WHERE id = ?", ("2000-01-01T00:00:00Z", aid))

    # Inside 7d cooling window (wallet updated "now" in test time, as_of only +3d).
    as_of = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat().replace("+00:00", "Z")
    prep = batches.prepare_draft_earning_batches(as_of_iso=as_of, economics=e)
    assert prep.get("batches_created") == 0
    assert aid in (prep.get("skipped_cooling_affiliate_ids") or [])


def test_mark_batch_paid_rejects_draft_not_exported(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_AFFILIATE_FIRST_PAYOUT_DELAY_DAYS", "0")
    monkeypatch.setenv("CLAW_AFFILIATE_PAYOUT_THRESHOLD_USD", "1")
    o, t, e = _stores(tmp_path, monkeypatch)
    cr = affiliate_service.create_affiliate(
        affiliate_code="DRF",
        wallet_address="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        economics=e,
    )
    assert cr["ok"]
    aid = cr["affiliate_id"]
    affiliate_service.attribute_affiliate(
        org_id="org_drf",
        affiliate_code="DRF",
        attribution_type="stripe",
        store=o,
        treasury=t,
        economics=e,
        emit_event=False,
    )
    e.upsert_stripe_customer_org(stripe_customer_id="cus_drf", org_id="org_drf")
    handle_invoice_paid(
        e,
        {
            "id": "in_drf",
            "customer": "cus_drf",
            "amount_paid": 8000,
            "billing_reason": "subscription_create",
            "metadata": {"org_id": "org_drf"},
            "subscription": None,
            "charge": None,
            "payment_intent": None,
        },
    )
    past = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat().replace("+00:00", "Z")
    with e._conn() as con:
        con.execute(
            "UPDATE affiliate_earnings SET status = 'payable', unlock_at = ? WHERE invoice_id = ?",
            (past, "in_drf"),
        )
        con.execute("UPDATE affiliates SET created_at = ? WHERE id = ?", ("2000-01-01T00:00:00Z", aid))

    prep = batches.prepare_draft_earning_batches(as_of_iso="2099-01-01T00:00:00Z", economics=e)
    bid = prep["batch_ids"][0]
    out = batches.mark_batch_paid(batch_id=bid, economics=e, tx_hash="0x" + "d" * 64, network="base")
    assert out.get("ok") is False
    assert out.get("error") == "not_exported"


def test_mark_exported_idempotent_rejects_second_call(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_AFFILIATE_FIRST_PAYOUT_DELAY_DAYS", "0")
    monkeypatch.setenv("CLAW_AFFILIATE_PAYOUT_THRESHOLD_USD", "1")
    o, t, e = _stores(tmp_path, monkeypatch)
    cr = affiliate_service.create_affiliate(
        affiliate_code="2EX",
        wallet_address="0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        economics=e,
    )
    assert cr["ok"]
    aid = cr["affiliate_id"]
    affiliate_service.attribute_affiliate(
        org_id="org_2ex",
        affiliate_code="2EX",
        attribution_type="stripe",
        store=o,
        treasury=t,
        economics=e,
        emit_event=False,
    )
    e.upsert_stripe_customer_org(stripe_customer_id="cus_2ex", org_id="org_2ex")
    handle_invoice_paid(
        e,
        {
            "id": "in_2ex",
            "customer": "cus_2ex",
            "amount_paid": 8000,
            "billing_reason": "subscription_create",
            "metadata": {"org_id": "org_2ex"},
            "subscription": None,
            "charge": None,
            "payment_intent": None,
        },
    )
    past = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat().replace("+00:00", "Z")
    with e._conn() as con:
        con.execute(
            "UPDATE affiliate_earnings SET status = 'payable', unlock_at = ? WHERE invoice_id = ?",
            (past, "in_2ex"),
        )
        con.execute("UPDATE affiliates SET created_at = ? WHERE id = ?", ("2000-01-01T00:00:00Z", aid))

    prep = batches.prepare_draft_earning_batches(as_of_iso="2099-01-01T00:00:00Z", economics=e)
    bid = prep["batch_ids"][0]
    assert batches.mark_batch_exported(batch_id=bid, economics=e).get("ok")
    second = batches.mark_batch_exported(batch_id=bid, economics=e)
    assert second.get("ok") is False
    assert second.get("error") == "invalid_status"


def test_refund_after_batch_prepare_blocks_export_and_paid(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_AFFILIATE_FIRST_PAYOUT_DELAY_DAYS", "0")
    monkeypatch.setenv("CLAW_AFFILIATE_PAYOUT_THRESHOLD_USD", "1")
    o, t, e = _stores(tmp_path, monkeypatch)
    cr = affiliate_service.create_affiliate(
        affiliate_code="REF",
        wallet_address="0xcccccccccccccccccccccccccccccccccccccccc",
        economics=e,
    )
    assert cr["ok"]
    aid = cr["affiliate_id"]
    affiliate_service.attribute_affiliate(
        org_id="org_ref",
        affiliate_code="REF",
        attribution_type="stripe",
        store=o,
        treasury=t,
        economics=e,
        emit_event=False,
    )
    e.upsert_stripe_customer_org(stripe_customer_id="cus_ref", org_id="org_ref")
    handle_invoice_paid(
        e,
        {
            "id": "in_ref",
            "customer": "cus_ref",
            "amount_paid": 8000,
            "billing_reason": "subscription_create",
            "metadata": {"org_id": "org_ref"},
            "subscription": None,
            "charge": None,
            "payment_intent": None,
        },
    )
    past = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat().replace("+00:00", "Z")
    with e._conn() as con:
        con.execute(
            "UPDATE affiliate_earnings SET status = 'payable', unlock_at = ? WHERE invoice_id = ?",
            (past, "in_ref"),
        )
        con.execute("UPDATE affiliates SET created_at = ? WHERE id = ?", ("2000-01-01T00:00:00Z", aid))

    prep = batches.prepare_draft_earning_batches(as_of_iso="2099-01-01T00:00:00Z", economics=e)
    bid = prep["batch_ids"][0]
    n = e.cancel_affiliate_earnings_for_invoice("in_ref", reason="refunded")
    assert n >= 1
    ex = batches.mark_batch_exported(batch_id=bid, economics=e)
    assert ex.get("ok") is False
    assert ex.get("error") == "earning_not_payable"


def test_refund_after_export_blocks_mark_paid(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_AFFILIATE_FIRST_PAYOUT_DELAY_DAYS", "0")
    monkeypatch.setenv("CLAW_AFFILIATE_PAYOUT_THRESHOLD_USD", "1")
    o, t, e = _stores(tmp_path, monkeypatch)
    cr = affiliate_service.create_affiliate(
        affiliate_code="R2",
        wallet_address="0xdddddddddddddddddddddddddddddddddddddddd",
        economics=e,
    )
    assert cr["ok"]
    aid = cr["affiliate_id"]
    affiliate_service.attribute_affiliate(
        org_id="org_r2",
        affiliate_code="R2",
        attribution_type="stripe",
        store=o,
        treasury=t,
        economics=e,
        emit_event=False,
    )
    e.upsert_stripe_customer_org(stripe_customer_id="cus_r2", org_id="org_r2")
    handle_invoice_paid(
        e,
        {
            "id": "in_r2",
            "customer": "cus_r2",
            "amount_paid": 8000,
            "billing_reason": "subscription_create",
            "metadata": {"org_id": "org_r2"},
            "subscription": None,
            "charge": None,
            "payment_intent": None,
        },
    )
    past = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat().replace("+00:00", "Z")
    with e._conn() as con:
        con.execute(
            "UPDATE affiliate_earnings SET status = 'payable', unlock_at = ? WHERE invoice_id = ?",
            (past, "in_r2"),
        )
        con.execute("UPDATE affiliates SET created_at = ? WHERE id = ?", ("2000-01-01T00:00:00Z", aid))

    prep = batches.prepare_draft_earning_batches(as_of_iso="2099-01-01T00:00:00Z", economics=e)
    bid = prep["batch_ids"][0]
    assert batches.mark_batch_exported(batch_id=bid, economics=e).get("ok")
    assert e.cancel_affiliate_earnings_for_invoice("in_r2", reason="refunded") >= 1
    paid = batches.mark_batch_paid(batch_id=bid, economics=e, tx_hash="0x" + "e" * 64, network="base")
    assert paid.get("ok") is False
    assert paid.get("error") in ("earning_not_payable", "earning_batch_mismatch")


def test_mark_batch_paid_rejects_already_paid(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_AFFILIATE_FIRST_PAYOUT_DELAY_DAYS", "0")
    monkeypatch.setenv("CLAW_AFFILIATE_PAYOUT_THRESHOLD_USD", "1")
    o, t, e = _stores(tmp_path, monkeypatch)
    cr = affiliate_service.create_affiliate(
        affiliate_code="2X",
        wallet_address="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        economics=e,
    )
    assert cr["ok"]
    aid = cr["affiliate_id"]
    affiliate_service.attribute_affiliate(
        org_id="org_2x",
        affiliate_code="2X",
        attribution_type="stripe",
        store=o,
        treasury=t,
        economics=e,
        emit_event=False,
    )
    e.upsert_stripe_customer_org(stripe_customer_id="cus_2x", org_id="org_2x")
    handle_invoice_paid(
        e,
        {
            "id": "in_2x",
            "customer": "cus_2x",
            "amount_paid": 8000,
            "billing_reason": "subscription_create",
            "metadata": {"org_id": "org_2x"},
            "subscription": None,
            "charge": None,
            "payment_intent": None,
        },
    )
    past = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat().replace("+00:00", "Z")
    with e._conn() as con:
        con.execute(
            "UPDATE affiliate_earnings SET status = 'payable', unlock_at = ? WHERE invoice_id = ?",
            (past, "in_2x"),
        )
        con.execute("UPDATE affiliates SET created_at = ? WHERE id = ?", ("2000-01-01T00:00:00Z", aid))

    prep = batches.prepare_draft_earning_batches(as_of_iso="2099-01-01T00:00:00Z", economics=e)
    bid = prep["batch_ids"][0]
    assert batches.mark_batch_exported(batch_id=bid, economics=e).get("ok")
    assert batches.mark_batch_paid(
        batch_id=bid, economics=e, tx_hash="0x" + "b" * 64, network="base"
    ).get("ok")
    second = batches.mark_batch_paid(
        batch_id=bid, economics=e, tx_hash="0x" + "c" * 64, network="base"
    )
    assert second.get("ok") is False
    assert second.get("error") == "already_paid"


def test_mark_paid_requires_tx_when_configured(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_AFFILIATE_FIRST_PAYOUT_DELAY_DAYS", "0")
    monkeypatch.setenv("CLAW_AFFILIATE_PAYOUT_THRESHOLD_USD", "1")
    monkeypatch.setenv("CLAW_AFFILIATE_REQUIRE_PAID_TX_HASH", "1")
    o, t, e = _stores(tmp_path, monkeypatch)
    cr = affiliate_service.create_affiliate(
        affiliate_code="TXR",
        wallet_address="0xcccccccccccccccccccccccccccccccccccccccc",
        economics=e,
    )
    assert cr["ok"]
    aid = cr["affiliate_id"]
    affiliate_service.attribute_affiliate(
        org_id="org_txr",
        affiliate_code="TXR",
        attribution_type="stripe",
        store=o,
        treasury=t,
        economics=e,
        emit_event=False,
    )
    e.upsert_stripe_customer_org(stripe_customer_id="cus_txr", org_id="org_txr")
    handle_invoice_paid(
        e,
        {
            "id": "in_txr",
            "customer": "cus_txr",
            "amount_paid": 9000,
            "billing_reason": "subscription_create",
            "metadata": {"org_id": "org_txr"},
            "subscription": None,
            "charge": None,
            "payment_intent": None,
        },
    )
    past = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat().replace("+00:00", "Z")
    with e._conn() as con:
        con.execute(
            "UPDATE affiliate_earnings SET status = 'payable', unlock_at = ? WHERE invoice_id = ?",
            (past, "in_txr"),
        )
        con.execute("UPDATE affiliates SET created_at = ? WHERE id = ?", ("2000-01-01T00:00:00Z", aid))

    prep = batches.prepare_draft_earning_batches(as_of_iso="2099-01-01T00:00:00Z", economics=e)
    assert prep["batches_created"] == 1
    bid = prep["batch_ids"][0]
    assert batches.mark_batch_exported(batch_id=bid, economics=e).get("ok")
    bad = batches.mark_batch_paid(batch_id=bid, economics=e)
    assert bad.get("ok") is False
    assert bad.get("error") == "missing_or_invalid_tx_hash"
    ok = batches.mark_batch_paid(
        batch_id=bid,
        economics=e,
        tx_hash="0x" + "a" * 64,
        network="base",
    )
    assert ok.get("ok") is True


def test_safe_json_export(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    pytest.importorskip("eth_abi")
    monkeypatch.setenv("CLAW_AFFILIATE_FIRST_PAYOUT_DELAY_DAYS", "0")
    monkeypatch.setenv("CLAW_AFFILIATE_PAYOUT_THRESHOLD_USD", "1")
    o, t, e = _stores(tmp_path, monkeypatch)
    cr = affiliate_service.create_affiliate(
        affiliate_code="SAFE",
        wallet_address="0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        economics=e,
    )
    assert cr["ok"]
    aid = cr["affiliate_id"]
    affiliate_service.attribute_affiliate(
        org_id="org_safe",
        affiliate_code="SAFE",
        attribution_type="stripe",
        store=o,
        treasury=t,
        economics=e,
        emit_event=False,
    )
    e.upsert_stripe_customer_org(stripe_customer_id="cus_safe", org_id="org_safe")
    handle_invoice_paid(
        e,
        {
            "id": "in_safe",
            "customer": "cus_safe",
            "amount_paid": 3000,
            "billing_reason": "subscription_create",
            "metadata": {"org_id": "org_safe"},
            "subscription": None,
            "charge": None,
            "payment_intent": None,
        },
    )
    past = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat().replace("+00:00", "Z")
    with e._conn() as con:
        con.execute(
            "UPDATE affiliate_earnings SET status = 'payable', unlock_at = ? WHERE invoice_id = ?",
            (past, "in_safe"),
        )
        con.execute("UPDATE affiliates SET created_at = ? WHERE id = ?", ("2000-01-01T00:00:00Z", aid))

    prep = batches.prepare_draft_earning_batches(as_of_iso="2099-01-01T00:00:00Z", economics=e)
    assert prep["batches_created"] == 1
    bid = prep["batch_ids"][0]
    payload = safe_batch_export.build_safe_payout_batch_json(batch_id=bid, economics=e)
    assert payload["version"] == "1.0"
    assert payload["chainId"] == 8453
    assert payload["meta"]["batch_id"] == bid
    assert len(payload["transactions"]) == 1
    tx0 = payload["transactions"][0]
    assert tx0["value"] == "0"
    assert tx0["data"].startswith("0x")
    assert tx0["to"].lower().startswith("0x")


def test_affiliate_quality_persists(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from backend.affiliates.affiliate_quality import compute_and_persist_affiliate_quality

    db = str(tmp_path / "e.sqlite3")
    eco = EconomicsStore(db)
    eco.init_schema()
    with eco._conn() as con:
        con.execute(
            """
            INSERT INTO affiliates (id, affiliate_code, display_name, wallet_address, status, created_at)
            VALUES ('qa1', 'Q1', 'q', '0xffffffffffffffffffffffffffffffffffffffff', 'active', datetime('now'))
            """
        )
    out = compute_and_persist_affiliate_quality(eco, "qa1")
    assert "affiliate_quality_score" in out
    prof = eco.get_gamification_profile("qa1")
    assert prof is not None
    assert prof.get("affiliate_quality_score") is not None
