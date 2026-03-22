# backend/tests/test_first_adjudication_verify.py
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.e2e


def _run(cmd: list[str], cwd: Path, env: dict | None = None) -> None:
    result = subprocess.run(
        cmd,
        cwd=str(cwd),
        env=env or {**os.environ},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if result.returncode != 0:
        raise AssertionError(
            "Command failed:\n"
            f"  cmd: {' '.join(cmd)}\n"
            f"  cwd: {cwd}\n"
            "---- output ----\n"
            f"{result.stdout}\n"
            "---- end output ----\n"
        )


def test_first_adjudication_demo_and_verify_roundtrip(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[2]
    out_dir = tmp_path / "first_adjudication"
    env = {**os.environ, "CLAW_OUT_DIR": str(out_dir)}

    # Run the demo generator (must be runnable as a module)
    _run([sys.executable, "-m", "backend.scripts.demo_first_adjudication"], cwd=repo_root, env=env)

    # Run the hostile verifier replay (must be runnable as a module)
    _run([sys.executable, "-m", "backend.scripts.verify_first_adjudication"], cwd=repo_root, env=env)


def test_first_adjudication_verify_detects_tamper(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[2]
    out_dir = tmp_path / "first_adjudication"
    env = {**os.environ, "CLAW_OUT_DIR": str(out_dir)}

    _run([sys.executable, "-m", "backend.scripts.demo_first_adjudication"], cwd=repo_root, env=env)

    # Tamper with an artifact
    esign_path = out_dir / "esign_attestation.json"
    data = json.loads(esign_path.read_text(encoding="utf-8"))
    data["signer_name"] = "Tampered"
    esign_path.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")

    result = subprocess.run(
        [sys.executable, "-m", "backend.scripts.verify_first_adjudication"],
        cwd=str(repo_root),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    assert result.returncode != 0