# backend/handlers/verify_tree_handler.py
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

from backend.handlers.verify_handler import VerifyReceiptRequest, verify_receipt_packet


# ----------------------------
# Models
# ----------------------------

class VerifyTreeRequest(BaseModel):
    """
    Accepts either:
      - parent_receipt containing embedded children receipts in parent_receipt["children"]
    OR
      - parent_receipt + child_receipts passed separately in this request

    strict=True enforces that the parent-reported/embedded children match provided children by hash.
    """
    parent_receipt: Dict[str, Any]
    child_receipts: Optional[Dict[str, Optional[Dict[str, Any]]]] = None  # keys like propose/sign/proof/anchor
    strict: bool = Field(default=False)


class VerifyTreeResponse(BaseModel):
    ok: bool
    parent_ok: bool
    parent_receipt_hash_sha256: Optional[str] = None

    children_total: int = 0
    children_ok: int = 0

    # helpful diagnostics
    child_results: List[Dict[str, Any]] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)


# ----------------------------
# Helpers
# ----------------------------

def _receipt_hash_from_verify_response(v: Dict[str, Any]) -> Optional[str]:
    return v.get("receipt_hash_sha256") or (v.get("checks") or {}).get("canonical_hash_computed")


def _canonical_child_list_from_parent(parent: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Parent receipts may embed children in "children".
    If absent, return [].
    """
    ch = parent.get("children")
    if isinstance(ch, list):
        return [c for c in ch if isinstance(c, dict)]
    return []


def _normalize_child_receipts_from_request(req: VerifyTreeRequest) -> List[Tuple[str, Dict[str, Any]]]:
    """
    Convert request.child_receipts dict into a list of (label, receipt_obj).
    Skips null values.
    """
    out: List[Tuple[str, Dict[str, Any]]] = []
    if not req.child_receipts:
        return out
    for k, v in req.child_receipts.items():
        if v is None:
            continue
        if isinstance(v, dict):
            out.append((k, v))
    return out


def _child_label_from_receipt(r: Dict[str, Any], fallback: str) -> str:
    claw = r.get("claw") if isinstance(r.get("claw"), dict) else {}
    action = claw.get("action")
    if isinstance(action, str) and action:
        return action
    return fallback


# ----------------------------
# Main verifier
# ----------------------------

def verify_receipt_tree(req: VerifyTreeRequest) -> VerifyTreeResponse:
    errors: List[str] = []
    child_results: List[Dict[str, Any]] = []

    # 1) verify parent receipt integrity
    parent_verify = verify_receipt_packet(
        VerifyReceiptRequest(receipt=req.parent_receipt, expected_receipt_hash_sha256=None)
    ).model_dump()

    parent_ok = bool(parent_verify.get("ok"))
    parent_hash = _receipt_hash_from_verify_response(parent_verify)

    if not parent_ok:
        errors.append("parent receipt failed integrity verification")
        # include underlying errors
        for e in parent_verify.get("errors") or []:
            errors.append(f"parent: {e}")

    # 2) determine children set:
    #    Prefer parent-embedded children if present,
    #    otherwise use request.child_receipts
    embedded_children = _canonical_child_list_from_parent(req.parent_receipt)

    request_children = _normalize_child_receipts_from_request(req)

    if embedded_children:
        children = [(_child_label_from_receipt(c, f"child_{i}"), c) for i, c in enumerate(embedded_children)]
        source = "parent.children"
    else:
        children = request_children
        source = "request.child_receipts"

    children_total = len(children)
    children_ok = 0

    # 3) verify each child
    verified_child_hashes: List[str] = []
    for idx, (label, child) in enumerate(children):
        v = verify_receipt_packet(VerifyReceiptRequest(receipt=child, expected_receipt_hash_sha256=None)).model_dump()
        ok = bool(v.get("ok"))
        h = _receipt_hash_from_verify_response(v)
        if ok:
            children_ok += 1
        if h:
            verified_child_hashes.append(h)

        child_results.append(
            {
                "index": idx,
                "label": label,
                "ok": ok,
                "receipt_hash_sha256": h,
                "errors": v.get("errors") or [],
            }
        )

    # 4) strict linkage check (optional)
    #    If strict=True AND request.child_receipts provided AND parent has embedded children:
    #    - compare the set of hashes from embedded children vs request children
    if req.strict and req.child_receipts and embedded_children:
        # verify request children separately (even if we already used embedded children as children list)
        req_child_list = _normalize_child_receipts_from_request(req)
        req_hashes: List[str] = []
        for _k, rc in req_child_list:
            vv = verify_receipt_packet(VerifyReceiptRequest(receipt=rc, expected_receipt_hash_sha256=None)).model_dump()
            hh = _receipt_hash_from_verify_response(vv)
            if hh:
                req_hashes.append(hh)

        embedded_hashes: List[str] = []
        for ec in embedded_children:
            vv = verify_receipt_packet(VerifyReceiptRequest(receipt=ec, expected_receipt_hash_sha256=None)).model_dump()
            hh = _receipt_hash_from_verify_response(vv)
            if hh:
                embedded_hashes.append(hh)

        if sorted(req_hashes) != sorted(embedded_hashes):
            errors.append("strict mismatch: provided child_receipts do not match parent embedded children (by hash)")

    ok = parent_ok and (children_ok == children_total) and (len(errors) == 0)

    return VerifyTreeResponse(
        ok=ok,
        parent_ok=parent_ok,
        parent_receipt_hash_sha256=parent_hash,
        children_total=children_total,
        children_ok=children_ok,
        child_results=child_results,
        errors=errors + ([f"children source: {source}"] if source else []),
    )
