from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

# Adjust imports to match your repo:
from backend.handlers.epoch_merkle import merkle_root_and_paths  # you already have this

PROTOCOL_ID = "CLAW-EPOCH-v0"
CANON = "claw-canonical-text-v0"  # keep simple now; update later if you want strict canonical JSON


def sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def canonical_bytes_from_text(s: str) -> bytes:
    # Minimal canonicalization for Epoch-0001:
    # - normalize line endings
    # - strip trailing whitespace
    # - ensure terminal newline
    s2 = s.replace("\r\n", "\n").replace("\r", "\n")
    s2 = "\n".join([ln.rstrip() for ln in s2.split("\n")]).strip("\n") + "\n"
    return s2.encode("utf-8")


def canonical_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def load_inputs(dirpath: Path) -> List[Tuple[str, bytes]]:
    files = sorted([p for p in dirpath.glob("*.txt") if p.is_file()])
    if not files:
        raise SystemExit(f"No .txt files found in {dirpath}")
    out: List[Tuple[str, bytes]] = []
    for p in files:
        leaf_id = p.stem
        raw = p.read_text(encoding="utf-8")
        out.append((leaf_id, canonical_bytes_from_text(raw)))
    return out


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("input_dir", type=str)
    ap.add_argument("--epoch", default="epoch-0001")
    ap.add_argument("--network", default="mainnet")
    ap.add_argument("--verifier_version", default="dev")
    ap.add_argument("--verifier_commit", default=os.environ.get("GIT_COMMIT", "unknown"))
    args = ap.parse_args()

    inputs = load_inputs(Path(args.input_dir))
    leaf_ids = [leaf_id for (leaf_id, _) in inputs]
    leaf_hashes = [sha256_hex(b) for (_, b) in inputs]

    # merkle_root_and_paths returns (root, paths, *extras) in your repo
    out = merkle_root_and_paths(leaf_hashes)
    root, paths = out[0], out[1]  # paths is a dict keyed by payload_hash

    proofs = []
    for leaf_id, payload_hash in zip(leaf_ids, leaf_hashes):
        mp = paths[payload_hash]  # MerklePath: siblings[], positions[] (positions are 'L'/'R')

        merkle_path = []
        for sib, pos in zip(mp.siblings, mp.positions):
            # IMPORTANT: do NOT skip sib == payload_hash.
            # In this repo's MerklePath format, a "self sibling" can be a real step
            # (e.g., duplication/carry behavior in odd-width trees).
            #
            # In this MerklePath format, positions refers to the *current node* position.
            # If current node is 'R', sibling is on the LEFT (and vice versa).
            side = "left" if pos == "R" else "right"
            merkle_path.append({"side": side, "hash": sib})

        proofs.append(
            {
                "leaf_id": leaf_id,
                "payload_hash": payload_hash,
                "merkle_path": merkle_path,
            }
        )

    receipt: Dict[str, Any] = {
        "protocol_id": PROTOCOL_ID,
        "epoch_id": args.epoch,
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "hash_algo": "sha256",
        "canonicalization": CANON,
        "batch_merkle_root": root,
        "leaf_count": len(leaf_hashes),
        "anchor": {
            "chain": "bitcoin",
            "network": args.network,
            "txid": None,
            "op_return": None,
            "block_height": None,
        },
        "proofs": proofs,
        "verifier": {"version": args.verifier_version, "commit": args.verifier_commit},
    }

    print(json.dumps(receipt, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
