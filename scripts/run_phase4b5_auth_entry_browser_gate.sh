#!/usr/bin/env bash
# Phase 4B.5 /app/sign-in + /app/auth/callback authenticated customer entry gate.
# Deterministic Playwright fixtures only — does not prove live email, Supabase,
# Google OAuth, or staging configuration.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CLAW_ENVIRONMENT="${CLAW_ENVIRONMENT:-test}"
export PW_CHANNEL="${PW_CHANNEL:-chrome}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export LANG="${LANG:-en_US.UTF-8}"

VITEST="${ROOT}/frontend/node_modules/.bin/vitest"
PLAYWRIGHT="${ROOT}/frontend/node_modules/.bin/playwright"

echo "== Phase 4B.5 authenticated customer entry browser gate =="
echo ""
echo "---- Route coverage (fail closed if prefix allowlist or next-over-server returns) ----"
(cd frontend && "$VITEST" run src/launch/phase4b5AuthEntryCoverage.test.ts src/launch/AuthCallbackPage.test.tsx src/auth/safeRedirectResolver.test.ts --reporter=dot)
echo ""
echo "---- Auth entry browser proof (desktop + mobile, retries=0, workers=1) ----"
(cd frontend && "$PLAYWRIGHT" test --config playwright.phase4b5.config.ts --workers=1 --reporter=line)
echo ""
echo "== Phase 4B.5 authenticated customer entry browser gate: PASS =="
