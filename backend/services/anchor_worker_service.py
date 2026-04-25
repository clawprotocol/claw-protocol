"""
Single entrypoint for batch anchor work: same code path for CLI worker, cron, and (optional) admin HTTP.

Call ``run_anchor_batch_cycle_from_env`` from ``python -m backend.workers.run_anchor_worker`` — not from
request handlers directly except the guarded admin route.

Operations: ``docs/ops/OPERATOR_RUNBOOK.md``; env topology: ``docs/architecture/ENV_TOPOLOGY.md``.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

from backend.config.runtime_environment import (
    anchor_mode,
    mainnet_disabled,
    process_role,
    timeline_db_path,
)
from backend.handlers.payment_adapters.x402 import X402PaymentAdapter
from backend.services.anchor_runner import run_anchor_batch_cycle
from backend.utils.anchor_queue import AnchorQueue
from backend.utils.timeline_store import TimelineStore


def run_anchor_batch_cycle_from_env(
    *,
    payment_proof_header: Optional[str] = None,
    request_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Build stores/adapters from environment and run one anchor batch drain cycle.

    Environment (non-exhaustive): ``CLAW_TIMELINE_DB_PATH``, ``CLAW_ANCHORING_ENABLED``, ``CLAW_ANCHORING_DB_PATH``,
    ``CLAW_ANCHOR_MODE``, ``CLAW_ANCHOR_ENABLE_MAINNET``, ``BITCOIN_RPC_*``, ``DOGECOIN_RPC_*``,
    feed DB path via ``CLAW_DATA_DIR`` / ``CLAW_FEED_DB_PATH``. Receipt-batch anchors:
    ``CLAW_RECEIPT_BATCH_ANCHOR_MAX_PER_RUN``, confirmation poll caps/thresholds
    ``CLAW_RECEIPT_BATCH_ANCHOR_CONFIRM_MAX_PER_RUN``, ``CLAW_ANCHOR_BTC_CONFIRMATIONS``,
    ``CLAW_ANCHOR_DOGE_CONFIRMATIONS``.
    """
    ctx = dict(request_context or {})
    ctx.setdefault("resource", "worker:anchor_batch_cycle")
    ctx.setdefault("method", "WORKER")
    ctx.setdefault("path", "/workers/run_anchor_worker")
    if "anchor_run_kind" not in ctx:
        ctx["anchor_run_kind"] = (
            os.getenv("CLAW_ANCHOR_RUN_KIND", "scheduled_worker").strip() or "scheduled_worker"
        )

    store = TimelineStore(db_path=timeline_db_path())
    queue = AnchorQueue()
    adapter = X402PaymentAdapter()
    pay_hdr = payment_proof_header
    if pay_hdr is None:
        pay_hdr = os.getenv("CLAW_WORKER_X402_PAYMENT_HEADER_VALUE", "").strip() or None

    return run_anchor_batch_cycle(
        timeline_store=store,
        anchor_queue=queue,
        payment_adapter=adapter,
        payment_proof_header=pay_hdr,
        request_context=ctx,
        anchor_mode=anchor_mode(),
        mainnet_disabled_flag=mainnet_disabled(),
    )


def main_cli() -> int:
    """Process role / stdout JSON for container entrypoints."""
    _ = process_role()
    result = run_anchor_batch_cycle_from_env()
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result.get("ok") else 1
