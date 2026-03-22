import subprocess
import sys
from pathlib import Path

import pytest

from backend.services import attestation_service

pytestmark = pytest.mark.e2e


def _flip_byte(path: Path) -> bytes:
    data = path.read_bytes()
    if not data:
        raise AssertionError(f"empty file: {path.name}")
    b = bytearray(data)
    b[0] ^= 0x01
    path.write_bytes(bytes(b))
    return data


def test_attestation_e2e(tmp_path: Path) -> None:
    payload = {
        "statement": "I attest to the facts stated in this record.",
        "subject_id": "subject_demo",
    }
    signer = {"id": "signer_demo", "name": "Demo Signer"}
    att = attestation_service.create_attestation(
        "esign", payload, signer, "2026-01-01T00:00:00Z"
    )
    att = attestation_service.sign_attestation(
        att, signer_id="signer_demo", signed_at="2026-01-01T00:00:00Z"
    )
    att = attestation_service.freeze_attestation(att, "2026-01-02T00:00:00Z")

    out_dir = tmp_path / "repro"
    attestation_service.export_attestation_repro(
        out_dir=out_dir,
        attestation=att,
        created_at="2026-01-01T00:00:00Z",
        event_time="2026-01-01T00:00:00Z",
        frozen_at="2026-01-02T00:00:00Z",
        issued_at="2026-01-02T00:00:00Z",
        anchor_network="bitcoin-testnet",
        epoch_id="epoch-demo",
        verify_md_path=Path(__file__).resolve().parents[2] / "docs" / "VERIFY.md",
    )

    ok = subprocess.run(
        [sys.executable, str(out_dir / "verify.py")],
        cwd=str(out_dir),
        capture_output=True,
        text=True,
    )
    assert ok.returncode == 0, ok.stderr
    assert "PASS" in ok.stdout

    tamper_path = out_dir / "attestation.json"
    original = _flip_byte(tamper_path)
    try:
        bad = subprocess.run(
            [sys.executable, str(out_dir / "verify.py")],
            cwd=str(out_dir),
            capture_output=True,
            text=True,
        )
        assert bad.returncode != 0
    finally:
        tamper_path.write_bytes(original)
