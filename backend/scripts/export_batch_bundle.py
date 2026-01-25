#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from pathlib import Path

from backend.utils.timeline_store import TimelineStore


def main() -> None:
    batch_id = os.environ.get("CLAW_BATCH_ID")
    if not batch_id:
        raise SystemExit("set CLAW_BATCH_ID")

    out_path = Path(os.environ.get("CLAW_OUT", f"artifacts/{batch_id}.bundle.json"))
    out_path.parent.mkdir(parents=True, exist_ok=True)

    s = TimelineStore()
    c = s._conn()
    try:
        b = c.execute("SELECT * FROM batches WHERE batch_id=?", (batch_id,)).fetchone()
        if not b:
            raise SystemExit("batch_not_found")

        members = c.execute(
            """
            SELECT receipt_id, receipt_hash, leaf_index
            FROM batch_receipts
            WHERE batch_id=?
            ORDER BY leaf_index ASC
            """,
            (batch_id,),
        ).fetchall()

        bundle = {
            "type": "claw_batch_bundle",
            "version": 1,
            "batch": dict(b),
            "members": [dict(m) for m in members],
        }

        out_path.write_text(json.dumps(bundle, indent=2, sort_keys=True), encoding="utf-8")
        print("ok")
        print(f"wrote={out_path}")
        print(f"members={len(members)}")
    finally:
        c.close()


if __name__ == "__main__":
    main()
