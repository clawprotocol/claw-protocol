from __future__ import annotations

import os
from pathlib import Path

import pytest

from backend.anchoring.confirmation_poll import poll_receipt_batch_anchor_confirmations
from backend.anchoring.store import AnchoringStore

pytestmark = pytest.mark.unit


@pytest.fixture
def anchor_db(tmp_path: Path) -> Path:
    p = tmp_path / "anchoring.sqlite3"
    os.environ["CLAW_ANCHORING_DB_PATH"] = str(p)
    store = AnchoringStore(str(p))
    store.init_schema()
    return p


def test_poll_skips_when_anchoring_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ANCHORING_ENABLED", "0")
    out = poll_receipt_batch_anchor_confirmations()
    assert out.get("skipped") is True


def test_poll_skips_when_confirm_cap_zero(monkeypatch: pytest.MonkeyPatch, anchor_db: Path) -> None:
    monkeypatch.setenv("CLAW_ANCHORING_ENABLED", "1")
    monkeypatch.setenv("CLAW_RECEIPT_BATCH_ANCHOR_CONFIRM_MAX_PER_RUN", "0")
    out = poll_receipt_batch_anchor_confirmations()
    assert out.get("skipped") is True


def test_poll_promotes_when_threshold_met(
    monkeypatch: pytest.MonkeyPatch, anchor_db: Path
) -> None:
    monkeypatch.setenv("CLAW_ANCHORING_ENABLED", "1")
    monkeypatch.setenv("CLAW_ANCHOR_BTC_CONFIRMATIONS", "1")
    store = AnchoringStore(str(anchor_db))
    root = "aa" * 32
    txid = "bb" * 32
    job = store.insert_anchor_job(
        chain="btc",
        anchor_type="batch",
        target_root_sha256=root,
        network="bitcoin-testnet",
        provider_type="local_rpc_bitcoin",
    )
    store.update_anchor_job_submitted(job["id"], txid=txid)

    monkeypatch.setattr(
        "backend.anchoring.confirmation_poll.effective_confirmations_for_batch_anchor_job",
        lambda _j: 3,
    )

    out = poll_receipt_batch_anchor_confirmations(anchoring_store=store)
    assert out.get("ok") is True
    assert out.get("receipt_batch_anchor_confirmed") == 1

    row = store.get_anchor_job_by_root_and_chain(root, "btc", "batch")
    assert row is not None
    assert str(row.get("status")) == "confirmed"


def test_poll_does_not_promote_when_confirmations_unknown(
    monkeypatch: pytest.MonkeyPatch, anchor_db: Path
) -> None:
    monkeypatch.setenv("CLAW_ANCHORING_ENABLED", "1")
    monkeypatch.setenv("CLAW_ANCHOR_BTC_CONFIRMATIONS", "1")
    store = AnchoringStore(str(anchor_db))
    root = "cc" * 32
    txid = "dd" * 32
    job = store.insert_anchor_job(
        chain="btc",
        anchor_type="batch",
        target_root_sha256=root,
        network="bitcoin-testnet",
        provider_type="local_rpc_bitcoin",
    )
    store.update_anchor_job_submitted(job["id"], txid=txid)

    monkeypatch.setattr(
        "backend.anchoring.confirmation_poll.effective_confirmations_for_batch_anchor_job",
        lambda _j: None,
    )

    out = poll_receipt_batch_anchor_confirmations(anchoring_store=store)
    assert out.get("receipt_batch_anchor_confirmed") == 0
    row = store.get_anchor_job_by_root_and_chain(root, "btc", "batch")
    assert row is not None
    assert str(row.get("status")) == "submitted_unconfirmed"
