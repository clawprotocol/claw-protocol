"""
Operator-facing aggregate status for a receipt-batch root with mandatory Bitcoin + Dogecoin jobs.

Per-chain truth remains in ``anchor_jobs`` rows; this helper answers "where are we?" for runbooks.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def _st(row: Optional[Dict[str, Any]]) -> str:
    if not row:
        return "missing"
    return str(row.get("status") or "").strip().lower()


def _submitted(st: str) -> bool:
    return st in (
        "submitted_unconfirmed",
        "broadcast",
        "building",
        "confirmed",
    )


def dual_chain_aggregate_phase(
    btc: Optional[Dict[str, Any]], doge: Optional[Dict[str, Any]]
) -> str:
    """
    High-level phase label (ops / API; not legal semantics).

    Maps to runbook language: nothing submitted / Bitcoin only / Doge only / partial / fully anchored,
    including explicit labels when Bitcoin is already confirmed while the mirror is queued, pending, or failed.
    """
    bs, ds = _st(btc), _st(doge)
    if bs == "confirmed" and ds == "confirmed":
        return "fully_anchored"
    if ds == "missing":
        if bs == "confirmed":
            return "bitcoin_confirmed_mirror_not_enqueued"
        if bs == "queued":
            return "queued"
        if _submitted(bs) and bs != "confirmed":
            return "bitcoin_submitted_mirror_not_enqueued"
        if bs in ("failed_retryable", "failed", "failed_terminal"):
            return "canonical_failed_retryable"
        return "partial_or_mixed"
    if bs == "confirmed" and ds == "queued":
        return "bitcoin_confirmed_dogecoin_queued"
    if bs == "confirmed" and ds in ("failed_retryable", "failed", "failed_terminal"):
        return "bitcoin_confirmed_mirror_failed_retryable"
    if bs == "confirmed" and _submitted(ds) and ds != "confirmed":
        return "bitcoin_confirmed_dogecoin_pending"
    if ds == "confirmed" and _submitted(bs) and bs != "confirmed":
        return "dogecoin_confirmed_bitcoin_pending"
    if _submitted(bs) and ds == "queued":
        return "bitcoin_submitted_dogecoin_queued"
    if _submitted(bs) and not _submitted(ds) and ds not in ("queued", "missing"):
        return "bitcoin_submitted_dogecoin_blocked"
    if _submitted(ds) and not _submitted(bs):
        return "dogecoin_submitted_bitcoin_not_submitted"
    if _submitted(bs) and _submitted(ds):
        return "both_submitted_unconfirmed"
    if bs in ("failed_retryable", "failed", "failed_terminal") and ds == "queued":
        return "canonical_failed_retryable"
    if ds in ("failed_retryable", "failed", "failed_terminal") and _submitted(bs):
        return "mirror_failed_retryable"
    if bs == "queued" and ds == "queued":
        return "queued"
    if bs == "queued" and ds in ("failed_retryable", "failed", "failed_terminal"):
        return "mirror_failed_canonical_pending"
    return "partial_or_mixed"


def dual_chain_aggregate_from_jobs(jobs: List[Dict[str, Any]]) -> str:
    btc = next((j for j in jobs if str(j.get("chain") or "").lower() == "btc"), None)
    doge = next((j for j in jobs if str(j.get("chain") or "").lower() == "doge"), None)
    return dual_chain_aggregate_phase(btc, doge)
