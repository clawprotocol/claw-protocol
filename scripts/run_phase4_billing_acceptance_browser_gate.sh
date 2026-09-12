#!/usr/bin/env bash
# Named desktop/mobile Billing acceptance gate for /app/billing.
# Production backend handlers are exercised with Stripe mocked in pytest.
# Playwright paints Billing UI states against mocked-provider routes only.
# Live Stripe / live-provider evidence is not collected here.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CLAW_ENVIRONMENT="${CLAW_ENVIRONMENT:-test}"
export PW_CHANNEL="${PW_CHANNEL:-chrome}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export LANG="${LANG:-en_US.UTF-8}"

PY="${PHASE4_BILLING_PYTHON:-${ROOT}/.venv/bin/python}"
if [[ ! -x "$PY" ]]; then
  PY=python3
fi
VITEST="${ROOT}/frontend/node_modules/.bin/vitest"
PLAYWRIGHT="${ROOT}/frontend/node_modules/.bin/playwright"

SHA="$(git rev-parse HEAD)"
# Content fingerprint of Billing sources on disk (working tree), not git-status filenames.
BILLING_SOURCES=(
  backend/billing/billing_display.py
  backend/billing/checkout_app_origin.py
  backend/billing/checkout_attempts.py
  backend/billing/stripe_client.py
  backend/billing/stripe_config.py
  backend/billing/subscription_authority.py
  backend/economics/store.py
  backend/routers/billing_checkout_api.py
  backend/tests/test_billing_cancellation_preservation.py
  backend/tests/test_billing_checkout_retry_safety.py
  backend/tests/test_billing_customer_portal.py
  backend/tests/test_billing_display.py
  frontend/src/launch/BillingPage.tsx
  frontend/src/launch/billingAccountDisplay.ts
  frontend/src/launch/billingStatusApi.ts
  frontend/src/launch/phase4BillingAcceptanceCoverage.ts
  frontend/e2e/phase4-billing/phase4BillingAcceptance.spec.ts
  frontend/e2e/phase4-billing/phase4BillingAcceptanceFixtures.ts
  frontend/playwright.phase4-billing.config.ts
  scripts/run_phase4_billing_acceptance_browser_gate.sh
)
CONTENT_FP="$(
  {
    for f in "${BILLING_SOURCES[@]}"; do
      if [[ -f "$ROOT/$f" ]]; then
        printf '%s ' "$f"
        git hash-object "$ROOT/$f"
      fi
    done
  } | git hash-object --stdin
)"
STAMP="${SHA:0:12}-src-${CONTENT_FP:0:12}-mocked-provider"
EVIDENCE="${ROOT}/evals/commercial-readiness/results/phase4-billing-acceptance/${STAMP}"
mkdir -p "$EVIDENCE/playwright" "$EVIDENCE/backend"
export PHASE4_BILLING_PW_OUTPUT="$EVIDENCE/playwright"

echo "== Phase 4 Billing acceptance gate =="
echo "sha: $SHA"
echo "source_content_fingerprint: $CONTENT_FP"
echo "evidence: $EVIDENCE"
echo "provider_label: mocked-provider"
echo "live_provider: not_run"
echo ""

echo "---- Billing display / portal / checkout-repeat contracts ----"
(cd frontend && "$VITEST" run \
  src/launch/phase4BillingAcceptanceCoverage.test.ts \
  src/launch/billingAccountDisplay.test.ts \
  src/launch/billingStatusApi.test.ts \
  src/launch/BillingPage.workspacePolicy.test.ts \
  --reporter=dot)
echo ""

echo "---- Production billing handlers (external Stripe mocked) ----"
"$PY" -m pytest -q --tb=short \
  backend/tests/test_billing_display.py \
  backend/tests/test_billing_customer_portal.py \
  backend/tests/test_billing_checkout_retry_safety.py \
  backend/tests/test_billing_cancellation_preservation.py \
  backend/tests/test_checkout_app_origin.py \
  backend/tests/test_subscription_probe_api.py \
  backend/tests/test_subscription_authority.py \
  backend/tests/test_stripe_subscription_sync.py \
  backend/tests/test_stripe_webhook_dev_unsigned.py \
  backend/tests/test_commercial_entitlement_policy.py \
  backend/tests/test_stripe_checkout_session_payload.py \
  | tee "$EVIDENCE/backend/focused-pytest.txt"
echo ""

echo "---- Billing browser proof (desktop + mobile, retries=0, workers=1) ----"
(cd frontend && "$PLAYWRIGHT" test --config playwright.phase4-billing.config.ts --workers=1 --reporter=line)
echo ""

echo "== Phase 4 Billing acceptance gate: PASS =="
echo "mocked-provider evidence: $EVIDENCE"
echo "live-provider evidence: not collected (no live Stripe)"
