import hashlib
import os
from pathlib import Path

import pytest

from backend.services import attestation_service
from backend.services import bundle_service
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


def _build_inputs():
    timeline = workflow_service.create_timeline(
        timeline_id="tl_bundle_demo",
        title="Bundle Demo",
        network="testnet",
        created_at="2026-01-01T00:00:00Z",
        parties=[],
    )
    timeline = workflow_service.append_event(
        timeline=timeline,
        event_type="notice",
        event_time="2026-01-01T00:00:00Z",
        notice={"text": "Bundle event"},
        marker=None,
        references=None,
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
    return timeline, receipt, [esign, liability]


def _update_fixtures_enabled() -> bool:
    return os.getenv("CLAW_UPDATE_FIXTURES", "") == "1"


def _write_fixture(path: Path, data: bytes) -> None:
    print(f"WARNING: Updating fixture at {path}")
    path.write_bytes(data)


def test_bundle_export_verify_roundtrip(tmp_path: Path) -> None:
    timeline, receipt, atts = _build_inputs()
    zip_bytes = bundle_service.export_bundle_zip(
        created_at="2026-01-01T00:00:00Z",
        timeline=timeline,
        receipt=receipt,
        attestations=atts,
        agreement=None,
        analysis=None,
        note="demo",
    )
    report = bundle_service.verify_bundle_zip(zip_bytes)
    assert report["ok"] is True

    bundle_dir = tmp_path / "bundle"
    bundle_dir.mkdir(parents=True, exist_ok=True)
    (tmp_path / "bundle.zip").write_bytes(zip_bytes)
    import zipfile

    with zipfile.ZipFile(tmp_path / "bundle.zip", "r") as zf:
        assert "BUNDLE_CONTENTS.md" in zf.namelist()
        contents = zf.read("BUNDLE_CONTENTS.md").decode("utf-8")
        assert "notes_included: false" in contents
        zf.extractall(bundle_dir)

    tamper_path = bundle_dir / "evidence" / "timeline.json"
    original = _flip_byte(tamper_path)
    try:
        bad = bundle_service.verify_bundle_dir(bundle_dir)
        assert bad["ok"] is False
    finally:
        tamper_path.write_bytes(original)


def test_bundle_golden_fixture(tmp_path: Path) -> None:
    timeline, receipt, atts = _build_inputs()
    zip_bytes = bundle_service.export_bundle_zip(
        created_at="2026-01-01T00:00:00Z",
        timeline=timeline,
        receipt=receipt,
        attestations=atts,
        agreement=None,
        analysis=None,
        note="demo",
    )
    fixture = Path(__file__).resolve().parents[2] / "tests" / "vectors" / "bundle_v0_demo.zip"
    fixture.parent.mkdir(parents=True, exist_ok=True)
    if not fixture.exists():
        if _update_fixtures_enabled():
            _write_fixture(fixture, zip_bytes)
            return
        raise AssertionError(
            "Missing fixture bundle_v0_demo.zip. Set CLAW_UPDATE_FIXTURES=1 to create."
        )
    fixture_hash = hashlib.sha256(fixture.read_bytes()).hexdigest()
    new_hash = hashlib.sha256(zip_bytes).hexdigest()
    if fixture_hash != new_hash:
        if _update_fixtures_enabled():
            _write_fixture(fixture, zip_bytes)
            return
        raise AssertionError(
            f"Fixture hash mismatch. Expected {fixture_hash}, got {new_hash}. "
            "Set CLAW_UPDATE_FIXTURES=1 to update."
        )


def test_bundle_contents_notes_included(tmp_path: Path) -> None:
    timeline, receipt, atts = _build_inputs()
    atts[1]["structuring_notes"] = {"text": "Private notes"}
    zip_bytes = bundle_service.export_bundle_zip(
        created_at="2026-01-01T00:00:00Z",
        timeline=timeline,
        receipt=receipt,
        attestations=atts,
        agreement=None,
        analysis=None,
        note="demo",
    )
    (tmp_path / "bundle.zip").write_bytes(zip_bytes)
    import zipfile

    with zipfile.ZipFile(tmp_path / "bundle.zip", "r") as zf:
        contents = zf.read("BUNDLE_CONTENTS.md").decode("utf-8")
        assert "notes_included: true" in contents


def test_update_fixtures_flag(monkeypatch) -> None:
    monkeypatch.setenv("CLAW_UPDATE_FIXTURES", "1")
    assert _update_fixtures_enabled() is True
    monkeypatch.setenv("CLAW_UPDATE_FIXTURES", "0")
    assert _update_fixtures_enabled() is False
