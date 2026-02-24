import hashlib
import subprocess
import sys
from pathlib import Path

from backend.services import attestation_service
from backend.services import evidence_envelope_service
from backend.services import workflow_service


def _flip_byte(path: Path) -> bytes:
    data = path.read_bytes()
    if not data:
        raise AssertionError(f"empty file: {path.name}")
    b = bytearray(data)
    b[0] ^= 0x01
    path.write_bytes(bytes(b))
    return data


def test_evidence_envelope_e2e(tmp_path: Path) -> None:
    esign = attestation_service.create_attestation(
        "esign",
        {"statement": "I attest to the facts stated in this record.", "subject_id": "s1"},
        {"id": "signer_demo", "name": "Demo Signer"},
        "2026-01-01T00:00:00Z",
    )
    liability = attestation_service.create_attestation(
        "liability",
        {"subject_id": "s2", "role": "operator", "capacity": "individual"},
        {"id": "signer_demo", "name": "Demo Signer"},
        "2026-01-01T00:00:00Z",
    )

    att_dir = tmp_path / "atts"
    att_dir.mkdir(parents=True, exist_ok=True)
    esign_path = att_dir / "esign.json"
    liability_path = att_dir / "liability.json"
    esign_path.write_text(
        json_dumps(esign),
        encoding="utf-8",
    )
    liability_path.write_text(
        json_dumps(liability),
        encoding="utf-8",
    )

    esign_sha = hashlib.sha256(esign_path.read_bytes()).hexdigest()
    liability_sha = hashlib.sha256(liability_path.read_bytes()).hexdigest()

    timeline = workflow_service.create_timeline(
        timeline_id="tl_env_001",
        title="Evidence Envelope Timeline",
        network="testnet",
        created_at="2026-01-01T00:00:00Z",
        parties=[],
    )
    timeline = workflow_service.append_event(
        timeline=timeline,
        event_type="notice",
        event_time="2026-01-01T00:00:00Z",
        notice={"text": "Envelope created"},
        marker=None,
        references=[
            {"path": "esign.json", "sha256": esign_sha, "type": "esign"},
            {"path": "liability.json", "sha256": liability_sha, "type": "liability"},
        ],
    )
    timeline = workflow_service.freeze_timeline(
        timeline=timeline, frozen_at="2026-01-02T00:00:00Z"
    )
    receipt = workflow_service.create_receipt(
        timeline_id=timeline["timeline_id"],
        frozen_manifest_sha256=timeline["frozen_manifest_sha256"],
        anchor_network="bitcoin-testnet",
        epoch_id="epoch-demo",
        issued_at="2026-01-02T00:00:00Z",
        btc_txid="pending",
    )

    envelope = evidence_envelope_service.compose_envelope(
        timeline_id=timeline["timeline_id"],
        frozen_manifest_sha256=timeline["frozen_manifest_sha256"],
        attestations=[
            {"path": "esign.json", "sha256": esign_sha, "type": "esign"},
            {"path": "liability.json", "sha256": liability_sha, "type": "liability"},
        ],
        agreement_ref=None,
        created_at="2026-01-02T00:00:00Z",
    )

    out_dir = tmp_path / "repro"
    evidence_envelope_service.export_envelope_repro(
        out_dir=out_dir,
        envelope=envelope,
        timeline=timeline,
        receipt=receipt,
        attestation_paths=[esign_path, liability_path],
        created_at="2026-01-02T00:00:00Z",
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

    tamper_path = out_dir / "evidence_envelope.json"
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


def json_dumps(obj):
    import json

    return json.dumps(obj, indent=2, sort_keys=True)
