"""Affiliate trust ledger append-only events + dashboard aggregates (SQLite economics path)."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest

from backend.affiliates import trust_ledger
from backend.affiliates import service as affiliate_service
from backend.economics.store import EconomicsStore


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def test_trust_click_dedupe_signup_dashboard(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_AFFILIATE_PAYOUT_THRESHOLD_USD", "25")
    monkeypatch.setenv("CLAW_AFFILIATE_TRUST_CUSTOMER_HASH_SALT", "test-salt")
    db = tmp_path / "eco.sqlite3"
    eco = EconomicsStore(str(db))
    eco.init_schema()

    cr = affiliate_service.create_affiliate(
        affiliate_code="alpha1",
        wallet_address="0x0000000000000000000000000000000000000001",
        display_name="Alpha",
        owner_org_id="org-owner",
        economics=eco,
    )
    assert cr.get("ok")
    aid = str(cr["affiliate_id"])

    out = trust_ledger.record_click_attributed(eco, referral_code="alpha1", idempotency_key="t1-click-session-a")
    assert out["ok"] and out["recorded"] is True
    out2 = trust_ledger.record_click_attributed(eco, referral_code="alpha1", idempotency_key="t1-click-session-a")
    assert out2["ok"] and out2["recorded"] is False

    trust_ledger.record_signup_attributed(
        eco, affiliate_id=aid, referral_code="alpha1", attribution_id="attr-1", org_id="buyer-org"
    )

    now = _iso()
    eco.insert_trust_ledger_event(
        event_id="ev-comm-1",
        created_at=now,
        affiliate_id=aid,
        referral_code="alpha1",
        event_type="commission_earned",
        customer_ref_hash="h1",
        agreement_id=None,
        gross_revenue_usd=100.0,
        commission_amount_usd=10.0,
        status="posted",
        payout_batch_id=None,
        proof_id="earn-1",
        idempotency_key="commission_earned:earn-1",
        meta_json=None,
    )

    dash = trust_ledger.build_trust_dashboard(eco, affiliate_id=aid, referral_code="alpha1")
    assert dash["clicks"] == 1
    assert dash["signups"] == 1
    assert dash["conversions"] == 1
    assert dash["referral_code"] == "alpha1"
    assert dash["payout_threshold_usd"] == 25.0


def test_friday_rollover_pass_runs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_AFFILIATE_PAYOUT_THRESHOLD_USD", "25")
    db = tmp_path / "eco2.sqlite3"
    eco = EconomicsStore(str(db))
    eco.init_schema()
    affiliate_service.create_affiliate(
        affiliate_code="lowbal",
        wallet_address="0x0000000000000000000000000000000000000002",
        economics=eco,
    )
    r1 = trust_ledger.run_friday_rollover_pass(eco)
    r2 = trust_ledger.run_friday_rollover_pass(eco)
    assert r1["ok"] and r2["ok"]
    assert "week_key" in r1 and "affiliates_scanned" in r1
