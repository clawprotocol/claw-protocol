from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

from utils.canon_json import canon_sha256_hex


class VerifyReceiptRequest(BaseModel):
    # Current API posts: {"receipt": {...}}
    receipt: Dict[str, Any]
    expected_receipt_hash_sha256: Optional[str] = None


class VerifyReceiptResponse(BaseModel):
    ok: bool
    receipt_hash_sha256: str
    checks: Dict[str, Any] = Field(default_factory=dict)
    errors: List[str] = Field(default_factory=list)


# ----------------------------
# Hashing rules
# ----------------------------

_STABLE_IDENTITY_FIELDS: Tuple[str, ...] = (
    "receipt_id",
    "protocol_version",
    "network",
    "epoch_id",
    "timeline_id",
    "commitment",
    "issued_at",
)


def _payload_for_hash(receipt: Dict[str, Any]) -> Dict[str, Any]:
    """
    Hash only the stable identity fields for the receipt.

    We intentionally EXCLUDE fields that may be populated later or vary by transport/storage:
      - btc_txid (pending -> confirmed txid)
      - merkle_proof / zk_proof_refs (often empty now, populated later)
      - *_json helper fields (db storage)
      - receipt_hash_sha256 itself
      - integrity (if present)
    """
    payload: Dict[str, Any] = {}
    for k in _STABLE_IDENTITY_FIELDS:
        if k in receipt:
            payload[k] = receipt.get(k)
    return payload


def _embedded_hash(receipt: Dict[str, Any]) -> Optional[str]:
    """
    Read an embedded integrity hash from either:
      - top-level "receipt_hash_sha256" (current pragmatic approach), or
      - receipt["integrity"][...], for forward compatibility.
    """
    # 1) Preferred future shape: integrity object
    integ = receipt.get("integrity")
    if isinstance(integ, dict):
        for k in ("receipt_hash_sha256", "receipt_canonical_hash_sha256", "canonical_hash_sha256"):
            v = integ.get(k)
            if isinstance(v, str) and v:
                return v

    # 2) Current pragmatic shape: top-level
    v = receipt.get("receipt_hash_sha256")
    if isinstance(v, str) and v:
        return v

    return None


def verify_receipt_packet(req: VerifyReceiptRequest) -> VerifyReceiptResponse:
    receipt = req.receipt

    payload = _payload_for_hash(receipt)
    computed = canon_sha256_hex(payload)
    embedded = _embedded_hash(receipt)

    errors: List[str] = []
    ok = True

    if not embedded:
        ok = False
        errors.append("receipt missing embedded integrity hash")
    elif embedded != computed:
        ok = False
        errors.append("receipt integrity hash mismatch (embedded vs computed)")

    # Optional explicit expectation check
    if req.expected_receipt_hash_sha256:
        if computed != req.expected_receipt_hash_sha256:
            ok = False
            errors.append("receipt hash mismatch vs expected")

    return VerifyReceiptResponse(
        ok=ok,
        receipt_hash_sha256=computed,
        checks={
            "payload_for_hash": payload,
            "canonical_hash_computed": computed,
            "canonical_hash_embedded": embedded,
        },
        errors=errors,
    )