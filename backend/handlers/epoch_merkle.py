# backend/handlers/epoch_merkle.py
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Dict, List, Tuple


def _sha256(b: bytes) -> bytes:
    return hashlib.sha256(b).digest()


def _h(a: bytes, b: bytes) -> bytes:
    # Internal node hash = sha256(left || right)
    return _sha256(a + b)


@dataclass(frozen=True)
class MerklePath:
    # siblings: list of 32-byte hex strings
    # positions: "L" means sibling is on the LEFT of current node; "R" means sibling is on the RIGHT
    siblings: List[str]
    positions: List[str]


def receipt_commitment_from_hash_tree_root(hash_tree_root_hex: str) -> str:
    """
    Deterministic commitment for a receipt leaf, derived from proof.hash_tree_root.
    This keeps leaf format stable even if proof packet structure evolves later.
    """
    root_bytes = bytes.fromhex(hash_tree_root_hex)
    if len(root_bytes) != 32:
        raise ValueError("hash_tree_root must be 32 bytes hex")
    return _sha256(b"CLAW:RECEIPT:" + root_bytes).hex()


def _normalize_leaves_hex(leaves_hex: List[str]) -> List[bytes]:
    out: List[bytes] = []
    for h in leaves_hex:
        b = bytes.fromhex(h)
        if len(b) != 32:
            raise ValueError("Each leaf must be 32 bytes hex")
        out.append(b)
    return out


def _canonical_sort_leaves(leaves_hex: List[str]) -> Tuple[List[str], List[bytes]]:
    """
    Canonical ordering: sort leaves by raw bytes ascending (deterministic).
    Returns (sorted_hex, sorted_bytes)
    """
    leaves_bytes = _normalize_leaves_hex(leaves_hex)
    pairs = sorted(zip(leaves_hex, leaves_bytes), key=lambda t: t[1])
    sorted_hex = [p[0] for p in pairs]
    sorted_bytes = [p[1] for p in pairs]
    return sorted_hex, sorted_bytes


def merkle_root_and_paths(leaves_hex: List[str]) -> Tuple[str, Dict[str, MerklePath], List[str]]:
    """
    Deterministic Merkle tree:
      - Sort leaves by raw bytes ascending (canonical ordering).
      - If a level has odd count, duplicate the last node (Bitcoin-style).
      - Return:
          (root_hex,
           paths_by_leaf_hex: Dict[leaf_hex, MerklePath],
           sorted_leaf_hex)

    IMPORTANT:
      - paths are computed for the sorted leaf order,
        but returned as a dict keyed by the actual leaf hex,
        so callers cannot accidentally zip mismatched lists.
    """
    if not leaves_hex:
        raise ValueError("no_leaves")

    sorted_hex, sorted_bytes = _canonical_sort_leaves(leaves_hex)

    # Build tree levels as bytes; levels[0] is leaves
    levels: List[List[bytes]] = [sorted_bytes]

    while len(levels[-1]) > 1:
        cur = levels[-1]
        nxt: List[bytes] = []
        i = 0
        while i < len(cur):
            left = cur[i]
            right = cur[i + 1] if i + 1 < len(cur) else cur[i]  # duplicate last if odd
            nxt.append(_h(left, right))
            i += 2
        levels.append(nxt)

    root_hex = levels[-1][0].hex()

    # Inclusion paths for each leaf in sorted order
    paths_by_leaf: Dict[str, MerklePath] = {}

    n = len(sorted_bytes)
    for leaf_index in range(n):
        idx = leaf_index
        sibs: List[str] = []
        poss: List[str] = []

        for level_i in range(len(levels) - 1):  # up to before root
            nodes = levels[level_i]
            is_right = (idx % 2 == 1)

            if is_right:
                sibling_index = idx - 1
                sibling_pos = "L"  # sibling is left of current
            else:
                sibling_index = idx + 1
                sibling_pos = "R"  # sibling is right of current

            if sibling_index >= len(nodes):
                sibling_index = idx  # duplicate last if odd

            sibs.append(nodes[sibling_index].hex())
            poss.append(sibling_pos)

            idx //= 2

        leaf_hex = sorted_hex[leaf_index]
        paths_by_leaf[leaf_hex] = MerklePath(siblings=sibs, positions=poss)

    return root_hex, paths_by_leaf, sorted_hex


def merkle_verify(leaf_hex: str, root_hex: str, path: MerklePath) -> bool:
    leaf = bytes.fromhex(leaf_hex)
    if len(leaf) != 32:
        return False
    cur = leaf

    if len(path.siblings) != len(path.positions):
        return False

    for sib_hex, pos in zip(path.siblings, path.positions):
        sib = bytes.fromhex(sib_hex)
        if len(sib) != 32:
            return False

        if pos == "L":
            cur = _h(sib, cur)
        elif pos == "R":
            cur = _h(cur, sib)
        else:
            return False

    return cur.hex() == root_hex
