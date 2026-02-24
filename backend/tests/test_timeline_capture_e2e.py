import hashlib
import subprocess
import sys
from pathlib import Path
import pytest

from backend.services import workflow_service


def _flip_byte(path: Path) -> bytes:
    data = path.read_bytes()
    if not data:
        raise AssertionError(f"empty file: {path.name}")
    b = bytearray(data)
    b[0] ^= 0x01
    path.write_bytes(bytes(b))
    return data


def test_timeline_capture_e2e(tmp_path: Path) -> None:
    ref_dir = tmp_path / "refs"
    ref_dir.mkdir(parents=True, exist_ok=True)
    ref_path = ref_dir / "attestation_stub.json"
    ref_path.write_text('{"schema":"stub","ok":true}', encoding="utf-8")
    ref_sha = hashlib.sha256(ref_path.read_bytes()).hexdigest()

    timeline = workflow_service.create_timeline(
        timeline_id="tl_capture_001",
        title="Timeline Capture Demo",
        network="testnet",
        created_at="2026-01-01T00:00:00Z",
        parties=[],
    )
    timeline = workflow_service.append_event(
        timeline=timeline,
        event_type="notice",
        event_time="2026-01-01T00:00:00Z",
        notice={"text": "Event one"},
        marker=None,
        references=None,
    )
    timeline = workflow_service.append_event(
        timeline=timeline,
        event_type="notice",
        event_time="2026-01-02T00:00:00Z",
        notice={"text": "Event two"},
        marker=None,
        references=[
            {"path": "refs/attestation_stub.json", "sha256": ref_sha, "type": "attestation"}
        ],
    )
    timeline = workflow_service.append_event(
        timeline=timeline,
        event_type="notice",
        event_time="2026-01-03T00:00:00Z",
        notice={"text": "Event three"},
        marker=None,
        references=None,
    )
    timeline = workflow_service.freeze_timeline(
        timeline=timeline, frozen_at="2026-01-04T00:00:00Z"
    )
    with pytest.raises(ValueError, match="Timeline is frozen"):
        workflow_service.append_event(
            timeline=timeline,
            event_type="notice",
            event_time="2026-01-05T00:00:00Z",
            notice={"text": "Event four"},
            marker=None,
            references=None,
        )
    forked = workflow_service.create_timeline_version(
        frozen_timeline=timeline,
        created_at="2026-01-05T00:00:00Z",
        title="Timeline Capture Demo (v2)",
    )
    assert forked.get("frozen") is False
    assert forked.get("prev_frozen_manifest_sha256") == timeline.get("frozen_manifest_sha256")
    assert forked.get("forked_from_timeline_id") == timeline.get("timeline_id")
    receipt = workflow_service.create_receipt(
        timeline_id=timeline["timeline_id"],
        frozen_manifest_sha256=timeline["frozen_manifest_sha256"],
        anchor_network="bitcoin-testnet",
        epoch_id="epoch-demo",
        issued_at="2026-01-04T00:00:00Z",
        btc_txid="pending",
    )

    out_dir = tmp_path / "repro"
    workflow_service.export_timeline_repro_kit(
        out_dir=out_dir,
        timeline=timeline,
        receipt=receipt,
        created_at="2026-01-04T00:00:00Z",
        verify_md_path=Path(__file__).resolve().parents[2] / "docs" / "VERIFY.md",
        reference_base_dir=tmp_path,
    )

    ok = subprocess.run(
        [sys.executable, str(out_dir / "verify.py")],
        cwd=str(out_dir),
        capture_output=True,
        text=True,
    )
    assert ok.returncode == 0, ok.stderr
    assert "PASS" in ok.stdout

    tamper_path = out_dir / "sample_timeline.json"
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
