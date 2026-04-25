"""
Drain ``anchoring.sqlite3`` receipt-batch anchor jobs: Bitcoin first, then mandatory Dogecoin mirror.

Invoked from ``run_anchor_batch_cycle`` when ``CLAW_ANCHORING_ENABLED=1``. Designed for a scheduled
worker (cadence from ``CLAW_ANCHOR_CADENCE_DAYS``) on AWS/Railway — no SQS required for launch.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from backend.anchoring.config import anchoring_enabled
from backend.anchoring.dual_chain_status import dual_chain_aggregate_from_jobs
from backend.anchoring.execution import submit_commitment_for_network
from backend.anchoring.store import AnchoringStore

logger = logging.getLogger("claw.anchor.receipt_batch")


def _filter_eligible_batch_anchor_jobs(
    store: AnchoringStore, jobs: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for j in jobs:
        if str(j.get("anchor_type") or "") != "batch":
            continue
        chain = str(j.get("chain") or "").lower()
        root = str(j.get("target_root_sha256") or "").lower()
        if not root:
            continue
        if chain == "doge":
            btc = store.get_anchor_job_by_root_and_chain(root, "btc", "batch")
            if not btc:
                continue
            bst = str(btc.get("status") or "").lower()
            if bst in ("queued", "building"):
                continue
            if bst in ("failed", "failed_retryable", "failed_terminal"):
                continue
        out.append(j)
    return out


def drain_receipt_batch_anchor_jobs(
    *,
    anchoring_store: Optional[AnchoringStore] = None,
    max_submissions: int = 20,
    mainnet_disabled_flag: bool = False,
) -> Dict[str, Any]:
    """
    Submit up to ``max_submissions`` queued batch anchor jobs (BTC before DOGE per root rules).
    """
    if not anchoring_enabled():
        return {
            "ok": True,
            "skipped": True,
            "reason": "CLAW_ANCHORING_ENABLED_not_set",
        }

    store = anchoring_store or AnchoringStore()
    store.init_schema()

    submitted = 0
    failed = 0
    canonical_failed = 0
    mirror_failed = 0
    skipped_mainnet = 0

    for _ in range(max(1, max_submissions)):
        jobs = store.list_ordered_queued_batch_anchor_jobs(limit=80)
        eligible = _filter_eligible_batch_anchor_jobs(store, jobs)
        if not eligible:
            break
        job = eligible[0]
        jid = str(job.get("id") or "")
        net = str(job.get("network") or "")
        root = str(job.get("target_root_sha256") or "")
        chain = str(job.get("chain") or "")

        if not jid or not net or len(root) != 64:
            if jid:
                store.update_anchor_job_failed(
                    jid, error="invalid_job_row", failure_kind="failed_terminal"
                )
            failed += 1
            if str(chain or "").lower() == "btc":
                canonical_failed += 1
            else:
                mirror_failed += 1
            continue

        if net.endswith("-mainnet") and mainnet_disabled_flag:
            store.update_anchor_job_failed(
                jid,
                error="Mainnet anchoring disabled",
                failure_kind="canonical_failed_retryable"
                if chain == "btc"
                else "mirror_failed_retryable",
            )
            failed += 1
            skipped_mainnet += 1
            if str(chain or "").lower() == "btc":
                canonical_failed += 1
            else:
                mirror_failed += 1
            continue

        try:
            txid = submit_commitment_for_network(
                net,
                root,
                metadata={
                    "job_kind": "receipt_batch_anchor",
                    "anchor_job_id": jid,
                    "chain": chain,
                },
            )
            store.update_anchor_job_submitted(jid, txid=txid)
            submitted += 1
            logger.info(
                "receipt_batch_anchor_submitted job_id=%s chain=%s network=%s txid=%s",
                jid,
                chain,
                net,
                txid[:24],
            )
        except Exception as e:
            fk = (
                "canonical_failed_retryable"
                if chain == "btc"
                else "mirror_failed_retryable"
            )
            store.update_anchor_job_failed(jid, error=str(e), failure_kind=fk)
            failed += 1
            if str(chain or "").lower() == "btc":
                canonical_failed += 1
            else:
                mirror_failed += 1
            logger.warning(
                "receipt_batch_anchor_failed job_id=%s chain=%s err=%s",
                jid,
                chain,
                str(e)[:500],
            )
            try:
                from backend.anchoring.anchor_alert_dispatch import (
                    anchoring_observability_alerts_enabled,
                    dispatch_anchoring_operator_alert,
                )
                from backend.anchoring.anchor_alert_types import (
                    CANONICAL_ANCHOR_SUBMISSION_FAILED,
                    DOGECOIN_MIRROR_FAILED,
                )

                if anchoring_observability_alerts_enabled():
                    if chain == "btc":
                        dispatch_anchoring_operator_alert(
                            CANONICAL_ANCHOR_SUBMISSION_FAILED,
                            "critical",
                            {
                                "anchor_job_id": jid,
                                "chain": chain,
                                "network": net,
                                "target_root_sha256": root,
                                "error": str(e)[:500],
                            },
                        )
                    else:
                        dispatch_anchoring_operator_alert(
                            DOGECOIN_MIRROR_FAILED,
                            "warning",
                            {
                                "anchor_job_id": jid,
                                "chain": chain,
                                "network": net,
                                "target_root_sha256": root,
                                "error": str(e)[:500],
                            },
                        )
            except Exception:
                pass

    return {
        "ok": True,
        "receipt_batch_anchor_submitted": submitted,
        "receipt_batch_anchor_failed": failed,
        "receipt_batch_anchor_canonical_failed": canonical_failed,
        "receipt_batch_anchor_mirror_failed": mirror_failed,
        "receipt_batch_anchor_skipped_mainnet": skipped_mainnet,
    }


def receipt_batch_anchor_phase_for_root(store: AnchoringStore, root_hex: str) -> str:
    """Convenience for ops tooling: aggregate phase for a Merkle root."""
    jobs = store.list_anchor_jobs_for_root(root_hex)
    return dual_chain_aggregate_from_jobs(jobs)
