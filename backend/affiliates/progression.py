"""Affiliate progression tiers — meaningful Momentum, not time-on-platform."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Dict, Optional


@dataclass(frozen=True)
class ProgressionThresholds:
    climber_min: float = 15.0
    closer_min: float = 45.0
    rainmaker_min: float = 100.0
    legend_min: float = 220.0


def load_progression_thresholds() -> ProgressionThresholds:
    raw = os.getenv("CLAW_AFFILIATE_PROGRESSION_TIERS", "").strip()
    if not raw:
        return ProgressionThresholds()
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return ProgressionThresholds()
        return ProgressionThresholds(
            climber_min=float(data.get("climber_min", ProgressionThresholds().climber_min)),
            closer_min=float(data.get("closer_min", ProgressionThresholds().closer_min)),
            rainmaker_min=float(data.get("rainmaker_min", ProgressionThresholds().rainmaker_min)),
            legend_min=float(data.get("legend_min", ProgressionThresholds().legend_min)),
        )
    except (TypeError, ValueError, json.JSONDecodeError):
        return ProgressionThresholds()


def progression_tier_for_momentum(score: float, th: Optional[ProgressionThresholds] = None) -> str:
    t = th or load_progression_thresholds()
    if score >= t.legend_min:
        return "Legend"
    if score >= t.rainmaker_min:
        return "Rainmaker"
    if score >= t.closer_min:
        return "Closer"
    if score >= t.climber_min:
        return "Climber"
    return "Starter"


def progression_tier_rank(tier: str) -> int:
    order = ["Starter", "Climber", "Closer", "Rainmaker", "Legend"]
    try:
        return order.index(tier)
    except ValueError:
        return 0


def next_progression_target(score: float, th: Optional[ProgressionThresholds] = None) -> Dict[str, Any]:
    t = th or load_progression_thresholds()
    steps = [
        ("Climber", t.climber_min),
        ("Closer", t.closer_min),
        ("Rainmaker", t.rainmaker_min),
        ("Legend", t.legend_min),
    ]
    for label, low in steps:
        if score < low:
            return {
                "next_tier": label,
                "momentum_to_go": round(max(0.0, low - score), 2),
                "threshold": low,
            }
    return {"next_tier": None, "momentum_to_go": 0.0, "threshold": None}
