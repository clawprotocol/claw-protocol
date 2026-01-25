#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from typing import Any, Dict

from backend.utils.canon_json import canon_sha256_hex
from backend.utils.timeline_store import TimelineStore


def _stable_receipt_hash(r: Dict[str, Any]) -> str:
    """
    Deterministic receipt hash used for batching.
    IMPORTANT: must match your verifier's receipt hashing rules.
    This version hashes a minimal stable subset that should already be final.
    """
    payload = {
        "receipt_id": r["receipt_id"],
        "timeline_id": r["timeline_id"],
        "protocol_version": r["protocol_version"],
        "network": r["network"],
        "epoch_id": r.get("epoch_id"),
        "btc_txid": r["btc_txid"],
        "commitment": r["commitment"],
        "merkle_proof": json.loads(r["merkle_proof_json"]),
        "zk_proof_refs": json.loads(r["zk_proof_refs_json"]) if r.get("zk_proof_refs_json") else None,
        "issued_at": r["issued_at"],
    }
    return canon_sha256_hex(payload)


def main() -> None:
    store = TimelineStore()

    conn = store._conn()  # internal, ok for script
    try:
        conn.execute("BEGIN IMMEDIATE")
        rows = conn.execute(
            """
            SELECT *
            FROM receipts
            WHERE receipt_hash_sha256 IS NULL OR receipt_hash_sha256 = ''
            """
        ).fetchall()

        n = 0
        for row in rows:
            r = dict(row)
            h = _stable_receipt_hash(r)
            conn.execute(
                "UPDATE receipts SET receipt_hash_sha256=? WHERE receipt_id=?",
                (h, r["receipt_id"]),
            )
            n += 1

        conn.commit()
        print(f"ok: backfilled {n} receipts")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
