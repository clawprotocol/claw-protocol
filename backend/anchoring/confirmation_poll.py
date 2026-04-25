"""
Lightweight confirmation polling for receipt-batch ``anchor_jobs``.

After ``drain_receipt_batch_anchor_jobs`` submits transactions, the same worker cycle calls
``poll_receipt_batch_anchor_confirmations``: wallet ``gettransaction`` for local RPC (pruned-safe
for wallet-origin txs), or HTTP status polling for ``third_party_anchor``, ``public_broadcast_bitcoin``,
and ``blockchair_dogecoin``.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, Optional

from backend.anchoring.config import (
    anchoring_enabled,
    anchor_btc_confirmations_required,
    anchor_doge_confirmations_required,
    receipt_batch_anchor_confirm_max_per_run,
)
from backend.anchoring.execution import get_anchor_status_for_network
from backend.anchoring.store import AnchoringStore
from backend.handlers.anchor_adapter import get_wallet_transaction_confirmations

logger = logging.getLogger("claw.anchor.receipt_batch")

_TXID_HEX64 = re.compile(r"^[0-9a-fA-F]{64}$")

# Third-party "confirmed" satisfies any positive integer threshold without coupling to block height.
_THIRD_PARTY_CONFIRMED_SENTINEL = 1_000_000

# HTTP execution providers: confirmations come from public APIs, not Core wallet RPC.
_HTTP_ANCHOR_STATUS_PROVIDERS = frozenset(
    {
        "third_party_anchor",
        "public_broadcast_bitcoin",
        "blockchair_dogecoin",
    }
)


def confirmations_required_for_batch_anchor_job(job: Dict[str, Any]) -> int:
    chain = str(job.get("chain") or "").lower()
    net = str(job.get("network") or "")
    if chain == "btc":
        return anchor_btc_confirmations_required(network=net)
    return anchor_doge_confirmations_required(network=net)


def effective_confirmations_for_batch_anchor_job(job: Dict[str, Any]) -> Optional[int]:
    """
    Effective on-chain (or provider) confirmation depth for promotion logic.

    Returns ``None`` when the reference is not a real 64-hex txid or status cannot be determined.
    """
    txid = str(job.get("txid") or "").strip()
    net = str(job.get("network") or "").strip()
    if txid.startswith(("stub:", "pending:")):
        return None
    if not _TXID_HEX64.match(txid):
        return None

    ptype = str(job.get("provider_type") or "").strip().lower()
    if ptype in _HTTP_ANCHOR_STATUS_PROVIDERS:
        try:
            st = get_anchor_status_for_network(net, txid)
        except Exception as e:
            logger.debug("http_anchor_status_failed network=%s err=%s", net, str(e)[:200])
            return None
        if st.state == "confirmed":
            return _THIRD_PARTY_CONFIRMED_SENTINEL
        return 0

    return get_wallet_transaction_confirmations(net, txid)


def poll_receipt_batch_anchor_confirmations(
    *,
    anchoring_store: Optional[AnchoringStore] = None,
    max_promotions: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Promote eligible ``batch`` anchor jobs to ``confirmed`` when thresholds are met.

    ``max_promotions`` defaults to ``receipt_batch_anchor_confirm_max_per_run()``; ``0`` skips work.
    """
    if not anchoring_enabled():
        return {
            "ok": True,
            "skipped": True,
            "reason": "CLAW_ANCHORING_ENABLED_not_set",
        }

    cap = (
        receipt_batch_anchor_confirm_max_per_run()
        if max_promotions is None
        else max(0, int(max_promotions))
    )
    if cap <= 0:
        return {
            "ok": True,
            "skipped": True,
            "reason": "CLAW_RECEIPT_BATCH_ANCHOR_CONFIRM_MAX_PER_RUN_zero",
        }

    store = anchoring_store or AnchoringStore()
    store.init_schema()

    list_limit = min(500, max(cap * 50, cap))
    jobs = store.list_batch_anchor_jobs_pending_confirmation(limit=list_limit)

    checked = 0
    promoted = 0
    for job in jobs:
        if promoted >= cap:
            break
        jid = str(job.get("id") or "").strip()
        if not jid:
            continue
        checked += 1
        eff = effective_confirmations_for_batch_anchor_job(job)
        if eff is None:
            continue
        need = confirmations_required_for_batch_anchor_job(job)
        if eff >= need:
            store.mark_anchor_job_confirmed(jid)
            promoted += 1

    return {
        "ok": True,
        "receipt_batch_anchor_confirmation_checked": checked,
        "receipt_batch_anchor_confirmed": promoted,
    }
