"""
One-shot anchoring observability pass (typically after ``run_anchor_batch_cycle``).

Emits operator alerts via the shared economics feed; optional Slack mirror. No policy changes.
"""

from __future__ import annotations

import logging
import os
import time
from collections import defaultdict
from typing import Any, Dict, Optional, Set

from backend.affiliates.operator_alerts import get_economics_store
from backend.anchoring.anchor_alert_dispatch import (
    anchoring_observability_alerts_enabled,
    dispatch_anchoring_operator_alert,
)
from backend.anchoring.anchor_alert_types import (
    ANCHOR_QUEUE_BACKLOG_CRITICAL,
    ANCHOR_WALLET_LOW_BALANCE_CRITICAL,
    ANCHOR_WALLET_LOW_BALANCE_WARNING,
    BATCH_NOT_FULLY_ANCHORED_IN_EXPECTED_WINDOW,
    BITCOIN_NODE_RPC_UNREACHABLE,
    DOGECOIN_NODE_RPC_UNREACHABLE,
    STALE_SUBMITTED_ANCHOR_JOB,
    WEEKLY_ANCHOR_CYCLE_COMPLETED,
)
from backend.anchoring.config import (
    anchor_batch_window_grace_days,
    anchor_receipt_batch_backlog_critical_threshold,
    anchor_stale_submitted_job_hours,
    anchor_weekly_info_alert_min_interval_seconds,
    anchor_weekly_info_alert_mode,
    anchoring_enabled,
    bitcoin_execution_provider_type,
    dogecoin_execution_provider_type,
    launch_anchor_cadence_days,
)
from backend.anchoring.operator_summary import (
    build_anchoring_operator_summary,
    compute_anchor_operator_health,
)
from backend.anchoring.rpc_ping import check_bitcoin_rpc_reachable, check_dogecoin_rpc_reachable
from backend.anchoring.store import AnchoringStore
from backend.anchoring.wallet_runway import estimate_anchor_wallet_runway
from backend.config.runtime_environment import data_dir

_log = logging.getLogger(__name__)

_WEEKLY_INFO_TS_FILE = "anchoring_weekly_info_alert_last_ts"


def _weekly_info_interval_allows_emit() -> bool:
    sec = anchor_weekly_info_alert_min_interval_seconds()
    if sec <= 0:
        return True
    path = os.path.join(data_dir(), "logs", _WEEKLY_INFO_TS_FILE)
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
    except Exception:
        pass
    now = time.time()
    try:
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as fh:
                last = float(fh.read().strip())
            if now - last < float(sec):
                return False
    except Exception:
        pass
    return True


def _weekly_info_mark_emitted() -> None:
    if anchor_weekly_info_alert_min_interval_seconds() <= 0:
        return
    path = os.path.join(data_dir(), "logs", _WEEKLY_INFO_TS_FILE)
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(str(time.time()))
    except Exception:
        pass


def _weekly_info_emit_decision(*, run_kind: str) -> str:
    """
    ``emitted`` | ``suppressed_mode_never`` | ``suppressed_not_scheduled_worker`` |
    ``suppressed_min_interval``
    """
    mode = anchor_weekly_info_alert_mode()
    if mode == "never":
        return "suppressed_mode_never"
    if mode == "scheduled_only":
        if run_kind != "scheduled_worker":
            return "suppressed_not_scheduled_worker"
        if not _weekly_info_interval_allows_emit():
            return "suppressed_min_interval"
        return "emitted"
    if mode == "always":
        if not _weekly_info_interval_allows_emit():
            return "suppressed_min_interval"
        return "emitted"
    return "suppressed_mode_never"


def _alert_dedupe_key(event_type: str, payload: Dict[str, Any]) -> str:
    chain = str(payload.get("chain") or "")
    rpc = str(payload.get("rpc") or "")
    detail = chain or rpc or ""
    return f"{event_type}:{detail}"


def compute_anchoring_operator_observability(
    cycle_summary: Dict[str, Any], *, emit_alerts: bool
) -> Dict[str, Any]:
    """
    Build RPC checks, wallet runway, queue metrics, operator_summary, and optional alerts.

    When ``emit_alerts`` is False (e.g. HTTP snapshot), nothing is persisted or Slack-mirrored.
    """
    run_kind = str((cycle_summary or {}).get("anchor_run_kind") or "unknown").strip() or "unknown"
    out: Dict[str, Any] = {"ok": True, "anchor_run_kind": run_kind}
    emitted_keys: Set[str] = set()

    def _emit(event_type: str, severity: str, payload: Dict[str, Any]) -> None:
        if not emit_alerts:
            return
        key = _alert_dedupe_key(event_type, payload)
        if key in emitted_keys:
            return
        emitted_keys.add(key)
        dispatch_anchoring_operator_alert(
            event_type, severity, {**payload, "anchor_run_kind": run_kind}
        )

    if bitcoin_execution_provider_type() == "public_broadcast_bitcoin":
        btc = {"status": "skipped", "detail": "CLAW_ANCHOR_BITCOIN_PROVIDER=public_broadcast_bitcoin"}
    else:
        btc = check_bitcoin_rpc_reachable()
    out["bitcoin_rpc"] = btc.get("status")
    if btc.get("status") == "error":
        _emit(
            BITCOIN_NODE_RPC_UNREACHABLE,
            "critical",
            {"detail": btc.get("detail"), "rpc": "bitcoin"},
        )

    if dogecoin_execution_provider_type() == "blockchair_dogecoin":
        doge = {"status": "skipped", "detail": "CLAW_ANCHOR_DOGECOIN_PROVIDER=blockchair_dogecoin"}
    else:
        doge = check_dogecoin_rpc_reachable()
    out["dogecoin_rpc"] = doge.get("status")
    if doge.get("status") == "error":
        _emit(
            DOGECOIN_NODE_RPC_UNREACHABLE,
            "critical",
            {"detail": doge.get("detail"), "rpc": "dogecoin"},
        )

    rw_btc: Optional[Dict[str, Any]] = None
    rw_doge: Optional[Dict[str, Any]] = None
    for chain in ("bitcoin", "dogecoin"):
        try:
            rw = estimate_anchor_wallet_runway(chain)  # type: ignore[arg-type]
        except Exception as e:
            _log.debug("wallet_runway_failed chain=%s err=%s", chain, str(e)[:200])
            rw = None
        if chain == "bitcoin":
            rw_btc = rw
        else:
            rw_doge = rw
        if not rw:
            continue
        out[f"wallet_runway_{chain}"] = rw.get("runway_severity")
        if rw.get("balance_native") is None:
            continue
        if rw.get("runway_severity") == "critical":
            _emit(
                ANCHOR_WALLET_LOW_BALANCE_CRITICAL,
                "critical",
                {**dict(rw)},
            )
        elif rw.get("runway_severity") == "warning":
            _emit(
                ANCHOR_WALLET_LOW_BALANCE_WARNING,
                "warning",
                {**dict(rw)},
            )

    n_queued = 0
    latest_fa: Optional[Dict[str, Any]] = None
    stale_n = 0
    overdue = 0
    thr = anchor_receipt_batch_backlog_critical_threshold()

    if anchoring_enabled():
        store = AnchoringStore()
        store.init_schema()
        n_queued = int(store.count_batch_anchor_jobs_with_status("queued"))
        latest_fa = store.get_latest_fully_anchored_receipt_batch()
        out["receipt_batch_anchor_jobs_queued"] = n_queued

        if n_queued >= thr:
            _emit(
                ANCHOR_QUEUE_BACKLOG_CRITICAL,
                "critical",
                {
                    "queued_batch_jobs": n_queued,
                    "threshold": thr,
                },
            )

        stale_h = anchor_stale_submitted_job_hours()
        stale_n = store.count_stale_unconfirmed_batch_anchor_jobs(older_than_hours=stale_h)
        out["stale_unconfirmed_batch_jobs"] = stale_n
        if stale_n > 0:
            _emit(
                STALE_SUBMITTED_ANCHOR_JOB,
                "warning",
                {
                    "count": stale_n,
                    "older_than_hours": stale_h,
                },
            )

        grace = anchor_batch_window_grace_days()
        cadence = launch_anchor_cadence_days()
        overdue_days = float(cadence + grace)
        overdue = store.count_receipt_batches_ready_overdue(older_than_days=overdue_days)
        out["ready_to_anchor_batches_overdue"] = overdue
        if overdue > 0:
            _emit(
                BATCH_NOT_FULLY_ANCHORED_IN_EXPECTED_WINDOW,
                "warning",
                {
                    "count": overdue,
                    "older_than_days": overdue_days,
                    "cadence_days": cadence,
                    "grace_days": grace,
                },
            )
    else:
        out["receipt_batch_anchor_jobs_queued"] = 0

    health = compute_anchor_operator_health(
        bitcoin_rpc_status=str(out.get("bitcoin_rpc") or ""),
        dogecoin_rpc_status=str(out.get("dogecoin_rpc") or ""),
        rw_btc=rw_btc,
        rw_doge=rw_doge,
        receipt_batch_jobs_queued=n_queued,
        backlog_critical_threshold=thr,
        cycle_summary=cycle_summary if isinstance(cycle_summary, dict) else {},
        stale_unconfirmed_jobs=stale_n,
        ready_batches_overdue=overdue,
    )

    out["operator_summary"] = build_anchoring_operator_summary(
        anchor_run_kind=run_kind,
        rw_btc=rw_btc,
        rw_doge=rw_doge,
        receipt_batch_jobs_queued=n_queued,
        latest_fully_anchored=latest_fa,
        health=health,
    )

    rb = cycle_summary.get("receipt_batch_anchor") if isinstance(cycle_summary, dict) else None
    rb_c = cycle_summary.get("receipt_batch_anchor_confirmations") if isinstance(
        cycle_summary, dict
    ) else None

    decision = _weekly_info_emit_decision(run_kind=run_kind)
    out["weekly_anchor_cycle_info_alert"] = decision
    if emit_alerts and decision == "emitted":
        wk_key = f"{WEEKLY_ANCHOR_CYCLE_COMPLETED}:weekly"
        if wk_key not in emitted_keys:
            emitted_keys.add(wk_key)
            dispatch_anchoring_operator_alert(
                WEEKLY_ANCHOR_CYCLE_COMPLETED,
                "info",
                {
                    "anchor_run_kind": run_kind,
                    "timeline_done": cycle_summary.get("timeline_done"),
                    "timeline_failed": cycle_summary.get("timeline_failed"),
                    "merkle_batch_anchored": cycle_summary.get("merkle_batch_anchored"),
                    "receipt_batch_anchor": rb if isinstance(rb, dict) else {},
                    "receipt_batch_anchor_confirmations": rb_c if isinstance(rb_c, dict) else {},
                },
            )
            _weekly_info_mark_emitted()

    return out


def gather_anchoring_operator_http_summary(*, alert_limit: int = 120) -> Dict[str, Any]:
    """
    Read-only bundle for ``GET /v1/ops/anchor/summary`` — no new alerts, no Slack.
    """
    run_kind = os.getenv("CLAW_ANCHOR_RUN_KIND", "").strip() or "api_snapshot"
    core = compute_anchoring_operator_observability(
        {"anchor_run_kind": run_kind},
        emit_alerts=False,
    )
    eco = get_economics_store()
    eco.init_schema()
    rows = eco.list_operator_alerts(limit=alert_limit)
    grouped: Dict[str, Any] = defaultdict(list)
    for r in rows:
        et = str(r.get("event_type") or "unknown")
        grouped[et].append(
            {
                "id": r.get("id"),
                "created_at": r.get("created_at"),
                "severity": r.get("severity"),
                "batch_id": r.get("batch_id"),
                "payload": r.get("payload") if isinstance(r.get("payload"), dict) else {},
            }
        )
    return {
        "anchor_run_kind": run_kind,
        "operator_summary": core.get("operator_summary"),
        "alerts_grouped": dict(grouped),
    }


def run_anchoring_observability_cycle(*, cycle_summary: Dict[str, Any]) -> Dict[str, Any]:
    if not anchoring_observability_alerts_enabled():
        return {"skipped": True, "reason": "CLAW_ANCHOR_OBSERVABILITY_ALERTS_disabled"}
    return compute_anchoring_operator_observability(cycle_summary, emit_alerts=True)
