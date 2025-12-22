# backend/handlers/agent_api_handler.py
from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field


# ----------------------------
# Deterministic helpers
# ----------------------------

def canonical_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def deterministic_id(prefix: str, payload: Any) -> str:
    return f"{prefix}_{sha256_hex(canonical_json(payload))[:24]}"


# ----------------------------
# In-memory stores (stub phase)
# ----------------------------

PROPOSALS: Dict[str, Dict[str, Any]] = {}
SIGNATURES: Dict[str, Dict[str, Any]] = {}
PROOFS: Dict[str, Dict[str, Any]] = {}
RECEIPTS: Dict[str, Dict[str, Any]] = {}


# ----------------------------
# API models
# ----------------------------

class ClauseConstraints(BaseModel):
    max_value: Optional[float] = None
    expiry: Optional[str] = None  # ISO8601 string
    revocable: bool = False


class ExecutionPolicy(BaseModel):
    auto_execute: bool = True
    human_required: bool = False
    dispute_window_seconds: int = 0


class ClauseObject(BaseModel):
    clause_id: str
    clause_text: str
    jurisdiction: Optional[str] = None
    roles: List[str] = Field(default_factory=list)
    constraints: ClauseConstraints = Field(default_factory=ClauseConstraints)
    execution_policy: ExecutionPolicy = Field(default_factory=ExecutionPolicy)
    hash: Optional[str] = None  # optional input; we compute our own clause_hash


class ProposeClauseRequest(BaseModel):
    agent_id: str
    clause: ClauseObject
    signature: str  # stub: opaque string
    idempotency_key: Optional[str] = None


class ProposeClauseResponse(BaseModel):
    proposal_id: str
    clause_hash: str


class SignatureObject(BaseModel):
    signer_id: str
    signer_type: str  # "human" | "agent"
    role: str
    signature: str
    timestamp: Optional[str] = None
    scope: str = "limited"
    authority_proof: Optional[Dict[str, Any]] = None


class SignClauseRequest(BaseModel):
    proposal_id: str
    signature_object: SignatureObject
    idempotency_key: Optional[str] = None


class SignClauseResponse(BaseModel):
    signature_id: str
    proposal_id: str


class GenerateProofRequest(BaseModel):
    proposal_id: str
    signature_ids: Optional[List[str]] = None


class GenerateProofResponse(BaseModel):
    proof_id: str
    receipt_id: str
    proof_packet: Dict[str, Any]


class AnchorProofRequest(BaseModel):
    proof_id: str
    anchor_type: str = "internal"  # "blockchain" | "notary" | "internal"


class AnchorProofResponse(BaseModel):
    proof_id: str
    anchor: Dict[str, Any]


class VerifyReceiptResponse(BaseModel):
    verified: bool
    proof_id: Optional[str] = None
    anchor_valid: bool = False
    signatures_valid: bool = True  # stub (no cryptographic verification yet)
    tamper_detected: bool = False
    explanation: str = ""


# ----------------------------
# Core operations
# ----------------------------

def propose_clause(req: ProposeClauseRequest) -> Tuple[str, str]:
    clause_payload = req.clause.model_dump()
    clause_hash = sha256_hex(canonical_json(clause_payload))

    proposal_payload = {
        "agent_id": req.agent_id,
        "clause": clause_payload,
        "clause_hash": clause_hash,
        "signature": req.signature,
        "idempotency_key": req.idempotency_key,
    }
    proposal_id = deterministic_id("proposal", proposal_payload)

    PROPOSALS[proposal_id] = proposal_payload
    return proposal_id, clause_hash


def sign_clause(req: SignClauseRequest) -> str:
    if req.proposal_id not in PROPOSALS:
        raise KeyError("proposal_not_found")

    sig_payload = {
        "proposal_id": req.proposal_id,
        "signature_object": req.signature_object.model_dump(),
        "idempotency_key": req.idempotency_key,
    }
    signature_id = deterministic_id("sig", sig_payload)
    SIGNATURES[signature_id] = sig_payload
    return signature_id


def generate_proof(req: GenerateProofRequest) -> Tuple[str, str, Dict[str, Any]]:
    if req.proposal_id not in PROPOSALS:
        raise KeyError("proposal_not_found")

    proposal = PROPOSALS[req.proposal_id]

    if req.signature_ids:
        sig_ids = req.signature_ids
    else:
        sig_ids = [sid for sid, s in SIGNATURES.items() if s.get("proposal_id") == req.proposal_id]

    proof_packet = {
        "proposal_id": req.proposal_id,
        "clause_hash": proposal["clause_hash"],
        "signatures": sig_ids,
        "hash_tree_root": sha256_hex(canonical_json({"clause_hash": proposal["clause_hash"], "signatures": sig_ids})),
        "anchor": {"type": "internal", "reference": "unanchored"},
        "lineage": {"parent_proofs": [], "supersedes": []},
    }

    proof_id = deterministic_id("proof", proof_packet)
    proof_packet["proof_id"] = proof_id
    PROOFS[proof_id] = proof_packet

    receipt = {
        "proof_id": proof_id,
        "summary": f"Proposal {req.proposal_id} proved with {len(sig_ids)} signature(s); anchor={proof_packet['anchor']['reference']}.",
        "verifiable": True,
        "verify_endpoint": "/verify_receipt/{receipt_id}",
    }
    receipt_id = deterministic_id("receipt", receipt)
    receipt["receipt_id"] = receipt_id
    RECEIPTS[receipt_id] = receipt

    return proof_id, receipt_id, proof_packet


def anchor_proof(req: AnchorProofRequest) -> Dict[str, Any]:
    if req.proof_id not in PROOFS:
        raise KeyError("proof_not_found")

    proof = PROOFS[req.proof_id]
    anchor_ref = deterministic_id("anchor", {"anchor_type": req.anchor_type, "proof_id": req.proof_id, "root": proof["hash_tree_root"]})

    proof["anchor"] = {"type": req.anchor_type, "reference": anchor_ref}
    PROOFS[req.proof_id] = proof

    # Update receipts for this proof (stub)
    for rid, r in list(RECEIPTS.items()):
        if r.get("proof_id") == req.proof_id:
            r["summary"] = f"Proof {req.proof_id} anchored to {anchor_ref}."
            RECEIPTS[rid] = r

    return proof["anchor"]


def verify_receipt(receipt_id: str) -> VerifyReceiptResponse:
    r = RECEIPTS.get(receipt_id)
    if not r:
        return VerifyReceiptResponse(verified=False, explanation="Receipt not found.")

    proof_id = r.get("proof_id")
    proof = PROOFS.get(proof_id) if proof_id else None
    if not proof:
        return VerifyReceiptResponse(
            verified=False,
            proof_id=proof_id,
            tamper_detected=True,
            explanation="Receipt exists but proof not found."
        )

    anchor_ref = proof.get("anchor", {}).get("reference", "unanchored")
    anchor_valid = anchor_ref != "unanchored"

    return VerifyReceiptResponse(
        verified=True,
        proof_id=proof_id,
        anchor_valid=anchor_valid,
        signatures_valid=True,
        tamper_detected=False,
        explanation="Verified deterministically (stub)."
    )
