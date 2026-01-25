from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.utils.merkle import (
    build_merkle_root_and_proofs,
    leaf_hash_from_receipt_hash,
)
from backend.utils.timeline_store import TimelineStore


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def build_timeline_anchor_batch(
    *,
    store: TimelineStore,
    max_jobs: int = 200,
    batch_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build-only step:
      - claim queued timeline_anchor_jobs
      - compute Merkle root + proofs from receipt_hash_sha256
      - store batch fields + per-receipt proof siblings
      - mark jobs done (meaning: built, not broadcast)
    """
    jobs = store.claim_timeline_anchor_jobs(max_n=max_jobs)
    if not jobs:
        return {"ok": True, "built": 0, "batch": None}

    # Load receipts and compute leaves
    receipts: List[Dict[str, Any]] = []
    leaves: List[bytes] = []

    for j in jobs:
        rid = j.get("receipt_id") or ""
        if not rid:
            store.mark_timeline_anchor_failed(job_id=j["job_id"], error="missing_receipt_id")
            continue

        try:
            r = store.get_receipt(rid)
        except Exception:
            store.mark_timeline_anchor_failed(job_id=j["job_id"], error="receipt_not_found")
            continue

        rh = (r.get("receipt_hash_sha256") or "").strip()
        if len(rh) != 64:
            store.mark_timeline_anchor_failed(job_id=j["job_id"], error="missing_or_invalid_receipt_hash_sha256")
            continue

        receipts.append(r)
        leaves.append(leaf_hash_from_receipt_hash(rh))

    if not receipts:
        return {"ok": True, "built": 0, "batch": None, "note": "no valid receipts to batch"}

    root_bytes, proofs = build_merkle_root_and_proofs(leaves)
    root_hex = root_bytes.hex()

    bid = batch_id or f"tl_batch_{_utc_now_iso().replace(':','').replace('-','').replace('.','')}_{uuid.uuid4().hex[:8]}"

    # Persist proof fields + mark jobs built/done
    built_items: List[Dict[str, Any]] = []
    for i, r in enumerate(receipts):
        rid = r["receipt_id"]
        p = proofs[i]

        # store: leaf index + siblings (hex list) + batch metadata
        store.mark_timeline_anchor_built(
            job_id=f"tl_anchor_{rid}",
            receipt_id=rid,
            batch_id=bid,
            batch_merkle_root_sha256=root_hex,
            leaf_index=p.index,
            merkle_proof_siblings_hex=p.siblings_hex,
        )
        built_items.append(
            {
                "receipt_id": rid,
                "timeline_id": r["timeline_id"],
                "leaf_index": p.index,
                "siblings_hex": p.siblings_hex,
            }
        )

    return {
        "ok": True,
        "built": len(built_items),
        "batch": {
            "batch_id": bid,
            "batch_merkle_root_sha256": root_hex,
            "count": len(built_items),
            "items": built_items,
        },
    }
