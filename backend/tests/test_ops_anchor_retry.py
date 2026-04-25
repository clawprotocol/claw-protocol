from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.anchoring.store import AnchoringStore
from backend.main import app

pytestmark = pytest.mark.unit


def test_ops_anchor_summary_read_only(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.delenv("CLAW_ADMIN_SECRET", raising=False)
    client = TestClient(app)
    r = client.get("/v1/ops/anchor/summary")
    assert r.status_code == 200
    body = r.json()
    assert "operator_summary" in body
    assert "anchor_run_kind" in body
    assert "alerts_grouped" in body
    assert "bitcoin_wallet" in (body.get("operator_summary") or {})


def test_ops_anchor_retry_job_validation_error(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.delenv("CLAW_ADMIN_SECRET", raising=False)
    client = TestClient(app)
    r = client.post("/v1/ops/anchor/retry-job", json={})
    assert r.status_code == 400
    assert r.json().get("error") == "missing_job_id_or_batch_chain"


def test_ops_anchor_retry_job_success(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    db = tmp_path / "ops_anchor.sqlite3"
    monkeypatch.setenv("CLAW_ANCHORING_DB_PATH", str(db))
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.delenv("CLAW_ADMIN_SECRET", raising=False)

    store = AnchoringStore(str(db))
    store.init_schema()
    j = store.insert_anchor_job(
        chain="btc",
        anchor_type="batch",
        target_root_sha256="aa" * 32,
        network="bitcoin-testnet",
        provider_type="local_rpc_bitcoin",
    )
    store.update_anchor_job_failed(
        j["id"], error="rpc fail", failure_kind="canonical_failed_retryable"
    )

    client = TestClient(app)
    r = client.post("/v1/ops/anchor/retry-job", json={"job_id": j["id"]})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["job_id"] == j["id"]

    row = store.get_anchor_job_by_root_and_chain("aa" * 32, "btc", "batch")
    assert row is not None
    assert str(row.get("status")) == "queued"


def test_ops_anchor_retry_rejects_confirmed(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    db = tmp_path / "ops_anchor2.sqlite3"
    monkeypatch.setenv("CLAW_ANCHORING_DB_PATH", str(db))
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.delenv("CLAW_ADMIN_SECRET", raising=False)

    store = AnchoringStore(str(db))
    store.init_schema()
    j = store.insert_anchor_job(
        chain="btc",
        anchor_type="batch",
        target_root_sha256="bb" * 32,
        network="bitcoin-testnet",
        provider_type="local_rpc_bitcoin",
    )
    store.update_anchor_job_submitted(j["id"], txid="cc" * 32)
    store.mark_anchor_job_confirmed(j["id"])

    client = TestClient(app)
    r = client.post("/v1/ops/anchor/retry-job", json={"job_id": j["id"]})
    assert r.status_code == 409
    assert r.json()["reason"] == "already_confirmed"
