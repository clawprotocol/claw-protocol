import io
import zipfile
from pathlib import Path

from backend.services import agreement_service, bundle_service, workflow_service


def _parties(order: int):
    base = [
        {"party_id": "party_a", "name": "Alice", "role": "party"},
        {"party_id": "party_b", "name": "Bob", "role": "party"},
    ]
    return base if order == 0 else list(reversed(base))


def test_agreement_determinism_and_diff():
    packet_a = agreement_service.create_agreement_packet(
        agreement_id=None,
        title="Agreement",
        parties=_parties(0),
        inclusion={"include_diffs_in_bundle": True, "include_private_notes_in_bundle": False},
        escrow_reference=None,
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
        analysis=None,
    )
    packet_b = agreement_service.create_agreement_packet(
        agreement_id=None,
        title="Agreement",
        parties=_parties(1),
        inclusion={"include_diffs_in_bundle": True, "include_private_notes_in_bundle": False},
        escrow_reference=None,
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
        analysis=None,
    )
    assert packet_a["agreement_id"] == packet_b["agreement_id"]

    v1_a = agreement_service.add_version(
        packet=packet_a,
        author_party_id="party_a",
        body_text="Line one\nLine two",
        created_at="2026-01-01T00:00:00Z",
        content_type="text/markdown",
        notes=None,
    )
    v1_b = agreement_service.add_version(
        packet=packet_b,
        author_party_id="party_a",
        body_text="Line one\nLine two",
        created_at="2026-01-01T00:00:00Z",
        content_type="text/markdown",
        notes=None,
    )
    assert v1_a["versions"][0]["version_id"] == v1_b["versions"][0]["version_id"]

    v2 = agreement_service.add_version(
        packet=v1_a,
        author_party_id="party_b",
        body_text="Line one\nLine two changed",
        created_at="2026-01-02T00:00:00Z",
        content_type="text/markdown",
        notes="private note",
    )
    assert v2["versions"][-1]["diff_from_prev"]


def test_finalize_inclusion_rules():
    packet = agreement_service.create_agreement_packet(
        agreement_id="ag_demo",
        title="Agreement",
        parties=_parties(0),
        inclusion={"include_diffs_in_bundle": False, "include_private_notes_in_bundle": False},
        escrow_reference=None,
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
        analysis=None,
    )
    packet = agreement_service.add_version(
        packet=packet,
        author_party_id="party_a",
        body_text="Body",
        created_at="2026-01-01T00:00:00Z",
        content_type="text/markdown",
        notes="private note",
    )
    att = agreement_service.finalize_agreement(packet=packet, finalized_at="2026-01-01T00:00:00Z")
    payload = att["payload"]
    v = payload["versions"][0]
    assert "diff_from_prev" not in v
    assert "notes" not in v


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


def test_agreement_bundle_verify_and_tamper(tmp_path: Path):
    packet = agreement_service.create_agreement_packet(
        agreement_id="ag_demo",
        title="Agreement",
        parties=_parties(0),
        inclusion={"include_diffs_in_bundle": True, "include_private_notes_in_bundle": False},
        escrow_reference=None,
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
        analysis=None,
    )
    packet = agreement_service.add_version(
        packet=packet,
        author_party_id="party_a",
        body_text="Body",
        created_at="2026-01-01T00:00:00Z",
        content_type="text/markdown",
        notes=None,
    )
    att = agreement_service.finalize_agreement(packet=packet, finalized_at="2026-01-01T00:00:00Z")

    timeline = workflow_service.create_timeline(
        timeline_id="tl_ag_demo",
        title="Agreement Demo",
        network="testnet",
        created_at="2026-01-01T00:00:00Z",
        parties=[],
    )
    timeline = workflow_service.append_event(
        timeline=timeline,
        event_type="notice",
        event_time="2026-01-01T00:00:00Z",
        notice={"text": "Agreement demo"},
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
        attestations=[],
        agreement=att,
        analysis=None,
        note="demo",
    )
    report = bundle_service.verify_bundle_zip(zip_bytes)
    assert report["ok"] is True

    bad_bytes = _tamper_zip_bytes(zip_bytes, tmp_path)
    bad = bundle_service.verify_bundle_zip(bad_bytes)
    assert bad["ok"] is False
