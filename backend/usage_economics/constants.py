"""Internal usage units — never surfaced in product UI copy."""

from __future__ import annotations

# 1 new agreement draft creation consumes this many internal Keys.
KEY_COST_AGREEMENT_DRAFT = 3
# Fully executing an agreement (send + sign path completes) consumes this many internal Keys.
KEY_COST_AGREEMENT_FINALIZATION = 7
# Expected total internal Keys for one fully completed agreement (draft + finalize).
KEY_COST_FULL_AGREEMENT_APPROX = KEY_COST_AGREEMENT_DRAFT + KEY_COST_AGREEMENT_FINALIZATION

# Guest temporary draft retention (not a Free account tier).
GUEST_MAX_TEMP_DRAFTS = 1
GUEST_DRAFT_TTL_SECONDS = 24 * 60 * 60
# Backward-compatible aliases for existing TTL helpers.
FREE_DRAFT_TTL_SECONDS = GUEST_DRAFT_TTL_SECONDS
FREE_MAX_ACTIVE_DRAFTS = GUEST_MAX_TEMP_DRAFTS
# Legacy constant — authenticated Free account tier is removed.
FREE_MAX_COMPLETED_AGREEMENTS = 0
COMPLETED_AGREEMENT_LIMIT = "entitlement_required"
ENTITLEMENT_REQUIRED = "entitlement_required"
GUEST_DRAFT_LIMIT = "guest_draft_limit"
GUEST_PERSISTED_DENIED = "guest_persisted_denied"
GUEST_WORKFLOW_DENIED = "guest_workflow_denied"

WATERMARK_LABEL = "Created with LawDog — Draft for Review"

PAID_SOFT_MONTHLY_AGREEMENTS_CAP = 500

# Complimentary UTC-calendar-month agreement *creations* for Genesis Dogs.
# Override with CLAW_GENESIS_MONTHLY_AGREEMENT_ALLOWANCE — accepted range [1, 100] only.
DEFAULT_GENESIS_MONTHLY_AGREEMENT_ALLOWANCE = 5
GENESIS_MONTHLY_AGREEMENT_ALLOWANCE_MIN = 1
GENESIS_MONTHLY_AGREEMENT_ALLOWANCE_MAX = 100
GENESIS_MONTHLY_ALLOWANCE_EXHAUSTED = "genesis_monthly_allowance_exhausted"

# Stripe Pro successfully finalized agreements per UTC calendar month (hard cap).
# Applies identically for monthly and annual subscribers — not per billing period.
# Override with CLAW_PRO_BILLING_PERIOD_AGREEMENT_ALLOWANCE — accepted range [1, 500].
DEFAULT_PRO_BILLING_PERIOD_AGREEMENT_ALLOWANCE = 10
PRO_BILLING_PERIOD_AGREEMENT_ALLOWANCE_MIN = 1
PRO_BILLING_PERIOD_AGREEMENT_ALLOWANCE_MAX = 500
PRO_BILLING_PERIOD_ALLOWANCE_EXHAUSTED = "pro_billing_period_allowance_exhausted"

# Abuse heuristics (stub-friendly; tune in production).
MAX_DISTINCT_SUBJECTS_PER_IP_PER_DAY = 5
# Draft creations from the same client IP in a short window (any org / subject).
IP_AGREEMENT_BURST_WINDOW_SECONDS = 600
IP_AGREEMENT_BURST_MAX_CREATES = 10
