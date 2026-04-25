"""
Canonical affiliate badges — titles, descriptions, and unlock evaluation.

Unlock timestamps live in ``affiliate_gamification_profiles.badge_unlocks_json``.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

@dataclass(frozen=True)
class BadgeDefinition:
    badge_id: str
    title: str
    description: str
    """Short token for UI (not emoji-first — surfaces can map to icons)."""
    visual: str

    # evaluated via context dict — see evaluate_badge_eligibility
    category: str


def all_badge_definitions() -> List[BadgeDefinition]:
    return [
        BadgeDefinition(
            badge_id="first_conversion",
            title="First Conversion",
            description="A referred workspace generated a qualified paid conversion.",
            visual="◆",
            category="conversion",
        ),
        BadgeDefinition(
            badge_id="first_paid_user",
            title="First Paid User",
            description="Someone you referred is on a paid path with staying power (retained).",
            visual="★",
            category="retention",
        ),
        BadgeDefinition(
            badge_id="five_activated",
            title="Activation Circle",
            description="Five referred workspaces have real product activation.",
            visual="⬡",
            category="activation",
        ),
        BadgeDefinition(
            badge_id="ten_agreements_influenced",
            title="Send Rhythm",
            description="Ten agreements moved through your network’s send milestone.",
            visual="↗",
            category="influence",
        ),
        BadgeDefinition(
            badge_id="weekly_climber",
            title="Weekly Climber",
            description="Meaningful Momentum lift this ISO week — quality over noise.",
            visual="⌁",
            category="consistency",
        ),
        BadgeDefinition(
            badge_id="conversion_streak",
            title="Conversion Streak",
            description="Five UTC days in a row with at least one qualified conversion.",
            visual="◇",
            category="consistency",
        ),
        BadgeDefinition(
            badge_id="premium_closer",
            title="Premium Closer",
            description="Retention + volume: paying users stick and your network scales.",
            visual="✦",
            category="conversion",
        ),
        BadgeDefinition(
            badge_id="network_builder",
            title="Network Builder",
            description="Ten qualified referrals — you’re growing the graph responsibly.",
            visual="⬢",
            category="network",
        ),
        BadgeDefinition(
            badge_id="momentum_25",
            title="Quarter Mark",
            description="Crossed 25 Momentum — your pipeline is heating up.",
            visual="▴",
            category="milestone",
        ),
        BadgeDefinition(
            badge_id="momentum_50",
            title="Half Sprint",
            description="50 Momentum — consistent signals from real outcomes.",
            visual="▲",
            category="milestone",
        ),
        BadgeDefinition(
            badge_id="momentum_100",
            title="Century Push",
            description="100 Momentum — serious network leverage.",
            visual="◆",
            category="milestone",
        ),
    ]


BADGE_BY_ID: Dict[str, BadgeDefinition] = {b.badge_id: b for b in all_badge_definitions()}


def _ctx(
    counts: Dict[str, int],
    momentum: float,
    *,
    conversion_streak_days: int,
    weekly_climber_eligible: bool,
) -> Dict[str, Any]:
    return {
        **counts,
        "momentum": momentum,
        "conversion_streak_days": conversion_streak_days,
        "weekly_climber_eligible": weekly_climber_eligible,
    }


_EVALUATORS: Dict[str, Callable[[Dict[str, Any]], bool]] = {
    "first_conversion": lambda c: int(c["paid_conversions"]) >= 1,
    "first_paid_user": lambda c: int(c["retained_paid_users"]) >= 1,
    "five_activated": lambda c: int(c["activated_users"]) >= 5,
    "ten_agreements_influenced": lambda c: int(c["agreements_influenced"]) >= 10,
    "weekly_climber": lambda c: bool(c.get("weekly_climber_eligible")),
    "conversion_streak": lambda c: int(c.get("conversion_streak_days") or 0) >= 5,
    "premium_closer": lambda c: int(c["retained_paid_users"]) >= 1
    or (int(c["paid_conversions"]) >= 2 and int(c["qualified_signups"]) >= 3),
    "network_builder": lambda c: int(c["qualified_signups"]) >= 10,
    "momentum_25": lambda c: float(c.get("momentum", 0)) >= 25,
    "momentum_50": lambda c: float(c.get("momentum", 0)) >= 50,
    "momentum_100": lambda c: float(c.get("momentum", 0)) >= 100,
}


def evaluate_weekly_climber(
    *,
    current_week: str,
    current_momentum: float,
    weekly_snapshot_json: Optional[str],
) -> Tuple[bool, str]:
    """
    Returns (eligible_for_badge_this_sync, updated_weekly_snapshot_json).
    Eligible when same ISO week and Momentum grew by >= 5 from week anchor.
    """
    import json

    anchor_m = current_momentum
    stored_week = ""
    try:
        snap = json.loads(weekly_snapshot_json or "{}")
        if isinstance(snap, dict):
            stored_week = str(snap.get("week") or "")
            anchor_m = float(snap.get("momentum_anchor", current_momentum))
    except (TypeError, ValueError, json.JSONDecodeError):
        pass

    if stored_week != current_week:
        new_snap = json.dumps({"week": current_week, "momentum_anchor": current_momentum})
        return False, new_snap

    eligible = current_momentum >= anchor_m + 5.0
    new_snap = json.dumps({"week": current_week, "momentum_anchor": anchor_m})
    return eligible, new_snap


def longest_conversion_streak_days(day_rows: List[Dict[str, Any]]) -> int:
    """Max run of UTC days each with conversion flag set."""
    from datetime import date, datetime, timedelta

    conv_days = sorted(
        [
            str(r["day_utc"])
            for r in day_rows
            if int(r.get("conversion") or 0) > 0
        ]
    )
    if not conv_days:
        return 0
    best = run = 1
    for i in range(1, len(conv_days)):
        a = date.fromisoformat(conv_days[i - 1])
        b = date.fromisoformat(conv_days[i])
        if (b - a).days == 1:
            run += 1
            best = max(best, run)
        else:
            run = 1
    return best
