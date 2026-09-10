#!/usr/bin/env bash
# Phase 4B.1 recipient agreement-review browser gate.
# Deterministic Playwright fixtures only — no live model, Stripe, email, or staging.
# Fails when either runtime-supported review entry loses recipient-token classification.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CLAW_ENVIRONMENT="${CLAW_ENVIRONMENT:-test}"
export PW_CHANNEL="${PW_CHANNEL:-chrome}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export LANG="${LANG:-en_US.UTF-8}"

VITEST="${ROOT}/frontend/node_modules/.bin/vitest"
PLAYWRIGHT="${ROOT}/frontend/node_modules/.bin/playwright"

echo "== Phase 4B.1 recipient-review browser gate =="
echo ""
echo "---- Route coverage (fail closed if primary or legacy loses recipient-token classification) ----"
(cd frontend && "$VITEST" run src/launch/phase4b1RecipientReviewCoverage.test.ts --reporter=dot)
echo ""
echo "---- Recipient-review browser proof (desktop + mobile, retries=0, workers=2) ----"
(cd frontend && "$PLAYWRIGHT" test --config playwright.phase4b1.config.ts --workers=2 --reporter=line)
echo ""
echo "== Phase 4B.1 recipient-review browser gate: PASS =="
