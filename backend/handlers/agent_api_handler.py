# backend/handlers/agent_api_handler.py
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

# IMPORTANT: use backend.* absolute imports (fixes your pytest ModuleNotFoundError)
from backend.handlers.epoch_merkle import (
    merkle_root_and_paths,
    receipt_commitment_from_hash_tree_root,
)
from backend.handlers.bitcoin_opreturn import (
    build_claw_opreturn_payload,
    anchor_opreturn_tx_testnet,
)
from backend.handlers.payment_adapters.base import PaymentAdapter, PaymentRequiredError


# ----------------------------
# Deterministic helpers
# ----------------------------

def canonical_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def deterministic_id(prefix: str, payload: Any) -> str:
    return f"{prefix}_{sha256_hex(canonical_json(payload))[:20]}"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _as_jsonable(obj: Any) -> Any:
    """
    Convert common python / pydantic / dataclass-ish objects into JSON-serializable forms
    without throwing. This prevents 500s during receipt/proof assembly when upstream
    returns MerklePath models, dicts, tuples, etc.
    """
    # Pydantic v2
    if hasattr(obj, "model_dump") and callable(getattr(obj, "model_dump")):
        return obj.model_dump()

    # Pydantic v1
    if hasattr(obj, "dict") and callable(getattr(obj, "dict")):
        return obj.dict()

    # Dict already
    if isinstance(obj, dict):
        return obj

    # Tuples/lists already JSON-ish
    if isinstance(obj, (list, tuple)):
        return list(obj)

    # Dataclass / simple object
    if hasattr(obj, "__dict__"):
        try:
            return dict(obj.__dict__)
        except Exception:
            return {"value": str(obj)}

    # Fallback: stringify
    return {"value": str(obj)}


# ----------------------------
# Request / Response Models (now include optional receipt)
# ----------------------------

class ProposeClauseRequest(BaseModel):
    clauses: List[str]
    role: str = Field(default="author")
    signer_name: Optional[str] = None
    signer_wallet: Optional[str] = None


class ProposeClauseResponse(BaseModel):
    action_id: str
    clauses: List[str]
    canonical_hash_sha256: str
    receipt: Optional[Dict[str, Any]] = None


class SignClauseRequest(BaseModel):
    clauses: List[str]
    role: str = Field(default="signer")
    signer_name: Optional[str] = None
    signer_wallet: Optional[str] = None


class SignClauseResponse(BaseModel):
    action_id: str
    clauses: List[str]
    canonical_hash_sha256: str
    signature_payload: Dict[str, Any]
    receipt: Optional[Dict[str, Any]] = None


class GenerateProofRequest(BaseModel):
    clauses: List[str]


class GenerateProofResponse(BaseModel):
    action_id: str
    merkle_root_sha256: str
    merkle_paths: List[Dict[str, Any]]
    receipt_commitment: str
    receipt: Optional[Dict[str, Any]] = None


class AnchorProofRequest(BaseModel):
    merkle_root_sha256: str
    receipt_commitment: str
    network: str = Field(default="testnet")


class AnchorProofResponse(BaseModel):
    action_id: str
    network: str
    txid: str
    op_return: str
    receipt: Optional[Dict[str, Any]] = None


# ----------------------------
# Payment-aware action helpers
# ----------------------------

def _maybe_require_payment(
    *,
    payment_adapter: Optional[PaymentAdapter],
    claw_action_id: str,
    action: str,
    request_context: Dict[str, Any],
    payment_proof_header: Optional[str],
) -> Tuple[List[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Returns (payment_fragments, quoted_terms_or_none), or raises PaymentRequiredError.
    """
    if payment_adapter is None:
        return [], None

    terms = payment_adapter.quote(claw_action_id=claw_action_id, action=action, request_context=request_context)
    if not terms:
        return [], None

    if not payment_proof_header:
        raise PaymentRequiredError(terms)

    vr = payment_adapter.verify(
        claw_action_id=claw_action_id,
        action=action,
        request_context=request_context,
        payment_proof_header=payment_proof_header,
        expected_terms=terms,
    )

    if vr.status != "paid" or not vr.payment_fragment:
        raise PaymentRequiredError(terms)

    return [vr.payment_fragment], terms


# ----------------------------
# Agent-native handlers (return payment fragments for receipt building)
# ----------------------------

def propose_clause(
    request: ProposeClauseRequest,
    *,
    payment_adapter: Optional[PaymentAdapter] = None,
    payment_proof_header: Optional[str] = None,
    request_context: Optional[Dict[str, Any]] = None,
) -> Tuple[ProposeClauseResponse, List[Dict[str, Any]], Dict[str, Any]]:
    ctx = request_context or {}
    payload = {
        "clauses": request.clauses,
        "role": request.role,
        "signer_name": request.signer_name,
        "signer_wallet": request.signer_wallet,
    }
    action_id = deterministic_id("claw_propose", payload)
    canonical_hash = sha256_hex(canonical_json(payload))

    pay_frags, _terms = _maybe_require_payment(
        payment_adapter=payment_adapter,
        claw_action_id=action_id,
        action="propose_clause",
        request_context=ctx,
        payment_proof_header=payment_proof_header,
    )

    claw_block = {
        "action": "propose_clause",
        "action_id": action_id,
        "created_at": _utc_now_iso(),
        "request": ctx,
        "payload": {"canonical_json": canonical_json(payload), "canonical_hash_sha256": canonical_hash},
        "roles": {
            "actor_role": request.role,
            "actor_wallet": request.signer_wallet,
            "actor_name": request.signer_name,
        },
    }

    resp = ProposeClauseResponse(action_id=action_id, clauses=request.clauses, canonical_hash_sha256=canonical_hash)
    return resp, pay_frags, claw_block


def sign_clause(
    request: SignClauseRequest,
    *,
    payment_adapter: Optional[PaymentAdapter] = None,
    payment_proof_header: Optional[str] = None,
    request_context: Optional[Dict[str, Any]] = None,
) -> Tuple[SignClauseResponse, List[Dict[str, Any]], Dict[str, Any]]:
    ctx = request_context or {}
    payload = {
        "clauses": request.clauses,
        "role": request.role,
        "signer_name": request.signer_name,
        "signer_wallet": request.signer_wallet,
    }
    action_id = deterministic_id("claw_sign", payload)
    canonical_hash = sha256_hex(canonical_json(payload))

    pay_frags, _terms = _maybe_require_payment(
        payment_adapter=payment_adapter,
        claw_action_id=action_id,
        action="sign_clause",
        request_context=ctx,
        payment_proof_header=payment_proof_header,
    )

    signature_payload = {
        "message": canonical_hash,
        "scheme": "sha256(canonical_json)",
        "created_at": _utc_now_iso(),
        "action_id": action_id,
    }

    claw_block = {
        "action": "sign_clause",
        "action_id": action_id,
        "created_at": _utc_now_iso(),
        "request": ctx,
        "payload": {"canonical_json": canonical_json(payload), "canonical_hash_sha256": canonical_hash},
        "roles": {
            "actor_role": request.role,
            "actor_wallet": request.signer_wallet,
            "actor_name": request.signer_name,
        },
        "signature_payload": signature_payload,
    }

    resp = SignClauseResponse(
        action_id=action_id,
        clauses=request.clauses,
        canonical_hash_sha256=canonical_hash,
        signature_payload=signature_payload,
    )
    return resp, pay_frags, claw_block


def generate_proof(
    request: GenerateProofRequest,
    *,
    payment_adapter: Optional[PaymentAdapter] = None,
    payment_proof_header: Optional[str] = None,
    request_context: Optional[Dict[str, Any]] = None,
) -> Tuple[GenerateProofResponse, List[Dict[str, Any]], Dict[str, Any]]:
    ctx = request_context or {}
    payload = {"clauses": request.clauses}
    action_id = deterministic_id("claw_proof", payload)

    pay_frags, _terms = _maybe_require_payment(
        payment_adapter=payment_adapter,
        claw_action_id=action_id,
        action="generate_proof",
        request_context=ctx,
        payment_proof_header=payment_proof_header,
    )

    leaf_hashes = [sha256_hex(c) for c in request.clauses]

    mrp = merkle_root_and_paths(leaf_hashes)
    # Support both (root, paths) and (root, <extra>, paths)
    if isinstance(mrp, tuple) and len(mrp) == 2:
        root, paths = mrp
    elif isinstance(mrp, tuple) and len(mrp) == 3:
        root, _, paths = mrp
    else:
        raise ValueError(
            f"Unexpected merkle_root_and_paths return shape: {type(mrp)} "
            f"len={len(mrp) if isinstance(mrp, tuple) else 'n/a'}"
        )

    receipt_commitment = receipt_commitment_from_hash_tree_root(root)

    paths_json = [_as_jsonable(p) for p in paths]

    claw_block = {
        "action": "generate_proof",
        "action_id": action_id,
        "created_at": _utc_now_iso(),
        "request": ctx,
        "payload": {"clauses": request.clauses},
        "proofs": {
            "merkle_root_sha256": root,
            "receipt_commitment": receipt_commitment,
            "merkle_paths": paths_json,
        },
    }

    resp = GenerateProofResponse(
        action_id=action_id,
        merkle_root_sha256=root,
        merkle_paths=paths_json if isinstance(paths_json, list) else [],
        receipt_commitment=receipt_commitment,
    )
    return resp, pay_frags, claw_block


def anchor_proof(
    request: AnchorProofRequest,
    *,
    payment_adapter: Optional[PaymentAdapter] = None,
    payment_proof_header: Optional[str] = None,
    request_context: Optional[Dict[str, Any]] = None,
) -> Tuple[AnchorProofResponse, List[Dict[str, Any]], Dict[str, Any]]:
    ctx = request_context or {}
    payload = {
        "merkle_root_sha256": request.merkle_root_sha256,
        "receipt_commitment": request.receipt_commitment,
    }
    action_id = deterministic_id("claw_anchor", payload)

    pay_frags, _terms = _maybe_require_payment(
        payment_adapter=payment_adapter,
        claw_action_id=action_id,
        action="anchor_proof",
        request_context=ctx,
        payment_proof_header=payment_proof_header,
    )

    opret = build_claw_opreturn_payload(request.receipt_commitment)
    txid = anchor_opreturn_tx_testnet(opret)

    claw_block = {
        "action": "anchor_proof",
        "action_id": action_id,
        "created_at": _utc_now_iso(),
        "request": ctx,
        "payload": payload,
        "proofs": {
            "anchors": [
                {
                    "chain": "bitcoin",
                    "network": request.network,
                    "anchor_type": "op_return",
                    "txid": txid,
                    "op_return_commitment": opret,
                }
            ]
        },
    }

    resp = AnchorProofResponse(action_id=action_id, network=request.network, txid=txid, op_return=opret)
    return resp, pay_frags, claw_block
