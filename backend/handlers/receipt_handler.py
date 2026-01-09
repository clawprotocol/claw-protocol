from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def canonical_json(obj: Any) -> str:
    # Deterministic JSON: stable key ordering, no whitespace variance
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _receipt_payload_for_hash(receipt: Dict[str, Any]) -> Dict[str, Any]:
    """
    Canonical payload hashed for receipt integrity.

    CRITICAL: exclude integrity itself to avoid self-referential hashing.
    """
    payload = dict(receipt)
    payload.pop("integrity", None)
    return payload


def receipt_summary(receipt: Dict[str, Any]) -> Dict[str, Any]:
    """
    Small, stable summary object suitable to embed as a child reference in a parent receipt.
    """
    integ = receipt.get("integrity") or {}
    claw = receipt.get("claw") or {}
    return {
        "receipt_id": receipt.get("receipt_id"),
        "receipt_hash_sha256": integ.get("receipt_canonical_hash_sha256"),
        "created_at": receipt.get("created_at"),
        "environment": receipt.get("environment"),
        "claw": {
            "action": claw.get("action"),
            "action_id": claw.get("action_id"),
        },
    }


def build_receipt(
    *,
    claw: Dict[str, Any],
    payment_fragments: Optional[List[Dict[str, Any]]] = None,
    children: Optional[List[Dict[str, Any]]] = None,
    environment: str = "local",
    receipt_version: str = "claw-receipt/0.4",
) -> Dict[str, Any]:
    """
    Build a deterministic CLAW receipt.

    Hash = sha256(canonical_json(receipt_without_integrity))
    """
    payments = payment_fragments or []
    child_refs = children or []

    # Base receipt (NO integrity yet)
    receipt: Dict[str, Any] = {
        "receipt_version": receipt_version,
        "created_at": _utc_now_iso(),
        "environment": environment,
        "claw": claw,
        "payments": payments,
        "children": child_refs,
    }

    # Deterministic receipt_id derived from canonical payload (excluding integrity)
    payload_for_id = _receipt_payload_for_hash(receipt)
    receipt_id = f"claw_rcpt_{sha256_hex(canonical_json(payload_for_id))[:20]}"
    receipt["receipt_id"] = receipt_id

    # Compute hash after receipt_id is present (still excluding integrity)
    payload_for_hash = _receipt_payload_for_hash(receipt)
    receipt_hash = sha256_hex(canonical_json(payload_for_hash))

    receipt["integrity"] = {
        "receipt_canonical_hash_sha256": receipt_hash
    }

    return receipt
