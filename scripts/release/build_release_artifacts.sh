#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="v1.0.0"
DIST_DIR="${ROOT_DIR}/dist/claw-${VERSION}"

rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

TMP_BUNDLE_DIR="${DIST_DIR}/_bundle"
CLAW_OUT_DIR="${TMP_BUNDLE_DIR}" uv run python "${ROOT_DIR}/backend/scripts/build_v1_repro_bundle.py" >/dev/null

REPRO_ZIP="${DIST_DIR}/claw-${VERSION}-repro-bundle.zip"
pushd "${TMP_BUNDLE_DIR}" >/dev/null
uv run --no-project python -m zipfile -c "${REPRO_ZIP}" .
popd >/dev/null

CLI_ARTIFACT="${CLAW_CLI_ARTIFACT:-}"
if [[ -n "${CLI_ARTIFACT}" ]]; then
  if [[ ! -f "${CLI_ARTIFACT}" ]]; then
    echo "ERROR: CLI artifact not found: ${CLI_ARTIFACT}" >&2
    exit 1
  fi
  cp "${CLI_ARTIFACT}" "${DIST_DIR}/"
else
  if [[ -f "${ROOT_DIR}/dist/clawctl" ]]; then
    cp "${ROOT_DIR}/dist/clawctl" "${DIST_DIR}/"
  else
    echo "CLI artifact not present; omitted." >&2
  fi
fi

rm -rf "${TMP_BUNDLE_DIR}"

pushd "${DIST_DIR}" >/dev/null
shasum -a 256 * > SHA256SUMS.txt
popd >/dev/null

echo "${DIST_DIR}"
