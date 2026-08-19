#!/usr/bin/env bash
# Focused paid-beta release suite — three consecutive runs.
# Does not invoke paid LLM APIs. Optional: CLAW_AGREEMENT_PG_TEST_URL for Postgres path.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CLAW_ENVIRONMENT="${CLAW_ENVIRONMENT:-test}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export LANG="${LANG:-en_US.UTF-8}"

PY="${ROOT}/.venv/bin/python"
if [[ ! -x "$PY" ]]; then
  PY=python3
fi

CRITICAL_BE=(
  backend/tests/test_paid_beta_release_gate.py
  backend/tests/test_commercial_beta_lifecycle.py
  backend/tests/test_genesis_referral.py
  backend/tests/test_vs01_signer_complete_api.py
  backend/tests/test_explicit_acceptance_http_e2e.py
  backend/tests/test_usage_economics.py
  backend/tests/test_commercial_p0_auth_boundary.py
  backend/tests/test_commercial_read_scope_fail_closed.py
  backend/tests/test_subscription_authority.py
  backend/tests/test_agreement_postgres_storage.py
)

CRITICAL_FE=(
  src/access/authenticatedWorkspaceAccessPolicy.test.ts
  src/access/commercialEntitlement.test.ts
  src/launch/checkoutParams.test.ts
  src/account/affiliatePresentation.test.ts
  src/components/agreements/paidProTest448BrandLicensingOrchestration.test.ts
  src/components/agreements/paidProTest435RedMesaHarborFreeze.test.ts
)

RUNS="${PAID_BETA_SUITE_RUNS:-3}"
OUT_DIR="${ROOT}/evals/commercial-readiness/baselines"
mkdir -p "$OUT_DIR"

# Normalize accidental DSN=/KEY= prefixes from helper files.
if [[ -n "${CLAW_AGREEMENT_PG_TEST_URL:-}" ]]; then
  CLAW_AGREEMENT_PG_TEST_URL="${CLAW_AGREEMENT_PG_TEST_URL#CLAW_AGREEMENT_PG_TEST_URL=}"
  CLAW_AGREEMENT_PG_TEST_URL="${CLAW_AGREEMENT_PG_TEST_URL#DSN=}"
  export CLAW_AGREEMENT_PG_TEST_URL
fi

echo "== Paid-beta critical suite ($RUNS consecutive runs) =="
echo "CLAW_AGREEMENT_PG_TEST_URL=${CLAW_AGREEMENT_PG_TEST_URL:-<unset — PG path will skip>}"

BE_FAIL=0
FE_FAIL=0
for i in $(seq 1 "$RUNS"); do
  echo ""
  echo "---- Backend run $i/$RUNS ----"
  set +e
  "$PY" -m pytest "${CRITICAL_BE[@]}" -q --tb=line 2>&1 | tee "$OUT_DIR/paid-beta-be-run${i}.txt"
  be_rc=${PIPESTATUS[0]}
  echo ""
  echo "---- Frontend run $i/$RUNS ----"
  (cd frontend && npx vitest run "${CRITICAL_FE[@]}" --reporter=dot 2>&1 | tee "../evals/commercial-readiness/baselines/paid-beta-fe-run${i}.txt")
  fe_rc=${PIPESTATUS[0]}
  set -e
  if [[ "$be_rc" -ne 0 ]]; then BE_FAIL=$((BE_FAIL + 1)); fi
  if [[ "$fe_rc" -ne 0 ]]; then FE_FAIL=$((FE_FAIL + 1)); fi
done

echo ""
echo "== Summary =="
for i in $(seq 1 "$RUNS"); do
  echo -n "BE run $i: "
  tail -n 1 "$OUT_DIR/paid-beta-be-run${i}.txt"
  echo -n "FE run $i: "
  tail -n 5 "$OUT_DIR/paid-beta-fe-run${i}.txt" | tr '\n' ' '
  echo
done
echo "BE failed runs: $BE_FAIL / $RUNS"
echo "FE failed runs: $FE_FAIL / $RUNS"
if [[ "$BE_FAIL" -ne 0 || "$FE_FAIL" -ne 0 ]]; then
  exit 1
fi
