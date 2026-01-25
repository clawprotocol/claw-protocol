from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import List, Tuple


def sha256(b: bytes) -> bytes:
    return hashlib.sha256(b).digest()


def leaf_hash_from_receipt_hash(receipt_hash_sha256: str) -> bytes:
    msg = ("claw:receipt:" + receipt_hash_sha256).encode("utf-8")
    return sha256(msg)


@dataclass(frozen=True)
class MerkleProof:
    index: int
    siblings_hex: List[str]


def _pair_hash(left: bytes, right: bytes) -> bytes:
    return sha256(left + right)


def build_merkle_root_and_proofs(leaves: List[bytes]) -> Tuple[bytes, List[MerkleProof]]:
    if not leaves:
        raise ValueError("no leaves")

    n = len(leaves)
    proof_siblings: List[List[bytes]] = [[] for _ in range(n)]

    level = leaves[:]
    reps = list(range(n))

    while len(level) > 1:
        if len(level) % 2 == 1:
            level.append(level[-1])
            reps.append(reps[-1])

        next_level: List[bytes] = []
        next_reps: List[int] = []

        for i in range(0, len(level), 2):
            left, right = level[i], level[i + 1]
            li, ri = reps[i], reps[i + 1]

            proof_siblings[li].append(right)
            proof_siblings[ri].append(left)

            next_level.append(_pair_hash(left, right))
            next_reps.append(li)

        level, reps = next_level, next_reps

    root = level[0]
    proofs = [MerkleProof(index=i, siblings_hex=[s.hex() for s in proof_siblings[i]]) for i in range(n)]
    return root, proofs
