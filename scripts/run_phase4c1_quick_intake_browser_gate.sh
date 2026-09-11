#!/usr/bin/env bash
# Phase 4C.1 Quick intake browser gate.
# Deterministic Playwright fixtures only — does not prove live email, Supabase,
# Google OAuth, or staging configuration. Stops after PDF details (not 4C.2 send).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CLAW_ENVIRONMENT="${CLAW_ENVIRONMENT:-test}"
export PW_CHANNEL="${PW_CHANNEL:-chrome}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export LANG="${LANG:-en_US.UTF-8}"

VITEST="${ROOT}/frontend/node_modules/.bin/vitest"
PLAYWRIGHT="${ROOT}/frontend/node_modules/.bin/playwright"
VITE_LOG="${TMPDIR:-/tmp}/phase4c1-vite.log"
VITE_PID=""

kill_tree() {
  local pid="${1:-}"
  [[ -z "${pid}" ]] && return 0
  local kids
  kids="$(pgrep -P "${pid}" 2>/dev/null || true)"
  for child in ${kids}; do
    kill_tree "${child}"
  done
  kill -TERM "${pid}" 2>/dev/null || true
}

cleanup() {
  if [[ -n "${VITE_PID}" ]]; then
    kill_tree "${VITE_PID}"
    wait "${VITE_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "== Phase 4C.1 Quick intake browser gate =="
echo ""
echo "---- Intake, alias, and auth-return contracts ----"
(cd frontend && "$VITEST" run \
  src/launch/phase4c1QuickIntakeCoverage.test.ts \
  src/launch/quickAliasCanonicalize.test.ts \
  src/launch/simpleProduct/quickIntakeAccess.test.ts \
  src/launch/simpleProduct/quickPdfUpload.test.ts \
  src/auth/safeRedirectResolver.test.ts \
  --reporter=dot)
echo ""
echo "---- Shared Vite compile (quick + create; not a proof) ----"
(
  cd frontend
  export VITE_CLAW_SUPPRESS_API_BASE_LOG=1
  export VITE_CLAW_API_BASE=http://127.0.0.1:4177
  export VITE_SUPABASE_URL=http://127.0.0.1:4177/__supabase
  export VITE_SUPABASE_ANON_KEY=phase4c1-test-anon-key
  export VITE_CLAW_FEATURE_SUPABASE_AUTH=1
  npm run dev -- --host 127.0.0.1 --port 4177
) >"$VITE_LOG" 2>&1 &
VITE_PID=$!
for _ in $(seq 1 60); do
  if curl -sf http://127.0.0.1:4177 >/dev/null; then
    break
  fi
  sleep 1
done
curl -sf http://127.0.0.1:4177 >/dev/null
(cd frontend && node --input-type=module -e '
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
await page.goto("http://127.0.0.1:4177/app/quick", { waitUntil: "domcontentloaded", timeout: 120000 });
await page.goto("http://127.0.0.1:4177/app/create", { waitUntil: "domcontentloaded", timeout: 120000 });
await browser.close();
')
export PHASE4C1_REUSE_VITE=1
echo ""
echo "---- Quick intake browser proof (desktop 1280x800 + mobile 390x844, retries=0, workers=1) ----"
(cd frontend && "$PLAYWRIGHT" test --config playwright.phase4c1.config.ts --workers=1 --retries=0 --reporter=line)
echo ""
echo "== Phase 4C.1 Quick intake browser gate: PASS =="
