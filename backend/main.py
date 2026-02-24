from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.utils import metrics
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
from backend.handlers.verifier_api_handler import get_batch, get_receipt_for_verify

# ✅ LLM router (OpenAI wrapper)
from backend.llm_router import call_legal_llm

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
from backend.handlers.payment_adapters.base import PaymentAdapter, PaymentRequiredError
from backend.handlers.payment_adapters.x402 import X402PaymentAdapter

# ✅ Tier enforcement + usage metering (anchor gating)
from backend.utils.usage_store import UsageStore
from backend.utils.enforce import (
    TierLimitError,
    assert_capability,
    assert_priority_anchor,
    principal_from_request,
    record_priority_anchor,
)
from backend.utils.tiers import Capability

# ✅ Batch anchoring queue (proof anchoring)
from backend.utils.anchor_queue import AnchorQueue

# canonical hashing helper
from backend.utils.canon_json import canon_sha256_hex

from backend.handlers.liability_api_handler import get_liability_assessment
from backend.handlers.liability_latest_handler import get_latest_liability_for_timeline
from backend.handlers.legal_analyst_handler import router as legal_analyst_router
from backend.routers.workflow_api import router as workflow_router
from backend.routers.esign_api import router as esign_router
from backend.routers.agreements_api import router as agreements_router
from backend.routers.agreements_v2_api import router as agreements_v2_router
from backend.routers.liability_api import router as liability_router


# -------------------------------------------------
# App + Middleware
# -------------------------------------------------
app = FastAPI(title="CLAW Backend")

VERIFIER_ONLY = os.getenv("CLAW_VERIFIER_ONLY", "0") == "1"
CLAW_PROTOCOL_VERSION = os.getenv("CLAW_PROTOCOL_VERSION", "claw-v1")
CLAW_API_VERSION = os.getenv("CLAW_API_VERSION", "v1")


def _error_response(
    *,
    status_code: int,
    error_code: str,
    message: str,
    detail: Any = None,
    trace_id: Optional[str] = None,
) -> JSONResponse:
    payload: Dict[str, Any] = {
        "error_code": error_code,
        "message": message,
    }
    if detail is not None:
        payload["detail"] = detail
    if trace_id:
        payload["trace_id"] = trace_id
    return JSONResponse(status_code=status_code, content=payload)


@app.middleware("http")
async def verifier_only_guard(request: Request, call_next):
    if not VERIFIER_ONLY:
        return await call_next(request)

    # allow only GET/HEAD and only verifier endpoints
    if request.method not in ("GET", "HEAD"):
        return _error_response(
            status_code=403,
            error_code="verifier_only_mode",
            message="verifier-only mode",
        )

    path = request.url.path
    allowed_prefixes = (
        "/v1/batches/",
        "/v1/receipts/",
        "/v1/llm-test",  # ✅ additive; handler still denies in verifier-only
        "/health",
        "/openapi.json",
        "/docs",
        "/redoc",
    )
    if not path.startswith(allowed_prefixes):
        return _error_response(
            status_code=403,
            error_code="verifier_only_mode",
            message="verifier-only mode",
        )

    return await call_next(request)


@app.middleware("http")
async def claw_version_headers(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/v1"):
        response.headers["X-CLAW-Protocol-Version"] = CLAW_PROTOCOL_VERSION
        response.headers["X-CLAW-API-Version"] = CLAW_API_VERSION
    return response


@app.middleware("http")
async def claw_request_id(request: Request, call_next):
    req_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
    request.state.request_id = req_id
    response = await call_next(request)
    response.headers["X-Request-Id"] = req_id
    return response


_rate_state: Dict[str, Dict[str, float]] = {}


def _rate_limit_allow(key: str) -> bool:
    rps = float(os.getenv("CLAW_RATE_LIMIT_RPS", "0") or 0)
    burst = float(os.getenv("CLAW_RATE_LIMIT_BURST", "0") or 0)
    if rps <= 0 or burst <= 0:
        return True
    now = datetime.now(timezone.utc).timestamp()
    state = _rate_state.get(key, {"tokens": burst, "ts": now})
    elapsed = max(0.0, now - state["ts"])
    state["tokens"] = min(burst, state["tokens"] + elapsed * rps)
    state["ts"] = now
    if state["tokens"] < 1.0:
        _rate_state[key] = state
        return False
    state["tokens"] -= 1.0
    _rate_state[key] = state
    return True


@app.middleware("http")
async def claw_rate_limit(request: Request, call_next):
    if not request.url.path.startswith("/v1"):
        return await call_next(request)
    key = request.client.host if request.client else "unknown"
    if not _rate_limit_allow(key):
        metrics.inc("rate_limited_total")
        return _error_response(
            status_code=429,
            error_code="rate_limited",
            message="Too many requests",
            trace_id=getattr(request.state, "request_id", None),
        )
    metrics.inc("requests_total")
    return await call_next(request)


@app.middleware("http")
async def claw_request_size_limit(request: Request, call_next):
    if request.url.path == "/v1/workflow/bundle/verify":
        max_bytes = int(os.getenv("CLAW_MAX_REQUEST_BYTES_VERIFY", "10485760"))
        cl = request.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > max_bytes:
            return _error_response(
                status_code=413,
                error_code="payload_too_large",
                message="request body too large",
                trace_id=getattr(request.state, "request_id", None),
            )
    return await call_next(request)


def _cors_origins() -> List[str]:
    env = os.getenv("CLAW_CORS_ALLOW_ORIGINS", "").strip()
    if env:
        return [o.strip() for o in env.split(",") if o.strip()]
    if os.getenv("CLAW_ENVIRONMENT", "local") in ("local", "dev", "test"):
        return ["*"]
    return []


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# stores
usage_store = UsageStore()
anchor_queue = AnchorQueue()  # proof-anchor queue (agent_anchor /anchor)


def _data_dir() -> str:
    env = os.getenv("CLAW_DATA_DIR", "").strip()
    if env:
        return os.path.expanduser(env)
    prod = "/var/lib/claw"
    try:
        if os.path.isdir(prod) and os.access(prod, os.W_OK):
            return prod
    except Exception:
        pass
    return os.path.expanduser("~/.claw")


def _timeline_db_path() -> str:
    return os.path.expanduser(
        os.getenv("CLAW_TIMELINE_DB_PATH", os.path.join(_data_dir(), "timeline.sqlite3"))
    )


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
    return _error_response(
        status_code=429,
        error_code=getattr(e, "code", "tier_limit"),
        message=str(e),
        detail={"hint": "Upgrade tier or reduce usage."},
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


@app.get("/v1/batches/{batch_id}")
def api_get_batch(batch_id: str):
    store = TimelineStore()
    return get_batch(store=store, batch_id=batch_id)


@app.get("/v1/receipts/{receipt_id}")
def api_get_receipt_for_verify(receipt_id: str):
    store = TimelineStore()
    return get_receipt_for_verify(store=store, receipt_id=receipt_id)


# -------------------------------------------------
# Small UX helper models (additive; do not break protocol models)
# -------------------------------------------------
class EventPatchRequest(BaseModel):
    # Patch into stored event record. Keep flexible for now.
    event_type: Optional[str] = None
    event_time: Optional[str] = None
    notice: Optional[dict] = None
    marker: Optional[dict] = None


# -------------------------------------------------
# Health + Version
# -------------------------------------------------
@app.get("/health")
async def health():
    return JSONResponse({"ok": True})


@app.get("/v1/healthz")
async def healthz():
    return JSONResponse({"ok": True})


@app.get("/version")
async def version():
    return JSONResponse(
        {
            "name": "claw-backend",
            "environment": _environment(),
            "debug": _debug_enabled(),
            "node_mode": _node_mode(),
            "protocol_version": CLAW_PROTOCOL_VERSION,
            "api_version": CLAW_API_VERSION,
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


@app.get("/v1/version")
async def version_v1():
    return JSONResponse(
        {
            "protocol_version": CLAW_PROTOCOL_VERSION,
            "api_version": CLAW_API_VERSION,
        }
    )


@app.get("/v1/metrics-lite")
async def metrics_lite():
    return JSONResponse(metrics.get_all())


# -------------------------------------------------
# ✅ LLM smoke test (dev helper)
# -------------------------------------------------
@app.get("/v1/llm-test")
def llm_test():
    deny = _deny_write_if_verifier()
    if deny:
        return deny

    out = call_legal_llm(
        [
            {"role": "system", "content": "Reply in 3 words only."},
            {"role": "user", "content": "CLAW is live"},
        ],
        max_tokens=20,
        temperature=0.0,
    )
    return JSONResponse({"ok": True, "out": out})


@app.exception_handler(HTTPException)
async def _http_exception_handler(request: Request, exc: HTTPException):
    if request.url.path.startswith("/v1"):
        trace_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
        return _error_response(
            status_code=exc.status_code,
            error_code="http_error",
            message=str(exc.detail),
            detail=exc.detail,
            trace_id=trace_id,
        )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def _validation_exception_handler(request: Request, exc: RequestValidationError):
    if request.url.path.startswith("/v1"):
        trace_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
        return _error_response(
            status_code=422,
            error_code="validation_error",
            message="Invalid request",
            detail=exc.errors(),
            trace_id=trace_id,
        )
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    trace_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
    if request.url.path.startswith("/v1"):
        return _error_response(
            status_code=500,
            error_code="internal_error",
            message="Internal server error",
            detail=str(exc),
            trace_id=trace_id,
        )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


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

    receipt_payload = rcpt.get("receipt") if isinstance(rcpt, dict) else None
    if not isinstance(receipt_payload, dict):
        receipt_payload = {"proof_packet": proof_packet, "signatures": signatures}

    receipt_hash = ""
    if isinstance(rcpt, dict):
        receipt_hash = rcpt.get("receipt_hash") or rcpt.get("receipt_hash_sha256") or ""

    receipt_payload["receipt_hash"] = receipt_payload.get("receipt_hash") or receipt_hash

    proof_packet_hash = (
        receipt_payload.get("proof_packet_hash")
        or receipt_payload.get("proof_packet_hash_sha256")
        or ""
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


# ✅ NEW: list events (Screen 3 timeline view)
@app.get("/v1/timelines/{timeline_id}/events")
async def list_events(timeline_id: str):
    try:
        return JSONResponse(timeline_store.list_events(timeline_id))
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


# ✅ NEW: patch/update event (Screen 3 "Edit")
@app.patch("/v1/timelines/{timeline_id}/events/{event_id}")
async def patch_event(timeline_id: str, event_id: str, body: EventPatchRequest):
    deny = _deny_write_if_verifier()
    if deny:
        return deny
    try:
        patch = body.model_dump(exclude_none=True)
        return JSONResponse(timeline_store.patch_event(timeline_id, event_id, patch))
    except KeyError:
        return JSONResponse(status_code=404, content={"error": "event_not_found"})


# ✅ NEW: delete event (Screen 3 "Remove")
@app.delete("/v1/timelines/{timeline_id}/events/{event_id}")
async def delete_event(timeline_id: str, event_id: str):
    deny = _deny_write_if_verifier()
    if deny:
        return deny
    try:
        return JSONResponse(timeline_store.delete_event(timeline_id, event_id))
    except KeyError:
        return JSONResponse(status_code=404, content={"error": "event_not_found"})


# ✅ NEW: duplicate event (Screen 3 "Duplicate")
@app.post("/v1/timelines/{timeline_id}/events/{event_id}/duplicate")
async def duplicate_event(timeline_id: str, event_id: str):
    deny = _deny_write_if_verifier()
    if deny:
        return deny
    try:
        return JSONResponse(timeline_store.duplicate_event(timeline_id, event_id))
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

        if body.anchor_network == "bitcoin-mainnet" and _mainnet_disabled():
            return JSONResponse(status_code=403, content={"error": "Mainnet anchoring disabled"})

        # Default: pending until the batch runner broadcasts
        btc_txid = "pending"

        # Immediate mode: broadcast now
        if _anchor_mode_env() == "immediate":
            try:
                btc_txid = _anchor_adapter().broadcast_commitment(
                    body.anchor_network, body.frozen_manifest_sha256
                )
            except Exception as e:
                return JSONResponse(status_code=500, content={"error": str(e)})

        # Create receipt (self-verifiable)
        receipt = create_receipt_response(
            timeline_id=timeline_id,
            frozen_manifest_sha256=body.frozen_manifest_sha256,
            anchor_network=body.anchor_network,
            epoch_id=body.epoch_id,
            btc_txid=btc_txid,
        )

        # Persist receipt
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
            receipt_hash_sha256=receipt.get("receipt_hash_sha256"),
        )

        # Batch mode: enqueue a timeline anchor job so /admin/anchor/run can broadcast + update txid
        if _anchor_mode_env() != "immediate":
            timeline_store.enqueue_timeline_anchor_job(
                receipt_id=receipt["receipt_id"],
                timeline_id=timeline_id,
                network=body.anchor_network,
                commitment=receipt["commitment"],
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


@app.get("/v1/liability/assessment/{event_id}")
def api_get_liability_assessment(event_id: str):
    store = TimelineStore()
    return get_liability_assessment(event_id, store)


@app.get("/v1/timelines/{timeline_id}/liability/latest")
def liability_latest(timeline_id: str):
    store = TimelineStore()
    return get_latest_liability_for_timeline(store, timeline_id)


# -------------------------------------------------
# /verify/tree — verify a parent receipt + its child receipts
# -------------------------------------------------
@app.post("/verify/tree")
async def verify_tree(body: Dict[str, Any]):
    if isinstance(body, dict) and not body.get("receipt") and body.get("receipt_id"):
        rid = body.get("receipt_id")
        try:
            body = dict(body)
            body["receipt"] = timeline_store.get_receipt(rid)
        except KeyError:
            return JSONResponse(status_code=404, content={"error": "receipt_not_found", "receipt_id": rid})
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": f"receipt_fetch_failed: {str(e)}"})

    req = VerifyTreeRequest(**body)
    resp = verify_receipt_tree(req)
    return JSONResponse(resp.model_dump())


# -------------------------------------------------
# /admin/anchor/run — drain queued anchors (batch mode)
#   - timeline anchors (timeline_anchor_jobs): broadcast commitment + set receipt txid
#   - proof anchors (anchor_queue): existing behavior
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

    # --------------------------
    # 1) Timeline anchor jobs
    # --------------------------
    max_tl = int(os.getenv("CLAW_TIMELINE_ANCHOR_MAX_PER_BATCH", "50000"))
    tl_jobs = timeline_store.claim_timeline_anchor_jobs(max_n=max_tl)

    tl_ran = tl_done = tl_failed = 0
    tl_adapter = _anchor_adapter()

    for j in tl_jobs:
        tl_ran += 1
        job_id = j.get("job_id") or ""
        network = j.get("network") or ""
        commitment = j.get("commitment") or ""
        receipt_id = j.get("receipt_id") or ""

        try:
            if network == "bitcoin-mainnet" and _mainnet_disabled():
                timeline_store.mark_timeline_anchor_failed(job_id=job_id, error="Mainnet anchoring disabled")
                tl_failed += 1
                continue

            # Broadcast OP_RETURN commitment via Bitcoin Core RPC adapter
            txid = tl_adapter.broadcast_commitment(network, commitment)

            # Mark job done + update receipt row with txid
            timeline_store.mark_timeline_anchor_done(job_id=job_id, txid=txid)
            if receipt_id:
                timeline_store.set_receipt_txid(receipt_id=receipt_id, btc_txid=txid)

            tl_done += 1

        except Exception as e:
            timeline_store.mark_timeline_anchor_failed(job_id=job_id, error=str(e))
            tl_failed += 1

    # --------------------------
    # 2) Proof anchor jobs (existing queue)
    # --------------------------
    adapter = _payment_adapter()
    pay_hdr = _payment_header_value(req)
    ctx = {**_request_context(req), "path": "/admin/anchor/run"}

    max_n = int(os.getenv("CLAW_ANCHOR_MAX_PER_BATCH", "50000"))
    jobs = anchor_queue.claim_batch(max_n=max_n)

    proof_ran = proof_done = proof_failed = 0

    for j in jobs:
        proof_ran += 1
        try:
            if j.network == "mainnet" and _mainnet_disabled():
                anchor_queue.mark_failed(j.job_id, "Mainnet anchoring disabled")
                proof_failed += 1
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
            proof_done += 1

        except PaymentRequiredError as e:
            anchor_queue.mark_failed(j.job_id, f"PaymentRequired: {str(e)}")
            proof_failed += 1
        except Exception as e:
            anchor_queue.mark_failed(j.job_id, str(e))
            proof_failed += 1

    # For convenience: counts + remaining pending counts
    return JSONResponse(
        {
            "ok": True,
            # totals
            "ran": tl_ran + proof_ran,
            "done": tl_done + proof_done,
            "failed": tl_failed + proof_failed,
            "pending": anchor_queue.pending_count(),  # proof queue pending
            # breakdown (additive; won't break old clients)
            "timeline_ran": tl_ran,
            "timeline_done": tl_done,
            "timeline_failed": tl_failed,
            "timeline_pending": len(timeline_store.claim_timeline_anchor_jobs(max_n=1)),
            "proof_ran": proof_ran,
            "proof_done": proof_done,
            "proof_failed": proof_failed,
            "proof_pending": anchor_queue.pending_count(),
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

    resp = await agent_sign(req, body)

    payload = resp.body
    if isinstance(payload, (bytes, bytearray)):
        import json

        data = json.loads(payload.decode("utf-8") or "{}")
    elif isinstance(payload, dict):
        data = payload
    else:
        data = {}

    canonical_hash = (
        data.get("canonical_hash_sha256") or (data.get("signature_payload") or {}).get("message") or ""
    )

    sign_packet = {
        "packet_hash": canonical_hash,
        "message": canonical_hash,
        "signature": None,
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

    resp = await agent_proof(req, body)

    payload = resp.body
    if isinstance(payload, (bytes, bytearray)):
        import json

        data = json.loads(payload.decode("utf-8") or "{}")
    elif isinstance(payload, dict):
        data = payload
    else:
        data = {}

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
# Legal Analyst + v1 routers
# -------------------------------------------------
app.include_router(legal_analyst_router)
app.include_router(workflow_router)
app.include_router(esign_router)
app.include_router(agreements_router)
app.include_router(agreements_v2_router)
app.include_router(liability_router)


# -------------------------------------------------
# Multipart routers (OFF by default)
# -------------------------------------------------
if _multipart_enabled():
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