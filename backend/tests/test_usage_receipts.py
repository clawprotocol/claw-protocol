from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.billing.usage_receipt_service import build_usage_receipt_from_db_row
from backend.economics.store import EconomicsStore, reset_economics_store_for_tests
from backend.main import app
from backend.payments.service import settle_onramp_payment
from backend.payments.store import OnrampStore, reset_onramp_store_for_tests
from backend.treasury.treasury_store import TreasuryStore
from backend.verification.usage_bundle import build_usage_bundle


@pytest.fixture
def triple_iso(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
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


def test_usage_generates_receipt(triple_iso) -> None:
    from backend.billing import usage_metering

    o, t, e = triple_iso
    out = settle_onramp_payment(
        provider="coinbase",
        provider_payment_id="ur1",
        org_id="org_ur",
        amount_usd=Decimal("50.00"),
        tx_hash="0xur1",
        store=o,
        treasury=t,
    )
    assert out["ok"] is True
    keys0 = int(out["keys_allocated"])
    mu = usage_metering.meter_usage(
        org_id="org_ur",
        user_id="u1",
        service_type="esign_create",
        unit_count=1.0,
        economics=e,
    )
    assert mu["ok"] is True
    uid = mu["usage_event_id"]
    r = e.get_usage_receipt(uid)
    assert r is not None
    assert mu.get("receipt_hash_sha256") == r["receipt_hash_sha256"]
    row = e.get_usage_event(uid)
    assert int(row["keys_balance_before"]) == keys0
    assert int(row["keys_balance_after"]) == keys0 - 1


def test_receipt_hash_deterministic(triple_iso) -> None:
    from backend.billing import usage_metering

    o, t, e = triple_iso
    settle_onramp_payment(
        provider="ramp",
        provider_payment_id="ur2",
        org_id="org_d",
        amount_usd=Decimal("30.00"),
        tx_hash="0xur2",
        store=o,
        treasury=t,
    )
    usage_metering.meter_usage(
        org_id="org_d",
        user_id=None,
        service_type="agreement_parse",
        unit_count=1.0,
        economics=e,
    )
    rows = e._conn().execute("SELECT * FROM usage_events LIMIT 1").fetchall()
    ev = dict(rows[0])
    allocs = [
        dict(r)
        for r in e._conn().execute(
            "SELECT * FROM usage_payment_allocation WHERE usage_event_id = ?",
            (ev["id"],),
        )
    ]
    b1, h1 = build_usage_receipt_from_db_row(ev, allocs)
    b2, h2 = build_usage_receipt_from_db_row(ev, allocs)
    assert h1 == h2
    assert b1 == b2


def test_payment_trace_fifo(triple_iso) -> None:
    from backend.billing import usage_metering

    o, t, e = triple_iso
    a = settle_onramp_payment(
        provider="coinbase",
        provider_payment_id="p_a",
        org_id="org_f",
        amount_usd=Decimal("20.00"),
        tx_hash="0xa",
        store=o,
        treasury=t,
    )
    b = settle_onramp_payment(
        provider="coinbase",
        provider_payment_id="p_b",
        org_id="org_f",
        amount_usd=Decimal("20.00"),
        tx_hash="0xb",
        store=o,
        treasury=t,
    )
    pid_a = a["payment_id"]
    usage_metering.meter_usage(
        org_id="org_f",
        user_id=None,
        service_type="esign_create",
        unit_count=1.0,
        economics=e,
    )
    rows = e._conn().execute(
        "SELECT payment_id FROM usage_payment_allocation ORDER BY created_at ASC LIMIT 1"
    ).fetchall()
    assert rows[0][0] == pid_a
    _ = b


def test_bundle_verifies_via_post_verify(triple_iso) -> None:
    from backend.billing import usage_metering

    o, t, e = triple_iso
    settle_onramp_payment(
        provider="ramp",
        provider_payment_id="ur3",
        org_id="org_v",
        amount_usd=Decimal("100.00"),
        tx_hash="0xur3",
        store=o,
        treasury=t,
    )
    mu = usage_metering.meter_usage(
        org_id="org_v",
        user_id=None,
        service_type="esign_create",
        unit_count=1.0,
        economics=e,
    )
    assert mu["ok"] is True
    bundle = build_usage_bundle(mu["usage_event_id"], economics=e, onramp=o)
    client = TestClient(app)
    r = client.post("/verify", json={"usage_bundle": bundle})
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True
    assert not body.get("errors")
