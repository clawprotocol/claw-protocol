#!/usr/bin/env bash
# Phase 4B.5.1 authenticated callback success-landing gate.
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
VITE_LOG="${TMPDIR:-/tmp}/phase4b51-vite.log"
VITE_PID=""

cleanup() {
  if [[ -n "${VITE_PID}" ]] && kill -0 "${VITE_PID}" 2>/dev/null; then
    kill "${VITE_PID}" 2>/dev/null || true
    wait "${VITE_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "== Phase 4B.5.1 authenticated callback success-landing gate =="
echo ""
echo "---- Server-org landing contracts (fail closed if fetch stub or local-org authority returns) ----"
(cd frontend && "$VITEST" run src/launch/phase4b51AuthSuccessLandingCoverage.test.ts src/launch/AuthCallbackPage.test.tsx src/auth/anonymousOwnerContext.test.ts --reporter=dot)
echo ""
echo "---- Shared Vite compile (callback + create; not a proof) ----"
(
  cd frontend
  export VITE_CLAW_SUPPRESS_API_BASE_LOG=1
  export VITE_CLAW_API_BASE=http://127.0.0.1:4176
  export VITE_SUPABASE_URL=http://127.0.0.1:4176/__supabase
  export VITE_SUPABASE_ANON_KEY=phase4b51-test-anon-key
  export VITE_CLAW_FEATURE_SUPABASE_AUTH=1
  npm run dev -- --host 127.0.0.1 --port 4176
) >"$VITE_LOG" 2>&1 &
VITE_PID=$!
for _ in $(seq 1 60); do
  if curl -sf http://127.0.0.1:4176 >/dev/null; then
    break
  fi
  sleep 1
done
curl -sf http://127.0.0.1:4176 >/dev/null
(cd frontend && node --input-type=module -e '
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
await page.goto("http://127.0.0.1:4176/app/auth/callback", { waitUntil: "domcontentloaded", timeout: 120000 });
await page.goto("http://127.0.0.1:4176/app/create", { waitUntil: "domcontentloaded", timeout: 120000 });
await browser.close();
')
export PHASE4B51_REUSE_VITE=1
echo ""
echo "---- Positive callback landing (desktop + mobile, retries=0, workers=1) ----"
(cd frontend && "$PLAYWRIGHT" test --config playwright.phase4b51.config.ts --workers=1 --grep-invert "paid-resume" --reporter=line)
echo ""
echo "---- Paid-resume create landing (retries=0, workers=1) ----"
(cd frontend && "$PLAYWRIGHT" test --config playwright.phase4b51.config.ts --workers=1 -g "paid-resume" --reporter=line)
echo ""
echo "== Phase 4B.5.1 authenticated callback success-landing gate: PASS =="
