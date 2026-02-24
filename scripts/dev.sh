#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

PORT="${PORT:-8000}"
FALLBACK_PORT="${FALLBACK_PORT:-8001}"

if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  PORT="${FALLBACK_PORT}"
fi

export VITE_API_BASE="http://127.0.0.1:${PORT}"

echo "Backend: http://127.0.0.1:${PORT}"
echo "Frontend: http://127.0.0.1:5173"

trap 'kill $(jobs -p) 2>/dev/null || true' EXIT

PORT="${PORT}" bash scripts/dev_backend.sh &
cd frontend && npm run dev &

wait
