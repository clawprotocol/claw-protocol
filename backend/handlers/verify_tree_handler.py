# backend/handlers/verify_tree_handler.py
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from backend.handlers.verify_handler import VerifyReceiptRequest, verify_receipt_packet


class VerifyTreeRequest(BaseModel):
    """
    Flexible tree verification request.

    Supported shapes (all optional to avoid 500s):
      1) {"receipt": {...}, "children": [{"receipt": {...}}, ...]}
      2) {"receipt": {...}, "children_receipts": [{...}, ...]}
      3) {"receipt_id": "..."}   (we will NOT fetch server-side; returns a structured error)
      4) {"root": {...}}         (legacy alias)
    """

    # Preferred
    receipt: Optional[Dict[str, Any]] = None

    # Legacy aliases
    root: Optional[Dict[str, Any]] = None
    receipt_id: Optional[str] = None

    # Children formats
    children: Optional[List[Dict[str, Any]]] = None
    children_receipts: Optional[List[Dict[str, Any]]] = None

    # Optional expected hash for root verification
    expected_receipt_hash_sha256: Optional[str] = None


class VerifyTreeResponse(BaseModel):
    ok: bool

    # Root receipt verification result (same shape as /verify)
    root: Optional[Dict[str, Any]] = None

    # Children verification results
    children: List[Dict[str, Any]] = Field(default_factory=list)

    # Informational flags
    tree_skipped: bool = False

    # Errors (never throw)
    errors: List[str] = Field(default_factory=list)


def _extract_root_receipt(req: VerifyTreeRequest) -> Optional[Dict[str, Any]]:
    if isinstance(req.receipt, dict):
        return req.receipt
    if isinstance(req.root, dict):
        return req.root
    return None


def _extract_children(req: VerifyTreeRequest) -> List[Dict[str, Any]]:
    # children may be [{"receipt": {...}}, {"receipt": {...}}] or [{...}, {...}]
    raw: List[Dict[str, Any]] = []
    if isinstance(req.children, list):
        raw.extend([c for c in req.children if isinstance(c, dict)])
    if isinstance(req.children_receipts, list):
        raw.extend([c for c in req.children_receipts if isinstance(c, dict)])

    out: List[Dict[str, Any]] = []
    for c in raw:
        if "receipt" in c and isinstance(c["receipt"], dict):
            out.append(c["receipt"])
        else:
            out.append(c)
    return out


def verify_receipt_tree(req: VerifyTreeRequest) -> VerifyTreeResponse:
    """
    Verify a root receipt and (optionally) a list of child receipts.

    IMPORTANT: This function MUST NOT raise. It must always return a structured response.
    """
    errors: List[str] = []

    root_receipt = _extract_root_receipt(req)
    if root_receipt is None:
        # We intentionally do NOT fetch by receipt_id here (pure verifier).
        # Returning a structured error avoids 500s and keeps the API deterministic.
        if req.receipt_id:
            errors.append(
                "verify/tree requires a receipt object (server will not fetch by receipt_id). "
                "Provide {\"receipt\": {...}} in the request body."
            )
        else:
            errors.append("verify/tree missing root receipt. Provide {\"receipt\": {...}}.")
        return VerifyTreeResponse(ok=False, root=None, children=[], tree_skipped=True, errors=errors)

    # Verify root using the same rules as /verify
    try:
        root_resp = verify_receipt_packet(
            VerifyReceiptRequest(
                receipt=root_receipt,
                expected_receipt_hash_sha256=req.expected_receipt_hash_sha256,
            )
        )
        root_dict = root_resp.model_dump()
    except Exception as e:
        # Never throw; return structured error
        errors.append(f"root verification error: {type(e).__name__}: {str(e)}")
        return VerifyTreeResponse(ok=False, root=None, children=[], tree_skipped=True, errors=errors)

    # Verify children (if any). Timeline receipts currently have no children; that's fine.
    children_receipts = _extract_children(req)
    children_out: List[Dict[str, Any]] = []
    child_ok = True

    for idx, child in enumerate(children_receipts):
        if not isinstance(child, dict):
            child_ok = False
            children_out.append(
                {
                    "index": idx,
                    "ok": False,
                    "errors": ["child receipt is not an object"],
                }
            )
            continue

        try:
            cr = verify_receipt_packet(VerifyReceiptRequest(receipt=child))
            children_out.append({"index": idx, **cr.model_dump()})
            if not cr.ok:
                child_ok = False
        except Exception as e:
            child_ok = False
            children_out.append(
                {
                    "index": idx,
                    "ok": False,
                    "errors": [f"{type(e).__name__}: {str(e)}"],
                }
            )

    tree_skipped = len(children_receipts) == 0
    ok = bool(root_dict.get("ok")) and child_ok

    return VerifyTreeResponse(
        ok=ok,
        root=root_dict,
        children=children_out,
        tree_skipped=tree_skipped,
        errors=errors,
    )
