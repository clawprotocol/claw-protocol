"""
Compact anchoring fields for operators (deploy readiness + observability).

Plain-language health for quick scanning; legacy numeric fields kept for tooling.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def _format_balance_display(rw: Optional[Dict[str, Any]]) -> Optional[str]:
    if not rw:
        return None
    bal = rw.get("balance_native")
    unit = (rw.get("balance_unit") or "").strip()
    if bal is None:
        return None
    try:
        f = float(bal)
    except (TypeError, ValueError):
        return None
    s = f"{f:.8f}".rstrip("0").rstrip(".")
    return f"{s} {unit}".strip() if unit else s


def _wallet_compact(rw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not rw:
        return {
            "balance": None,
            "runway_weeks": None,
            "severity": "unknown",
            "runway_severity": "unknown",
            "balance_native": None,
            "balance_unit": None,
        }
    sev = str(rw.get("runway_severity") or "unknown").strip() or "unknown"
    if sev not in ("ok", "warning", "critical", "unknown"):
        sev = "unknown"
    return {
        "balance": _format_balance_display(rw),
        "runway_weeks": rw.get("runway_weeks"),
        "severity": sev,
        "runway_severity": sev,
        "balance_native": rw.get("balance_native"),
        "balance_unit": rw.get("balance_unit"),
    }


def _batch_compact(row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not row:
        return None
    ts = row.get("closed_at") or row.get("updated_at")
    return {
        "batch_id": row.get("id"),
        "timestamp": ts,
        "updated_at": row.get("updated_at"),
        "closed_at": row.get("closed_at"),
        "merkle_root_sha256": row.get("merkle_root_sha256"),
        "receipt_count": row.get("receipt_count"),
    }


def compute_anchor_operator_health(
    *,
    bitcoin_rpc_status: str,
    dogecoin_rpc_status: str,
    rw_btc: Optional[Dict[str, Any]],
    rw_doge: Optional[Dict[str, Any]],
    receipt_batch_jobs_queued: Optional[int],
    backlog_critical_threshold: int,
    cycle_summary: Dict[str, Any],
    stale_unconfirmed_jobs: int,
    ready_batches_overdue: int,
) -> Dict[str, Any]:
    """
    Single traffic-light signal (green / amber / red) with short, non-technical notes.
    """
    red: List[str] = []
    amber: List[str] = []

    if str(bitcoin_rpc_status or "") == "error":
        red.append("Bitcoin RPC unreachable (canonical / primary publishing).")
    if str(dogecoin_rpc_status or "") == "error":
        red.append("Dogecoin RPC unreachable (mirror / secondary publishing).")

    if rw_btc and str(rw_btc.get("runway_severity") or "") == "critical":
        red.append("Bitcoin fee wallet critically low for routine publishing.")
    if rw_doge and str(rw_doge.get("runway_severity") or "") == "critical":
        red.append("Dogecoin fee wallet critically low for mirror publishing.")

    if (rw_btc and str(rw_btc.get("runway_severity") or "") == "warning") or (
        rw_doge and str(rw_doge.get("runway_severity") or "") == "warning"
    ):
        amber.append(
            "At least one fee wallet is below a comfortable runway (under about four weeks)."
        )

    tl_f = int(cycle_summary.get("timeline_failed") or 0)
    pf = int(cycle_summary.get("proof_failed") or 0)
    if tl_f > 0 or pf > 0:
        red.append("This run reported steps that did not complete — review recent operator notices.")

    rb = cycle_summary.get("receipt_batch_anchor")
    rb_d = rb if isinstance(rb, dict) else {}
    c_fail = int(
        cycle_summary.get("receipt_batch_anchor_canonical_failed")
        or rb_d.get("receipt_batch_anchor_canonical_failed")
        or 0
    )
    m_fail = int(
        cycle_summary.get("receipt_batch_anchor_mirror_failed")
        or rb_d.get("receipt_batch_anchor_mirror_failed")
        or 0
    )
    if c_fail == 0 and m_fail == 0 and rb_d:
        tot_f = int(rb_d.get("receipt_batch_anchor_failed") or 0)
        if tot_f > 0:
            m_fail = tot_f

    if c_fail > 0:
        red.append("Bitcoin (canonical) anchoring step failed for at least one receipt batch in this run.")
    if m_fail > 0:
        amber.append(
            "Dogecoin mirror anchoring failed for at least one receipt batch (Bitcoin may still be fine)."
        )

    nq = int(receipt_batch_jobs_queued or 0)
    thr = max(1, int(backlog_critical_threshold))
    if nq >= thr:
        red.append(f"Receipt-batch publish backlog is high ({nq} queued; threshold {thr}).")

    if int(stale_unconfirmed_jobs or 0) > 0:
        amber.append("Some submitted batches are waiting on confirmation longer than usual.")

    if int(ready_batches_overdue or 0) > 0:
        amber.append("Some closed batches are past the usual publish window.")

    if red:
        overall = "red"
        headline = "Action required — fix blocking items before relying on publishing."
    elif amber:
        overall = "amber"
        headline = "Worth a look — warnings only; schedule follow-up."
    else:
        overall = "green"
        headline = "All clear for this snapshot — no blocking issues flagged."

    notes = [*red, *amber] if overall != "green" else []

    return {
        "overall_status": overall,
        "headline": headline,
        "blocking_alerts": red,
        "warning_alerts": amber,
        "notes": notes,
    }


def build_anchoring_operator_summary(
    *,
    anchor_run_kind: Optional[str] = None,
    rw_btc: Optional[Dict[str, Any]] = None,
    rw_doge: Optional[Dict[str, Any]] = None,
    receipt_batch_jobs_queued: Optional[int] = None,
    latest_fully_anchored: Optional[Dict[str, Any]] = None,
    health: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    rq = receipt_batch_jobs_queued
    if rq is None:
        rq = 0
    out: Dict[str, Any] = {
        "bitcoin_wallet": _wallet_compact(rw_btc),
        "dogecoin_wallet": _wallet_compact(rw_doge),
        "receipt_batch_jobs_queued": int(rq),
        "last_fully_anchored_batch": _batch_compact(latest_fully_anchored),
    }
    if anchor_run_kind is not None:
        out["anchor_run_kind"] = anchor_run_kind
    if health is not None:
        out["health"] = health
    return out
