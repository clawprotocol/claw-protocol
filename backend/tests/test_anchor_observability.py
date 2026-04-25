from __future__ import annotations

from unittest.mock import patch

import pytest

from backend.anchoring.observability_cycle import run_anchoring_observability_cycle


def test_observability_skipped_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ANCHOR_OBSERVABILITY_ALERTS", "0")
    out = run_anchoring_observability_cycle(cycle_summary={"timeline_done": 0})
    assert out.get("skipped") is True


def test_observability_emits_weekly_info(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ANCHOR_OBSERVABILITY_ALERTS", "1")
    calls: list[tuple] = []

    def _capture(event_type: str, severity: str, payload: dict, **kw):
        calls.append((event_type, severity, payload))
        return "aid"

    _rw = {
        "chain": "bitcoin",
        "balance_native": 10.0,
        "runway_weeks": 100.0,
        "runway_severity": "ok",
        "balance_unit": "BTC",
    }
    with patch(
        "backend.anchoring.observability_cycle.dispatch_anchoring_operator_alert",
        side_effect=_capture,
    ):
        with patch(
            "backend.anchoring.observability_cycle.check_bitcoin_rpc_reachable",
            return_value={"status": "ok"},
        ):
            with patch(
                "backend.anchoring.observability_cycle.check_dogecoin_rpc_reachable",
                return_value={"status": "ok"},
            ):
                with patch(
                    "backend.anchoring.observability_cycle.estimate_anchor_wallet_runway",
                    return_value=_rw,
                ):
                    with patch(
                        "backend.anchoring.observability_cycle.anchoring_enabled",
                        return_value=False,
                    ):
                        run_anchoring_observability_cycle(
                            cycle_summary={
                                "anchor_run_kind": "scheduled_worker",
                                "timeline_done": 1,
                                "receipt_batch_anchor": {},
                            }
                        )

    types = [c[0] for c in calls]
    assert "weekly_anchor_cycle_completed" in types


def test_weekly_info_suppressed_for_admin_http(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ANCHOR_OBSERVABILITY_ALERTS", "1")
    monkeypatch.setenv("CLAW_ANCHOR_WEEKLY_INFO_ALERT_MODE", "scheduled_only")
    calls: list[tuple] = []

    def _capture(event_type: str, severity: str, payload: dict, **kw):
        calls.append((event_type, severity, payload))
        return "aid"

    _rw = {
        "chain": "bitcoin",
        "balance_native": 10.0,
        "runway_weeks": 100.0,
        "runway_severity": "ok",
        "balance_unit": "BTC",
    }
    with patch(
        "backend.anchoring.observability_cycle.dispatch_anchoring_operator_alert",
        side_effect=_capture,
    ):
        with patch(
            "backend.anchoring.observability_cycle.check_bitcoin_rpc_reachable",
            return_value={"status": "ok"},
        ):
            with patch(
                "backend.anchoring.observability_cycle.check_dogecoin_rpc_reachable",
                return_value={"status": "ok"},
            ):
                with patch(
                    "backend.anchoring.observability_cycle.estimate_anchor_wallet_runway",
                    return_value=_rw,
                ):
                    with patch(
                        "backend.anchoring.observability_cycle.anchoring_enabled",
                        return_value=False,
                    ):
                        out = run_anchoring_observability_cycle(
                            cycle_summary={
                                "anchor_run_kind": "admin_http",
                                "timeline_done": 1,
                                "receipt_batch_anchor": {},
                            }
                        )

    assert out.get("weekly_anchor_cycle_info_alert") == "suppressed_not_scheduled_worker"
    assert "weekly_anchor_cycle_completed" not in [c[0] for c in calls]


def test_operator_summary_present(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ANCHOR_OBSERVABILITY_ALERTS", "1")
    _rw = {
        "chain": "bitcoin",
        "balance_native": 10.0,
        "runway_weeks": 100.0,
        "runway_severity": "ok",
        "balance_unit": "BTC",
    }
    with patch(
        "backend.anchoring.observability_cycle.dispatch_anchoring_operator_alert",
        return_value="x",
    ):
        with patch(
            "backend.anchoring.observability_cycle.check_bitcoin_rpc_reachable",
            return_value={"status": "ok"},
        ):
            with patch(
                "backend.anchoring.observability_cycle.check_dogecoin_rpc_reachable",
                return_value={"status": "ok"},
            ):
                with patch(
                    "backend.anchoring.observability_cycle.estimate_anchor_wallet_runway",
                    return_value=_rw,
                ):
                    with patch(
                        "backend.anchoring.observability_cycle.anchoring_enabled",
                        return_value=False,
                    ):
                        out = run_anchoring_observability_cycle(
                            cycle_summary={"anchor_run_kind": "scheduled_worker"}
                        )
    s = out.get("operator_summary") or {}
    assert s.get("anchor_run_kind") == "scheduled_worker"
    assert "bitcoin_wallet" in s and "dogecoin_wallet" in s
    assert "receipt_batch_jobs_queued" in s
    assert "last_fully_anchored_batch" in s
    btc_w = s.get("bitcoin_wallet") or {}
    assert "balance" in btc_w and "runway_weeks" in btc_w and "severity" in btc_w
    assert s.get("health", {}).get("overall_status") in ("green", "amber", "red")
