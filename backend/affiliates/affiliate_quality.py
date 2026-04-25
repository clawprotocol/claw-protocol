"""Internal affiliate quality / risk heuristics — not a public rank (ops + persistence only)."""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

from backend.affiliates.momentum import contribution_counts
from backend.economics.store import EconomicsStore, get_economics_store


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def compute_affiliate_quality(
    economics: EconomicsStore, affiliate_id: str
) -> Dict[str, Any]:
    """
    Bounded score 0–100 plus explainable factors. ``affiliate_risk_flag`` when score is low
    or hard signals (disputes, concentration, abuse exclusions) trip thresholds.
    """
    aid = (affiliate_id or "").strip()
    economics.init_schema()
    if not aid:
        return {
            "affiliate_quality_score": 50.0,
            "affiliate_risk_flag": True,
            "factors": {"error": "missing_affiliate_id"},
        }

    counts = contribution_counts(economics, aid)
    excluded = int(counts.get("excluded_signups") or 0)
    qualified = max(1, int(counts.get("qualified_signups") or 0))

    agg = economics.affiliate_earnings_quality_aggregate(aid)
    n_all = int(agg.get("n_all") or 0)
    n_cancelled = int(agg.get("n_cancelled") or 0)
    n_recovery = int(agg.get("n_recovery") or 0)
    n_refundish = int(agg.get("n_refundish") or 0)

    with economics._conn() as con:
        conc = con.execute(
            """
            SELECT signup_ip_hash, COUNT(*) AS c
            FROM affiliate_attributions
            WHERE affiliate_id = ?
              AND COALESCE(momentum_credit_state, 'pending') != 'excluded'
              AND signup_ip_hash IS NOT NULL
              AND TRIM(signup_ip_hash) != ''
            GROUP BY signup_ip_hash
            ORDER BY c DESC
            LIMIT 1
            """,
            (aid,),
        ).fetchone()
        top_ip_count = int(conc[1] or 0) if conc else 0
        denom_row = con.execute(
            """
            SELECT COUNT(*) FROM affiliate_attributions
            WHERE affiliate_id = ?
              AND COALESCE(momentum_credit_state, 'pending') != 'excluded'
              AND signup_ip_hash IS NOT NULL
              AND TRIM(signup_ip_hash) != ''
            """,
            (aid,),
        ).fetchone()
        ip_denom = int(denom_row[0] or 0) if denom_row else 0

    refund_rate = (n_refundish / n_all) if n_all else 0.0
    cancel_rate = (n_cancelled / n_all) if n_all else 0.0
    dispute_signal = (n_recovery / n_all) if n_all else 0.0
    excluded_ratio = excluded / float(qualified)
    top_ip_share = (top_ip_count / ip_denom) if ip_denom >= 3 else 0.0

    score = 100.0
    score -= _clamp(refund_rate * 120.0, 0.0, 45.0)
    score -= _clamp(cancel_rate * 80.0, 0.0, 35.0)
    score -= _clamp(dispute_signal * 100.0, 0.0, 40.0)
    score -= _clamp(excluded_ratio * 55.0, 0.0, 30.0)
    score -= _clamp((top_ip_share - 0.34) * 90.0, 0.0, 25.0) if top_ip_share >= 0.35 else 0.0
    score = _clamp(score, 0.0, 100.0)

    risk = score < 48.0 or n_recovery > 0 or excluded_ratio > 0.25 or top_ip_share >= 0.55

    factors: Dict[str, Any] = {
        "earnings_rows": n_all,
        "cancelled_earnings": n_cancelled,
        "recovery_due_rows": n_recovery,
        "refundish_cancellations": n_refundish,
        "refund_rate": round(refund_rate, 4),
        "cancel_rate": round(cancel_rate, 4),
        "dispute_rate_proxy": round(dispute_signal, 4),
        "excluded_signups": excluded,
        "qualified_signups": qualified,
        "excluded_ratio": round(excluded_ratio, 4),
        "top_ip_hash_share": round(top_ip_share, 4) if ip_denom >= 3 else None,
    }

    return {
        "affiliate_quality_score": round(score, 2),
        "affiliate_risk_flag": bool(risk),
        "factors": factors,
    }


def compute_and_persist_affiliate_quality(
    economics: Optional[EconomicsStore] = None,
    affiliate_id: str = "",
) -> Dict[str, Any]:
    eco = economics or get_economics_store()
    out = compute_affiliate_quality(eco, affiliate_id)
    eco.upsert_gamification_profile(
        affiliate_id,
        affiliate_quality_score=out["affiliate_quality_score"],
        affiliate_risk_flag=out["affiliate_risk_flag"],
        affiliate_quality_factors_json=json.dumps(out["factors"], separators=(",", ":")),
    )
    return out
