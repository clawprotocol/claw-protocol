# backend/main.py
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.handlers.receipt_handler import build_receipt
from backend.handlers.verify_handler import VerifyReceiptRequest, verify_receipt_packet
from backend.handlers.verify_tree_handler import VerifyTreeRequest, verify_receipt_tree
from backend.handlers.timeline_handler import (
    PROTOCOL_VERSION as TIMELINE_PROTOCOL_VERSION,
    ALLOWED_NETWORKS as TIMELINE_ALLOWED_NETWORKS,
    CreateTimelineRequest,
    AppendEventRequest,
    FreezeTimelineRequest,
    AnchorTimelineRequest,
    build_manifest,
    timeline_response,
    event_response,
    create_receipt_response,
)
from backend.utils.timeline_store import TimelineStore
from backend.handlers.anchor_adapter import AnchorAdapter, BitcoinCoreRpcAnchorAdapter

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

# Payment plumbing
from backend.handlers.payment_adapters.base import PaymentRequiredError, PaymentAdapter
from backend.handlers.payment_adapters.x402 import X402PaymentAdapter

# ✅ Tier enforcement + usage metering (anchor gating)
from backend.utils.usage_store import UsageStore
from backend.utils.enforce import (
    principal_from_request,
    assert_capability,
    assert_priority_anchor,
    record_priority_anchor,
    TierLimitError,
)
from backend.utils.tiers import Capability

# ✅ Batch anchoring queue
from backend.utils.anchor_queue import AnchorQueue

# canonical hashing helper
from backend.utils.canon_json import canon_sha256_hex


app = FastAPI(title="CLAW Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# stores
usage_store = UsageStore()
anchor_queue = AnchorQueue()


def _timeline_db_path() -> str:
    return os.path.expanduser(os.getenv("CLAW_TIMELINE_DB_PATH", "~/.claw/timeline.sqlite3"))


def _anchor_adapter() -> AnchorAdapter:
    return BitcoinCoreRpcAnchorAdapter()


timeline_store = TimelineStore(db_path=_timeline_db_path())


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


def _tier_error_response(e: TierLimitError) -> JSONResponse:
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


def _multipart_enabled() -> bool:
    """
    Multipart (File/Form) endpoints require python-multipart.
    Keep OFF by default to avoid import-time/test collection failures.
    """
    return os.getenv("CLAW_ENABLE_MULTIPART", "0").lower() in ("1", "true", "yes")


# -------------------------------------------------
# Node mode: API vs verifier-only
# -------------------------------------------------
def _node_mode() -> str:
    """
    Node mode controls whether this server can MUTATE state or only VERIFY.

    - "api"      : normal mode (default)
    - "verifier" : verifier-only mode (no writes/mutations/anchoring)
    """
    return os.getenv("CLAW_NODE_MODE", "api").strip().lower()


def _verifier_only() -> bool:
    return _node_mode() == "verifier"


def _deny_write_if_verifier() -> Optional[JSONResponse]:
    """
    In verifier-only mode, we block ALL mutation endpoints.

    Read-only endpoints remain available:
      /health, /version, /verify, /verify/tree,
      GET /v1/timelines/*, GET /v1/receipts/*
    """
    if _verifier_only():
        return JSONResponse(
            status_code=403,
            content={
                "error": "verifier_only",
                "hint": "This node is running in verifier-only mode (CLAW_NODE_MODE=verifier).",
            },
        )
    return None


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
            "node_mode": _node_mode(),
            "x402_payment_header": os.getenv("CLAW_X402_PAYMENT_HEADER", "X-PAYMENT"),
            "tier_headers": ["x-claw-wallet", "x-claw-api-key", "x-claw-tier"],
            "anchor": {
                "default_network": _default_anchor_network(),
                "mainnet_enabled": not _mainnet_disabled(),
                "mode": _anchor_mode_env(),
            },
            "multipart_enabled": _multipart_enabled(),
        }
    )


# -------------------------------------------------
# /receipt — legacy receipt builder (tests expect this)
# NOTE: allowed in verifier mode (pure function / no state mutation)
# -------------------------------------------------
@app.post("/receipt")
async def receipt_legacy(body: Dict[str, Any]):
    proof_packet = body.get("proof_packet")
    signatures = body.get("signatures") or []

    if not isinstance(proof_packet, dict):
        return JSONResponse(status_code=400, content={"error": "missing_proof_packet"})
    if not isinstance(signatures, list):
        return JSONResponse(status_code=400, content={"error": "signatures_must_be_list"})

    rcpt = build_receipt(proof_packet=proof_packet, signatures=signatures)

    # Tests expect r_receipt.json()["receipt"] and that receipt contains:
    # - receipt_hash (len 64)
    # - proof_packet_hash equals proof_packet["clauses_hash"]
    receipt_payload = rcpt.get("receipt") if isinstance(rcpt, dict) else None
    if not isinstance(receipt_payload, dict):
        receipt_payload = {
            "proof_packet": proof_packet,
            "signatures": signatures,
        }

    receipt_hash = ""
    if isinstance(rcpt, dict):
        receipt_hash = rcpt.get("receipt_hash") or rcpt.get("receipt_hash_sha256") or ""

    receipt_payload["receipt_hash"] = receipt_payload.get("receipt_hash") or receipt_hash

    # legacy compatibility key expected by tests
    proof_packet_hash = (
        receipt_payload.get("proof_packet_hash") or receipt_payload.get("proof_packet_hash_sha256") or ""
    )
    if not proof_packet_hash:
        proof_packet_hash = (proof_packet.get("clauses_hash") if isinstance(proof_packet, dict) else "") or ""
    receipt_payload["proof_packet_hash"] = proof_packet_hash

    return JSONResponse(
        {
            "ok": True,
            "protocol": rcpt.get("protocol") if isinstance(rcpt, dict) else "CLAW-RECEIPT-LEGACY-v1",
            "issued_at": rcpt.get("issued_at") if isinstance(rcpt, dict) else datetime.now(timezone.utc).isoformat(),
            "receipt": receipt_payload,
        }
    )


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
# Timeline Tool API (docs/CLAW-TIMELINE-API.md)
# -------------------------------------------------
@app.post("/v1/timelines")
async def create_timeline(body: CreateTimelineRequest):
    deny = _deny_write_if_verifier()
    if deny:
        return deny

    network = body.network or _default_anchor_network()
    if network not in TIMELINE_ALLOWED_NETWORKS:
        return JSONResponse(status_code=400, content={"error": "Invalid network"})
    tl = timeline_store.create_timeline(
        timeline_id=body.timeline_id,
        title=body.title,
        parties=[p.model_dump() for p in body.parties],
        network=network,
        protocol_version=TIMELINE_PROTOCOL_VERSION,
    )
    return JSONResponse(timeline_response(timeline_store, tl.timeline_id))


@app.get("/v1/timelines/{timeline_id}")
async def get_timeline(timeline_id: str):
    try:
        return JSONResponse(timeline_response(timeline_store, timeline_id))
    except KeyError:
        return JSONResponse(status_code=404, content={"error": "timeline_not_found"})


@app.post("/v1/timelines/{timeline_id}/events")
async def append_event(timeline_id: str, body: AppendEventRequest):
    deny = _deny_write_if_verifier()
    if deny:
        return deny

    try:
        ev = timeline_store.append_event(
            timeline_id=timeline_id,
            event_type=body.event_type,
            event_time=body.event_time,
            notice=body.notice,
            marker=body.marker,
        )
        event_hashes = timeline_store.list_event_hashes(timeline_id)
        manifest = build_manifest(event_hashes)
        return JSONResponse(
            {
                "timeline_id": ev.timeline_id,
                "event_id": ev.event_id,
                "event_index": ev.event_index,
                "event_type": ev.event_type,
                "event_time": ev.event_time,
                "event_sha256": ev.event_sha256,
                "manifest": manifest,
            }
        )
    except KeyError:
        return JSONResponse(status_code=404, content={"error": "timeline_not_found"})
    except RuntimeError as e:
        if str(e) == "timeline_frozen":
            return JSONResponse(status_code=409, content={"error": "timeline_frozen"})
        return JSONResponse(status_code=400, content={"error": str(e)})


@app.get("/v1/timelines/{timeline_id}/events/{event_id}")
async def get_event(timeline_id: str, event_id: str):
    try:
        return JSONResponse(event_response(timeline_store, timeline_id, event_id))
    except KeyError:
        return JSONResponse(status_code=404, content={"error": "event_not_found"})


@app.post("/v1/timelines/{timeline_id}/freeze")
async def freeze_timeline(timeline_id: str, body: FreezeTimelineRequest):
    deny = _deny_write_if_verifier()
    if deny:
        return deny

    try:
        event_hashes = timeline_store.list_event_hashes(timeline_id)
        current_manifest = build_manifest(event_hashes)
        if body.manifest_sha256 != current_manifest["manifest_sha256"]:
            return JSONResponse(status_code=409, content={"error": "manifest_sha256_mismatch"})

        frozen_hash, frozen_at = timeline_store.freeze_timeline(timeline_id, body.manifest_sha256)
        return JSONResponse(
            {
                "timeline_id": timeline_id,
                "frozen_manifest_sha256": frozen_hash,
                "frozen_at": frozen_at,
            }
        )
    except KeyError:
        return JSONResponse(status_code=404, content={"error": "timeline_not_found"})
    except RuntimeError:
        return JSONResponse(status_code=409, content={"error": "frozen_manifest_mismatch"})


@app.post("/v1/timelines/{timeline_id}/anchor")
async def anchor_timeline(timeline_id: str, body: AnchorTimelineRequest):
    deny = _deny_write_if_verifier()
    if deny:
        return deny

    try:
        tl = timeline_store.get_timeline(timeline_id)
        if not tl.frozen or not tl.frozen_manifest_sha256:
            return JSONResponse(status_code=409, content={"error": "timeline_not_frozen"})
        if body.frozen_manifest_sha256 != tl.frozen_manifest_sha256:
            return JSONResponse(status_code=409, content={"error": "frozen_manifest_sha256_mismatch"})

        btc_txid = "pending"
        if _anchor_mode_env() == "immediate":
            if body.anchor_network == "bitcoin-mainnet" and _mainnet_disabled():
                return JSONResponse(status_code=403, content={"error": "Mainnet anchoring disabled"})
            try:
                btc_txid = _anchor_adapter().broadcast_commitment(
                    body.anchor_network, body.frozen_manifest_sha256
                )
            except Exception as e:
                return JSONResponse(status_code=500, content={"error": str(e)})

        receipt = create_receipt_response(
            timeline_id=timeline_id,
            frozen_manifest_sha256=body.frozen_manifest_sha256,
            anchor_network=body.anchor_network,
            epoch_id=body.epoch_id,
            btc_txid=btc_txid,
        )
        timeline_store.create_receipt(
            receipt_id=receipt["receipt_id"],
            timeline_id=timeline_id,
            protocol_version=receipt["protocol_version"],
            network=receipt["network"],
            epoch_id=receipt.get("epoch_id"),
            btc_txid=receipt["btc_txid"],
            commitment=receipt["commitment"],
            merkle_proof=receipt["merkle_proof"],
            zk_proof_refs=receipt.get("zk_proof_refs"),
            issued_at=receipt["issued_at"],
        )
        return JSONResponse(receipt)
    except KeyError:
        return JSONResponse(status_code=404, content={"error": "timeline_not_found"})


@app.get("/v1/receipts/{receipt_id}")
async def get_receipt(receipt_id: str):
    try:
        return JSONResponse(timeline_store.get_receipt(receipt_id))
    except KeyError:
        return JSONResponse(status_code=404, content={"error": "receipt_not_found"})


# -------------------------------------------------
# /verify/tree — verify a parent receipt + its child receipts
# -------------------------------------------------
@app.post("/verify/tree")
async def verify_tree(body: Dict[str, Any]):
    req = VerifyTreeRequest(**body)
    resp = verify_receipt_tree(req)
    return JSONResponse(resp.model_dump())


# -------------------------------------------------
# /admin/anchor/run — drain queued anchors (batch mode)
# -------------------------------------------------
@app.post("/admin/anchor/run")
async def admin_anchor_run(req: Request):
    deny = _deny_write_if_verifier()
    if deny:
        return deny

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
        return JSONResponse(
            {"ok": True, "ran": 0, "done": 0, "failed": 0, "pending": anchor_queue.pending_count()}
        )

    ran = done = failed = 0

    for j in jobs:
        ran += 1
        try:
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
# /agent/* — return receipt every time (JSON-only)
# -------------------------------------------------
@app.post("/agent/propose")
async def agent_propose(req: Request, body: ProposeClauseRequest):
    deny = _deny_write_if_verifier()
    if deny:
        return deny

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
    deny = _deny_write_if_verifier()
    if deny:
        return deny

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
    deny = _deny_write_if_verifier()
    if deny:
        return deny

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
    deny = _deny_write_if_verifier()
    if deny:
        return deny

    adapter = _payment_adapter()
    ctx = _request_context(req)
    pay_hdr = _payment_header_value(req)

    if body.network == "mainnet" and _mainnet_disabled():
        return JSONResponse(status_code=403, content={"error": "Mainnet anchoring disabled"})

    p = principal_from_request(req)
    try:
        assert_capability(p, Capability.PRIORITY_ANCHOR)
        assert_priority_anchor(p, usage_store)
        record_priority_anchor(p, usage_store)
    except TierLimitError as e:
        return _tier_error_response(e)

    if _anchor_mode_env() != "immediate":
        job_id = f"anchor_{body.merkle_root_sha256[:16]}_{body.receipt_commitment[:16]}_{body.network}"
        anchor_queue.enqueue(
            job_id=job_id,
            merkle_root_sha256=body.merkle_root_sha256,
            receipt_commitment=body.receipt_commitment,
            network=body.network,
        )
        return JSONResponse({"ok": True, "status": "queued", "job_id": job_id, "network": body.network})

    try:
        resp, pay_frags, claw_block = anchor_proof_fn(
            body, payment_adapter=adapter, payment_proof_header=pay_hdr, request_context=ctx
        )
        rcpt = build_receipt(claw=claw_block, payment_fragments=pay_frags, environment=_environment())
        resp.receipt = rcpt
        return JSONResponse(resp.model_dump())
    except PaymentRequiredError as e:
        return JSONResponse(status_code=402, content=e.terms)


# -------------------------------------------------
# Legacy compatibility routes (tests + older clients)
# Mirrors /agent/* endpoints
# -------------------------------------------------
@app.post("/propose")
async def propose_legacy(req: Request, body: ProposeClauseRequest):
    deny = _deny_write_if_verifier()
    if deny:
        return deny
    return await agent_propose(req, body)


@app.post("/sign")
async def sign_legacy(req: Request, body: SignClauseRequest):
    deny = _deny_write_if_verifier()
    if deny:
        return deny

    """
    Legacy test/client compatibility:
    tests expect top-level key "sign_packet" from /sign response.
    sign_packet MUST include "packet_hash".
    """
    resp = await agent_sign(req, body)

    payload = resp.body
    if isinstance(payload, (bytes, bytearray)):
        import json

        data = json.loads(payload.decode("utf-8") or "{}")
    elif isinstance(payload, dict):
        data = payload
    else:
        data = {}

    # Deterministic packet_hash source:
    # Prefer canonical_hash_sha256 (already stable), else signature_payload.message.
    canonical_hash = (
        data.get("canonical_hash_sha256") or (data.get("signature_payload") or {}).get("message") or ""
    )

    # Build a legacy-ish sign_packet with required key.
    sign_packet = {
        "packet_hash": canonical_hash,
        "message": canonical_hash,
        "signature": None,  # ✅ required by tests
        "algo": "sha256",
        "created_utc": (data.get("signature_payload") or {}).get("created_at") or "",
        "root_hash": canonical_hash,
        "clauses": data.get("clauses") or body.clauses,
        "role": body.role,
        "signer_name": body.signer_name,
        "signer_wallet": body.signer_wallet,
        "document_title": getattr(body, "document_title", ""),
        "chain": getattr(body, "chain", ""),
    }

    data["sign_packet"] = sign_packet
    if "packet" not in data:
        data["packet"] = sign_packet

    return JSONResponse(data, status_code=resp.status_code)


@app.post("/proof")
async def proof_legacy(req: Request, body: GenerateProofRequest):
    deny = _deny_write_if_verifier()
    if deny:
        return deny

    """
    Legacy test/client compatibility:
    tests expect top-level key "proof_packet" from /proof response.
    proof_packet MUST include "clauses_hash".
    """
    resp = await agent_proof(req, body)

    payload = resp.body
    if isinstance(payload, (bytes, bytearray)):
        import json

        data = json.loads(payload.decode("utf-8") or "{}")
    elif isinstance(payload, dict):
        data = payload
    else:
        data = {}

    # Deterministic proof packet hash:
    merkle_root = data.get("merkle_root_sha256") or data.get("root_hash") or ""
    if not merkle_root:
        try:
            merkle_root = canon_sha256_hex(
                {
                    "clauses": data.get("clauses") or getattr(body, "clauses", []),
                    "sign_packet": data.get("sign_packet")
                    or data.get("packet")
                    or getattr(body, "sign_packet", {})
                    or {},
                }
            )
        except Exception:
            merkle_root = ""

    packet_hash = data.get("packet_hash") or merkle_root

    created_utc = (
        data.get("created_utc")
        or (data.get("proof_payload") or {}).get("created_at")
        or datetime.now(timezone.utc).isoformat()
    )

    clauses_list = data.get("clauses") or getattr(body, "clauses", [])
    clauses_hash = canon_sha256_hex({"clauses": clauses_list})

    proof_packet = {
        "packet_hash": packet_hash,
        "algo": "sha256",
        "created_utc": created_utc,
        "root_hash": merkle_root or packet_hash,
        "clauses": clauses_list,
        "sign_packet": data.get("sign_packet")
        or data.get("packet")
        or getattr(body, "sign_packet", {})
        or {},
        "clauses_hash": clauses_hash,
    }

    data["proof_packet"] = proof_packet
    if "packet" not in data:
        data["packet"] = proof_packet

    return JSONResponse(data, status_code=resp.status_code)


@app.post("/anchor")
async def anchor_legacy(req: Request, body: AnchorProofRequest):
    deny = _deny_write_if_verifier()
    if deny:
        return deny
    return await agent_anchor(req, body)


# -------------------------------------------------
# Multipart routers (OFF by default)
# -------------------------------------------------
if _multipart_enabled():
    # NOTE: these routers use File/Form and therefore require python-multipart.
    try:
        from backend.routers.extract import router as extract_router  # type: ignore

        app.include_router(extract_router, prefix="/v1")
    except Exception:
        if _debug_enabled():
            raise

    try:
        from backend.routers.agent_flow import router as agent_flow_router  # type: ignore

        app.include_router(agent_flow_router)
    except Exception:
        if _debug_enabled():
            raise
