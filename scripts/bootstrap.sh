#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "Bootstrapping CLAW dev environment..."

if command -v uv >/dev/null 2>&1; then
  echo "uv detected. Syncing dependencies..."
  if uv sync; then
    echo "uv sync complete."
    exit 0
  else
    echo "uv sync failed; falling back to venv + pip."
  fi
else
  echo "uv not found; falling back to venv + pip."
fi

VENV_DIR="${ROOT_DIR}/.venv"
python3 -m venv "${VENV_DIR}"
VENV_PY="${VENV_DIR}/bin/python"
${VENV_PY} -m pip install --upgrade pip
${VENV_PY} -m pip install -e .[dev]

echo "Bootstrap complete (venv)."
