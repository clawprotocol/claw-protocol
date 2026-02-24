import os
import subprocess
import sys
import zipfile
from pathlib import Path


def _cli_cmd() -> list[str]:
    repo_root = Path(__file__).resolve().parents[2]
    bin_path = repo_root / ".venv" / "bin" / "clawctl"
    if bin_path.exists():
        return [str(bin_path)]
    return [sys.executable, "-m", "clawctl.main"]


def _fixture_zip() -> Path:
    return Path(__file__).resolve().parents[2] / "tests" / "vectors" / "bundle_v0_demo.zip"


def test_cli_verify_zip_ok(tmp_path: Path) -> None:
    fixture = _fixture_zip()
    assert fixture.exists(), "fixture bundle_v0_demo.zip missing"
    cmd = _cli_cmd() + ["verify", str(fixture), "--quiet"]
    repo = Path(__file__).resolve().parents[2]
    env = os.environ.copy()
    env["PYTHONPATH"] = str(repo)
    result = subprocess.run(cmd, cwd=str(repo), text=True, env=env)
    assert result.returncode == 0


def test_cli_verify_dir_fail(tmp_path: Path) -> None:
    fixture = _fixture_zip()
    assert fixture.exists(), "fixture bundle_v0_demo.zip missing"
    bundle_dir = tmp_path / "bundle"
    bundle_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(fixture, "r") as zf:
        zf.extractall(bundle_dir)
    target = bundle_dir / "evidence" / "timeline.json"
    data = target.read_bytes()
    b = bytearray(data)
    b[0] ^= 0x01
    target.write_bytes(bytes(b))
    cmd = _cli_cmd() + ["verify", str(bundle_dir), "--quiet"]
    repo = Path(__file__).resolve().parents[2]
    env = os.environ.copy()
    env["PYTHONPATH"] = str(repo)
    result = subprocess.run(cmd, cwd=str(repo), text=True, env=env)
    assert result.returncode == 1
