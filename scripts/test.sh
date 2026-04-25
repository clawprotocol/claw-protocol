#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

run_pytest() {
  if uv run pytest -q; then
    return 0
  fi
  echo "uv failed. Falling back to python -m pytest."
  if [[ -x "${ROOT_DIR}/.venv/bin/python" ]]; then
    "${ROOT_DIR}/.venv/bin/python" -m pytest -q
  else
    python3 -m pytest -q
  fi
}

echo "Running tests with pytest..."
run_pytest

if [[ -f frontend/package.json ]]; then
  echo "Running frontend vitest..."
  npm --prefix frontend test
fi
