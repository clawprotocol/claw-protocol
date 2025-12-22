# backend/proof_chain.py

from datetime import datetime, timezone
from typing import List, Dict, Any

from utils.canon_json import canon_json_bytes, sha256_hex


def build_proof_chain(clauses: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Canonical proof chain builder (v0.1)

    - Normalizes clause content
    - Builds a deterministic proof packet
    - Hashes ONLY canonical JSON bytes
    """

    # 1) Normalize clause bodies deterministically
    normalized_clauses = [
        {
            "id": c.get("id"),
            "body": c.get("body") or c.get("raw_text", ""),
        }
        for c in clauses
    ]

    # 2) Build canonical proof packet (dict ONLY — no strings)
    packet: Dict[str, Any] = {
        "protocol_version": "claw/v0.1",
        "clauses": normalized_clauses,
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "algo": "sha256-canonical-json",
    }

    # 3) Canonical serialization + hash
    packet_bytes = canon_json_bytes(packet)
    packet_hash = sha256_hex(packet_bytes)

    # 4) Attach hash (hash is over packet *without* packet_hash field)
    packet["packet_hash"] = packet_hash

    return packet
