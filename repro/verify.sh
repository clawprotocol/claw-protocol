#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

cd "$ROOT"

uv run python - <<'PY'
import json
import sys
from pathlib import Path

timeline = json.loads(Path("repro/sample_timeline.json").read_text(encoding="utf-8"))
receipt  = json.loads(Path("repro/sample_receipt.json").read_text(encoding="utf-8"))

from clawctl.main import _verify_bundle_data  # matches backend/tests/test_verify_bundle.py

result = _verify_bundle_data(timeline, receipt)
print(json.dumps(result, indent=2, sort_keys=True))

if not bool(result.get("ok")):
    sys.exit(1)

print("OK: receipt verifies deterministically.")
PY
