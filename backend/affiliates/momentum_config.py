"""
Configurable Momentum weights — single source for scoring (not sprinkled in UI).

Override with env ``CLAW_AFFILIATE_MOMENTUM_WEIGHTS`` as JSON, e.g.
``{"qualified_signup":1.0,"activated_user":2.5,...}``.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass(frozen=True)
class MomentumWeights:
    qualified_signup: float = 1.0
    activated_user: float = 2.5
    paid_conversion: float = 8.0
    retained_paid_user: float = 12.0
    agreement_sent_influenced: float = 5.0

    def to_dict(self) -> Dict[str, float]:
        return {
            "qualified_signup": self.qualified_signup,
            "activated_user": self.activated_user,
            "paid_conversion": self.paid_conversion,
            "retained_paid_user": self.retained_paid_user,
            "agreement_sent_influenced": self.agreement_sent_influenced,
        }


_DEFAULT = MomentumWeights()


@dataclass(frozen=True)
class MomentumTrustFactors:
    """
    Dormant = trusted referral without product usage yet.
    Pending score uses ``dormant_qualified_factor`` on the qualified-signup weight.
    Leaderboard / confirmed lane uses ``leaderboard_dormant_qualified_factor`` (default 0).
    """

    dormant_qualified_factor: float = 0.35
    leaderboard_dormant_qualified_factor: float = 0.0


def load_momentum_trust_factors() -> MomentumTrustFactors:
    raw = os.getenv("CLAW_AFFILIATE_MOMENTUM_TRUST", "").strip()
    if not raw:
        return MomentumTrustFactors()
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return MomentumTrustFactors()
        return MomentumTrustFactors(
            dormant_qualified_factor=float(
                data.get("dormant_qualified_factor", MomentumTrustFactors().dormant_qualified_factor)
            ),
            leaderboard_dormant_qualified_factor=float(
                data.get(
                    "leaderboard_dormant_qualified_factor",
                    MomentumTrustFactors().leaderboard_dormant_qualified_factor,
                )
            ),
        )
    except (TypeError, ValueError, json.JSONDecodeError):
        return MomentumTrustFactors()


def load_momentum_weights() -> MomentumWeights:
    raw = os.getenv("CLAW_AFFILIATE_MOMENTUM_WEIGHTS", "").strip()
    if not raw:
        return _DEFAULT
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return _DEFAULT
        return MomentumWeights(
            qualified_signup=float(data.get("qualified_signup", _DEFAULT.qualified_signup)),
            activated_user=float(data.get("activated_user", _DEFAULT.activated_user)),
            paid_conversion=float(data.get("paid_conversion", _DEFAULT.paid_conversion)),
            retained_paid_user=float(data.get("retained_paid_user", _DEFAULT.retained_paid_user)),
            agreement_sent_influenced=float(
                data.get("agreement_sent_influenced", _DEFAULT.agreement_sent_influenced)
            ),
        )
    except (TypeError, ValueError, json.JSONDecodeError):
        return _DEFAULT


@dataclass(frozen=True)
class TierThresholds:
    """Pack-style tiers from Momentum score — tune without frontend changes."""

    builder_min: float = 18.0
    connector_min: float = 55.0
    alpha_min: float = 120.0


def load_tier_thresholds() -> TierThresholds:
    raw = os.getenv("CLAW_AFFILIATE_MOMENTUM_TIER_THRESHOLDS", "").strip()
    if not raw:
        return TierThresholds()
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return TierThresholds()
        return TierThresholds(
            builder_min=float(data.get("builder_min", TierThresholds().builder_min)),
            connector_min=float(data.get("connector_min", TierThresholds().connector_min)),
            alpha_min=float(data.get("alpha_min", TierThresholds().alpha_min)),
        )
    except (TypeError, ValueError, json.JSONDecodeError):
        return TierThresholds()


def momentum_tier_label(score: float, thresholds: Optional[TierThresholds] = None) -> str:
    th = thresholds or load_tier_thresholds()
    if score >= th.alpha_min:
        return "Alpha"
    if score >= th.connector_min:
        return "Connector"
    if score >= th.builder_min:
        return "Builder"
    return "Pup"
