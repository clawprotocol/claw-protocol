"""Composite streaks from meaningful daily activity (not vanity clicks)."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from backend.affiliates.gamification_events import emit_affiliate_gamification_event
from backend.economics.store import EconomicsStore


def _today_utc() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _yesterday_utc() -> str:
    return (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()


def _meaningful_days(rows: List[Dict[str, Any]]) -> Set[str]:
    out: Set[str] = set()
    for r in rows:
        if max(
            int(r.get("qualified_signup") or 0),
            int(r.get("activation") or 0),
            int(r.get("conversion") or 0),
            int(r.get("agreement_send") or 0),
        ) > 0:
            out.add(str(r["day_utc"])[:10])
    return out


def _best_consecutive_run(sorted_days_asc: List[str]) -> int:
    if not sorted_days_asc:
        return 0
    best = run = 1
    for i in range(1, len(sorted_days_asc)):
        a = date.fromisoformat(sorted_days_asc[i - 1])
        b = date.fromisoformat(sorted_days_asc[i])
        if (b - a).days == 1:
            run += 1
            best = max(best, run)
        else:
            run = 1
    return best


def compute_streak_bundle(economics: EconomicsStore, affiliate_id: str) -> Dict[str, Any]:
    rows = economics.list_affiliate_gamification_days(affiliate_id)
    meaningful = _meaningful_days(rows)
    today = _today_utc()
    yesterday = _yesterday_utc()

    # Current streak ends at most recent meaningful day if it's today or yesterday
    anchor_end: Optional[str] = None
    if today in meaningful:
        anchor_end = today
    elif yesterday in meaningful:
        anchor_end = yesterday

    current = 0
    last_day: Optional[str] = None
    if anchor_end:
        d = date.fromisoformat(anchor_end)
        last_day = anchor_end
        while d.isoformat() in meaningful:
            current += 1
            d -= timedelta(days=1)

    best = _best_consecutive_run(sorted(meaningful))
    at_risk = (
        yesterday in meaningful
        and today not in meaningful
        and datetime.now(timezone.utc).hour < 23  # soften: “at risk” same calendar day
    )
    return {
        "current_streak_days": current,
        "best_streak_days": best,
        "streak_last_meaningful_day_utc": last_day,
        "streak_at_risk": at_risk,
        "streak_at_risk_copy": (
            "Your streak rests on yesterday — meaningful activity today keeps it alive."
            if at_risk
            else None
        ),
    }


def sync_streak_to_profile(economics: EconomicsStore, affiliate_id: str) -> Dict[str, Any]:
    """Persist streak fields; emit ``affiliate_streak_updated`` when values change."""
    aid = (affiliate_id or "").strip()
    bundle = compute_streak_bundle(economics, aid)
    prof = economics.get_gamification_profile(aid)
    prev_current = int(prof.get("streak_days") or 0) if prof else 0
    prev_best = int(prof.get("best_streak_days") or 0) if prof else 0
    cur = int(bundle["current_streak_days"])
    best = max(int(bundle["best_streak_days"]), cur)
    economics.upsert_gamification_profile(
        aid,
        streak_days=cur,
        best_streak_days=max(prev_best, best),
        streak_last_meaningful_day_utc=bundle.get("streak_last_meaningful_day_utc"),
    )
    if cur != prev_current or max(prev_best, best) != prev_best:
        emit_affiliate_gamification_event(
            "affiliate_streak_updated",
            affiliate_id=aid,
            current_streak_days=cur,
            best_streak_days=max(prev_best, max(int(bundle["best_streak_days"]), cur)),
        )
    return bundle
