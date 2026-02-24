#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

PORT="${PORT:-8000}"
FALLBACK_PORT="${FALLBACK_PORT:-8001}"
AUTO_KILL="${AUTO_KILL:-0}"

function port_in_use() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

function pid_for_port() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null || true
}

function cmd_for_pid() {
  ps -p "$1" -o command= 2>/dev/null || true
}

if port_in_use "${PORT}"; then
  PID="$(pid_for_port "${PORT}")"
  CMD="$(cmd_for_pid "${PID}")"
  echo "Port ${PORT} is in use."
  echo "PID: ${PID}"
  echo "CMD: ${CMD}"
  if [[ "${AUTO_KILL}" == "1" ]] && [[ "${CMD}" == *"uvicorn"* ]] && [[ "${CMD}" == *"backend.main:app"* ]]; then
    echo "AUTO_KILL=1 and uvicorn detected; terminating ${PID}."
    kill "${PID}"
  else
    echo "Using fallback port ${FALLBACK_PORT}."
    PORT="${FALLBACK_PORT}"
  fi
fi

PYTHON_BIN="python3"
if [[ -x "${ROOT_DIR}/.venv/bin/python" ]]; then
  PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
fi

echo "Starting backend on http://127.0.0.1:${PORT}"
exec "${PYTHON_BIN}" -m uvicorn backend.main:app --host 127.0.0.1 --port "${PORT}"
