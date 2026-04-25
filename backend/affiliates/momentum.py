from __future__ import annotations

import json
from typing import Any, Dict, List, Literal, Optional, Tuple

from backend.affiliates.gamification_events import emit_affiliate_gamification_event
from backend.affiliates.momentum_config import (
    MomentumWeights,
    load_momentum_trust_factors,
    load_momentum_weights,
    load_tier_thresholds,
)
from backend.affiliates.progression import progression_tier_for_momentum
from backend.economics.store import EconomicsStore, get_economics_store

RankMovement = Literal["up", "down", "same", "new"]


def contribution_counts(economics: EconomicsStore, affiliate_id: str) -> Dict[str, int]:
    """Trusted referral counts (excluded attributions omitted). Includes ``dormant_signups`` for scoring."""
    aid = (affiliate_id or "").strip()
    economics.init_schema()
    activated = economics.count_affiliate_activated_orgs(aid)
    dormant = economics.count_affiliate_dormant_attributions(aid)
    return {
        "qualified_signups": economics.count_affiliate_qualified_signups(aid),
        "activated_users": activated,
        "dormant_signups": dormant,
        "paid_conversions": economics.count_affiliate_lifetime_conversions(aid),
        "retained_paid_users": economics.count_affiliate_retained_paid_orgs(aid),
        "agreements_influenced": economics.get_agreements_influenced_count(aid),
        "excluded_signups": economics.count_affiliate_excluded_attributions(aid),
    }


def compute_momentum_score(
    counts: Dict[str, int],
    weights: MomentumWeights,
    *,
    dormant_qualified_factor: float,
) -> float:
    """
    Qualified-signup weight applies to ``activated_users + dormant_signups * factor``.
    Surplus signup spam without activation is down-weighted when ``factor`` < 1.
    Leaderboard uses ``factor=0`` by default so rank requires activation or paid signals.
    """
    act = int(counts["activated_users"])
    dorm = int(counts.get("dormant_signups") or 0)
    qs_eff = float(act) + float(dorm) * float(dormant_qualified_factor)
    return (
        qs_eff * weights.qualified_signup
        + float(act) * weights.activated_user
        + int(counts["paid_conversions"]) * weights.paid_conversion
        + int(counts["retained_paid_users"]) * weights.retained_paid_user
        + int(counts["agreements_influenced"]) * weights.agreement_sent_influenced
    )


def momentum_scores_for_affiliate(
    economics: EconomicsStore, affiliate_id: str
) -> Tuple[Dict[str, int], float, float]:
    """Returns (counts, pending_momentum, leaderboard_confirmed_momentum)."""
    weights = load_momentum_weights()
    trust = load_momentum_trust_factors()
    counts = contribution_counts(economics, affiliate_id)
    pending = compute_momentum_score(
        counts, weights, dormant_qualified_factor=trust.dormant_qualified_factor
    )
    confirmed = compute_momentum_score(
        counts,
        weights,
        dormant_qualified_factor=trust.leaderboard_dormant_qualified_factor,
    )
    return counts, pending, confirmed


def build_leaderboard_rows(
    *,
    economics: Optional[EconomicsStore] = None,
    limit: int = 30,
    viewer_affiliate_id: Optional[str] = None,
    update_rank_snapshots: bool = True,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    eco = economics or get_economics_store()
    eco.init_schema()
    weights = load_momentum_weights()
    thresholds = load_tier_thresholds()
    trust = load_momentum_trust_factors()

    candidates: List[Tuple[str, Dict[str, int], float, Dict[str, Any]]] = []
    for aid in eco.list_active_affiliate_ids():
        aff = eco.get_affiliate(aid)
        if not aff:
            continue
        counts = contribution_counts(eco, aid)
        score = compute_momentum_score(
            counts,
            weights,
            dormant_qualified_factor=trust.leaderboard_dormant_qualified_factor,
        )
        prof = eco.get_gamification_profile(aid)
        visible = True
        if prof is not None:
            visible = bool(int(prof.get("leaderboard_visible") or 1))
        if not visible:
            continue
        if score <= 0:
            continue
        candidates.append((aid, counts, score, dict(aff)))

    candidates.sort(key=lambda x: x[2], reverse=True)

    rows_out: List[Dict[str, Any]] = []
    rank = 0
    for aid, counts, score, aff in candidates[: max(1, min(100, limit))]:
        rank += 1
        prof = eco.get_gamification_profile(aid)
        prev_rank: Optional[int] = None
        if prof and prof.get("last_leaderboard_rank") is not None:
            try:
                prev_rank = int(prof["last_leaderboard_rank"])
            except (TypeError, ValueError):
                prev_rank = None
        movement: RankMovement = "new"
        if prev_rank is not None:
            if rank < prev_rank:
                movement = "up"
            elif rank > prev_rank:
                movement = "down"
            else:
                movement = "same"

        tier = progression_tier_for_momentum(score)
        display_name = str(aff.get("display_name") or "").strip() or str(aff.get("affiliate_code") or aid)[:12]
        badge_ids: List[str] = []
        unlocks_raw = str(prof.get("badge_unlocks_json") or "") if prof else ""
        try:
            u = json.loads(unlocks_raw or "[]")
            if isinstance(u, list):
                badge_ids = [str(x.get("badge_id")) for x in u if isinstance(x, dict) and x.get("badge_id")]
        except json.JSONDecodeError:
            badge_ids = []
        if not badge_ids and prof:
            try:
                b = json.loads(str(prof.get("badges_json") or "[]"))
                if isinstance(b, list):
                    badge_ids = [str(x) for x in b]
            except json.JSONDecodeError:
                badge_ids = []

        avatar_url = None
        avatar_asset_ref = None
        tagline = None
        streak_days = 0
        best_streak = 0
        if prof:
            avatar_url = prof.get("avatar_url")
            avatar_asset_ref = prof.get("avatar_asset_ref")
            tagline = prof.get("tagline")
            try:
                streak_days = int(prof.get("streak_days") or 0)
            except (TypeError, ValueError):
                streak_days = 0
            try:
                best_streak = int(prof.get("best_streak_days") or 0)
            except (TypeError, ValueError):
                best_streak = 0

        rows_out.append(
            {
                "rank": rank,
                "affiliate_id": aid,
                "referral_code": str(aff.get("affiliate_code") or ""),
                "display_name": display_name,
                "avatar_url": avatar_url,
                "avatar_asset_ref": avatar_asset_ref,
                "tagline": tagline,
                "tier": tier,
                "momentum_score": round(score, 2),
                "rank_movement": movement,
                "badges": badge_ids,
                "streak_days": streak_days,
                "best_streak_days": best_streak,
                "stats": {
                    "qualified_signups": counts["qualified_signups"],
                    "activated_users": counts["activated_users"],
                    "dormant_signups": counts.get("dormant_signups", 0),
                    "lifetime_conversions": counts["paid_conversions"],
                    "retained_conversions": counts["retained_paid_users"],
                    "agreements_influenced": counts["agreements_influenced"],
                },
                "is_viewer": bool(viewer_affiliate_id and aid == viewer_affiliate_id),
            }
        )

    if update_rank_snapshots:
        for row in rows_out:
            aid = str(row["affiliate_id"])
            prof = eco.get_gamification_profile(aid)
            prev: Optional[int] = None
            if prof and prof.get("last_leaderboard_rank") is not None:
                try:
                    prev = int(prof["last_leaderboard_rank"])
                except (TypeError, ValueError):
                    prev = None
            new_r = int(row["rank"])
            if prev is not None and prev != new_r:
                emit_affiliate_gamification_event(
                    "affiliate_rank_changed",
                    affiliate_id=aid,
                    previous_rank=prev,
                    new_rank=new_r,
                )
            eco.upsert_gamification_profile(aid, last_leaderboard_rank=new_r)

    meta = {
        "weights": weights.to_dict(),
        "trust_factors": {
            "dormant_qualified_factor": trust.dormant_qualified_factor,
            "leaderboard_dormant_qualified_factor": trust.leaderboard_dormant_qualified_factor,
        },
        "tier_thresholds": {
            "builder_min": thresholds.builder_min,
            "connector_min": thresholds.connector_min,
            "alpha_min": thresholds.alpha_min,
        },
        "leaderboard_score_basis": "confirmed_momentum",
        "progression_note": "Pack meta preserved for legacy analytics; row ``tier`` is Starter→Legend progression.",
    }
    return rows_out, meta


def get_leaderboard_rank(
    economics: EconomicsStore, affiliate_id: str, *, limit: int = 200
) -> Optional[int]:
    """Current rank on the public Momentum board, or None if not listed (opt-out or zero score)."""
    rows, _ = build_leaderboard_rows(
        economics=economics,
        limit=limit,
        viewer_affiliate_id=None,
        update_rank_snapshots=False,
    )
    for row in rows:
        if str(row["affiliate_id"]) == str(affiliate_id):
            return int(row["rank"])
    return None
