import io
import zipfile
from pathlib import Path

from backend.services import bundle_service, liability_service, workflow_service


def _liability_inputs(include_public: bool, include_private: bool):
    return {
        "attestable_facts": {"freeform_text": "I operated the system."},
        "public_legal_context": {
            "freeform_text": "Educational reference only.",
            "citations": ["ref-1", "ref-2"],
        },
        "inclusion": {
            "include_public_legal_context_in_bundle": include_public,
            "include_private_notes_in_bundle": include_private,
        },
        "private_notes": "Private notes.",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
        "author": {"name": "Author", "role": "Declarant"},
    }


def test_liability_packet_determinism() -> None:
    a = liability_service.create_or_update_packet(**_liability_inputs(False, False))
    b = liability_service.create_or_update_packet(**_liability_inputs(False, False))
    assert a["packet_sha256"] == b["packet_sha256"]


def test_liability_inclusion_rules() -> None:
    draft = liability_service.create_or_update_packet(**_liability_inputs(False, False))
    att = liability_service.finalize_packet(
        packet=draft["packet"], finalized_at="2026-01-01T00:00:00Z"
    )
    payload = att["payload"]
    assert "public_legal_context" not in payload
    assert "private_notes" not in payload

    draft2 = liability_service.create_or_update_packet(**_liability_inputs(True, True))
    att2 = liability_service.finalize_packet(
        packet=draft2["packet"], finalized_at="2026-01-01T00:00:00Z"
    )
    payload2 = att2["payload"]
    assert "public_legal_context" in payload2
    assert "private_notes" in payload2


def _tamper_zip_bytes(zip_bytes: bytes, tmp_path: Path) -> bytes:
    zpath = tmp_path / "bundle.zip"
    out_dir = tmp_path / "bundle"
    out_dir.mkdir(parents=True, exist_ok=True)
    zpath.write_bytes(zip_bytes)
    with zipfile.ZipFile(zpath, "r") as zf:
        zf.extractall(out_dir)
    tamper_target = out_dir / "evidence" / "timeline.json"
    data = tamper_target.read_bytes()
    tamper_target.write_bytes(data[:-1] + bytes([data[-1] ^ 0x01]))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(out_dir.rglob("*")):
            if path.is_file():
                rel = path.relative_to(out_dir).as_posix()
                zf.write(path, rel)
    return buf.getvalue()


def test_liability_bundle_verify_and_tamper(tmp_path: Path) -> None:
    draft = liability_service.create_or_update_packet(**_liability_inputs(True, False))
    att = liability_service.finalize_packet(
        packet=draft["packet"], finalized_at="2026-01-01T00:00:00Z"
    )
    timeline = workflow_service.create_timeline(
        timeline_id="tl_liability_demo",
        title="Liability Demo",
        network="testnet",
        created_at="2026-01-01T00:00:00Z",
        parties=[],
    )
    timeline = workflow_service.append_event(
        timeline=timeline,
        event_type="notice",
        event_time="2026-01-01T00:00:00Z",
        notice={"text": "Liability demo"},
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
    zip_bytes = bundle_service.export_bundle_zip(
        created_at="2026-01-01T00:00:00Z",
        timeline=timeline,
        receipt=receipt,
        attestations=[att],
        agreement=None,
        analysis=None,
        note="demo",
    )
    report = bundle_service.verify_bundle_zip(zip_bytes)
    assert report["ok"] is True

    bad_bytes = _tamper_zip_bytes(zip_bytes, tmp_path)
    bad = bundle_service.verify_bundle_zip(bad_bytes)
    assert bad["ok"] is False
