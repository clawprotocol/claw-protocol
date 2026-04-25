"""
Optional dual-chain + explorer URL fields for agreement execution ``proof`` blobs.

Uses existing anchoring config, ``AnchoringStore``, and ``dual_chain_aggregate_from_jobs`` only.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Optional

from backend.anchoring.config import (
    anchoring_enabled,
    bitcoin_explorer_tx_url_template,
    dogecoin_explorer_tx_url_template,
)
from backend.anchoring.dual_chain_status import dual_chain_aggregate_from_jobs
from backend.anchoring.store import AnchoringStore

_TXID64 = re.compile(r"^[0-9a-fA-F]{64}$")


def _explorer_url_for_network(network_label: str, txid: str) -> Optional[str]:
    tid = (txid or "").strip()
    if not _TXID64.match(tid):
        return None
    if tid.startswith(("stub:", "pending:")):
        return None
    n = (network_label or "").strip().lower()
    if n.startswith("bitcoin"):
        return bitcoin_explorer_tx_url_template().replace("{txid}", tid.lower())
    if n.startswith("dogecoin"):
        return dogecoin_explorer_tx_url_template().replace("{txid}", tid.lower())
    return None


def _job_txid(job: Optional[Dict[str, Any]]) -> Optional[str]:
    if not job:
        return None
    tid = str(job.get("txid") or "").strip()
    if not _TXID64.match(tid):
        return None
    if tid.startswith(("stub:", "pending:")):
        return None
    return tid.lower()


def enrich_agreement_anchor_proof_view(
    proof: Dict[str, Any],
    *,
    receipt: Dict[str, Any],
    timeline_batch: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    out = dict(proof)

    net = str(out.get("anchor_network") or receipt.get("network") or "").strip()
    legacy_tx = str(out.get("anchor_txid") or "").strip()
    if legacy_tx and _TXID64.match(legacy_tx):
        url = _explorer_url_for_network(net, legacy_tx)
        if url:
            out["anchor_explorer_url"] = url

    root = str(receipt.get("batch_merkle_root_sha256") or "").strip().lower()
    if len(root) == 64 and anchoring_enabled():
        try:
            store = AnchoringStore()
            store.init_schema()
            jobs = store.list_anchor_jobs_for_root(root)
        except Exception:
            jobs = []
        if jobs:
            out["anchor_aggregate_phase"] = dual_chain_aggregate_from_jobs(jobs)
            btc_j = next(
                (j for j in jobs if str(j.get("chain") or "").lower() == "btc"), None
            )
            doge_j = next(
                (j for j in jobs if str(j.get("chain") or "").lower() == "doge"), None
            )
            ct = _job_txid(btc_j)
            mt = _job_txid(doge_j)
            if ct:
                out["anchor_canonical_txid"] = ct
                cu = _explorer_url_for_network(
                    str((btc_j or {}).get("network") or "bitcoin-testnet"), ct
                )
                if cu:
                    out["anchor_canonical_explorer_url"] = cu
            if mt:
                out["anchor_mirror_txid"] = mt
                mu = _explorer_url_for_network(
                    str((doge_j or {}).get("network") or "dogecoin-testnet"), mt
                )
                if mu:
                    out["anchor_mirror_explorer_url"] = mu
            out["anchor_dual_chain_ops"] = {
                "canonical_role": "bitcoin",
                "mirror_role": "dogecoin",
                "btc": {
                    "network": (btc_j or {}).get("network"),
                    "status": (btc_j or {}).get("status"),
                    "txid": ct,
                    "broadcast_at": (btc_j or {}).get("broadcast_at"),
                    "confirmed_at": (btc_j or {}).get("confirmed_at"),
                },
                "doge": {
                    "network": (doge_j or {}).get("network"),
                    "status": (doge_j or {}).get("status"),
                    "txid": mt,
                    "broadcast_at": (doge_j or {}).get("broadcast_at"),
                    "confirmed_at": (doge_j or {}).get("confirmed_at"),
                },
            }

    _ = timeline_batch  # reserved if timeline + anchoring correlation tightens later
    return {k: v for k, v in out.items() if v is not None}
