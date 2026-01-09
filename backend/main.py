# backend/main.py
from __future__ import annotations

import json
import os
import traceback
from typing import Any, Dict, Optional

from fastapi import FastAPI, UploadFile, File, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.handlers.clause_extract import extract_clauses_from_bytes
from backend.handlers.receipt_handler import build_receipt, receipt_summary
from backend.handlers.verify_handler import VerifyReceiptRequest, verify_receipt_packet
from backend.handlers.verify_tree_handler import VerifyTreeRequest, verify_receipt_tree  # ✅ NEW

# Agent APIs
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

# Payment plumbing (x402 provisioned but can be “off” via env prices/payee)
from backend.handlers.payment_adapters.base import PaymentRequiredError, PaymentAdapter
from backend.handlers.payment_adapters.x402 import X402PaymentAdapter

# ✅ Tier enforcement + usage metering
from backend.utils.usage_store import UsageStore
from backend.utils.enforce import (
    principal_from_request,
    assert_upload_limits,
    assert_capability,
    assert_priority_anchor,
    record_upload,
    record_priority_anchor,
    TierLimitError,
)
from backend.utils.tiers import Capability

# ✅ Batch anchoring queue
from backend.utils.anchor_queue import AnchorQueue


app = FastAPI(title="CLAW Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ simple local usage counters (audit/usage.sqlite3 by default)
usage_store = UsageStore()

# ✅ anchor job queue (uses same sqlite file by default)
anchor_queue = AnchorQueue()


def _payment_adapter() -> Optional[PaymentAdapter]:
    return X402PaymentAdapter()


def _request_context(req: Request) -> Dict[str, Any]:
    base_url = str(req.base_url).rstrip("/")
    return {
        "resource": f"{req.method} {base_url}{req.url.path}",
        "method": req.method,
        "path": req.url.path,
    }


def _payment_header_value(req: Request) -> Optional[str]:
    hdr_name = os.getenv("CLAW_X402_PAYMENT_HEADER", "X-PAYMENT")
    return req.headers.get(hdr_name)


def _environment() -> str:
    return os.getenv("CLAW_ENVIRONMENT", "local")


def _debug_enabled() -> bool:
    return os.getenv("CLAW_DEBUG", "1").lower() in ("1", "true", "yes")


def _bytes_to_mb_ceil(n: int) -> int:
    # integer “MB” for policy checks (ceil-ish)
    # 1 MB = 1,048,576 bytes
    return (n + 1_048_576 - 1) // 1_048_576


def _tier_error_response(e: TierLimitError) -> JSONResponse:
    # Use 429 for quota/limits; keep 402 reserved for payment adapter “terms”
    return JSONResponse(
        status_code=429,
        content={
            "error": str(e),
            "code": getattr(e, "code", "tier_limit"),
            "hint": "Upgrade tier or reduce usage.",
        },
    )


def _mainnet_disabled() -> bool:
    return os.getenv("CLAW_ANCHOR_ENABLE_MAINNET", "0") != "1"


def _anchor_mode_env() -> str:
    # "batch" (safe default) | "immediate" (dev/testnet)
    return os.getenv("CLAW_ANCHOR_MODE", "batch").strip().lower()


def _default_anchor_network() -> str:
    return os.getenv("CLAW_ANCHOR_DEFAULT_NETWORK", "testnet").strip().lower()


def _admin_ok(req: Request) -> bool:
    """
    Simple protection for admin-only endpoints.
    If CLAW_ADMIN_SECRET is unset, endpoint is OPEN (dev convenience).
    Set CLAW_ADMIN_SECRET in prod and pass x-claw-admin-secret header.
    """
    secret = os.getenv("CLAW_ADMIN_SECRET", "").strip()
    if not secret:
        return True
    return req.headers.get("x-claw-admin-secret") == secret


# -------------------------------------------------
# Health + Version
# -------------------------------------------------
@app.get("/health")
async def health():
    return JSONResponse({"ok": True})


@app.get("/version")
async def version():
    return JSONResponse(
        {
            "name": "claw-backend",
            "environment": _environment(),
            "debug": _debug_enabled(),
            "x402_payment_header": os.getenv("CLAW_X402_PAYMENT_HEADER", "X-PAYMENT"),
            # Enforcement is header-driven for now:
            # - x-claw-wallet OR x-claw-api-key (identity)
            # - x-claw-tier (tier)
            "tier_headers": ["x-claw-wallet", "x-claw-api-key", "x-claw-tier"],
            # Anchoring switches
            "anchor": {
                "default_network": _default_anchor_network(),
                "mainnet_enabled": not _mainnet_disabled(),
                "mode": _anchor_mode_env(),
            },
        }
    )


# -------------------------------------------------
# /extract — upload and extract clauses
# -------------------------------------------------
@app.post("/extract")
async def extract(req: Request, file: UploadFile = File(...)):
    p = principal_from_request(req)
    try:
        content = await file.read()
        file_mb = _bytes_to_mb_ceil(len(content))
        assert_upload_limits(p, usage_store, file_mb=file_mb)
        record_upload(p, usage_store)
    except TierLimitError as e:
        return _tier_error_response(e)

    clauses = extract_clauses_from_bytes(content, filename=file.filename)
    return JSONResponse({"clauses": clauses})


# -------------------------------------------------
# /verify — verify a receipt packet (expects JSON)
# -------------------------------------------------
@app.post("/verify")
async def verify(body: Dict[str, Any]):
    receipt_obj = body.get("receipt", body)
    expected = body.get("expected_receipt_hash_sha256") or body.get("expected")

    req = VerifyReceiptRequest(receipt=receipt_obj, expected_receipt_hash_sha256=expected)
    resp = verify_receipt_packet(req)
    return JSONResponse(resp.model_dump())


# -------------------------------------------------
# /verify/tree — verify a parent receipt + its child receipts
# -------------------------------------------------
@app.post("/verify/tree")
async def verify_tree(body: Dict[str, Any]):
    """
    Accepts JSON shaped like:
      {
        "parent_receipt": {...},
        "child_receipts": { "propose": {...}, "sign": {...}, "proof": {...}, "anchor": null },
        "strict": false
      }

    You can omit child_receipts if parent_receipt already embeds "children".
    """
    req = VerifyTreeRequest(**body)
    resp = verify_receipt_tree(req)
    return JSONResponse(resp.model_dump())


# -------------------------------------------------
# /admin/anchor/run — drain queued anchors (batch mode)
# -------------------------------------------------
@app.post("/admin/anchor/run")
async def admin_anchor_run(req: Request):
    if not _admin_ok(req):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})

    if _anchor_mode_env() != "batch":
        return JSONResponse(status_code=409, content={"error": "Not in batch mode"})

    adapter = _payment_adapter()
    pay_hdr = _payment_header_value(req)
    ctx = {**_request_context(req), "path": "/admin/anchor/run"}

    max_n = int(os.getenv("CLAW_ANCHOR_MAX_PER_BATCH", "50000"))
    jobs = anchor_queue.claim_batch(max_n=max_n)
    if not jobs:
        return JSONResponse({"ok": True, "ran": 0, "done": 0, "failed": 0, "pending": anchor_queue.pending_count()})

    ran = done = failed = 0

    for j in jobs:
        ran += 1
        try:
            # mainnet kill switch
            if j.network == "mainnet" and _mainnet_disabled():
                anchor_queue.mark_failed(j.job_id, "Mainnet anchoring disabled")
                failed += 1
                continue

            resp, pay_frags, claw_block = anchor_proof_fn(
                AnchorProofRequest(
                    merkle_root_sha256=j.merkle_root_sha256,
                    receipt_commitment=j.receipt_commitment,
                    network=j.network,
                ),
                payment_adapter=adapter,
                payment_proof_header=pay_hdr,
                request_context={**ctx, "job_id": j.job_id, "anchor_mode": "batch"},
            )

            # best-effort extraction of txid from response model
            txid = ""
            for attr in ("txid", "anchor_txid", "opreturn_txid", "transaction_id"):
                if hasattr(resp, attr):
                    txid = getattr(resp, attr) or ""
                    if txid:
                        break

            anchor_queue.mark_done(j.job_id, txid)
            done += 1

        except PaymentRequiredError as e:
            anchor_queue.mark_failed(j.job_id, f"PaymentRequired: {str(e)}")
            failed += 1
        except Exception as e:
            anchor_queue.mark_failed(j.job_id, str(e))
            failed += 1

    return JSONResponse(
        {
            "ok": True,
            "ran": ran,
            "done": done,
            "failed": failed,
            "pending": anchor_queue.pending_count(),
        }
    )


# -------------------------------------------------
# /agent/flow — orchestrator endpoint (extract → propose → sign → proof → optional anchor)
# -------------------------------------------------
@app.post("/agent/flow")
async def agent_flow(
    req: Request,
    file: UploadFile = File(...),
    meta: str = Form(...),  # JSON string
):
    adapter = _payment_adapter()
    ctx = _request_context(req)
    pay_hdr = _payment_header_value(req)

    # ✅ principal/tier
    p = principal_from_request(req)

    try:
        meta_obj = json.loads(meta)
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid meta JSON"})

    role = meta_obj.get("role", "signer")
    signer_name = meta_obj.get("signer_name")
    signer_wallet = meta_obj.get("signer_wallet")
    do_anchor = bool(meta_obj.get("do_anchor", False))
    anchor_network = meta_obj.get("anchor_network", _default_anchor_network())

    try:
        file_bytes = await file.read()

        # ✅ upload abuse control (free-tier protection)
        file_mb = _bytes_to_mb_ceil(len(file_bytes))
        try:
            assert_upload_limits(p, usage_store, file_mb=file_mb)
            record_upload(p, usage_store)
        except TierLimitError as e:
            return _tier_error_response(e)

        # 1) extract
        clauses = extract_clauses_from_bytes(file_bytes, filename=file.filename)
        if not clauses:
            return JSONResponse(status_code=400, content={"error": "No clauses extracted"})

        # 2) propose
        propose_resp, propose_pay, propose_claw = propose_clause_fn(
            ProposeClauseRequest(
                clauses=clauses,
                role="author",
                signer_name=signer_name,
                signer_wallet=signer_wallet,
            ),
            payment_adapter=adapter,
            payment_proof_header=pay_hdr,
            request_context={**ctx, "path": "/agent/flow:propose"},
        )
        propose_rcpt = build_receipt(claw=propose_claw, payment_fragments=propose_pay, environment=_environment())

        # 3) sign
        sign_resp, sign_pay, sign_claw = sign_clause_fn(
            SignClauseRequest(
                clauses=clauses,
                role=role,
                signer_name=signer_name,
                signer_wallet=signer_wallet,
            ),
            payment_adapter=adapter,
            payment_proof_header=pay_hdr,
            request_context={**ctx, "path": "/agent/flow:sign"},
        )
        sign_rcpt = build_receipt(claw=sign_claw, payment_fragments=sign_pay, environment=_environment())

        # 4) proof
        proof_resp, proof_pay, proof_claw = generate_proof_fn(
            GenerateProofRequest(clauses=clauses),
            payment_adapter=adapter,
            payment_proof_header=pay_hdr,
            request_context={**ctx, "path": "/agent/flow:proof"},
        )
        proof_rcpt = build_receipt(claw=proof_claw, payment_fragments=proof_pay, environment=_environment())

        anchor_resp = None
        anchor_rcpt = None
        anchor_queue_info = None

        # 5) optional anchor (✅ cost-sensitive; batch-safe; mainnet-gated)
        if do_anchor:
            # ✅ hard gate mainnet spend
            if anchor_network == "mainnet" and _mainnet_disabled():
                return JSONResponse(status_code=403, content={"error": "Mainnet anchoring disabled"})

            anchor_mode_env = _anchor_mode_env()  # batch | immediate

            anchor_mode = "pending"
            try:
                # anchor is treated as a premium/cost-sensitive capability
                assert_capability(p, Capability.PRIORITY_ANCHOR)
                assert_priority_anchor(p, usage_store)
            except TierLimitError:
                anchor_mode = "pending"
            else:
                record_priority_anchor(p, usage_store)
                anchor_mode = "priority"

            anchor_ctx = {**ctx, "path": "/agent/flow:anchor", "anchor_mode": anchor_mode, "anchor_exec": anchor_mode_env}

            # ✅ Immediate mode anchors inline (dev/testnet); Batch mode queues a job (safe default)
            if anchor_mode_env == "immediate" and anchor_mode == "priority":
                anchor_resp, anchor_pay, anchor_claw = anchor_proof_fn(
                    AnchorProofRequest(
                        merkle_root_sha256=proof_resp.merkle_root_sha256,
                        receipt_commitment=proof_resp.receipt_commitment,
                        network=anchor_network,
                    ),
                    payment_adapter=adapter,
                    payment_proof_header=pay_hdr,
                    request_context=anchor_ctx,
                )
                anchor_rcpt = build_receipt(claw=anchor_claw, payment_fragments=anchor_pay, environment=_environment())
            else:
                job_id = f"anchor_{proof_resp.merkle_root_sha256[:16]}_{proof_resp.receipt_commitment[:16]}_{anchor_network}"
                anchor_queue.enqueue(
                    job_id=job_id,
                    merkle_root_sha256=proof_resp.merkle_root_sha256,
                    receipt_commitment=proof_resp.receipt_commitment,
                    network=anchor_network,
                )
                anchor_queue_info = {"status": "queued", "job_id": job_id, "network": anchor_network, "mode": anchor_mode_env}
                anchor_resp = None
                anchor_rcpt = None

        # ✅ 6) Build parent receipt with child references (summaries only)
        children = [
            receipt_summary(propose_rcpt),
            receipt_summary(sign_rcpt),
            receipt_summary(proof_rcpt),
        ]
        if anchor_rcpt:
            children.append(receipt_summary(anchor_rcpt))

        flow_claw = {
            "action": "flow",
            "action_id": f"claw_flow_{sign_resp.action_id}",
            "request": ctx,
            "payload": {
                "filename": file.filename,
                "signer_wallet": signer_wallet,
                "do_anchor": do_anchor,
                "anchor_network": anchor_network if do_anchor else None,
                "tier_subject": p.subject,
                "tier": p.tier.value,
                "anchor_exec_mode": _anchor_mode_env(),
            },
            "artifacts": {
                "propose": {"response": propose_resp.model_dump()},
                "sign": {"response": sign_resp.model_dump()},
                "proof": {"response": proof_resp.model_dump()},
                "anchor": {
                    "response": anchor_resp.model_dump() if anchor_resp else None,
                    "queue": anchor_queue_info,
                },
            },
        }

        flow_receipt = build_receipt(
            claw=flow_claw,
            payment_fragments=[],
            children=children,
            environment=_environment(),
        )

        return JSONResponse(
            {
                "ok": True,
                "clauses": clauses,
                "steps": {
                    "propose": propose_resp.model_dump(),
                    "sign": sign_resp.model_dump(),
                    "proof": proof_resp.model_dump(),
                    "anchor": anchor_resp.model_dump() if anchor_resp else None,
                    "anchor_queue": anchor_queue_info,
                },
                "receipts": {
                    "propose": propose_rcpt,
                    "sign": sign_rcpt,
                    "proof": proof_rcpt,
                    "anchor": anchor_rcpt,
                },
                "flow_receipt": flow_receipt,
            }
        )

    except PaymentRequiredError as e:
        return JSONResponse(status_code=402, content=e.terms)

    except Exception as e:
        if _debug_enabled():
            return JSONResponse(
                status_code=500,
                content={"error": str(e), "trace": traceback.format_exc()},
            )
        return JSONResponse(status_code=500, content={"error": "Internal Server Error"})


# -------------------------------------------------
# /agent/* — return receipt every time
# -------------------------------------------------
@app.post("/agent/propose")
async def agent_propose(req: Request, body: ProposeClauseRequest):
    adapter = _payment_adapter()
    ctx = _request_context(req)
    pay_hdr = _payment_header_value(req)
    try:
        resp, pay_frags, claw_block = propose_clause_fn(
            body, payment_adapter=adapter, payment_proof_header=pay_hdr, request_context=ctx
        )
        rcpt = build_receipt(claw=claw_block, payment_fragments=pay_frags, environment=_environment())
        resp.receipt = rcpt
        return JSONResponse(resp.model_dump())
    except PaymentRequiredError as e:
        return JSONResponse(status_code=402, content=e.terms)


@app.post("/agent/sign")
async def agent_sign(req: Request, body: SignClauseRequest):
    adapter = _payment_adapter()
    ctx = _request_context(req)
    pay_hdr = _payment_header_value(req)
    try:
        resp, pay_frags, claw_block = sign_clause_fn(
            body, payment_adapter=adapter, payment_proof_header=pay_hdr, request_context=ctx
        )
        rcpt = build_receipt(claw=claw_block, payment_fragments=pay_frags, environment=_environment())
        resp.receipt = rcpt
        return JSONResponse(resp.model_dump())
    except PaymentRequiredError as e:
        return JSONResponse(status_code=402, content=e.terms)


@app.post("/agent/proof")
async def agent_proof(req: Request, body: GenerateProofRequest):
    adapter = _payment_adapter()
    ctx = _request_context(req)
    pay_hdr = _payment_header_value(req)
    try:
        resp, pay_frags, claw_block = generate_proof_fn(
            body, payment_adapter=adapter, payment_proof_header=pay_hdr, request_context=ctx
        )
        rcpt = build_receipt(claw=claw_block, payment_fragments=pay_frags, environment=_environment())
        resp.receipt = rcpt
        return JSONResponse(resp.model_dump())
    except PaymentRequiredError as e:
        return JSONResponse(status_code=402, content=e.terms)


@app.post("/agent/anchor")
async def agent_anchor(req: Request, body: AnchorProofRequest):
    adapter = _payment_adapter()
    ctx = _request_context(req)
    pay_hdr = _payment_header_value(req)

    # ✅ mainnet kill switch
    if body.network == "mainnet" and _mainnet_disabled():
        return JSONResponse(status_code=403, content={"error": "Mainnet anchoring disabled"})

    # ✅ tier/capability enforcement: anchor is cost-sensitive
    p = principal_from_request(req)
    try:
        assert_capability(p, Capability.PRIORITY_ANCHOR)
        assert_priority_anchor(p, usage_store)
        record_priority_anchor(p, usage_store)
    except TierLimitError as e:
        return _tier_error_response(e)

    # ✅ batch mode: enqueue and return immediately
    if _anchor_mode_env() != "immediate":
        job_id = f"anchor_{body.merkle_root_sha256[:16]}_{body.receipt_commitment[:16]}_{body.network}"
        anchor_queue.enqueue(
            job_id=job_id,
            merkle_root_sha256=body.merkle_root_sha256,
            receipt_commitment=body.receipt_commitment,
            network=body.network,
        )
        return JSONResponse({"ok": True, "status": "queued", "job_id": job_id, "network": body.network})

    # ✅ immediate mode: anchor inline (dev/testnet)
    try:
        resp, pay_frags, claw_block = anchor_proof_fn(
            body, payment_adapter=adapter, payment_proof_header=pay_hdr, request_context=ctx
        )
        rcpt = build_receipt(claw=claw_block, payment_fragments=pay_frags, environment=_environment())
        resp.receipt = rcpt
        return JSONResponse(resp.model_dump())
    except PaymentRequiredError as e:
        return JSONResponse(status_code=402, content=e.terms)
