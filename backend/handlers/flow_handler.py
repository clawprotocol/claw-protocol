# backend/handlers/flow_handler.py
from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

from backend.handlers.clause_extract import extract_clauses_from_bytes
from backend.handlers.agent_api_handler import (
    ProposeClauseRequest,
    SignClauseRequest,
    GenerateProofRequest,
    AnchorProofRequest,
    propose_clause as propose_clause_fn,
    sign_clause as sign_clause_fn,
    generate_proof as generate_proof_fn,
    anchor_proof as anchor_proof_fn,
)
from backend.handlers.payment_adapters.base import PaymentAdapter
from backend.handlers.receipt_handler import build_receipt


class FlowRequest(BaseModel):
    """
    One-shot CLAW happy-path orchestrator.

    Upload bytes in /agent/flow (multipart) and provide this JSON in a "meta" field.

    Note: this handler is intentionally simple:
    - it runs extract -> sign -> proof -> (optional) anchor
    - it returns one final "flow_receipt" that embeds sub-step receipts and artifacts
    """
    role: str = Field(default="signer")
    signer_name: Optional[str] = None
    signer_wallet: Optional[str] = None

    do_anchor: bool = Field(default=False)
    anchor_network: str = Field(default="testnet")


class FlowResponse(BaseModel):
    ok: bool
    clauses: list[str]
    flow_receipt: Dict[str, Any]
    steps: Dict[str, Any]


def run_flow(
    *,
    file_bytes: bytes,
    meta: FlowRequest,
    request_context: Dict[str, Any],
    payment_adapter: Optional[PaymentAdapter],
    payment_proof_header: Optional[str],
    environment: str,
) -> FlowResponse:
    # 1) extract clauses
    clauses = extract_clauses_from_bytes(file_bytes)
    if not clauses:
        return FlowResponse(ok=False, clauses=[], flow_receipt={}, steps={"error": "no clauses extracted"})

    # 2) propose (optional but useful for “authoring” stage)
    propose_resp, propose_pay, propose_claw = propose_clause_fn(
        ProposeClauseRequest(clauses=clauses, role="author", signer_name=meta.signer_name, signer_wallet=meta.signer_wallet),
        payment_adapter=payment_adapter,
        payment_proof_header=payment_proof_header,
        request_context={**request_context, "path": "/agent/flow:propose"},
    )
    propose_rcpt = build_receipt(claw=propose_claw, payment_fragments=propose_pay, environment=environment)

    # 3) sign
    sign_resp, sign_pay, sign_claw = sign_clause_fn(
        SignClauseRequest(
            clauses=clauses,
            role=meta.role,
            signer_name=meta.signer_name,
            signer_wallet=meta.signer_wallet,
        ),
        payment_adapter=payment_adapter,
        payment_proof_header=payment_proof_header,
        request_context={**request_context, "path": "/agent/flow:sign"},
    )
    sign_rcpt = build_receipt(claw=sign_claw, payment_fragments=sign_pay, environment=environment)

    # 4) proof
    proof_resp, proof_pay, proof_claw = generate_proof_fn(
        GenerateProofRequest(clauses=clauses),
        payment_adapter=payment_adapter,
        payment_proof_header=payment_proof_header,
        request_context={**request_context, "path": "/agent/flow:proof"},
    )
    proof_rcpt = build_receipt(claw=proof_claw, payment_fragments=proof_pay, environment=environment)

    anchor_rcpt = None
    anchor_resp = None

    # 5) optional anchor
    if meta.do_anchor:
        anchor_resp, anchor_pay, anchor_claw = anchor_proof_fn(
            AnchorProofRequest(
                merkle_root_sha256=proof_resp.merkle_root_sha256,
                receipt_commitment=proof_resp.receipt_commitment,
                network=meta.anchor_network,
            ),
            payment_adapter=payment_adapter,
            payment_proof_header=payment_proof_header,
            request_context={**request_context, "path": "/agent/flow:anchor"},
        )
        anchor_rcpt = build_receipt(claw=anchor_claw, payment_fragments=anchor_pay, environment=environment)

    # 6) final flow receipt (one envelope)
    flow_claw_block: Dict[str, Any] = {
        "action": "flow",
        "action_id": f"claw_flow_{sign_resp.action_id}",
        "created_at": sign_claw.get("created_at"),
        "request": request_context,
        "payload": {
            "clauses": clauses,
            "signer_wallet": meta.signer_wallet,
            "do_anchor": meta.do_anchor,
            "anchor_network": meta.anchor_network if meta.do_anchor else None,
        },
        "artifacts": {
            "propose": {
                "response": propose_resp.model_dump(),
                "receipt": propose_rcpt,
            },
            "sign": {
                "response": sign_resp.model_dump(),
                "receipt": sign_rcpt,
            },
            "proof": {
                "response": proof_resp.model_dump(),
                "receipt": proof_rcpt,
            },
            "anchor": {
                "response": anchor_resp.model_dump() if anchor_resp else None,
                "receipt": anchor_rcpt,
            },
        },
    }

    # Flow receipt does not duplicate per-step payments; it nests full step receipts already.
    flow_receipt = build_receipt(claw=flow_claw_block, payment_fragments=[], environment=environment)

    steps = {
        "propose": propose_resp.model_dump(),
        "sign": sign_resp.model_dump(),
        "proof": proof_resp.model_dump(),
        "anchor": anchor_resp.model_dump() if anchor_resp else None,
    }

    return FlowResponse(ok=True, clauses=clauses, flow_receipt=flow_receipt, steps=steps)
