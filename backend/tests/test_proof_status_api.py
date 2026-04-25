"""Proof status service + API wiring (anchoring bridge, humane capabilities)."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.anchoring.batch_service import AdaptiveBatchAnchorService, compute_activity_mode
from backend.anchoring.store import AnchoringStore
from backend.proof_status.service import ProofStatusService
from backend.proof_status.store import ProofLayerStore
from backend.routers.proof_status_api import router as proof_status_router


@pytest.fixture()
def proof_layer_tmp(tmp_path: Path) -> ProofLayerStore:
    p = tmp_path / "proof_layer.sqlite3"
    os.environ["CLAW_PROOF_LAYER_DB_PATH"] = str(p)
    st = ProofLayerStore(str(p))
    st.init_schema()
    return st


@pytest.fixture()
def anchor_tmp(tmp_path: Path) -> AnchoringStore:
    p = tmp_path / "anchoring.sqlite3"
    os.environ["CLAW_ANCHORING_DB_PATH"] = str(p)
    st = AnchoringStore(str(p))
    st.init_schema()
    return st


def test_proof_status_receipt_ready(
    proof_layer_tmp: ProofLayerStore, anchor_tmp: AnchoringStore, monkeypatch: pytest.MonkeyPatch
) -> None:
    svc = ProofStatusService(layer_store=proof_layer_tmp, anchoring_store=anchor_tmp)
    caps = {
        "can_request_anchor_upgrade": True,
        "can_request_priority_anchor": False,
    }
    rec = {
        "receipt_id": "rcpt_test123",
        "receipt_hash_sha256": "a" * 64,
        "created_at": "2026-04-01T12:00:00Z",
    }

    from backend.services import receipt_service

    def fake_get(rid: str):
        return rec if rid == "rcpt_test123" else None

    monkeypatch.setattr(receipt_service, "get_receipt", fake_get)
    payload = svc.build_status_payload("receipt", "rcpt_test123", capabilities=caps)
    assert payload.verification_status == "ready"
    assert payload.receipt_id == "rcpt_test123"
    assert payload.anchor_status == "available"
    assert "/v1/receipts/rcpt_test123/bundle" in (payload.proof_export_url or "")


def test_upgrade_idempotent_appends_batch(
    proof_layer_tmp: ProofLayerStore, anchor_tmp: AnchoringStore, monkeypatch: pytest.MonkeyPatch
) -> None:
    rec = {
        "receipt_id": "rcpt_x",
        "receipt_hash_sha256": "b" * 64,
        "created_at": "2026-04-02T12:00:00Z",
    }

    from backend.services import receipt_service

    monkeypatch.setattr(receipt_service, "get_receipt", lambda rid: rec if rid == "rcpt_x" else None)

    svc = ProofStatusService(layer_store=proof_layer_tmp, anchoring_store=anchor_tmp)
    caps = {"can_request_anchor_upgrade": True, "can_request_priority_anchor": False}

    svc.request_proof_upgrade("receipt", "rcpt_x", requested_by_user_id=None, preference="batched", capabilities=caps)
    ctx = anchor_tmp.find_batch_context_for_receipt("rcpt_x")
    assert ctx is not None
    assert ctx.get("batch_id")

    svc.request_proof_upgrade("receipt", "rcpt_x", requested_by_user_id=None, preference="batched", capabilities=caps)
    row = proof_layer_tmp.get_anchor_request("receipt", "rcpt_x")
    assert row and row.get("anchor_status") == "queued"


def test_find_batch_context_for_receipt(anchor_tmp: AnchoringStore) -> None:
    n = anchor_tmp.count_receipts_last_24h()
    mode = compute_activity_mode(n)
    svc = AdaptiveBatchAnchorService(anchor_tmp, get_receipt=lambda _rid: {"receipt_hash_sha256": "c" * 64})
    svc.append_receipt_to_open_batch("rcpt_ctx", mode=mode)
    ctx = anchor_tmp.find_batch_context_for_receipt("rcpt_ctx")
    assert ctx is not None
    assert ctx["batch_status"] == "open"
    assert ctx["leaf_index"] == 0


def test_exports_flow(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    p = tmp_path / "pl.sqlite3"
    os.environ["CLAW_PROOF_LAYER_DB_PATH"] = str(p)
    app = FastAPI()
    app.include_router(proof_status_router)
    client = TestClient(app)

    def fake_resolve(_req):
        return "org:test-org"

    monkeypatch.setattr("backend.routers.proof_status_api.resolve_subject_from_request", fake_resolve)
    monkeypatch.setattr(
        "backend.proof_status.capabilities.assert_export_allowed_or_raise",
        lambda _req: None,
    )

    r = client.post("/v1/proof/exports", json={"scope": "record", "scope_ref": "rcpt_z"})
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    eid = data["export"]["export_id"]
    r2 = client.get(f"/v1/proof/exports/{eid}/download")
    assert r2.status_code == 200
    assert r2.headers.get("content-type", "").startswith("application/zip")
