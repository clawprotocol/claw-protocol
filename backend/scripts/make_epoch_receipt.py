from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple, Optional
from urllib.request import Request, urlopen

from backend.handlers.epoch_merkle import merkle_root_and_paths

PROTOCOL_ID = "CLAW-EPOCH-v0"
MANIFEST_PROTOCOL_ID = "CLAW-EPOCH-MANIFEST-v0"
CANON = "claw-canonical-text-v0"
HASH_ALGO = "sha256"


def sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def claw_epoch_commitment_from_root(root_hex: str) -> str:
    """
    Epoch commitment for OP_RETURN push32:
      sha256("CLAW" + 0x01 + root_bytes)

    This namespaces epoch roots separately from genesis (0x00).
    """
    root_bytes = bytes.fromhex(root_hex)
    return hashlib.sha256(b"CLAW" + bytes([0x01]) + root_bytes).hexdigest()


def canonical_bytes_from_text(s: str) -> bytes:
    # Minimal canonicalization:
    # - normalize line endings
    # - strip trailing whitespace per line
    # - ensure terminal newline
    s2 = s.replace("\r\n", "\n").replace("\r", "\n")
    s2 = "\n".join([ln.rstrip() for ln in s2.split("\n")]).strip("\n") + "\n"
    return s2.encode("utf-8")


def canonical_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def load_inputs_dir(dirpath: Path) -> List[Tuple[str, bytes]]:
    files = sorted([p for p in dirpath.glob("*.txt") if p.is_file()])
    if not files:
        raise SystemExit(f"No .txt files found in {dirpath}")
    out: List[Tuple[str, bytes]] = []
    for p in files:
        leaf_id = p.stem
        raw = p.read_text(encoding="utf-8")
        out.append((leaf_id, canonical_bytes_from_text(raw)))
    return out


def _ipfs_to_gateway(uri: str, gateway: str) -> str:
    # ipfs://<cid>/<path>  ->  <gateway>/ipfs/<cid>/<path>
    u = uri[len("ipfs://") :]
    return gateway.rstrip("/") + "/ipfs/" + u.lstrip("/")


def fetch_bytes(uri: str, ipfs_gateway: str) -> bytes:
    # Minimal fetcher for admin-less manifests:
    # - supports file:<path>, relative paths, https://, ipfs://
    if uri.startswith("ipfs://"):
        uri = _ipfs_to_gateway(uri, ipfs_gateway)

    if uri.startswith("http://") or uri.startswith("https://"):
        # Some IPFS gateways 403 default urllib User-Agent; send a normal UA.
        req = Request(
            uri,
            headers={
                "User-Agent": "claw-bot/0 (+https://github.com/clawprotocol/claw-protocol)",
                "Accept": "*/*",
            },
        )
        with urlopen(req) as r:
            return r.read()

    if uri.startswith("file:"):
        p = Path(uri[len("file:") :])
        return p.read_bytes()

    # treat as local path (relative or absolute)
    return Path(uri).read_bytes()


def load_inputs_manifest(manifest_path: Path, ipfs_gateway: str) -> List[Tuple[str, bytes]]:
    m = json.loads(manifest_path.read_text(encoding="utf-8"))
    if m.get("protocol_id") != MANIFEST_PROTOCOL_ID:
        raise SystemExit(f"Bad manifest protocol_id (expected {MANIFEST_PROTOCOL_ID})")

    ordering = m.get("ordering")
    if ordering != "by_leaf_id_asc":
        raise SystemExit("Only ordering=by_leaf_id_asc is supported in v0")

    inputs = m.get("inputs") or []
    if not inputs:
        raise SystemExit("Manifest has no inputs")

    # Sort deterministically by leaf_id asc
    inputs_sorted = sorted(inputs, key=lambda x: str(x.get("leaf_id", "")))

    out: List[Tuple[str, bytes]] = []
    for item in inputs_sorted:
        leaf_id = item["leaf_id"]
        uri = item["uri"]
        expected = str(item["payload_sha256"]).lower()

        raw = fetch_bytes(uri, ipfs_gateway)

        # v0 manifest assumes canonical text
        try:
            text = raw.decode("utf-8")
        except Exception:
            raise SystemExit(f"Manifest input leaf_id={leaf_id} is not UTF-8 text (v0)")

        canon = canonical_bytes_from_text(text)
        got = sha256_hex(canon)

        if got.lower() != expected:
            raise SystemExit(
                f"Hash mismatch for leaf_id={leaf_id}\n  expected: {expected}\n  got:      {got}\n  uri:      {uri}"
            )

        out.append((leaf_id, canon))

    return out


# ---------------------------------------------------------------------
# Receipt-side self-validation helpers (keeps receipts correct even if
# MerklePath.positions semantics vary between implementations).
# ---------------------------------------------------------------------

def _merkle_parent(left_hex: str, right_hex: str) -> str:
    return sha256_hex(bytes.fromhex(left_hex) + bytes.fromhex(right_hex))


def _fold_merkle_path(payload_hash: str, merkle_path: List[Dict[str, str]]) -> str:
    cur = payload_hash.lower()
    for step in merkle_path:
        sib = str(step["hash"]).lower().strip()
        side = str(step["side"]).lower().strip()
        if side == "left":
            cur = _merkle_parent(sib, cur)
        elif side == "right":
            cur = _merkle_parent(cur, sib)
        else:
            raise SystemExit(f"Invalid merkle_path side (expected 'left'/'right'): {step['side']}")
    return cur


def _build_merkle_path_autopick(
    root_hex: str,
    payload_hash: str,
    siblings: List[str],
    positions: List[str],
) -> List[Dict[str, str]]:
    """
    Build merkle_path[] from a MerklePath(siblings[], positions[]) while guaranteeing
    it folds back to root_hex.

    We try two plausible interpretations for positions -> side mapping:

      A) positions refers to CURRENT node position at that step
         - pos == 'R' => current is right, sibling is on left  => side='left'
         - pos == 'L' => current is left,  sibling is on right => side='right'

      B) positions refers to SIBLING position at that step
         - pos == 'L' => sibling on left  => side='left'
         - pos == 'R' => sibling on right => side='right'

    We select the one that actually verifies.
    """
    root_expected = root_hex.lower().strip()
    ph = payload_hash.lower().strip()

    cand_a: List[Dict[str, str]] = []
    cand_b: List[Dict[str, str]] = []

    for sib, pos in zip(siblings, positions):
        sib = str(sib).lower().strip()
        pos = str(pos).upper().strip()

        # IMPORTANT: do NOT skip sib == payload_hash (odd-width duplication/carry semantics).
        # interpretation A (current node position)
        side_a = "left" if pos == "R" else "right"
        cand_a.append({"side": side_a, "hash": sib})

        # interpretation B (sibling position)
        side_b = "left" if pos == "L" else "right"
        cand_b.append({"side": side_b, "hash": sib})

    got_a = _fold_merkle_path(ph, cand_a)
    if got_a == root_expected:
        return cand_a

    got_b = _fold_merkle_path(ph, cand_b)
    if got_b == root_expected:
        return cand_b

    raise SystemExit(
        "Could not fold proof to root using either positions interpretation.\n"
        f"payload_hash={ph}\n"
        f"root={root_expected}\n"
        f"got_a={got_a}\n"
        f"got_b={got_b}\n"
        f"siblings={len(siblings)} positions={len(positions)}"
    )


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("input_dir", nargs="?", default=None, help="Directory of .txt inputs (fallback mode).")
    ap.add_argument("--manifest", default=None, help="Path to epoch-manifest.json (admin-less mode).")

    ap.add_argument("--epoch", default="epoch-0001")
    ap.add_argument("--network", default="mainnet")
    ap.add_argument("--verifier_version", default="dev")
    ap.add_argument("--verifier_commit", default=os.environ.get("GIT_COMMIT", "unknown"))

    ap.add_argument("--created_utc", default=None, help="Override created_utc (ISO8601). Use 'null' to omit.")
    ap.add_argument("--ipfs_gateway", default="https://ipfs.io", help="Gateway for ipfs:// URIs.")
    args = ap.parse_args()

    if args.manifest:
        inputs = load_inputs_manifest(Path(args.manifest), args.ipfs_gateway)
    else:
        if not args.input_dir:
            raise SystemExit("Provide input_dir or --manifest")
        inputs = load_inputs_dir(Path(args.input_dir))

    leaf_ids = [leaf_id for (leaf_id, _) in inputs]
    leaf_hashes = [sha256_hex(b) for (_, b) in inputs]

    out = merkle_root_and_paths(leaf_hashes)
    root, paths = out[0], out[1]  # paths keyed by payload_hash -> MerklePath

    proofs = []
    for leaf_id, payload_hash in zip(leaf_ids, leaf_hashes):
        mp = paths[payload_hash]  # MerklePath(siblings[], positions[])

        merkle_path = _build_merkle_path_autopick(
            root_hex=root,
            payload_hash=payload_hash,
            siblings=list(mp.siblings),
            positions=list(mp.positions),
        )

        proofs.append(
            {
                "leaf_id": leaf_id,
                "payload_hash": payload_hash,
                "merkle_path": merkle_path,
            }
        )

    # created_utc handling (avoid noisy diffs when desired)
    if args.created_utc == "null":
        created_utc: Optional[str] = None
    elif args.created_utc:
        created_utc = args.created_utc
    else:
        created_utc = datetime.now(timezone.utc).isoformat()

    epoch_commitment = claw_epoch_commitment_from_root(root)

    receipt: Dict[str, Any] = {
        "protocol_id": PROTOCOL_ID,
        "epoch_id": args.epoch,
        "created_utc": created_utc,
        "hash_algo": HASH_ALGO,
        "canonicalization": CANON,
        "batch_merkle_root": root,
        "epoch_commitment": epoch_commitment,
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
