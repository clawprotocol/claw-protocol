#!/usr/bin/env bash
# Phase 4B.3 public agreement-verification browser gate.
# Deterministic Playwright fixtures only — no live model, Stripe, email, or staging.
# Fails when /verify/:id or /app/verify/:id lose public treatment.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CLAW_ENVIRONMENT="${CLAW_ENVIRONMENT:-test}"
export PW_CHANNEL="${PW_CHANNEL:-chrome}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export LANG="${LANG:-en_US.UTF-8}"

VITEST="${ROOT}/frontend/node_modules/.bin/vitest"
PLAYWRIGHT="${ROOT}/frontend/node_modules/.bin/playwright"

echo "== Phase 4B.3 public-verify browser gate =="
echo ""
echo "---- Route coverage (fail closed if public verify routes lose public treatment) ----"
(cd frontend && "$VITEST" run src/launch/phase4b3PublicVerifyCoverage.test.ts --reporter=dot)
echo ""
echo "---- Public-verify browser proof (desktop + mobile, retries=0, workers=1) ----"
(cd frontend && "$PLAYWRIGHT" test --config playwright.phase4b3.config.ts --workers=1 --reporter=line)
echo ""
echo "== Phase 4B.3 public-verify browser gate: PASS =="
