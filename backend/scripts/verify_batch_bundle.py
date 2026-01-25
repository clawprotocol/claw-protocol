#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import List


def sha256(b: bytes) -> bytes:
    return hashlib.sha256(b).digest()


def canon(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def merkle_root_hex(leaf_hexes: List[str]) -> str:
    if not leaf_hexes:
        raise ValueError("no leaves")
    level = [bytes.fromhex(h) for h in leaf_hexes]
    while len(level) > 1:
        if len(level) % 2 == 1:
            level.append(level[-1])
        nxt = []
        for i in range(0, len(level), 2):
            nxt.append(sha256(level[i] + level[i + 1]))
        level = nxt
    return level[0].hex()


def main() -> None:
    p = Path(os.environ.get("CLAW_BUNDLE", ""))
    if not p:
        raise SystemExit("set CLAW_BUNDLE=/path/to/*.bundle.json")
    data = json.loads(p.read_text(encoding="utf-8"))

    b = data["batch"]
    members = data["members"]

    # 1) membership ordering sanity
    members_sorted = sorted(members, key=lambda x: int(x["leaf_index"]))
    leaf_hexes = [m["receipt_hash"] for m in members_sorted]

    # 2) root check
    calc_root = merkle_root_hex(leaf_hexes)
    ok_root = (calc_root == b["merkle_root"])

    # 3) commitment check: sha256(canon(batch_header))
    header = {
        "namespace": "claw-batch-v1",
        "network": b["network"],
        "protocol_version": b["protocol_version"],
        "created_at": b["created_at"],
        "leaf_count": b["leaf_count"],
        "merkle_root": b["merkle_root"],
    }
    calc_commit = hashlib.sha256(canon(header)).hexdigest()
    ok_commit = (calc_commit == b["batch_commitment"])

    ok_count = (int(b["leaf_count"]) == len(members_sorted))

    ok = ok_root and ok_commit and ok_count

    print(f"ok={ok}")
    print(f"ok_root={ok_root} ok_commit={ok_commit} ok_count={ok_count}")
    print(f"leaf_count={len(members_sorted)}")
    print(f"db_root={b['merkle_root']}")
    print(f"calc_root={calc_root}")
    print(f"db_commit={b['batch_commitment']}")
    print(f"calc_commit={calc_commit}")


if __name__ == "__main__":
    main()
