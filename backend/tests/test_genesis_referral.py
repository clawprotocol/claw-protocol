"""Genesis Referral Access — capture, Stripe commissions, void on refund."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest

from backend.affiliates.genesis_referral_service import (
    build_stripe_checkout_metadata,
    capture_referral_visit,
    convert_referral,
    create_genesis_affiliate,
)
from backend.affiliates.genesis_stripe_handlers import (
    handle_genesis_charge_refunded,
    handle_genesis_invoice_paid,
)
from backend.economics.store import EconomicsStore, reset_economics_store_for_tests


def _store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> EconomicsStore:
    root = tmp_path / "econ"
    root.mkdir()
    db = str(root / "economics.sqlite3")
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", db)
    reset_economics_store_for_tests()
    e = EconomicsStore(db)
    e.init_schema()
    return e


def _seed_affiliate(e: EconomicsStore, *, code: str = "GENESISDOG", user_id: str = "user_referrer") -> None:
    create_genesis_affiliate(
        e,
        user_id=user_id,
        display_name="Genesis Dog",
        referral_code=code,
        community_slug="genesis-dogs",
    )


def test_checkout_metadata_includes_referral_code() -> None:
    md = build_stripe_checkout_metadata(
        org_id="org_1",
        referral_code="genesisdog",
        visitor_id="vis_abc123",
        plan_code="pro",
    )
    assert md["org_id"] == "org_1"
    assert md["claw_org_id"] == "org_1"
    assert md["referral_code"] == "GENESISDOG"
    assert md["visitor_id"] == "vis_abc123"
    assert md["plan_code"] == "pro"


def test_capture_soft_fails_for_unknown_code(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    e = _store(tmp_path, monkeypatch)
    out = capture_referral_visit(
        e,
        referral_code="NOTREAL",
        visitor_id="visitor_unknown",
        source_path="/",
    )
    assert not out.get("ok")
    assert out.get("error") == "unknown_referral_code"


def test_capture_from_url_visitor(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    e = _store(tmp_path, monkeypatch)
    _seed_affiliate(e)
    out = capture_referral_visit(
        e,
        referral_code="GENESISDOG",
        visitor_id="visitor_test_001",
        source_path="/app/create?ref=GENESISDOG",
    )
    assert out["ok"]
    with e._conn() as con:
        n = con.execute("SELECT COUNT(*) FROM referral_attributions").fetchone()[0]
    assert n == 1


def test_webhook_creates_commission_at_30_percent(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    e = _store(tmp_path, monkeypatch)
    _seed_affiliate(e)
    capture_referral_visit(
        e,
        referral_code="GENESISDOG",
        visitor_id="visitor_comm_1",
        source_path="/",
    )
    convert_referral(
        e,
        referral_code="GENESISDOG",
        visitor_id="visitor_comm_1",
        referred_org_id="org_subscriber",
        referred_user_id="user_subscriber",
    )
    e.upsert_stripe_customer_org(stripe_customer_id="cus_genesis", org_id="org_subscriber")
    inv = {
        "id": "in_genesis_1",
        "customer": "cus_genesis",
        "amount_paid": 3900,
        "billing_reason": "subscription_cycle",
        "metadata": {"org_id": "org_subscriber", "referral_code": "GENESISDOG", "plan_code": "pro"},
        "subscription": "sub_genesis_1",
        "charge": None,
    }
    r = handle_genesis_invoice_paid(e, inv)
    assert r.get("ok")
    assert r.get("commission_id")
    with e._conn() as con:
        row = con.execute(
            "SELECT commission_rate, commission_amount, status FROM affiliate_commissions LIMIT 1"
        ).fetchone()
    assert row is not None
    assert float(row[0]) == pytest.approx(0.30)
    assert float(row[1]) == pytest.approx(11.70)
    assert row[2] == "pending"


def test_inactive_affiliate_does_not_earn(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    e = _store(tmp_path, monkeypatch)
    create_genesis_affiliate(
        e,
        user_id="user_paused",
        display_name="Paused",
        referral_code="PAUSED1",
        affiliate_status="paused",
    )
    assert not capture_referral_visit(e, referral_code="PAUSED1", visitor_id="v_paused", source_path="/").get("ok")
    assert not convert_referral(
        e,
        referral_code="PAUSED1",
        visitor_id="v_paused",
        referred_org_id="org_paused_sub",
    ).get("ok")
    e.upsert_stripe_customer_org(stripe_customer_id="cus_paused", org_id="org_paused_sub")
    r = handle_genesis_invoice_paid(
        e,
        {
            "id": "in_paused",
            "customer": "cus_paused",
            "amount_paid": 3900,
            "metadata": {"org_id": "org_paused_sub", "referral_code": "PAUSED1", "plan_code": "pro"},
            "subscription": None,
        },
    )
    assert r.get("ignored")
    with e._conn() as con:
        n = con.execute("SELECT COUNT(*) FROM affiliate_commissions").fetchone()[0]
    assert n == 0


def test_refunded_invoice_voids_commission(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    e = _store(tmp_path, monkeypatch)
    _seed_affiliate(e)
    convert_referral(
        e,
        referral_code="GENESISDOG",
        visitor_id="v_refund",
        referred_org_id="org_refund",
    )
    e.upsert_stripe_customer_org(stripe_customer_id="cus_ref", org_id="org_refund")
    handle_genesis_invoice_paid(
        e,
        {
            "id": "in_refund_me",
            "customer": "cus_ref",
            "amount_paid": 3900,
            "metadata": {"org_id": "org_refund", "referral_code": "GENESISDOG", "plan_code": "pro"},
            "subscription": None,
        },
    )
    void_r = handle_genesis_charge_refunded(
        e,
        {"id": "ch_ref", "refunded": True, "amount_refunded": 3900, "invoice": "in_refund_me"},
    )
    assert void_r.get("voided") == 1
    with e._conn() as con:
        status = con.execute(
            "SELECT status FROM affiliate_commissions WHERE stripe_invoice_id = ?",
            ("in_refund_me",),
        ).fetchone()[0]
    assert status == "void"


def test_invoice_paid_idempotent_duplicate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    e = _store(tmp_path, monkeypatch)
    _seed_affiliate(e)
    convert_referral(
        e,
        referral_code="GENESISDOG",
        visitor_id="v_idem",
        referred_org_id="org_idem",
    )
    e.upsert_stripe_customer_org(stripe_customer_id="cus_idem", org_id="org_idem")
    inv = {
        "id": "in_idem_1",
        "customer": "cus_idem",
        "amount_paid": 3900,
        "metadata": {"org_id": "org_idem", "referral_code": "GENESISDOG", "plan_code": "pro"},
        "subscription": None,
    }
    r1 = handle_genesis_invoice_paid(e, inv)
    r2 = handle_genesis_invoice_paid(e, inv)
    assert r1.get("commission_id")
    assert r2.get("duplicate")
    with e._conn() as con:
        n = con.execute("SELECT COUNT(*) FROM affiliate_commissions").fetchone()[0]
    assert n == 1


def test_refund_does_not_void_paid_commission(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    e = _store(tmp_path, monkeypatch)
    _seed_affiliate(e)
    convert_referral(
        e,
        referral_code="GENESISDOG",
        visitor_id="v_paid",
        referred_org_id="org_paid",
    )
    e.upsert_stripe_customer_org(stripe_customer_id="cus_paid", org_id="org_paid")
    handle_genesis_invoice_paid(
        e,
        {
            "id": "in_paid_keep",
            "customer": "cus_paid",
            "amount_paid": 3900,
            "metadata": {"org_id": "org_paid", "referral_code": "GENESISDOG", "plan_code": "pro"},
            "subscription": None,
        },
    )
    with e._conn() as con:
        con.execute(
            "UPDATE affiliate_commissions SET status = 'paid' WHERE stripe_invoice_id = ?",
            ("in_paid_keep",),
        )
        con.commit()
    void_r = handle_genesis_charge_refunded(
        e,
        {"id": "ch_paid", "refunded": True, "amount_refunded": 3900, "invoice": "in_paid_keep"},
    )
    assert void_r.get("voided") == 0
    with e._conn() as con:
        status = con.execute(
            "SELECT status FROM affiliate_commissions WHERE stripe_invoice_id = ?",
            ("in_paid_keep",),
        ).fetchone()[0]
    assert status == "paid"


def test_revoked_affiliate_does_not_earn(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    e = _store(tmp_path, monkeypatch)
    create_genesis_affiliate(
        e,
        user_id="user_revoked",
        display_name="Revoked",
        referral_code="REVOKED1",
        affiliate_status="revoked",
    )
    assert not convert_referral(
        e,
        referral_code="REVOKED1",
        visitor_id="v_revoked",
        referred_org_id="org_revoked_sub",
    ).get("ok")
    e.upsert_stripe_customer_org(stripe_customer_id="cus_revoked", org_id="org_revoked_sub")
    r = handle_genesis_invoice_paid(
        e,
        {
            "id": "in_revoked",
            "customer": "cus_revoked",
            "amount_paid": 3900,
            "metadata": {"org_id": "org_revoked_sub", "referral_code": "REVOKED1", "plan_code": "pro"},
            "subscription": None,
        },
    )
    assert r.get("ignored")
    with e._conn() as con:
        n = con.execute("SELECT COUNT(*) FROM affiliate_commissions").fetchone()[0]
    assert n == 0


def test_self_referral_blocked_at_commission_resolution(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    e = _store(tmp_path, monkeypatch)
    _seed_affiliate(e, user_id="user_self_pay")
    convert_referral(
        e,
        referral_code="GENESISDOG",
        visitor_id="v_self_pay",
        referred_org_id="org_other",
        referred_user_id="user_subscriber",
    )
    e.upsert_stripe_customer_org(stripe_customer_id="cus_self", org_id="org_other")
    r = handle_genesis_invoice_paid(
        e,
        {
            "id": "in_self",
            "customer": "cus_self",
            "amount_paid": 3900,
            "metadata": {
                "org_id": "org_other",
                "referral_code": "GENESISDOG",
                "plan_code": "pro",
                "user_id": "user_self_pay",
            },
            "subscription": None,
        },
    )
    assert r.get("ignored")
    with e._conn() as con:
        n = con.execute("SELECT COUNT(*) FROM affiliate_commissions").fetchone()[0]
    assert n == 0


def test_self_referral_blocked_on_convert(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    e = _store(tmp_path, monkeypatch)
    _seed_affiliate(e, user_id="user_self")
    out = convert_referral(
        e,
        referral_code="GENESISDOG",
        visitor_id="v_self",
        referred_org_id="org_self",
        referred_user_id="user_self",
    )
    assert not out.get("ok")
    assert out.get("error") == "self_referral"
