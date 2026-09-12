#!/usr/bin/env bash
# Phase 4C.2.3 signing acceptance — production handlers + live local backend.
# Isolated CLAW_DATA_DIR. External identity/payment/email/model are unused fixtures.
# Does not prove live email, Supabase, Google OAuth, Stripe, or staging.
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
COMMIT="$("$PY" -c 'import subprocess; print(subprocess.check_output(["git","rev-parse","--short=12","HEAD"], text=True).strip())')"
CONFIG="live-4182-4183"
RESULT_DIR="${ROOT}/evals/commercial-readiness/results/phase4c23-signing-acceptance/${COMMIT}-${CONFIG}"
mkdir -p "${RESULT_DIR}"
DATA_DIR="${RESULT_DIR}/claw-data"
mkdir -p "${DATA_DIR}"

API_PORT=4182
VITE_PORT=4183
API_URL="http://127.0.0.1:${API_PORT}"
VITE_URL="http://127.0.0.1:${VITE_PORT}"
API_LOG="${RESULT_DIR}/uvicorn.log"
VITE_LOG="${RESULT_DIR}/vite.log"
API_PID=""
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
  if [[ -n "${API_PID}" ]]; then
    kill_tree "${API_PID}"
    wait "${API_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "== Phase 4C.2.3 signing acceptance gate =="
echo "result_dir=${RESULT_DIR}"
echo ""
echo "---- API-boundary acceptance (production TestClient handlers) ----"
"$PY" -m pytest -q --tb=short backend/tests/test_phase4c23_signing_acceptance.py
echo ""
echo "---- Named 4C.2.3 evidence / contract proofs ----"
"$PY" -m pytest -q --tb=short backend/tests/test_phase4c23_recipient_completion_truth.py
(cd frontend && "$VITEST" run \
  src/launch/phase4c23RecipientCompletionTruthCoverage.test.ts \
  src/vs01/vs01SignerCompletionSync.test.ts \
  --reporter=dot)
echo ""
echo "---- Isolated local API (${API_URL}) ----"
(
  export CLAW_ENVIRONMENT=test
  export CLAW_COMMERCIAL_MODE=1
  export CLAW_USAGE_ECONOMICS_ENABLED=0
  export CLAW_DATA_DIR="${DATA_DIR}"
  export CLAW_BLOB_ROOT="${DATA_DIR}/blobs"
  export CLAW_DOCUMENTS_DIR="${DATA_DIR}/documents"
  export CLAW_RECEIPTS_DIR="${DATA_DIR}/receipts"
  export CLAW_STORAGE_BACKEND=local
  export CLAW_ARTIFACT_REGISTRY_DB_PATH="${DATA_DIR}/registry.sqlite3"
  export CLAW_USAGE_ECONOMICS_DB_PATH="${DATA_DIR}/usage.sqlite3"
  export CLAW_ECONOMICS_DB_PATH="${DATA_DIR}/economics.sqlite3"
  export CLAW_ANON_SESSION_SECRET=phase4c23-live-anon-secret
  export CLAW_AGREEMENT_SIGNING_TOKEN_SECRET=phase4c23-live-signing-secret
  export CLAW_CORS_ALLOW_ORIGINS="${VITE_URL}"
  export CLAW_VS01_COMPLETION_LEDGER_PATH="${DATA_DIR}/vs01_completion_ledger.sqlite3"
  "$PY" -m uvicorn backend.main:app --host 127.0.0.1 --port "${API_PORT}" --log-level warning
) >"${API_LOG}" 2>&1 &
API_PID=$!
for _ in $(seq 1 60); do
  if curl -sf "${API_URL}/health" >/dev/null || curl -sf "${API_URL}/api/agreements/access/policy" >/dev/null; then
    break
  fi
  sleep 1
done
curl -sf "${API_URL}/api/agreements/access/policy" >/dev/null

echo "---- Vite (${VITE_URL}) pointing at live API ----"
(
  cd frontend
  export VITE_CLAW_SUPPRESS_API_BASE_LOG=1
  export VITE_CLAW_API_BASE="${API_URL}"
  export VITE_SUPABASE_URL="${API_URL}/__supabase"
  export VITE_SUPABASE_ANON_KEY=phase4c23-live-anon-key
  export VITE_CLAW_FEATURE_SUPABASE_AUTH=1
  npm run dev -- --host 127.0.0.1 --port "${VITE_PORT}"
) >"${VITE_LOG}" 2>&1 &
VITE_PID=$!
for _ in $(seq 1 60); do
  if curl -sf "${VITE_URL}" >/dev/null; then
    break
  fi
  sleep 1
done
curl -sf "${VITE_URL}" >/dev/null

export PHASE4C23_LIVE_API="${API_URL}"
export PHASE4C23_LIVE_ORIGIN="${VITE_URL}"
export PHASE4C23_LIVE_OUTPUT="${RESULT_DIR}/playwright"
echo ""
echo "---- Live browser acceptance (production handlers, isolated storage) ----"
(cd frontend && "$PLAYWRIGHT" test --config playwright.phase4c23-live.config.ts --workers=1 --retries=0 --reporter=line)
echo ""
echo "== Phase 4C.2.3 signing acceptance gate: PASS =="
echo "result_dir=${RESULT_DIR}"
