from __future__ import annotations

import os
from pathlib import Path

import pytest

from backend.anchoring.agreement_proof_enrichment import enrich_agreement_anchor_proof_view
from backend.anchoring.store import AnchoringStore


@pytest.fixture
def anchor_db(tmp_path: Path) -> Path:
    p = tmp_path / "anchoring.sqlite3"
    os.environ["CLAW_ANCHORING_DB_PATH"] = str(p)
    store = AnchoringStore(str(p))
    store.init_schema()
    return p


def test_enrich_adds_explorer_for_legacy_txid(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLAW_ANCHORING_ENABLED", raising=False)
    proof = {
        "anchor_network": "bitcoin-testnet",
        "anchor_txid": "aa" * 32,
        "anchor_status": "anchored",
    }
    receipt = {"network": "bitcoin-testnet"}
    out = enrich_agreement_anchor_proof_view(proof, receipt=receipt, timeline_batch=None)
    assert out.get("anchor_explorer_url")
    assert "aa" * 32 in str(out.get("anchor_explorer_url"))


def test_enrich_dual_chain_when_anchoring_jobs_exist(
    monkeypatch: pytest.MonkeyPatch, anchor_db: Path
) -> None:
    monkeypatch.setenv("CLAW_ANCHORING_ENABLED", "1")
    root = "bb" * 32
    store = AnchoringStore(str(anchor_db))
    store.insert_anchor_job(
        chain="btc",
        anchor_type="batch",
        target_root_sha256=root,
        network="bitcoin-testnet",
        provider_type="local_rpc_bitcoin",
    )
    doge = store.insert_anchor_job(
        chain="doge",
        anchor_type="batch",
        target_root_sha256=root,
        network="dogecoin-testnet",
        provider_type="local_rpc_dogecoin",
    )
    store.update_anchor_job_submitted(doge["id"], txid="cc" * 32)

    proof = {"anchor_status": "batched", "batch_merkle_root_sha256": root}
    receipt = {"batch_merkle_root_sha256": root, "network": "bitcoin-testnet"}
    out = enrich_agreement_anchor_proof_view(proof, receipt=receipt, timeline_batch=None)
    assert out.get("anchor_aggregate_phase")
    assert out.get("anchor_mirror_txid") == "cc" * 32
    assert out.get("anchor_mirror_explorer_url")
    assert out.get("anchor_dual_chain_ops")
