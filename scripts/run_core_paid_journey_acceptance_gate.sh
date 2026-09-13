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
      frontend/src/launch/corePaidJourneyAcceptanceCoverage.ts \
      frontend/e2e/core-paid-journey-live/corePaidJourneyAcceptance.live.spec.ts \
      frontend/e2e/core-paid-journey-live/corePaidJourneyRowPersist.ts \
      frontend/playwright.core-paid-journey-live.config.ts \
      frontend/src/agreement/agreementWorkspaceApi.ts \
      frontend/src/agreement/agreementDraftNormalize.ts \
      frontend/src/launch/simpleProduct/OwnerProposalReviewPage.tsx \
      frontend/src/launch/ownerSignedAgreementView.ts \
      frontend/src/launch/simpleProduct/OwnerSignedAgreementPage.tsx \
      frontend/src/agreement/pendingSignatureDerive.ts \
      frontend/src/components/agreements/paidProSignatureConfirmationAuthority.ts \
      frontend/src/components/agreements/paidProStickyCta.ts \
      frontend/src/agreement/recipientReviewAuthorityMeta.ts \
      frontend/src/agreement/recipientSigningLockedVersion.ts \
      frontend/src/agreement/AgreementRecipientReview.tsx \
      backend/services/accepted_review_snapshot.py \
      backend/services/recipient_draft_projection.py \
      backend/proof/agreement_receipt.py \
      backend/routers/agreements_v2_api.py \
      frontend/src/components/agreements/paidProOpeningRecitalGuard.ts \
      frontend/src/components/agreements/paidProAcceptedCorpusPartyRoles.ts \
      frontend/src/components/agreements/paidProReviewRenderCorpus.ts \
      frontend/src/components/agreements/paidProExecutionBlockNormalization.ts \
      frontend/src/launch/corePaidJourneyAcceptanceFixtures.ts \
      frontend/src/launch/simpleProduct/paidProPostRecipientSetupHandoff.ts \
      frontend/src/launch/simpleProduct/paidProDirectSigningLockAndInvite.ts \
      frontend/src/components/agreements/AgreementBuilderIntake.tsx \
      frontend/src/launch/simpleProduct/premiumSenderFirstSigningRoute.ts \
      frontend/src/launch/simpleProduct/reviewFirstDisplayCorpus.ts \
      frontend/src/launch/simpleProduct/reviewReadyHydratedDisplayCorpus.ts \
      frontend/src/agreement/reviewFirstDocumentDisplay.ts \
      frontend/src/components/agreements/paidProDeclaredConsultantClientPaper.ts \
      frontend/src/components/agreements/paidProAgreementRecitalRepair.ts \
      frontend/src/components/agreements/paidProOpeningRoleLabelConsistency.ts \
      frontend/src/components/agreements/canonicalPartyIdentityResolver.ts \
      frontend/e2e/core-paid-journey-live/corePaidJourneyLiveAuth.ts \
      backend/tests/test_core_paid_journey_acceptance.py \
      backend/llm_acceptance_stub.py \
      backend/llm_router.py \
      backend/security/ai_airlock.py \
      backend/security/redaction.py \
      backend/security/agreement_identity.py \
      backend/agreements/premium_agreement_validation.py \
      backend/tests/test_live_drafting_output_boundary.py \
      backend/quality_eval_budget.py \
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
RUN_LABEL="${CORE_PAID_JOURNEY_RUN_LABEL:-run}"
RUN_STAMP="$(date -u +%Y%m%dT%H%M%SZ)-$$"
RESULT_DIR="${ROOT}/evals/commercial-readiness/results/core-paid-journey-acceptance/${COMMIT}-src-${CONTENT_FP:0:12}-${CONFIG}-${RUN_LABEL}-${RUN_STAMP}"
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
echo "run_stamp: ${RUN_STAMP}"
echo "result_dir=${RESULT_DIR}"
echo "model_label: acceptance-stub"
echo "live_model: not_run"
echo ""

"$PY" - <<PY
import json, subprocess
from pathlib import Path
root = Path(r"""${RESULT_DIR}""")
root.mkdir(parents=True, exist_ok=True)
identity = {
  "git_head": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
  "git_head_short": subprocess.check_output(["git", "rev-parse", "--short=12", "HEAD"], text=True).strip(),
  "source_content_fingerprint": "${CONTENT_FP}",
  "run_stamp": "${RUN_STAMP}",
  "tested_source_identity": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() + "+src-${CONTENT_FP}+run-${RUN_STAMP}",
  "model_label": "acceptance-stub",
  "live_model": "not_run",
  "live_model_quality": "unproven_approval_only",
}
(root / "source-identity.json").write_text(json.dumps(identity, indent=2) + "\n")
print("tested_source_identity=" + identity["tested_source_identity"])
PY

echo "---- Matrix / coverage contracts ----"
(cd frontend && "$VITEST" run src/launch/corePaidJourneyAcceptanceCoverage.test.ts src/launch/corePaidJourneyAcceptanceMatrix.test.ts src/agreement/recipientReviewAuthorityMeta.test.ts src/agreement/recipientSigningLockedVersion.test.ts --reporter=dot)
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
export CORE_PAID_JOURNEY_RESULT_DIR="${RESULT_DIR}"
export CORE_PAID_JOURNEY_ROW_RESULTS="${RESULT_DIR}/matrix-rows.json"
echo ""
echo "---- Live browser acceptance (desktop + mobile) ----"
PW_EXTRA=()
if [[ -n "${CORE_PAID_JOURNEY_PLAYWRIGHT_GREP:-}" ]]; then
  PW_EXTRA+=(--grep "${CORE_PAID_JOURNEY_PLAYWRIGHT_GREP}")
fi
if [[ -n "${CORE_PAID_JOURNEY_PLAYWRIGHT_PROJECT:-}" ]]; then
  PW_EXTRA+=(--project "${CORE_PAID_JOURNEY_PLAYWRIGHT_PROJECT}")
fi
set +e
(cd frontend && "$PLAYWRIGHT" test --config playwright.core-paid-journey-live.config.ts --workers=1 --retries=0 --reporter=line ${PW_EXTRA[@]+"${PW_EXTRA[@]}"})
PW_RC=$?
set -e
echo "playwright_exit=${PW_RC}"
echo "matrix_rows=${CORE_PAID_JOURNEY_ROW_RESULTS}"
GATE_BLOCKED=0
MATRIX_JSON="${CORE_PAID_JOURNEY_ROW_RESULTS}" "$PY" - <<'PY' || GATE_BLOCKED=$?
import json, os, sys
from pathlib import Path
p = Path(os.environ["MATRIX_JSON"])
if not p.exists():
    print("matrix_aggregate=missing")
    sys.exit(2)
d = json.loads(p.read_text())
missing = d.get("missing") or []
failed = d.get("failed") or []
blocked = d.get("blocked") or []
unknown = d.get("unknown") or []
viewport_incomplete = d.get("viewport_incomplete") or []
print(f"matrix_missing_rows={len(missing)}")
print(f"matrix_failed_rows={len(failed)}")
print(f"matrix_blocked_rows={len(blocked)}")
print(f"matrix_unknown_rows={len(unknown)}")
print(f"matrix_viewport_incomplete={len(viewport_incomplete)}")
print("gate_green=" + str(bool(d.get("gate_green"))))
if missing or failed or blocked or unknown or viewport_incomplete or not d.get("gate_green"):
    sys.exit(1)
PY
echo "== Core Paid Journey acceptance gate finished =="
echo "result_dir=${RESULT_DIR}"
if [[ "${PW_RC}" != "0" || "${GATE_BLOCKED}" != "0" ]]; then
  exit 1
fi
exit 0
