from pathlib import Path
import zipfile

from backend.services import bundle_service
from backend.services import workflow_service
from backend.utils.agreement_version_store import AgreementVersionStore


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
    return timeline, receipt


def test_bundle_includes_agreement_version_and_diff(tmp_path, monkeypatch):
    db_path = tmp_path / "agreements.sqlite3"
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(db_path))
    store = AgreementVersionStore()
    store.save_version(
        agreement_id="ag_demo",
        title="Demo Agreement",
        body_markdown="Line one\nLine two\n",
        created_at="2026-01-01T00:00:00Z",
        disclaimers=[],
        metadata=None,
    )
    store.save_version(
        agreement_id="ag_demo",
        title="Demo Agreement",
        body_markdown="Line one\nLine two changed\n",
        created_at="2026-01-02T00:00:00Z",
        disclaimers=[],
        metadata=None,
    )
    timeline, receipt = _build_inputs()
    zip_bytes = bundle_service.export_bundle_zip(
        created_at="2026-01-01T00:00:00Z",
        timeline=timeline,
        receipt=receipt,
        attestations=[],
        agreement=None,
        analysis=None,
        note="demo",
        agreement_id="ag_demo",
        agreement_version=2,
        agreement_diff={"from_version": 1, "to_version": 2},
    )
    zip_path = tmp_path / "bundle.zip"
    zip_path.write_bytes(zip_bytes)
    with zipfile.ZipFile(zip_path, "r") as zf:
        names = zf.namelist()
        assert "agreements/ag_demo/v2.md" in names
        assert "agreements/ag_demo/v2.json" in names
        assert "agreements/ag_demo/diff_v1_v2.patch" in names
        assert "agreements/ag_demo/diff_v1_v2.json" in names
