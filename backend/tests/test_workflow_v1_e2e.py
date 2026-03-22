import subprocess
import sys
from pathlib import Path

import pytest

from backend.services import workflow_service

pytestmark = pytest.mark.e2e


def _flip_byte(path: Path) -> bytes:
    data = path.read_bytes()
    if not data:
        raise AssertionError(f"empty file: {path.name}")
    b = bytearray(data)
    b[0] ^= 0x01
    path.write_bytes(bytes(b))
    return data


def _build_bundle(out_dir: Path) -> Path:
    timeline = workflow_service.create_timeline(
        timeline_id="tl_demo_001",
        title="Workflow Demo",
        network="testnet",
        created_at="2026-01-01T00:00:00Z",
        parties=[],
    )
    timeline = workflow_service.append_event(
        timeline=timeline,
        event_type="notice",
        event_time="2026-01-01T00:00:00Z",
        notice={"text": "Notice: verify run"},
        marker=None,
    )
    timeline = workflow_service.freeze_timeline(
        timeline=timeline, frozen_at="2026-01-01T00:00:00Z"
    )
    receipt = workflow_service.create_receipt(
        timeline_id=timeline["timeline_id"],
        frozen_manifest_sha256=timeline["frozen_manifest_sha256"],
        anchor_network="bitcoin-testnet",
        epoch_id="epoch-demo",
        issued_at="2026-01-01T00:00:00Z",
        btc_txid="pending",
    )

    esign = workflow_service.create_attestation_esign(
        signer_id="signer_demo",
        signer_name="Demo Signer",
        statement="I attest to the facts stated in this record.",
        signed_at="2026-01-01T00:00:00Z",
    )
    liability = workflow_service.create_attestation_liability(
        subject_id="subject_demo",
        role="operator",
        capacity="individual",
        control_asserted=True,
        access_asserted=True,
        valid_from="2026-01-01T00:00:00Z",
        valid_to="2027-01-01T00:00:00Z",
        exclusions=["No authority to bind third parties"],
    )
    agreement = workflow_service.create_agreement(
        title="Agreement Demo",
        parties=[],
        content="Demo agreement text.",
        created_at="2026-01-01T00:00:00Z",
    )
    dispute = workflow_service.build_dispute_packet(
        claims=["Example claim"],
        references=[],
        timelines=[],
        created_at="2026-01-01T00:00:00Z",
    )

    verify_md = Path(__file__).resolve().parents[2] / "docs" / "VERIFY.md"
    workflow_service.export_bundle(
        out_dir=out_dir,
        timeline=timeline,
        receipt=receipt,
        esign_attestation=esign,
        liability_attestation=liability,
        agreement=agreement,
        dispute_packet=dispute,
        verify_md_path=verify_md,
        created_at="2026-01-01T00:00:00Z",
    )
    return out_dir / "pack.json"


def test_workflow_v1_bundle_verification(tmp_path: Path) -> None:
    out_a = tmp_path / "bundle_a"
    out_b = tmp_path / "bundle_b"
    pack_a = _build_bundle(out_a)
    pack_b = _build_bundle(out_b)

    pack_hash_a = pack_a.read_text(encoding="utf-8")
    pack_hash_b = pack_b.read_text(encoding="utf-8")
    assert pack_hash_a == pack_hash_b

    ok = subprocess.run(
        [sys.executable, str(out_a / "verify.py")],
        cwd=str(out_a),
        capture_output=True,
        text=True,
    )
    assert ok.returncode == 0, ok.stderr
    assert "PASS" in ok.stdout

    tamper_path = out_a / "agreement.json"
    original = _flip_byte(tamper_path)
    try:
        bad = subprocess.run(
            [sys.executable, str(out_a / "verify.py")],
            cwd=str(out_a),
            capture_output=True,
            text=True,
        )
        assert bad.returncode != 0
    finally:
        tamper_path.write_bytes(original)
