# backend/handlers/agent_api_handler.py
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

# IMPORTANT: use backend.* absolute imports (fixes pytest ModuleNotFoundError)
from backend.handlers.epoch_merkle import (
    MerklePath,
    merkle_root_and_paths,
    merkle_verify,
    receipt_commitment_from_hash_tree_root,
)
from backend.handlers.bitcoin_opreturn import (
    build_claw_opreturn_payload,
    anchor_opreturn_tx_testnet,
)

# ----------------------------
# Deterministic helpers
# ----------------------------

def canonical_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def deterministic_id(prefix: str, payload: Any) -> str:
    return f"{prefix}_{sha256_hex(canonical_json(payload))[:24]}"


def _is_hex_32bytes(s: str) -> bool:
    if not isinstance(s, str):
        return False
    if len(s) != 64:
        return False
    try:
        bytes.fromhex(s)
        return True
    except Exception:
        return False


# ----------------------------
# In-memory stores (stub phase)
# ----------------------------

PROPOSALS: Dict[str, Dict[str, Any]] = {}
SIGNATURES: Dict[str, Dict[str, Any]] = {}
PROOFS: Dict[str, Dict[str, Any]] = {}
RECEIPTS: Dict[str, Dict[str, Any]] = {}

# Epoch anchoring stores
EPOCHS: Dict[str, Dict[str, Any]] = {}          # epoch_id -> epoch manifest
RECEIPT_ANCHOR: Dict[str, Dict[str, Any]] = {}  # receipt_id -> anchoring info (commitment + merkle path + txid)


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
    anchor_type: str = "internal"  # "bitcoin_opreturn" | "internal" | etc.


class AnchorProofResponse(BaseModel):
    proof_id: str
    anchor: Dict[str, Any]


class VerifyReceiptResponse(BaseModel):
    verified: bool
    proof_id: Optional[str] = None
    anchor_valid: bool = False
    signatures_valid: bool = True  # stub (no cryptographic verification yet)
    tamper_detected: bool = False

    # Epoch anchoring extension
    epoch_id: Optional[str] = None
    epoch_inclusion_valid: bool = False
    bitcoin_anchor_valid: bool = False
    bitcoin_txid: Optional[str] = None

    explanation: str = ""


# Epoch API models (optional; used if your FastAPI layer validates)
class EpochReceiptInput(BaseModel):
    receipt_id: str
    hash_tree_root: str  # hex32


class EpochBuildRequest(BaseModel):
    network: str = "testnet"
    epoch_start_height: int
    epoch_end_height: int
    receipts: List[EpochReceiptInput]


class EpochBuildResponse(BaseModel):
    ok: bool
    epoch_id: Optional[str] = None
    epoch_root: Optional[str] = None
    receipt_count: int = 0
    reason: str = ""


class EpochAnchorRequest(BaseModel):
    epoch_id: str


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

    # Minimal proof hash root (v0.1)
    hash_tree_root = sha256_hex(canonical_json({"clause_hash": proposal["clause_hash"], "signatures": sig_ids}))

    proof_packet = {
        "proposal_id": req.proposal_id,
        "clause_hash": proposal["clause_hash"],
        "signatures": sig_ids,
        "hash_tree_root": hash_tree_root,
        "anchor": {"type": "internal", "reference": "unanchored"},
        "lineage": {"parent_proofs": [], "supersedes": []},
    }

    proof_id = deterministic_id("proof", proof_packet)
    proof_packet["proof_id"] = proof_id
    PROOFS[proof_id] = proof_packet

    receipt = {
        "proof_id": proof_id,
        "hash_tree_root": hash_tree_root,  # include for epoch anchoring inputs
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
    anchor_ref = deterministic_id(
        "anchor",
        {"anchor_type": req.anchor_type, "proof_id": req.proof_id, "root": proof["hash_tree_root"]},
    )

    proof["anchor"] = {"type": req.anchor_type, "reference": anchor_ref}
    PROOFS[req.proof_id] = proof

    for rid, r in list(RECEIPTS.items()):
        if r.get("proof_id") == req.proof_id:
            r["summary"] = f"Proof {req.proof_id} anchored to {anchor_ref}."
            RECEIPTS[rid] = r

    return proof["anchor"]


# ----------------------------
# Epoch anchoring (B=144 blocks)
# ----------------------------

def epoch_build(req: EpochBuildRequest) -> EpochBuildResponse:
    network = (req.network or "testnet").strip()
    start_h = int(req.epoch_start_height)
    end_h = int(req.epoch_end_height)
    receipts = req.receipts or []
    if not receipts:
        return EpochBuildResponse(ok=False, reason="no_receipts", receipt_count=0)

    # Validate inputs early for clean error messages
    for r in receipts:
        if not _is_hex_32bytes(r.hash_tree_root):
            return EpochBuildResponse(
                ok=False,
                reason=f"bad_hash_tree_root_for_receipt:{r.receipt_id}",
                receipt_count=len(receipts),
            )

    # 1) compute commitments per receipt (commitment derived from each proof's hash_tree_root)
    receipt_commitments: List[str] = []
    for r in receipts:
        receipt_commitments.append(receipt_commitment_from_hash_tree_root(r.hash_tree_root))

    # 2) build epoch root + paths (paths correspond to commitments_sorted order)
    epoch_root, paths, commitments_sorted = merkle_root_and_paths(receipt_commitments)

    # 3) map commitment -> list of receipt_ids that have it (rare collisions possible)
    commit_to_receipt_ids: Dict[str, List[str]] = {}
    for r, c in zip(receipts, receipt_commitments):
        commit_to_receipt_ids.setdefault(c, []).append(r.receipt_id)

    epoch_id = f"btc:{network}:{start_h}-{end_h}"

    manifest = {
        "epoch_id": epoch_id,
        "network": network,
        "epoch_start_height": start_h,
        "epoch_end_height": end_h,
        "receipt_count": len(receipts),
        "epoch_root": epoch_root,
        "anchor": {
            "type": "bitcoin_opreturn",
            "network": network,
            "txid": None,
            "vout": None,
            "block_height": None,
            "block_hash": None,
            "confirmations": None,
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    EPOCHS[epoch_id] = manifest

    # 4) store per-receipt inclusion proofs
    for c, p in zip(commitments_sorted, paths):
        for rid in commit_to_receipt_ids.get(c, []):
            RECEIPT_ANCHOR[rid] = {
                "epoch_id": epoch_id,
                "network": network,
                "epoch_root": epoch_root,
                "receipt_commitment": c,
                "merkle_path": {"siblings": p.siblings, "positions": p.positions},
                "txid": None,
            }

    return EpochBuildResponse(ok=True, epoch_id=epoch_id, epoch_root=epoch_root, receipt_count=len(receipts))


def epoch_get(epoch_id: str) -> Dict[str, Any]:
    m = EPOCHS.get(epoch_id)
    if not m:
        raise KeyError("epoch_not_found")
    return m


def receipt_anchor_proof(receipt_id: str) -> Dict[str, Any]:
    info = RECEIPT_ANCHOR.get(receipt_id)
    if not info:
        raise KeyError("anchor_proof_not_found")
    return info


def epoch_anchor_testnet(req: EpochAnchorRequest) -> Dict[str, Any]:
    epoch_id = req.epoch_id
    if epoch_id not in EPOCHS:
        raise KeyError("epoch_not_found")

    m = EPOCHS[epoch_id]
    if m["anchor"].get("txid"):
        return {"ok": True, "epoch_id": epoch_id, "txid": m["anchor"]["txid"], "already_anchored": True}

    epoch_root = m["epoch_root"]
    start_h = m["epoch_start_height"]
    end_h = m["epoch_end_height"]

    # Build OP_RETURN payload (45 bytes target)
    opreturn_hex = build_claw_opreturn_payload(epoch_root, start_h, end_h)

    # Broadcast using Bitcoin Core RPC (testnet)
    res = anchor_opreturn_tx_testnet(opreturn_hex)
    txid = res["txid"]

    m["anchor"]["txid"] = txid
    m["anchor"]["vout"] = 0  # placeholder; can be discovered later
    EPOCHS[epoch_id] = m

    # Attach txid to receipts in this epoch
    for rid, info in RECEIPT_ANCHOR.items():
        if info.get("epoch_id") == epoch_id:
            info["txid"] = txid

    return {"ok": True, "epoch_id": epoch_id, "txid": txid, "opreturn_hex": opreturn_hex}


# ----------------------------
# Verification
# ----------------------------

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
            explanation="Receipt exists but proof not found.",
        )

    anchor_ref = proof.get("anchor", {}).get("reference", "unanchored")
    anchor_valid = anchor_ref != "unanchored"

    # Epoch anchoring verification (if present)
    epoch_info = RECEIPT_ANCHOR.get(receipt_id)
    epoch_id = epoch_info.get("epoch_id") if epoch_info else None

    epoch_inclusion_valid = False
    bitcoin_anchor_valid = False
    bitcoin_txid = None

    if epoch_info:
        bitcoin_txid = epoch_info.get("txid")

        # 1) recompute receipt commitment from proof hash_tree_root
        expected_commit = receipt_commitment_from_hash_tree_root(proof["hash_tree_root"])

        # 2) verify Merkle inclusion against epoch_root
        path = MerklePath(
            siblings=epoch_info["merkle_path"]["siblings"],
            positions=epoch_info["merkle_path"]["positions"],
        )
        epoch_root = epoch_info["epoch_root"]

        epoch_inclusion_valid = (expected_commit == epoch_info["receipt_commitment"]) and merkle_verify(
            expected_commit, epoch_root, path
        )

        # 3) bitcoin anchor validity is stubbed until we parse tx + verify OP_RETURN
        bitcoin_anchor_valid = bool(bitcoin_txid)

    return VerifyReceiptResponse(
        verified=True,
        proof_id=proof_id,
        anchor_valid=anchor_valid,
        signatures_valid=True,
        tamper_detected=False,
        epoch_id=epoch_id,
        epoch_inclusion_valid=epoch_inclusion_valid,
        bitcoin_anchor_valid=bitcoin_anchor_valid,
        bitcoin_txid=bitcoin_txid,
        explanation="Verified deterministically (stub).",
    )
