#!/usr/bin/env bash
# Phase 4C.2.2 Quick uploaded-PDF receipt integrity gate.
# Deterministic backend + Playwright fixtures only — does not prove live email,
# Supabase, Google OAuth, Stripe, or staging.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CLAW_ENVIRONMENT="${CLAW_ENVIRONMENT:-test}"
export PW_CHANNEL="${PW_CHANNEL:-chrome}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export LANG="${LANG:-en_US.UTF-8}"

PY="${ROOT}/.venv/bin/python"
if [[ ! -x "$PY" ]]; then
  PY=python3
fi
VITEST="${ROOT}/frontend/node_modules/.bin/vitest"
PLAYWRIGHT="${ROOT}/frontend/node_modules/.bin/playwright"
VITE_LOG="${TMPDIR:-/tmp}/phase4c22-vite.log"
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

echo "== Phase 4C.2.2 Quick receipt integrity gate =="
echo ""
echo "---- Authoritative receipt issuance, GET read-only, and artifact identity ----"
"$PY" -m pytest -q --tb=short backend/tests/test_phase4c22_quick_receipt_integrity.py
echo ""
echo "---- Uploaded-PDF receipt contracts ----"
(cd frontend && "$VITEST" run \
  src/launch/phase4c22QuickReceiptIntegrityCoverage.test.ts \
  src/launch/phase4c21QuickIntegrityCoverage.test.ts \
  src/launch/simpleProduct/quickPdfEnvelope.test.ts \
  --reporter=dot)
echo ""
echo "---- Shared Vite compile (quick + recipient esign; not a proof) ----"
(
  cd frontend
  export VITE_CLAW_SUPPRESS_API_BASE_LOG=1
  export VITE_CLAW_API_BASE=http://127.0.0.1:4180
  export VITE_SUPABASE_URL=http://127.0.0.1:4180/__supabase
  export VITE_SUPABASE_ANON_KEY=phase4c22-test-anon-key
  export VITE_CLAW_FEATURE_SUPABASE_AUTH=1
  npm run dev -- --host 127.0.0.1 --port 4180
) >"$VITE_LOG" 2>&1 &
VITE_PID=$!
for _ in $(seq 1 60); do
  if curl -sf http://127.0.0.1:4180 >/dev/null; then
    break
  fi
  sleep 1
done
curl -sf http://127.0.0.1:4180 >/dev/null
(cd frontend && node --input-type=module -e '
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
await page.goto("http://127.0.0.1:4180/app/quick", { waitUntil: "domcontentloaded", timeout: 120000 });
await page.goto("http://127.0.0.1:4180/app/esign/doc_phase4c2_pdf?vs01_recipient_sign=1&document_id=doc_phase4c2_pdf&recipient_index=0", { waitUntil: "domcontentloaded", timeout: 120000 });
await browser.close();
')
export PHASE4C22_REUSE_VITE=1
echo ""
echo "---- Receipt integrity browser proof (desktop 1280x800 + mobile 390x844, retries=0, workers=1) ----"
(cd frontend && "$PLAYWRIGHT" test --config playwright.phase4c22.config.ts --workers=1 --retries=0 --reporter=line)
echo ""
echo "== Phase 4C.2.2 Quick receipt integrity gate: PASS =="
