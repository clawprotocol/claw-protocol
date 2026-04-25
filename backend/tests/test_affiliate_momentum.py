from __future__ import annotations

import json

import pytest


def test_compute_momentum_score_weighted() -> None:
    from backend.affiliates.momentum import compute_momentum_score
    from backend.affiliates.momentum_config import MomentumWeights

    w = MomentumWeights(
        qualified_signup=1.0,
        activated_user=2.0,
        paid_conversion=10.0,
        retained_paid_user=5.0,
        agreement_sent_influenced=3.0,
    )
    counts = {
        "qualified_signups": 2,
        "activated_users": 1,
        "dormant_signups": 1,
        "paid_conversions": 1,
        "retained_paid_users": 1,
        "agreements_influenced": 1,
    }
    # Full dormant weight reproduces legacy double-count on qualified + activated slice.
    s = compute_momentum_score(counts, w, dormant_qualified_factor=1.0)
    assert s == pytest.approx(2 + 2 + 10 + 5 + 3)


def test_dormant_signups_downweighted_on_leaderboard_lane() -> None:
    from backend.affiliates.momentum import compute_momentum_score
    from backend.affiliates.momentum_config import MomentumWeights

    w = MomentumWeights(qualified_signup=1.0, activated_user=0.0, paid_conversion=0.0, retained_paid_user=0.0, agreement_sent_influenced=0.0)
    counts = {
        "qualified_signups": 2,
        "activated_users": 0,
        "dormant_signups": 2,
        "paid_conversions": 0,
        "retained_paid_users": 0,
        "agreements_influenced": 0,
    }
    pending = compute_momentum_score(counts, w, dormant_qualified_factor=0.35)
    board = compute_momentum_score(counts, w, dormant_qualified_factor=0.0)
    assert pending == pytest.approx(0.7)
    assert board == 0.0


def test_leaderboard_respects_visibility_and_score(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "econ.sqlite3"))
    from backend.economics.store import EconomicsStore, reset_economics_store_for_tests

    reset_economics_store_for_tests()
    eco = EconomicsStore(str(tmp_path / "econ.sqlite3"))
    eco.init_schema()
    eco.insert_affiliate(
        affiliate_id="aff_a",
        code="ALPHA",
        display_name="Alpha",
        wallet_address="0x1234567890123456789012345678901234567890",
        owner_org_id="org_1",
    )
    eco.insert_affiliate(
        affiliate_id="aff_b",
        code="BETA",
        display_name="Beta",
        wallet_address="0x2234567890123456789012345678901234567890",
        owner_org_id="org_2",
    )
    eco.upsert_gamification_profile("aff_b", leaderboard_visible=False)

    from backend.affiliates.momentum import build_leaderboard_rows

    rows, _ = build_leaderboard_rows(economics=eco, limit=10, update_rank_snapshots=False)
    assert len(rows) == 0

    eco.insert_attribution(
        attr_id="at1",
        org_id="org_x",
        user_id=None,
        affiliate_id="aff_a",
        attribution_type="first_payment",
        expires_at=None,
    )
    with eco._conn() as con:
        con.execute(
            """
            INSERT INTO usage_events (
              id, org_id, user_id, service_type, unit_count, key_cost, reference_id,
              created_at, keys_balance_before, keys_balance_after
            ) VALUES (?, ?, NULL, 'agreement', 1.0, 1, NULL, ?, 0, 0)
            """,
            ("ue_lb_1", "org_x", "2026-01-01T12:00:00Z"),
        )
    rows2, _ = build_leaderboard_rows(economics=eco, limit=10, update_rank_snapshots=False)
    assert len(rows2) == 1
    assert rows2[0]["affiliate_id"] == "aff_a"
    assert rows2[0]["momentum_score"] > 0


def test_disposable_domain_marks_attribution_excluded(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "e3.sqlite3"))
    from backend.affiliates.trust_signals import evaluate_new_attribution
    from backend.economics.store import EconomicsStore, reset_economics_store_for_tests

    reset_economics_store_for_tests()
    eco = EconomicsStore(str(tmp_path / "e3.sqlite3"))
    eco.init_schema()
    eco.insert_affiliate(
        affiliate_id="aff_t",
        code="TR",
        display_name="T",
        wallet_address="0x4234567890123456789012345678901234567890",
        owner_org_id=None,
    )
    eco.insert_attribution(
        attr_id="attr_t1",
        org_id="org_t1",
        user_id=None,
        affiliate_id="aff_t",
        attribution_type="signup",
        expires_at=None,
        signup_email_domain="mailinator.com",
    )
    te = evaluate_new_attribution(
        economics=eco,
        affiliate_id="aff_t",
        attr_id="attr_t1",
        signup_ip_hash=None,
        device_fingerprint_hash=None,
        email_domain="mailinator.com",
    )
    assert te.momentum_credit_state == "excluded"
    assert "disposable_email" in te.flags
    from backend.affiliates.momentum import contribution_counts

    c = contribution_counts(eco, "aff_t")
    assert c["qualified_signups"] == 0
    assert c["excluded_signups"] == 1


def test_gamification_sync_unlocks_first_conversion(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "e2.sqlite3"))
    from backend.affiliates.gamification_sync import run_affiliate_gamification_sync
    from backend.affiliates.momentum import compute_momentum_score, contribution_counts
    from backend.affiliates.momentum_config import load_momentum_weights
    from backend.economics.store import EconomicsStore, reset_economics_store_for_tests

    reset_economics_store_for_tests()
    eco = EconomicsStore(str(tmp_path / "e2.sqlite3"))
    eco.init_schema()
    eco.insert_affiliate(
        affiliate_id="aff_z",
        code="ZETA",
        display_name="Z",
        wallet_address="0x3234567890123456789012345678901234567890",
        owner_org_id=None,
    )
    eco.insert_attribution(
        attr_id="attr_z_p",
        org_id="org_p",
        user_id=None,
        affiliate_id="aff_z",
        attribution_type="signup",
        expires_at=None,
    )
    eco.insert_accrual(
        accrual_id="acc1",
        affiliate_id="aff_z",
        org_id="org_p",
        payment_id="pay1",
        basis_amount_usd=10.0,
        payout_amount_usd=1.0,
        status="accrued",
        matured_at=None,
    )
    counts = contribution_counts(eco, "aff_z")
    mom = compute_momentum_score(
        counts, load_momentum_weights(), dormant_qualified_factor=0.0
    )
    run_affiliate_gamification_sync(eco, "aff_z", counts=counts, momentum=mom)
    prof = eco.get_gamification_profile("aff_z")
    assert prof is not None
    unlocks = json.loads(prof["badge_unlocks_json"] or "[]")
    ids = [u["badge_id"] for u in unlocks if isinstance(u, dict)]
    assert "first_conversion" in ids
