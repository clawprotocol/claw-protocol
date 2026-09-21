#!/usr/bin/env bash
# Phase 4B.2 recipient agreement-signing browser gate.
# Deterministic Playwright fixtures only — no live model, Stripe, email, or staging.
# Fails when /agreements/:id/sign loses public recipient-token treatment.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CLAW_ENVIRONMENT="${CLAW_ENVIRONMENT:-test}"
export PW_CHANNEL="${PW_CHANNEL:-chrome}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export LANG="${LANG:-en_US.UTF-8}"

VITEST="${ROOT}/frontend/node_modules/.bin/vitest"
PLAYWRIGHT="${ROOT}/frontend/node_modules/.bin/playwright"

echo "== Phase 4B.2 recipient-signing browser gate =="
echo ""
echo "---- Route coverage (fail closed if /agreements/:id/sign loses public recipient-token treatment) ----"
(cd frontend && "$VITEST" run src/launch/phase4b2RecipientSigningCoverage.test.ts --reporter=dot)
echo ""
echo "---- Recipient-signing browser proof (desktop + mobile, retries=0; deterministic workers=1 split) ----"
(cd frontend && "$PLAYWRIGHT" test --config playwright.phase4b2.config.ts --workers=1 --grep-invert "retryable network" --reporter=line)
(cd frontend && "$PLAYWRIGHT" test --config playwright.phase4b2.config.ts --workers=1 -g "retryable network" --reporter=line)
echo ""
echo "== Phase 4B.2 recipient-signing browser gate: PASS =="
