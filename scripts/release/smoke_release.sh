#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
VERSION="v1.0.0"

echo "Running release build..."
bash "${ROOT_DIR}/scripts/release/build_release_artifacts.sh" >/dev/null

ZIP_PATH="$(ls -1 "${DIST_DIR}/claw-${VERSION}"/claw-"${VERSION}"-repro-bundle.zip 2>/dev/null || true)"
if [[ -z "${ZIP_PATH}" ]]; then
  echo "FAIL: repro kit zip not found in dist" >&2
  exit 1
fi

WORK_DIR="$(mktemp -d)"
unzip -q "${ZIP_PATH}" -d "${WORK_DIR}"

if [[ ! -f "${WORK_DIR}/verify.py" ]]; then
  echo "FAIL: verify.py not found in repro kit" >&2
  exit 1
fi

echo "Running verifier (expected PASS)..."
if (cd "${WORK_DIR}" && uv run --no-project python verify.py >/dev/null); then
  echo "PASS: verifier succeeded"
else
  echo "FAIL: verifier did not pass" >&2
  exit 1
fi

TAMPER_TARGET="${WORK_DIR}/sample_timeline.json"
if [[ ! -f "${TAMPER_TARGET}" ]]; then
  echo "FAIL: tamper target not found" >&2
  exit 1
fi

printf ' ' >> "${TAMPER_TARGET}"

echo "Running verifier after tamper (expected FAIL)..."
if (cd "${WORK_DIR}" && uv run --no-project python verify.py >/dev/null); then
  echo "FAIL: verifier passed after tamper" >&2
  exit 1
else
  echo "PASS: verifier failed after tamper"
fi

rm -rf "${WORK_DIR}"
echo "Release smoke test PASS"
