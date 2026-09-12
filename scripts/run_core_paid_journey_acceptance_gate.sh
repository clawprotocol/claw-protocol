#!/usr/bin/env bash
# Core Paid Journey acceptance — production handlers + live local backend.
# Isolated CLAW_DATA_DIR. Model boundary is the test-only acceptance stub.
# Does not prove live model quality, live email, Stripe, or staging.
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
CONTENT_FP="$(
  {
    for f in \
      frontend/src/launch/corePaidJourneyAcceptanceMatrix.ts \
      frontend/e2e/core-paid-journey-live/corePaidJourneyAcceptance.live.spec.ts \
      backend/llm_acceptance_stub.py \
      backend/llm_router.py \
      backend/jwt_acceptance_jwks.py \
      scripts/run_core_paid_journey_acceptance_gate.sh
    do
      if [[ -f "$ROOT/$f" ]]; then
        printf '%s ' "$f"
        git hash-object "$ROOT/$f"
      fi
    done
  } | git hash-object --stdin
)"
CONFIG="live-4188-4189-stub-model"
RESULT_DIR="${ROOT}/evals/commercial-readiness/results/core-paid-journey-acceptance/${COMMIT}-src-${CONTENT_FP:0:12}-${CONFIG}"
mkdir -p "${RESULT_DIR}"
DATA_DIR="${RESULT_DIR}/claw-data"
mkdir -p "${DATA_DIR}"

API_PORT=4188
VITE_PORT=4189
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

echo "== Core Paid Journey acceptance gate =="
echo "sha: $(git rev-parse HEAD)"
echo "source_content_fingerprint: ${CONTENT_FP}"
echo "result_dir=${RESULT_DIR}"
echo "model_label: acceptance-stub"
echo "live_model: not_run"
echo ""

echo "---- Matrix / coverage contracts ----"
(cd frontend && "$VITEST" run src/launch/corePaidJourneyAcceptanceCoverage.test.ts --reporter=dot)
echo ""

echo "---- Isolated local API (${API_URL}) ----"
export CLAW_ENVIRONMENT=test
export CLAW_COMMERCIAL_MODE=1
export CLAW_USAGE_ECONOMICS_ENABLED=1
export CLAW_DATA_DIR="${DATA_DIR}"
export CLAW_BLOB_ROOT="${DATA_DIR}/blobs"
export CLAW_DOCUMENTS_DIR="${DATA_DIR}/documents"
export CLAW_RECEIPTS_DIR="${DATA_DIR}/receipts"
export CLAW_STORAGE_BACKEND=local
export CLAW_ARTIFACT_REGISTRY_DB_PATH="${DATA_DIR}/registry.sqlite3"
export CLAW_USAGE_ECONOMICS_DB_PATH="${DATA_DIR}/usage.sqlite3"
export CLAW_ECONOMICS_DB_PATH="${DATA_DIR}/economics.sqlite3"
export CLAW_ANON_SESSION_SECRET=core-paid-journey-anon-secret
export CLAW_AGREEMENT_SIGNING_TOKEN_SECRET=core-paid-journey-signing-secret
export CLAW_CORS_ALLOW_ORIGINS="${VITE_URL}"
export CLAW_VS01_COMPLETION_LEDGER_PATH="${DATA_DIR}/vs01_completion_ledger.sqlite3"
export CLAW_LLM_ACCEPTANCE_STUB=1
export SUPABASE_JWT_ISSUER=https://example.supabase.co/auth/v1
export SUPABASE_JWT_AUDIENCE=authenticated
export OPENAI_API_KEY=sk-acceptance-stub-not-live
export CORE_PAID_JOURNEY_OWNER_ID=core-paid-owner
export CORE_PAID_JOURNEY_ORG_ID=user-core-paid-owner
export CORE_PAID_JOURNEY_RUNTIME_JSON="${RESULT_DIR}/runtime.json"
export CORE_PAID_JOURNEY_JWKS_DIR="${RESULT_DIR}"
"$PY" "${ROOT}/scripts/seed_core_paid_journey_runtime.py"
export CLAW_JWT_ACCEPTANCE_JWKS_PATH="${RESULT_DIR}/acceptance-jwks.json"
(
  export CLAW_ENVIRONMENT=test
  export CLAW_COMMERCIAL_MODE=1
  export CLAW_USAGE_ECONOMICS_ENABLED=1
  export CLAW_DATA_DIR="${DATA_DIR}"
  export CLAW_BLOB_ROOT="${DATA_DIR}/blobs"
  export CLAW_DOCUMENTS_DIR="${DATA_DIR}/documents"
  export CLAW_RECEIPTS_DIR="${DATA_DIR}/receipts"
  export CLAW_STORAGE_BACKEND=local
  export CLAW_ARTIFACT_REGISTRY_DB_PATH="${DATA_DIR}/registry.sqlite3"
  export CLAW_USAGE_ECONOMICS_DB_PATH="${DATA_DIR}/usage.sqlite3"
  export CLAW_ECONOMICS_DB_PATH="${DATA_DIR}/economics.sqlite3"
  export CLAW_ANON_SESSION_SECRET=core-paid-journey-anon-secret
  export CLAW_AGREEMENT_SIGNING_TOKEN_SECRET=core-paid-journey-signing-secret
  export CLAW_CORS_ALLOW_ORIGINS="${VITE_URL}"
  export CLAW_VS01_COMPLETION_LEDGER_PATH="${DATA_DIR}/vs01_completion_ledger.sqlite3"
  export CLAW_LLM_ACCEPTANCE_STUB=1
  export CLAW_JWT_ACCEPTANCE_JWKS_PATH="${CLAW_JWT_ACCEPTANCE_JWKS_PATH}"
  export SUPABASE_JWT_ISSUER=https://example.supabase.co/auth/v1
  export SUPABASE_JWT_AUDIENCE=authenticated
  export OPENAI_API_KEY=sk-acceptance-stub-not-live
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
  export VITE_SUPABASE_ANON_KEY=core-paid-journey-anon-key
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

export CORE_PAID_JOURNEY_LIVE_API="${API_URL}"
export CORE_PAID_JOURNEY_LIVE_ORIGIN="${VITE_URL}"
export CORE_PAID_JOURNEY_LIVE_OUTPUT="${RESULT_DIR}/playwright"
export CORE_PAID_JOURNEY_ROW_RESULTS="${RESULT_DIR}/matrix-rows.json"
echo ""
echo "---- Live browser acceptance (desktop + mobile) ----"
set +e
(cd frontend && "$PLAYWRIGHT" test --config playwright.core-paid-journey-live.config.ts --workers=1 --retries=0 --reporter=line)
PW_RC=$?
set -e
echo "playwright_exit=${PW_RC}"
echo "matrix_rows=${CORE_PAID_JOURNEY_ROW_RESULTS}"
MATRIX_FAILED=0
if [[ -f "${CORE_PAID_JOURNEY_ROW_RESULTS}" ]]; then
  MATRIX_FAILED="$("$PY" -c 'import json,sys; d=json.load(open(sys.argv[1])); print(len(d.get("failed") or []))' "${CORE_PAID_JOURNEY_ROW_RESULTS}")"
  echo "matrix_failed_rows=${MATRIX_FAILED}"
fi
echo "== Core Paid Journey acceptance gate finished =="
echo "result_dir=${RESULT_DIR}"
if [[ "${PW_RC}" != "0" || "${MATRIX_FAILED}" != "0" ]]; then
  exit 1
fi
exit 0
