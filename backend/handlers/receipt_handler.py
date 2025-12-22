# backend/handlers/receipt_handler.py

from __future__ import annotations

from typing import Any, Dict, List

from utils.canon_json import canon_json_bytes, sha256_hex


def _normalize_sig(s: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize signatures into a stable schema so:
    - missing fields don't change hashing
    - casing/whitespace doesn't create surprises
    - empty signature is allowed for preview mode
    """
    chain = (s.get("chain") or "").strip().lower()
    address = (s.get("address") or "").strip().lower()
    role = (s.get("role") or "").strip().lower()
    message = s.get("message") or ""
    signature = s.get("signature")
    if signature is None:
        signature = ""
    else:
        signature = str(signature)

    return {
        "chain": chain,
        "address": address,
        "role": role,
        "message": message,
        "signature": signature,
    }


def build_receipt(
    proof_packet: Dict[str, Any],
    signatures: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Deterministic receipt:
    - receipt_hash does NOT depend on signatures input order
    - receipt_hash changes if signature content changes
    - no timestamps / randomness
    """

    # Prefer explicit packet_hash if present; otherwise fall back safely.
    proof_packet_hash = (
        proof_packet.get("packet_hash")
        or proof_packet.get("clauses_hash")
        or sha256_hex(canon_json_bytes(proof_packet))
    )

    normalized = [_normalize_sig(s) for s in (signatures or [])]

    # Deterministic ordering: sort by canonical JSON bytes of each signature.
    # This is stronger than sorting by (chain,address,...) because it cannot drift.
    normalized_sorted = sorted(normalized, key=lambda sig: canon_json_bytes(sig))

    receipt: Dict[str, Any] = {
        "version": "0.1.0",
        "proof_packet_hash": proof_packet_hash,
        "signatures": normalized_sorted,
    }

    # Hash the receipt (no receipt_hash field yet)
    receipt_hash = sha256_hex(canon_json_bytes(receipt))
    receipt["receipt_hash"] = receipt_hash

    return receipt
