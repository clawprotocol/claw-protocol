#!/usr/bin/env python3
from __future__ import annotations

import os

from backend.utils.timeline_store import TimelineStore


def main() -> None:
    batch_id = os.environ.get("CLAW_BATCH_ID")
    if not batch_id:
        raise SystemExit("set CLAW_BATCH_ID")

    # v1 payload: ASCII prefix + 32-byte commitment hex (stored/anchored)
    prefix = "CLAWB1:"  # short, stable
    store = TimelineStore()
    c = store._conn()
    try:
        b = c.execute("SELECT * FROM batches WHERE batch_id=?", (batch_id,)).fetchone()
        if not b:
            raise SystemExit("batch_not_found")

        commitment_hex = b["batch_commitment"]
        payload_ascii = f"{prefix}{commitment_hex}"  # keep under 80 bytes total
        payload_hex = payload_ascii.encode("utf-8").hex()

        # persist payload_hex on batches row (release artifact)
        c.execute("UPDATE batches SET anchor_op_return=? WHERE batch_id=?", (payload_hex, batch_id))
        c.commit()

        print("ok")
        print(f"batch_id={batch_id}")
        print(f"op_return_ascii={payload_ascii}")
        print(f"op_return_hex={payload_hex}")
        print(f"bytes={len(bytes.fromhex(payload_hex))}")
    finally:
        c.close()


if __name__ == "__main__":
    main()
