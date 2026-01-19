# backend/tests/test_verify_bundle.py
import json
from pathlib import Path

from clawctl.main import _verify_bundle_data


def test_verify_bundle_ok_from_vector():
    # repo_root = .../claw-bot
    repo_root = Path(__file__).resolve().parents[2]
    vectors = repo_root / "tests" / "vectors"

    timeline = json.loads((vectors / "demo.timeline.json").read_text(encoding="utf-8"))
    receipt = json.loads((vectors / "demo.receipt.json").read_text(encoding="utf-8"))

    result = _verify_bundle_data(timeline, receipt)
    assert result["ok"] is True
