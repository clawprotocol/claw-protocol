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
  backend/tests/test_accepted_review_snapshot_authority.py
  backend/tests/test_dashboard_resume_freeze_canonical_auth.py
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
echo "---- Phase 1 access-contract files must remain in the Phase 2 gate ----"
PHASE1_INCLUDE="$ROOT/frontend/vitest.phase1AccessContract.include.ts"
PHASE2_INCLUDE="$ROOT/frontend/vitest.phase2PaidJourney.runner.config.ts"
MISSING=0
while IFS= read -r rel; do
  if [[ ! -f "$ROOT/frontend/$rel" ]]; then
    echo "MISSING ON DISK: $rel" >&2
    MISSING=1
  fi
  if ! grep -F -q "\"$rel\"" "$PHASE2_INCLUDE" && ! grep -F -q "PHASE1_ACCESS_CONTRACT_INCLUDE" "$PHASE2_INCLUDE"; then
    echo "OMITTED FROM PHASE 2 INCLUDE: $rel" >&2
    MISSING=1
  fi
  if ! grep -F -q "\"$rel\"" "$PHASE1_INCLUDE"; then
    echo "PHASE 1 INCLUDE PARSE ERROR: $rel" >&2
    MISSING=1
  fi
done < <(grep -oE 'src/[^"]+\.test\.tsx?' "$PHASE1_INCLUDE")
if [[ "$MISSING" -ne 0 ]]; then
  echo "Phase 2 gate cannot omit Phase 1 contract tests." >&2
  exit 1
fi
if ! grep -F -q "PHASE1_ACCESS_CONTRACT_INCLUDE" "$PHASE2_INCLUDE"; then
  echo "Phase 2 runner must import PHASE1_ACCESS_CONTRACT_INCLUDE." >&2
  exit 1
fi
echo "Phase 1 contract include is bound into the Phase 2 gate."
echo ""
echo "---- Backend ownership / security / paid journey ----"
"$PY" -m pytest "${CRITICAL_BE[@]}" -q --tb=short
echo ""
echo "---- Frontend paid-journey vitest ----"
(cd frontend && npx vitest run --config vitest.phase2PaidJourney.runner.config.ts --reporter=dot)
echo ""
echo "== Phase 2 paid-journey release gate: PASS =="
