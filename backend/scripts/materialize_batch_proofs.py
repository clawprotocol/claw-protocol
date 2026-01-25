#!/usr/bin/env python3
from __future__ import annotations

import os
from typing import List, Tuple

from backend.utils.timeline_store import TimelineStore


def _merkle_siblings_hex(leaf_hexes: List[str], target_index: int) -> List[str]:
    """
    Returns sibling list (hex) from leaf level up to root.
    Uses same rules as batch_handler: pairwise sha256(left||right), duplicate last if odd.
    NOTE: leaf_hexes must be ordered exactly as used to compute root (ORDER BY leaf_index).
    """
    import hashlib

    def sha256(b: bytes) -> bytes:
        return hashlib.sha256(b).digest()

    idx = target_index
    level = [bytes.fromhex(h) for h in leaf_hexes]
    siblings: List[str] = []

    while len(level) > 1:
        if len(level) % 2 == 1:
            level.append(level[-1])

        sib_idx = idx ^ 1
        siblings.append(level[sib_idx].hex())

        nxt: List[bytes] = []
        for i in range(0, len(level), 2):
            nxt.append(sha256(level[i] + level[i + 1]))

        level = nxt
        idx //= 2

    return siblings


def main() -> None:
    batch_id = os.environ.get("CLAW_BATCH_ID")
    if not batch_id:
        raise SystemExit("set CLAW_BATCH_ID")

    s = TimelineStore()
    conn = s._conn()
    try:
        conn.execute("BEGIN IMMEDIATE")

        b = conn.execute("SELECT * FROM batches WHERE batch_id=?", (batch_id,)).fetchone()
        if not b:
            raise SystemExit("batch_not_found")

        members = conn.execute(
            """
            SELECT receipt_id, receipt_hash, leaf_index
            FROM batch_receipts
            WHERE batch_id=?
            ORDER BY leaf_index ASC
            """,
            (batch_id,),
        ).fetchall()

        leaf_hexes = [m["receipt_hash"] for m in members]
        root = b["merkle_root"]

        updated = 0
        for m in members:
            rid = m["receipt_id"]
            idx = int(m["leaf_index"])
            sibs = _merkle_siblings_hex(leaf_hexes, idx)

            # Store on receipts table (your schema uses these fields)
            conn.execute(
                """
                UPDATE receipts
                SET batch_id = ?,
                    batch_merkle_root_sha256 = ?,
                    leaf_index = ?,
                    merkle_proof_json = ?
                WHERE receipt_id = ?
                """,
                (batch_id, root, idx, __import__("json").dumps(sibs, separators=(",", ":"), ensure_ascii=False), rid),
            )
            updated += 1

        conn.commit()
        print(f"ok: materialized proofs for {updated} receipts")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
