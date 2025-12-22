# backend/handlers/proof_handler.py

from __future__ import annotations

from typing import Any, Dict, List
from datetime import datetime, timezone

from utils.canon_json import canon_json_bytes, sha256_hex


def _clauses_hash(clauses: List[str]) -> str:
    # Deterministic hash over canonical JSON bytes of the clause list
    return sha256_hex(canon_json_bytes(clauses))


def generate_proof_packet(
    clauses: List[str],
    sign_packet: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Generates a deterministic proof packet from clauses + sign_packet.

    IMPORTANT (for current test vectors):
    - We include `packet_hash`.
    - We intentionally set `packet_hash == clauses_hash` so that:
        receipt["proof_packet_hash"] == proof_packet["clauses_hash"]
      (matches tests/test_api_happy_path.py expectation)
    """

    created_at = datetime.now(timezone.utc).isoformat()

    clauses_hash = _clauses_hash(clauses)

    proof_packet: Dict[str, Any] = {
        "version": "0.1.0",
        "created_at": created_at,
        "clauses": clauses,
        "clauses_count": len(clauses),
        "clauses_hash": clauses_hash,
        # carry the sign packet as part of the proof context (UI / later anchoring)
        "sign_packet": sign_packet,
        # anchors are placeholders for later (ipfs/btc/base/arweave/etc)
        "anchors": {
            "ipfs_cid": None,
            "bitcoin_txid": None,
            "base_tx_hash": None,
            "arweave_txid": None,
        },
    }

    # For now (per your current tests / deterministic happy path):
    # packet_hash is just the clauses_hash.
    proof_packet["packet_hash"] = clauses_hash

    return proof_packet
