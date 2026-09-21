#!/usr/bin/env bash
# Phase 1 focused access-contract gate — 96 route/auth/owner-data/session tests.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Phase 1 access-contract focused gate =="
(cd frontend && npx vitest run --config vitest.phase1AccessContract.runner.config.ts --reporter=dot)
echo ""
echo "== Phase 1 access-contract focused gate: PASS =="
