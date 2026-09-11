#!/usr/bin/env bash
# Phase 4C.2 Quick completion browser gate.
# Deterministic Playwright fixtures only — does not prove live email, Supabase,
# Google OAuth, Stripe, or staging. Existing-final-PDF path only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CLAW_ENVIRONMENT="${CLAW_ENVIRONMENT:-test}"
export PW_CHANNEL="${PW_CHANNEL:-chrome}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export LANG="${LANG:-en_US.UTF-8}"

VITEST="${ROOT}/frontend/node_modules/.bin/vitest"
PLAYWRIGHT="${ROOT}/frontend/node_modules/.bin/playwright"
VITE_LOG="${TMPDIR:-/tmp}/phase4c2-vite.log"
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

echo "== Phase 4C.2 Quick completion browser gate =="
echo ""
echo "---- Envelope, alias, and 4B.4 recipient contracts ----"
(cd frontend && "$VITEST" run \
  src/launch/phase4c2QuickCompletionCoverage.test.ts \
  src/launch/simpleProduct/quickPdfEnvelope.test.ts \
  src/launch/esignDocumentAccess.test.ts \
  --reporter=dot)
echo ""
echo "---- Shared Vite compile (quick + recipient esign; not a proof) ----"
(
  cd frontend
  export VITE_CLAW_SUPPRESS_API_BASE_LOG=1
  export VITE_CLAW_API_BASE=http://127.0.0.1:4178
  export VITE_SUPABASE_URL=http://127.0.0.1:4178/__supabase
  export VITE_SUPABASE_ANON_KEY=phase4c2-test-anon-key
  export VITE_CLAW_FEATURE_SUPABASE_AUTH=1
  npm run dev -- --host 127.0.0.1 --port 4178
) >"$VITE_LOG" 2>&1 &
VITE_PID=$!
for _ in $(seq 1 60); do
  if curl -sf http://127.0.0.1:4178 >/dev/null; then
    break
  fi
  sleep 1
done
curl -sf http://127.0.0.1:4178 >/dev/null
(cd frontend && node --input-type=module -e '
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
await page.goto("http://127.0.0.1:4178/app/quick", { waitUntil: "domcontentloaded", timeout: 120000 });
await page.goto("http://127.0.0.1:4178/app/esign/doc_phase4c2_pdf?vs01_recipient_sign=1&document_id=doc_phase4c2_pdf&recipient_index=0", { waitUntil: "domcontentloaded", timeout: 120000 });
await browser.close();
')
export PHASE4C2_REUSE_VITE=1
echo ""
echo "---- Quick completion browser proof (desktop 1280x800 + mobile 390x844, retries=0, workers=1) ----"
(cd frontend && "$PLAYWRIGHT" test --config playwright.phase4c2.config.ts --workers=1 --retries=0 --reporter=line)
echo ""
echo "== Phase 4C.2 Quick completion browser gate: PASS =="
