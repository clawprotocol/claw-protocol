#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os

from backend.utils.timeline_store import TimelineStore


def sha256(b: bytes) -> bytes:
    return hashlib.sha256(b).digest()


def compute_root_from_proof(*, leaf_hex: str, siblings_hex: list[str], leaf_index: int) -> str:
    node = bytes.fromhex(leaf_hex)
    idx = int(leaf_index)

    for sib_hex in siblings_hex:
        sib = bytes.fromhex(sib_hex)
        if idx % 2 == 0:
            node = sha256(node + sib)
        else:
            node = sha256(sib + node)
        idx //= 2

    return node.hex()


def main() -> None:
    receipt_id = os.environ.get("CLAW_RECEIPT_ID")
    if not receipt_id:
        raise SystemExit("set CLAW_RECEIPT_ID")

    s = TimelineStore()
    c = s._conn()
    try:
        r = c.execute("SELECT * FROM receipts WHERE receipt_id=?", (receipt_id,)).fetchone()
        if not r:
            raise SystemExit("receipt_not_found")

        batch_id = r["batch_id"]
        if not batch_id:
            raise SystemExit("receipt_has_no_batch_id")

        b = c.execute("SELECT * FROM batches WHERE batch_id=?", (batch_id,)).fetchone()
        if not b:
            raise SystemExit("batch_not_found")

        leaf = r["receipt_hash_sha256"]
        idx = int(r["leaf_index"])
        siblings = json.loads(r["merkle_proof_json"])  # we stored siblings list here
        calc = compute_root_from_proof(leaf_hex=leaf, siblings_hex=siblings, leaf_index=idx)

        ok = (calc == b["merkle_root"])
        print(f"ok={ok}")
        print(f"receipt_id={receipt_id}")
        print(f"batch_id={batch_id}")
        print(f"leaf_index={idx}")
        print(f"db_root={b['merkle_root']}")
        print(f"calc_root={calc}")
        print(f"siblings_len={len(siblings)}")
    finally:
        c.close()


if __name__ == "__main__":
    main()
