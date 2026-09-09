#!/usr/bin/env bash
# Phase 2 paid-journey release gate — zero-failure authenticated paid-user path.
# Does not invoke paid LLM APIs or live Stripe.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CLAW_ENVIRONMENT="${CLAW_ENVIRONMENT:-test}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export LANG="${LANG:-en_US.UTF-8}"

PY="${PHASE2_PYTHON:-${ROOT}/.venv/bin/python}"
if [[ ! -x "$PY" ]]; then
  PY=python3
fi

CRITICAL_BE=(
  backend/tests/test_j7_auth_claim_authority.py
  backend/tests/test_j7_checkout_same_agreement_authority.py
  backend/tests/test_paid_beta_release_gate.py
  backend/tests/test_commercial_p0_auth_boundary.py
  backend/tests/test_commercial_read_scope_fail_closed.py
  backend/tests/test_subscription_authority.py
  backend/tests/test_anonymous_draft_claim.py
  backend/tests/test_vs01_signer_complete_api.py
  backend/tests/test_vs01_signer_completion.py
  backend/tests/test_commercial_beta_lifecycle.py
  backend/tests/test_explicit_acceptance_http_e2e.py
)

echo "== Phase 2 paid-journey release gate =="
echo "python: $PY"
echo ""
echo "---- Backend ownership / security / paid journey ----"
"$PY" -m pytest "${CRITICAL_BE[@]}" -q --tb=short
echo ""
echo "---- Frontend paid-journey vitest ----"
(cd frontend && npx vitest run --config vitest.phase2PaidJourney.runner.config.ts --reporter=dot)
echo ""
echo "== Phase 2 paid-journey release gate: PASS =="
