"""Internal usage units — never surfaced in product UI copy."""

from __future__ import annotations

# 1 new agreement draft creation consumes this many internal Keys.
KEY_COST_AGREEMENT_DRAFT = 3
# Fully executing an agreement (send + sign path completes) consumes this many internal Keys.
KEY_COST_AGREEMENT_FINALIZATION = 7
# Expected total internal Keys for one fully completed agreement (draft + finalize).
KEY_COST_FULL_AGREEMENT_APPROX = KEY_COST_AGREEMENT_DRAFT + KEY_COST_AGREEMENT_FINALIZATION

FREE_MAX_ACTIVE_DRAFTS = 2
FREE_MAX_COMPLETED_AGREEMENTS = 1

# Free-tier draft storage window (incomplete agreements only).
FREE_DRAFT_TTL_SECONDS = 24 * 60 * 60

WATERMARK_LABEL = "Created with LawDog — Draft for Review"

PAID_SOFT_MONTHLY_AGREEMENTS_CAP = 500

# Abuse heuristics (stub-friendly; tune in production).
MAX_DISTINCT_SUBJECTS_PER_IP_PER_DAY = 5
# Draft creations from the same client IP in a short window (any org / subject).
IP_AGREEMENT_BURST_WINDOW_SECONDS = 600
IP_AGREEMENT_BURST_MAX_CREATES = 10
