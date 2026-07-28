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
# Server reason when the one complimentary completed agreement has been used.
COMPLETED_AGREEMENT_LIMIT = "completed_agreement_limit"

# Free-tier draft storage window (incomplete agreements only).
FREE_DRAFT_TTL_SECONDS = 24 * 60 * 60

WATERMARK_LABEL = "Created with LawDog — Draft for Review"

PAID_SOFT_MONTHLY_AGREEMENTS_CAP = 500

# Complimentary UTC-calendar-month agreement *creations* for active Genesis Dogs.
# Not a Stripe Pro plan and not affiliate commission economics ($11.70/mo is separate).
# Override with CLAW_GENESIS_MONTHLY_AGREEMENT_ALLOWANCE — accepted range [1, 100] only.
# Blank / malformed / 0 / negative / >100 → DEFAULT (never a hidden kill-switch).
DEFAULT_GENESIS_MONTHLY_AGREEMENT_ALLOWANCE = 5
GENESIS_MONTHLY_AGREEMENT_ALLOWANCE_MIN = 1
GENESIS_MONTHLY_AGREEMENT_ALLOWANCE_MAX = 100

GENESIS_MONTHLY_ALLOWANCE_EXHAUSTED = "genesis_monthly_allowance_exhausted"

# Abuse heuristics (stub-friendly; tune in production).
MAX_DISTINCT_SUBJECTS_PER_IP_PER_DAY = 5
# Draft creations from the same client IP in a short window (any org / subject).
IP_AGREEMENT_BURST_WINDOW_SECONDS = 600
IP_AGREEMENT_BURST_MAX_CREATES = 10
