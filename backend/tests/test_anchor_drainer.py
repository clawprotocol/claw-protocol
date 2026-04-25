from __future__ import annotations

from pathlib import Path

import pytest

from backend.anchoring.anchor_drainer import drain_receipt_batch_anchor_jobs
from backend.anchoring.store import AnchoringStore


def test_drainer_skips_when_anchoring_disabled(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = str(tmp_path / "a.sqlite3")
    monkeypatch.setenv("CLAW_ANCHORING_DB_PATH", db)
    monkeypatch.delenv("CLAW_ANCHORING_ENABLED", raising=False)
    store = AnchoringStore(db)
    store.init_schema()
    out = drain_receipt_batch_anchor_jobs(anchoring_store=store, max_submissions=5)
    assert out.get("skipped") is True


def test_drainer_no_queued_jobs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = str(tmp_path / "b.sqlite3")
    monkeypatch.setenv("CLAW_ANCHORING_DB_PATH", db)
    monkeypatch.setenv("CLAW_ANCHORING_ENABLED", "1")
    store = AnchoringStore(db)
    store.init_schema()
    out = drain_receipt_batch_anchor_jobs(anchoring_store=store, max_submissions=5)
    assert out.get("ok") is True
    assert out.get("receipt_batch_anchor_submitted", 0) == 0
