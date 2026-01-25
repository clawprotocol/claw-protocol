#!/usr/bin/env python3
from __future__ import annotations

import os
from backend.utils.timeline_store import TimelineStore
from backend.handlers.batch_handler import merkle_root_hex

def main() -> None:
    batch_id = os.environ.get("CLAW_BATCH_ID")
    if not batch_id:
        raise SystemExit("set CLAW_BATCH_ID")

    s = TimelineStore()
    c = s._conn()
    try:
        b = c.execute("SELECT * FROM batches WHERE batch_id=?", (batch_id,)).fetchone()
        if not b:
            raise SystemExit("batch_not_found")

        rows = c.execute(
            """
            SELECT receipt_hash, leaf_index
            FROM batch_receipts
            WHERE batch_id=?
            ORDER BY leaf_index ASC
            """,
            (batch_id,),
        ).fetchall()

        leaf_hashes = [r["receipt_hash"] for r in rows]
        calc_root = merkle_root_hex(leaf_hashes)

        ok = (calc_root == b["merkle_root"]) and (len(leaf_hashes) == int(b["leaf_count"]))
        print(f"ok={ok}")
        print(f"db_leaf_count={b['leaf_count']} calc_leaf_count={len(leaf_hashes)}")
        print(f"db_merkle_root={b['merkle_root']}")
        print(f"calc_merkle_root={calc_root}")
    finally:
        c.close()

if __name__ == '__main__':
    main()
