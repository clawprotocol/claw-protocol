from __future__ import annotations

import json
import os
import subprocess
import sys
import zipfile
from pathlib import Path


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


def test_first_adjudication_export_zip(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[2]
    out_dir = tmp_path / "first_adjudication"
    env = {**os.environ, "CLAW_OUT_DIR": str(out_dir)}

    _run([sys.executable, "-m", "backend.scripts.demo_first_adjudication"], cwd=repo_root, env=env)
    _run([sys.executable, "-m", "backend.scripts.export_first_adjudication_pack"], cwd=repo_root, env=env)

    zips = list(out_dir.parent.glob("claw_first_adjudication_pack_*.zip"))
    assert zips, "export zip not found"
    zip_path = zips[0]

    with zipfile.ZipFile(zip_path, "r") as zf:
        names = set(zf.namelist())
    assert "VERIFY.md" in names
    assert "pack.json" in names or "pack_manifest.json" in names

    pack = json.loads((out_dir / "pack.json").read_text(encoding="utf-8"))
    utilities = pack.get("utilities") or {}
    for key in ("timeline", "e_sign", "personal_liability", "agreements"):
        assert key in utilities
