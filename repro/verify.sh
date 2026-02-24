#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

cd "$ROOT"

if ! command -v uv >/dev/null 2>&1; then
  echo "ERROR: uv is required but not found in PATH." >&2
  exit 1
fi

uv run python repro/verify.py
