# backend/handlers/batch_handler.py
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple


def _canon(obj: Any) -> bytes:
    # Deterministic JSON bytes (matches canonical hashing expectations)
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha256(b: bytes) -> bytes:
    return hashlib.sha256(b).digest()


def sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def merkle_root_hex(leaf_hexes: List[str]) -> str:
    """
    Deterministic Merkle root:
    - leaves are 32-byte hex strings
    - pairwise sha256(left||right)
    - if odd, duplicate last
    """
    if not leaf_hexes:
        raise ValueError("no leaves")

    level = [bytes.fromhex(h) for h in leaf_hexes]
    while len(level) > 1:
        if len(level) % 2 == 1:
            level.append(level[-1])
        nxt: List[bytes] = []
        for i in range(0, len(level), 2):
            nxt.append(sha256(level[i] + level[i + 1]))
        level = nxt
    return level[0].hex()


@dataclass(frozen=True)
class BatchBuildResult:
    batch_id: str
    created_at: str
    network: str
    protocol_version: str
    leaf_count: int
    leaf_hashes: List[str]          # ordered list
    merkle_root: str                # hex
    batch_commitment: str           # hex (sha256(canon(batch_header)))


def build_receipt_batch(
    *,
    network: str,
    protocol_version: str,
    receipt_summaries: List[Dict[str, Any]],
    batch_namespace: str = "claw-batch-v1",
) -> BatchBuildResult:
    """
    receipt_summaries: minimal objects that must include a stable receipt hash.
    Expected key (prefer): 'receipt_sha256'
    Fallback accepted: 'receipt_hash'
    """
    if not receipt_summaries:
        raise ValueError("no receipts to batch")

    # 1) Extract and deterministically sort leaf hashes
    leaves: List[str] = []
    for r in receipt_summaries:
        h = r.get("receipt_sha256") or r.get("receipt_hash")
        if not isinstance(h, str) or len(h) != 64:
            raise ValueError(f"missing/invalid receipt hash in item: {r.keys()}")
        leaves.append(h.lower())

    leaves_sorted = sorted(leaves)

    # 2) Merkle root over sorted leaves
    root = merkle_root_hex(leaves_sorted)

    # 3) Batch header + commitment (what you anchor later)
    created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    header = {
        "namespace": batch_namespace,
        "network": network,
        "protocol_version": protocol_version,
        "created_at": created_at,
        "leaf_count": len(leaves_sorted),
        "merkle_root": root,
    }
    commitment = sha256_hex(_canon(header))

    # 4) Stable batch id (commitment-derived)
    batch_id = f"{batch_namespace}:{commitment[:16]}"

    return BatchBuildResult(
        batch_id=batch_id,
        created_at=created_at,
        network=network,
        protocol_version=protocol_version,
        leaf_count=len(leaves_sorted),
        leaf_hashes=leaves_sorted,
        merkle_root=root,
        batch_commitment=commitment,
    )
