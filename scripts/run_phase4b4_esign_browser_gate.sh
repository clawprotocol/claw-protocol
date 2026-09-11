#!/usr/bin/env bash
# Phase 4B.4 /app/esign/:documentId dual-mode browser gate.
# Deterministic Playwright fixtures only — no live model, Stripe, email, or staging.
# Fails when owner bridge is treated as public recipient access or bare URLs become readable.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CLAW_ENVIRONMENT="${CLAW_ENVIRONMENT:-test}"
export PW_CHANNEL="${PW_CHANNEL:-chrome}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export LANG="${LANG:-en_US.UTF-8}"

VITEST="${ROOT}/frontend/node_modules/.bin/vitest"
PLAYWRIGHT="${ROOT}/frontend/node_modules/.bin/playwright"

echo "== Phase 4B.4 esign dual-mode browser gate =="
echo ""
echo "---- Route coverage (fail closed if query-sensitive esign access is lost) ----"
(cd frontend && "$VITEST" run src/launch/phase4b4EsignDualModeCoverage.test.ts --reporter=dot)
echo ""
echo "---- Esign dual-mode browser proof (desktop + mobile, retries=0, workers=2) ----"
(cd frontend && "$PLAYWRIGHT" test --config playwright.phase4b4.config.ts --workers=2 --reporter=line)
echo ""
echo "== Phase 4B.4 esign dual-mode browser gate: PASS =="
