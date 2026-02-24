#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "Running tests with uv (preferred)..."
if uv run pytest -q; then
  exit 0
fi

echo "uv failed. Falling back to python -m pytest."

if [[ -x "${ROOT_DIR}/.venv/bin/python" ]]; then
  "${ROOT_DIR}/.venv/bin/python" -m pytest -q
else
  python3 -m pytest -q
fi
