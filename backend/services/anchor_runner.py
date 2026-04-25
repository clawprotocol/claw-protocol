"""
Shared anchor / batch cycle for API admin endpoint and background worker process.

Keeps chain work out of request-handling code paths: call ``run_anchor_batch_cycle`` from
``POST /admin/anchor/run`` or from ``python -m backend.workers.run_anchor_worker``.

See ``docs/ops/OPERATOR_RUNBOOK.md`` and ``docs/architecture/ENV_TOPOLOGY.md``.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger("claw.anchor")

from backend.config.anchor_network_config import agreement_receipt_protocol_version
from backend.config.feed_anchor_policy import feed_anchor_max_attempts
from backend.config.runtime_environment import (
    mainnet_disabled,
    merkle_anchor_max_attempts,
    timeline_anchor_max_attempts,
)
from backend.handlers.agent_api_handler import AnchorProofRequest, anchor_proof as anchor_proof_fn
from backend.anchoring.anchor_drainer import drain_receipt_batch_anchor_jobs
from backend.anchoring.confirmation_poll import poll_receipt_batch_anchor_confirmations
from backend.anchoring.execution import submit_commitment_for_network
from backend.services.claw_feed_store import get_claw_feed_store
from backend.handlers.payment_adapters.base import PaymentAdapter, PaymentRequiredError
from backend.utils.anchor_queue import AnchorQueue
from backend.utils.timeline_store import TimelineStore


def run_anchor_batch_cycle(
    *,
    timeline_store: TimelineStore,
    anchor_queue: AnchorQueue,
    payment_adapter: Optional[PaymentAdapter],
    payment_proof_header: Optional[str],
    request_context: Dict[str, Any],
    anchor_mode: str,
    mainnet_disabled_flag: bool,
) -> Dict[str, Any]:
    """
    One full drain cycle: timeline OP_RETURN jobs, proof payment-anchor queue, Merkle agreement batches.

    ``anchor_mode`` must be ``batch`` (immediate timeline anchoring stays on the API path elsewhere).
    """
    run_kind = str(request_context.get("anchor_run_kind") or "unknown").strip() or "unknown"
    if anchor_mode != "batch":
        return {
            "ok": False,
            "error": "Not in batch mode",
            "anchor_mode": anchor_mode,
            "anchor_run_kind": run_kind,
        }

    timeline_store.requeue_retryable_timeline_anchor_failures(
        max_attempts=timeline_anchor_max_attempts()
    )
    timeline_store.recover_stale_merkle_batch_anchoring(stale_seconds=900)

    max_tl = int(os.getenv("CLAW_TIMELINE_ANCHOR_MAX_PER_BATCH", "50000"))
    tl_jobs = timeline_store.claim_timeline_anchor_jobs(max_n=max_tl)

    tl_ran = tl_done = tl_failed = 0
    for j in tl_jobs:
        tl_ran += 1
        job_id = j.get("job_id") or ""
        network = j.get("network") or ""
        commitment = j.get("commitment") or ""
        receipt_id = j.get("receipt_id") or ""

        try:
            if network == "bitcoin-mainnet" and mainnet_disabled_flag:
                timeline_store.mark_timeline_anchor_failed(
                    job_id=job_id, error="Mainnet anchoring disabled"
                )
                tl_failed += 1
                continue

            txid = submit_commitment_for_network(
                network,
                commitment,
                metadata={"job_kind": "timeline_anchor", "job_id": job_id},
            )
            timeline_store.mark_timeline_anchor_done(job_id=job_id, txid=txid)
            if receipt_id:
                timeline_store.set_receipt_txid(receipt_id=receipt_id, btc_txid=txid)
            tl_done += 1
        except Exception as e:
            timeline_store.mark_timeline_anchor_failed(job_id=job_id, error=str(e))
            tl_failed += 1
            logger.warning(
                "timeline_anchor_failed job_id=%s network=%s receipt_id=%s err=%s",
                job_id,
                network,
                receipt_id,
                str(e)[:500],
            )

    max_n = int(os.getenv("CLAW_ANCHOR_MAX_PER_BATCH", "50000"))
    jobs = anchor_queue.claim_batch(max_n=max_n)

    proof_ran = proof_done = proof_failed = 0
    for j in jobs:
        proof_ran += 1
        try:
            if j.network == "mainnet" and mainnet_disabled_flag:
                anchor_queue.mark_failed(j.job_id, "Mainnet anchoring disabled")
                proof_failed += 1
                continue

            resp, pay_frags, claw_block = anchor_proof_fn(
                AnchorProofRequest(
                    merkle_root_sha256=j.merkle_root_sha256,
                    receipt_commitment=j.receipt_commitment,
                    network=j.network,
                ),
                payment_adapter=payment_adapter,
                payment_proof_header=payment_proof_header,
                request_context={**request_context, "job_id": j.job_id, "anchor_mode": "batch"},
            )
            _ = pay_frags, claw_block

            txid = ""
            for attr in ("txid", "anchor_txid", "opreturn_txid", "transaction_id"):
                if hasattr(resp, attr):
                    txid = getattr(resp, attr) or ""
                    if txid:
                        break

            anchor_queue.mark_done(j.job_id, txid)
            proof_done += 1
        except PaymentRequiredError as e:
            anchor_queue.mark_failed(j.job_id, f"PaymentRequired: {str(e)}")
            proof_failed += 1
        except Exception as e:
            anchor_queue.mark_failed(j.job_id, str(e))
            proof_failed += 1
            logger.warning(
                "proof_anchor_failed job_id=%s network=%s err=%s",
                j.job_id,
                getattr(j, "network", ""),
                str(e)[:500],
            )

    agreement_pv = agreement_receipt_protocol_version()
    mb_built: List[Dict[str, Any]] = []
    mb_anchored = 0
    mb_failed = 0
    max_merkle_batches = int(os.getenv("CLAW_MERKLE_ANCHOR_MAX_BATCHES_PER_RUN", "20"))
    max_attempts = merkle_anchor_max_attempts()

    for network, protocol_version in timeline_store.list_unbatched_receipt_groups():
        if protocol_version != agreement_pv:
            continue
        built = timeline_store.build_next_batch(
            network=network, protocol_version=protocol_version, limit=5000
        )
        if built.get("ok"):
            mb_built.append(
                {
                    "network": network,
                    "protocol_version": protocol_version,
                    "batch_id": built.get("batch_id"),
                    "leaf_count": built.get("leaf_count"),
                }
            )

    for batch in timeline_store.list_merkle_batches_pending_anchor(
        limit=max_merkle_batches, max_attempts=max_attempts
    ):
        if batch.get("protocol_version") != agreement_pv:
            continue
        bid = str(batch.get("batch_id") or "")
        net = str(batch.get("network") or "")
        bc = str(batch.get("batch_commitment") or "")
        if not bid or not net or len(bc) != 64:
            mb_failed += 1
            continue
        try:
            if net == "bitcoin-mainnet" and mainnet_disabled_flag:
                timeline_store.mark_merkle_batch_anchor_failed(
                    batch_id=bid, error="Mainnet anchoring disabled"
                )
                mb_failed += 1
                continue
            timeline_store.mark_merkle_batch_anchor_attempt_started(batch_id=bid)
            merkle_txid = submit_commitment_for_network(
                net,
                bc,
                metadata={"job_kind": "merkle_batch", "batch_id": bid},
            )
            timeline_store.mark_merkle_batch_anchored(batch_id=bid, anchor_txid=merkle_txid)
            timeline_store.set_receipt_txids_for_batch(batch_id=bid, btc_txid=merkle_txid)
            mb_anchored += 1
        except Exception as e:
            timeline_store.mark_merkle_batch_anchor_failed(batch_id=bid, error=str(e))
            mb_failed += 1
            logger.warning(
                "merkle_batch_anchor_failed batch_id=%s network=%s err=%s",
                bid,
                net,
                str(e)[:500],
            )

    feed_store = get_claw_feed_store()
    stale_feed = int(os.getenv("CLAW_FEED_ANCHOR_STALE_CLAIM_SECONDS", "900"))
    n_stale = feed_store.recover_stale_feed_anchor_jobs(stale_seconds=stale_feed)
    if n_stale:
        logger.warning("feed_anchor_recovered_stale_claims count=%s", n_stale)

    max_feed = int(os.getenv("CLAW_FEED_ANCHOR_MAX_PER_BATCH", "200"))
    feed_jobs = feed_store.claim_feed_anchor_jobs(max_n=max_feed)
    feed_ran = feed_done = feed_failed = 0
    max_feed_attempts = feed_anchor_max_attempts()
    for j in feed_jobs:
        feed_ran += 1
        job_id = j.get("job_id") or ""
        event_id = j.get("event_id") or ""
        net = str(j.get("network") or "")
        commitment = str(j.get("commitment") or "")
        if not job_id or not event_id or not net or len(commitment) != 64:
            feed_failed += 1
            continue
        try:
            if net.endswith("-mainnet") and mainnet_disabled_flag:
                feed_store.mark_feed_anchor_failed(
                    job_id=job_id,
                    event_id=event_id,
                    error="Mainnet anchoring disabled",
                    max_attempts=max_feed_attempts,
                )
                feed_failed += 1
                continue
            txid = submit_commitment_for_network(
                net,
                commitment,
                metadata={"job_kind": "feed_anchor", "job_id": job_id, "event_id": event_id},
            )
            feed_store.mark_feed_anchor_done(job_id=job_id, event_id=event_id, txid=txid)
            feed_done += 1
        except Exception as e:
            feed_store.mark_feed_anchor_failed(
                job_id=job_id,
                event_id=event_id,
                error=str(e),
                max_attempts=max_feed_attempts,
            )
            feed_failed += 1
            logger.warning(
                "feed_anchor_failed job_id=%s event_id=%s network=%s err=%s",
                job_id,
                event_id,
                net,
                str(e)[:500],
            )

    rb_anchor = drain_receipt_batch_anchor_jobs(
        max_submissions=int(os.getenv("CLAW_RECEIPT_BATCH_ANCHOR_MAX_PER_RUN", "20")),
        mainnet_disabled_flag=mainnet_disabled_flag,
    )

    rb_confirm = poll_receipt_batch_anchor_confirmations()

    result: Dict[str, Any] = {
        "ok": True,
        "anchor_run_kind": run_kind,
        "ran": tl_ran + proof_ran,
        "done": tl_done + proof_done,
        "failed": tl_failed + proof_failed,
        "pending": anchor_queue.pending_count(),
        "timeline_ran": tl_ran,
        "timeline_done": tl_done,
        "timeline_failed": tl_failed,
        "timeline_pending": len(timeline_store.list_queued_timeline_anchor_jobs(limit=1)),
        "proof_ran": proof_ran,
        "proof_done": proof_done,
        "proof_failed": proof_failed,
        "proof_pending": anchor_queue.pending_count(),
        "merkle_batch_built_groups": len(mb_built),
        "merkle_batch_anchored": mb_anchored,
        "merkle_batch_anchor_failed": mb_failed,
        "merkle_batch_detail": mb_built[:20],
        "feed_anchor_ran": feed_ran,
        "feed_anchor_done": feed_done,
        "feed_anchor_failed": feed_failed,
        "receipt_batch_anchor": rb_anchor,
        "receipt_batch_anchor_confirmations": rb_confirm,
    }
    try:
        from backend.anchoring.observability_cycle import run_anchoring_observability_cycle

        result["anchoring_observability"] = run_anchoring_observability_cycle(
            cycle_summary=result
        )
    except Exception:
        logger.warning("anchoring_observability_cycle_failed", exc_info=True)
    return result
