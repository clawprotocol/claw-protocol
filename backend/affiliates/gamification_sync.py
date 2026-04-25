"""Central sync: streaks, weekly snapshot, badges with timestamps, progression tier, celebrations."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.affiliates.badges_catalog import (
    BADGE_BY_ID,
    _EVALUATORS,
    evaluate_weekly_climber,
    longest_conversion_streak_days,
)
from backend.affiliates.gamification_events import emit_affiliate_gamification_event
from backend.affiliates.progression import (
    progression_tier_for_momentum,
    progression_tier_rank,
)
from backend.affiliates.streaks import sync_streak_to_profile
from backend.economics.store import EconomicsStore


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _iso_week_utc() -> str:
    d = datetime.now(timezone.utc).date()
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def _parse_unlocks(raw: Optional[str]) -> List[Dict[str, Any]]:
    try:
        v = json.loads(raw or "[]")
        if isinstance(v, list):
            return [x for x in v if isinstance(x, dict) and x.get("badge_id")]
    except json.JSONDecodeError:
        pass
    return []


def _legacy_badge_ids_from_json(raw: Optional[str]) -> List[str]:
    try:
        v = json.loads(raw or "[]")
        if isinstance(v, list):
            return [str(x) for x in v if x]
    except json.JSONDecodeError:
        pass
    return []


def _merge_unlocks_fixed(
    existing: List[Dict[str, Any]], new_ids: List[str], unlocked_at: str
) -> Tuple[List[Dict[str, Any]], List[str]]:
    have = {str(x.get("badge_id")) for x in existing}
    added: List[str] = []
    out = list(existing)
    for bid in new_ids:
        if bid in have:
            continue
        out.append({"badge_id": bid, "unlocked_at": unlocked_at})
        have.add(bid)
        added.append(bid)
    out.sort(key=lambda x: str(x.get("badge_id")))
    return out, added


def run_affiliate_gamification_sync(
    economics: EconomicsStore,
    affiliate_id: str,
    *,
    counts: Dict[str, int],
    momentum: float,
) -> Dict[str, Any]:
    """
    Updates profile-derived state and returns ``celebrations`` for the API
    (delta-only UX: badges / tier / milestones first seen this sync).
    """
    aid = (affiliate_id or "").strip()
    now_iso = _utc_now_iso()
    prof = economics.get_gamification_profile(aid) or {}
    tier_before_raw = str(prof.get("progression_tier") or "").strip()
    tier_before = (
        tier_before_raw
        if tier_before_raw
        else progression_tier_for_momentum(momentum)
    )

    unlocks = _parse_unlocks(str(prof.get("badge_unlocks_json") or ""))
    if not unlocks:
        legacy_ids = sorted(
            {
                b
                for b in _legacy_badge_ids_from_json(str(prof.get("badges_json") or ""))
                if b in BADGE_BY_ID
            }
        )
        for bid in legacy_ids:
            unlocks.append({"badge_id": bid, "unlocked_at": now_iso})

    streak_bundle = sync_streak_to_profile(economics, aid)
    day_rows = economics.list_affiliate_gamification_days(aid, limit=800)
    conv_streak_len = longest_conversion_streak_days(day_rows)

    week = _iso_week_utc()
    eligible_weekly, new_weekly_snap = evaluate_weekly_climber(
        current_week=week,
        current_momentum=momentum,
        weekly_snapshot_json=str(prof.get("weekly_snapshot_json") or ""),
    )
    economics.upsert_gamification_profile(aid, weekly_snapshot_json=new_weekly_snap)
    prof = economics.get_gamification_profile(aid) or prof

    ctx = dict(counts)
    ctx["momentum"] = momentum
    ctx["conversion_streak_days"] = conv_streak_len
    ctx["weekly_climber_eligible"] = eligible_weekly

    newly_eligible: List[str] = []
    for bid, fn in _EVALUATORS.items():
        try:
            if fn(ctx):
                newly_eligible.append(bid)
        except Exception:
            continue

    merged, added_ids = _merge_unlocks_fixed(unlocks, newly_eligible, now_iso)
    celebrations_badges: List[Dict[str, Any]] = []
    milestone_ids = {"momentum_25", "momentum_50", "momentum_100"}
    for bid in added_ids:
        emit_affiliate_gamification_event(
            "affiliate_badge_unlocked",
            affiliate_id=aid,
            badge_id=bid,
            title=BADGE_BY_ID[bid].title if bid in BADGE_BY_ID else bid,
        )
        if bid in milestone_ids:
            emit_affiliate_gamification_event(
                "affiliate_milestone_reached",
                affiliate_id=aid,
                milestone_id=bid,
            )
        meta = BADGE_BY_ID.get(bid)
        celebrations_badges.append(
            {
                "badge_id": bid,
                "title": (meta.title if meta else bid),
                "description": (meta.description if meta else ""),
                "visual": (meta.visual if meta else "·"),
                "unlocked_at": now_iso,
            }
        )

    id_list = [str(x.get("badge_id")) for x in merged]
    economics.upsert_gamification_profile(
        aid,
        badge_unlocks_json=json.dumps(merged, ensure_ascii=False),
        badges_json=json.dumps(sorted(set(h for h in id_list if h)), ensure_ascii=False),
    )

    tier_after = progression_tier_for_momentum(momentum)
    economics.upsert_gamification_profile(aid, progression_tier=tier_after)
    tier_celebration: Optional[Dict[str, str]] = None
    if progression_tier_rank(tier_after) > progression_tier_rank(tier_before):
        emit_affiliate_gamification_event(
            "affiliate_tier_upgraded",
            affiliate_id=aid,
            previous_tier=tier_before,
            new_tier=tier_after,
        )
        tier_celebration = {"previous_tier": tier_before, "new_tier": tier_after}

    return {
        "streak": streak_bundle,
        "celebrations": {
            "badges": celebrations_badges,
            "tier_upgrade": tier_celebration,
        },
        "progression_tier": tier_after,
        "badge_unlocks": merged,
    }
