#!/usr/bin/env bash
# Phase 4A paid-owner sitemap browser gate.
# Deterministic Playwright fixtures only — no live model, Stripe, email, or staging.
# Fails when APP_ROUTE_MANIFEST gains an authenticated/paid route without a browser scenario.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CLAW_ENVIRONMENT="${CLAW_ENVIRONMENT:-test}"
export PW_CHANNEL="${PW_CHANNEL:-chrome}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export LANG="${LANG:-en_US.UTF-8}"

VITEST="${ROOT}/frontend/node_modules/.bin/vitest"
PLAYWRIGHT="${ROOT}/frontend/node_modules/.bin/playwright"

echo "== Phase 4A paid-owner sitemap browser gate =="
echo ""
echo "---- Manifest coverage (fail closed if a new authenticated/paid route is uncovered) ----"
(cd frontend && "$VITEST" run src/launch/phase4aPaidSitemapCoverage.test.ts --reporter=dot)
echo ""
echo "---- Paid-owner sitemap browser proof (desktop + mobile, retries=0) ----"
(cd frontend && "$PLAYWRIGHT" test --config playwright.phase4a.config.ts --reporter=line)
echo ""
echo "== Phase 4A paid-owner sitemap browser gate: PASS =="
