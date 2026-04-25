from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.payments import reconciliation
from backend.payments.webhooks import router as payments_webhook_router
from backend.payments.service import allocate_reserve, settle_onramp_payment
from backend.payments.store import OnrampStore, reset_onramp_store_for_tests
from backend.treasury.treasury_store import TreasuryStore
from backend.economics.store import reset_economics_store_for_tests


@pytest.fixture
def isolated_stores(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite"))
    reset_onramp_store_for_tests()
    reset_economics_store_for_tests()
    o = OnrampStore(path=str(tmp_path / "onramp.sqlite"))
    o.init_schema()
    t = TreasuryStore(path=str(tmp_path / "treasury.sqlite"))
    t.init_schema()
    return o, t


def test_reserve_math() -> None:
    r, n, k = allocate_reserve(Decimal("100"))
    assert r == Decimal("8.00")
    assert n == Decimal("92.00")
    assert k == 92


def test_key_issuance_correctness(isolated_stores) -> None:
    o, t = isolated_stores
    out = settle_onramp_payment(
        provider="coinbase",
        provider_payment_id="pay_a",
        org_id="org_1",
        amount_usd=Decimal("100.00"),
        tx_hash="0xabc",
        store=o,
        treasury=t,
    )
    assert out["ok"] is True
    assert out["duplicate"] is False
    assert out["keys_allocated"] == 92
    row = o._conn().execute("SELECT keys_allocated FROM claw_keys WHERE payment_id = ?", (out["payment_id"],)).fetchone()
    assert int(row[0]) == 92


def test_duplicate_webhook_idempotent(isolated_stores) -> None:
    o, t = isolated_stores
    a = settle_onramp_payment(
        provider="ramp",
        provider_payment_id="dup_x",
        org_id="o1",
        amount_usd=Decimal("50.00"),
        tx_hash="0x111",
        store=o,
        treasury=t,
    )
    b = settle_onramp_payment(
        provider="ramp",
        provider_payment_id="dup_x",
        org_id="o1",
        amount_usd=Decimal("50.00"),
        tx_hash="0x111",
        store=o,
        treasury=t,
    )
    assert a["duplicate"] is False
    assert b["duplicate"] is True
    n = o._conn().execute("SELECT COUNT(1) FROM payments WHERE provider_payment_id = ?", ("dup_x",)).fetchone()[0]
    assert n == 1
    n_ev = o._conn().execute(
        "SELECT COUNT(1) FROM payment_canonical_events WHERE event_type = ?", ("PaymentReceived",)
    ).fetchone()[0]
    assert n_ev == 1


def test_coinbase_webhook_full_pipeline(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "o.sqlite"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "t.sqlite"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "e.sqlite"))
    monkeypatch.setenv("CLAW_PAYMENTS_WEBHOOK_DEV", "1")
    reset_onramp_store_for_tests()
    reset_economics_store_for_tests()
    app = FastAPI()
    app.include_router(payments_webhook_router)
    client = TestClient(app)
    body = {
        "event": "order_completed",
        "order_id": "cb_1",
        "org_id": "org_cb",
        "amount_usd": "100.00",
        "tx_hash": "0xcbhash",
    }
    r1 = client.post("/webhook/coinbase", content=json.dumps(body), headers={"Content-Type": "application/json"})
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["ok"] is True
    assert d1.get("duplicate") is False
    r2 = client.post("/webhook/coinbase", content=json.dumps(body), headers={"Content-Type": "application/json"})
    assert r2.status_code == 200
    assert r2.json().get("duplicate") is True


def test_reconciliation_inserts_missing(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "o.sqlite"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "t.sqlite"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "e.sqlite"))
    monkeypatch.setenv("PAYNOW_SMOKE_INBOUND", "1")
    reset_onramp_store_for_tests()
    reset_economics_store_for_tests()

    def _stub(**_: object) -> list:
        return [
            {
                "provider_payment_id": "rec_1",
                "org_id": "org_rec",
                "amount_usd": Decimal("10.00"),
                "tx_hash": "0xrec",
            }
        ]

    monkeypatch.setattr(reconciliation, "list_stale_provider_orders_stub", _stub)
    out = reconciliation.reconcile_hourly_cycle()
    assert out["applied"] >= 1
    o = OnrampStore(path=str(tmp_path / "o.sqlite"))
    row = o._conn().execute(
        "SELECT 1 FROM payments WHERE provider_payment_id = ?", ("rec_1",)
    ).fetchone()
    assert row is not None
