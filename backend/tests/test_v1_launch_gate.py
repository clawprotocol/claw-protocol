import os
import subprocess
import sys
from pathlib import Path


def _run_verify(bundle_dir: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(bundle_dir / "verify.py")],
        cwd=str(bundle_dir),
        capture_output=True,
        text=True,
    )


def _flip_byte(path: Path) -> bytes:
    data = path.read_bytes()
    if not data:
        raise AssertionError(f"empty file: {path.name}")
    b = bytearray(data)
    b[0] ^= 0x01
    path.write_bytes(bytes(b))
    return data


def test_v1_launch_gate(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[2]
    script = repo_root / "backend" / "scripts" / "build_v1_repro_bundle.py"
    bundle_dir = tmp_path / "bundle"

    env = os.environ.copy()
    env["CLAW_OUT_DIR"] = str(bundle_dir)

    result = subprocess.run(
        [sys.executable, str(script)],
        capture_output=True,
        text=True,
        env=env,
        cwd=str(repo_root),
        check=False,
    )
    assert result.returncode == 0, result.stderr

    ok = _run_verify(bundle_dir)
    assert ok.returncode == 0, ok.stderr
    assert "PASS" in ok.stdout

    targets = [
        "pack.json",
        "sample_timeline.json",
        "sample_receipt.json",
        "esign_attestation.json",
        "personal_liability_attestation.json",
        "agreement_ref.json",
        "verify.py",
        "VERIFY.md",
    ]

    for name in targets:
        path = bundle_dir / name
        original = _flip_byte(path)
        try:
            mutated = _run_verify(bundle_dir)
            assert mutated.returncode != 0, f"expected FAIL after tamper: {name}"
        finally:
            path.write_bytes(original)
