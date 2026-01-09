from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


def canonical_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


class VerifyReceiptRequest(BaseModel):
    receipt: Dict[str, Any]
    expected_receipt_hash_sha256: Optional[str] = None


class VerifyReceiptResponse(BaseModel):
    ok: bool
    receipt_hash_sha256: str
    checks: Dict[str, Any] = Field(default_factory=dict)
    errors: List[str] = Field(default_factory=list)


def _payload_for_hash(receipt: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(receipt)
    payload.pop("integrity", None)
    return payload


def _embedded_hash(receipt: Dict[str, Any]) -> Optional[str]:
    # Prefer the canonical new field inside integrity
    integ = receipt.get("integrity") or {}
    for k in ("receipt_canonical_hash_sha256", "canonical_hash_sha256", "receipt_hash_sha256"):
        v = integ.get(k)
        if isinstance(v, str) and v:
            return v

    # Legacy fallbacks (if you ever used these earlier)
    for k in ("receipt_canonical_hash_sha256", "receipt_hash_sha256"):
        v = receipt.get(k)
        if isinstance(v, str) and v:
            return v

    return None


def verify_receipt_packet(req: VerifyReceiptRequest) -> VerifyReceiptResponse:
    receipt = req.receipt

    computed = sha256_hex(canonical_json(_payload_for_hash(receipt)))
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
            "canonical_hash_computed": computed,
            "canonical_hash_embedded": embedded,
        },
        errors=errors,
    )
