# backend/handlers/receipt_handler.py
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.utils.canon_json import canon_sha256_hex


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _sorted_signatures(signatures: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Deterministic ordering so receipt hash is stable across input list permutations.
    Sort key is intentionally simple + cross-chain safe.
    """

    def k(s: Dict[str, Any]) -> tuple:
        chain = (s.get("chain") or "").lower()
        addr = (s.get("address") or "").lower()
        role = (s.get("role") or "").lower()
        msg = (s.get("message") or "")
        sig = (s.get("signature") or "")
        return (chain, addr, role, msg, sig)

    return sorted(signatures, key=k)


def receipt_summary(receipt: Dict[str, Any]) -> Dict[str, Any]:
    """
    Small, stable “pointer” used for parent/child receipts.
    """
    return {
        "receipt_hash_sha256": receipt.get("receipt_hash_sha256"),
        "issued_at": receipt.get("issued_at"),
        "protocol": receipt.get("protocol"),
        "action": (receipt.get("claw") or {}).get("action"),
        "action_id": (receipt.get("claw") or {}).get("action_id"),
    }


def build_receipt(
    *,
    # New-style inputs (current architecture)
    claw: Optional[Dict[str, Any]] = None,
    payment_fragments: Optional[List[Dict[str, Any]]] = None,
    children: Optional[List[Dict[str, Any]]] = None,
    environment: str = "local",
    # Legacy inputs (older tests)
    proof_packet: Optional[Dict[str, Any]] = None,
    signatures: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Dual-mode receipt builder.

    NEW MODE:
      build_receipt(claw=..., payment_fragments=[...], children=[...])

    LEGACY MODE (tests):
      build_receipt(proof_packet=..., signatures=[...])
    """

    issued_at = _utc_now_iso()

    # ------------------------------------------------------------------
    # LEGACY MODE (used by existing tests)
    # ------------------------------------------------------------------
    if proof_packet is not None:
        sigs = _sorted_signatures(signatures or [])

        payload = {
            "proof_packet": proof_packet,
            "signatures": sigs,
        }

        receipt_hash = canon_sha256_hex(payload)

        return {
            "protocol": "CLAW-RECEIPT-LEGACY-v1",
            "issued_at": issued_at,
            "receipt": payload,
            # legacy keys expected by tests / older callers
            "receipt_hash": receipt_hash,
            "receipt_hash_sha256": receipt_hash,
            "proof_packet_hash": (proof_packet or {}).get("packet_hash"),
        }

    # ------------------------------------------------------------------
    # NEW MODE (current architecture)
    # ------------------------------------------------------------------
    claw = claw or {}
    payment_fragments = payment_fragments or []
    children = children or []

    payload = {
        "claw": claw,
        "payment_fragments": payment_fragments,
        "children": [receipt_summary(c) for c in children],
        "environment": environment,
    }

    receipt_hash = canon_sha256_hex(payload)

    return {
        "protocol": "CLAW-RECEIPT-v1",
        "issued_at": issued_at,
        "claw": claw,
        "payment_fragments": payment_fragments,
        "children": payload["children"],
        "environment": environment,
        # legacy alias (harmless; helps older callers/tools)
        "receipt_hash": receipt_hash,
        "receipt_hash_sha256": receipt_hash,
    }
