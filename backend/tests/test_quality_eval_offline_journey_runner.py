"""The offline journey flag is a no-spend runner mode, not a live authorization."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "run_quality_eval_local.py"


def test_offline_journey_help_and_conflicts() -> None:
    help_text = subprocess.check_output([sys.executable, str(SCRIPT), "--help"], text=True)
    assert "--offline-journey" in help_text
    assert "--offline-journey-evidence" in help_text
    assert "--filled-only" in help_text
    assert "--increment-policy" in help_text
    assert "--authorize-increment" in help_text
    assert "--live" in help_text
    conflict = subprocess.run(
        [sys.executable, str(SCRIPT), "--offline-journey", "--live"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert conflict.returncode != 0
    assert "offline_journey_is_no_spend_only" in (conflict.stderr + conflict.stdout)


def test_live_requires_matching_preflight_and_offline_journey(tmp_path: Path) -> None:
    missing = subprocess.run(
        [sys.executable, str(SCRIPT), "--live", "--preflight", str(tmp_path / "missing")],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert missing.returncode != 0
    preflight = tmp_path / "preflight"
    preflight.mkdir()
    (preflight / "status.json").write_text('{"status":"PASS"}\n')
    (preflight / "identity.json").write_text('{"source_files_sha256":{}}\n')
    no_offline = subprocess.run(
        [sys.executable, str(SCRIPT), "--live", "--preflight", str(preflight)],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert no_offline.returncode != 0
    combined = no_offline.stderr + no_offline.stdout
    assert "matching_offline_journey_evidence_required" in combined or "source_changed_since_preflight" in combined
