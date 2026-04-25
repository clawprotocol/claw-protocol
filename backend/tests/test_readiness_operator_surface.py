"""Operator-facing readiness / deploy-readiness JSON shape (no secrets)."""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.anchoring.operator_summary import compute_anchor_operator_health
from backend.ops.deploy_readiness import gather_deploy_readiness

pytestmark = pytest.mark.unit


def test_gather_deploy_readiness_includes_operator_summary_block(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    d = tmp_path / "data"
    d.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("CLAW_DATA_DIR", str(d))
    r = gather_deploy_readiness()
    assert "summary" in r
    summ = r["summary"]
    assert isinstance(summ.get("headline"), str) and summ["headline"]
    assert isinstance(summ.get("optional_component_errors"), list)
    assert isinstance(summ.get("how_to_read"), str) and summ["how_to_read"]
    assert "failed_critical_checks" in r
    assert isinstance(r["failed_critical_checks"], list)


def test_compute_anchor_operator_health_groups_alerts() -> None:
    h = compute_anchor_operator_health(
        bitcoin_rpc_status="error",
        dogecoin_rpc_status="ok",
        rw_btc=None,
        rw_doge=None,
        receipt_batch_jobs_queued=0,
        backlog_critical_threshold=50,
        cycle_summary={},
        stale_unconfirmed_jobs=0,
        ready_batches_overdue=0,
    )
    assert h["overall_status"] == "red"
    assert h["blocking_alerts"]
    assert not h["warning_alerts"]
    assert h["notes"] == h["blocking_alerts"] + h["warning_alerts"]
