from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def _run(cmd: list[str], cwd: Path, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        cwd=str(cwd),
        env=env or {**os.environ},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )


def test_first_adjudication_repro_verify(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[2]
    out_dir = tmp_path / "first_adjudication"
    env = {**os.environ, "CLAW_OUT_DIR": str(out_dir)}

    r1 = _run([sys.executable, "-m", "backend.scripts.demo_first_adjudication"], cwd=repo_root, env=env)
    assert r1.returncode == 0, r1.stdout
    r2 = _run([sys.executable, "-m", "backend.scripts.export_first_adjudication_repro"], cwd=repo_root, env=env)
    assert r2.returncode == 0, r2.stdout

    repro_dir = out_dir / "repro"
    verify_py = repro_dir / "verify.py"
    r3 = _run([sys.executable, str(verify_py)], cwd=repro_dir, env=env)
    assert r3.returncode == 0, r3.stdout

    # Tamper an artifact and expect failure
    esign = repro_dir / "esign_attestation.json"
    esign.write_text(esign.read_text(encoding="utf-8").replace("Demo Signer", "Tampered"), encoding="utf-8")
    r4 = _run([sys.executable, str(verify_py)], cwd=repro_dir, env=env)
    assert r4.returncode != 0
