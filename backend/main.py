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
from backend.handlers.verify_handler import (
    VerifyReceiptRequest,
    verify_receipt_packet,
    verify_usage_verification_bundle,
)
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
from backend.anchoring.execution import submit_commitment_for_network
from backend.handlers.verifier_api_handler import get_batch, get_receipt_for_verify
from backend.anchoring.config import (
    anchor_canonical_chain_policy,
    anchor_mirror_dogecoin_enabled,
    anchor_mirror_dogecoin_required,
    bitcoin_execution_provider_type,
    dogecoin_execution_provider_type,
    dogecoin_mirror_every_nth_batch_close,
    launch_anchor_cadence_days,
    third_party_anchor_api_key_configured,
    third_party_anchor_base_url,
)
from backend.config.anchor_network_config import anchor_cadence_summary
from backend.config.external_ai_policy import log_external_ai_policy_at_startup

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
from backend.config.deployment_runtime import (
    admin_anchor_http_trigger_enabled,
    public_runtime_summary,
)
from backend.ops.break_glass_audit import BreakGlassAction, log_break_glass_event
from backend.ops.deploy_readiness import gather_deploy_readiness
from backend.services.anchor_worker_service import run_anchor_batch_cycle_from_env
from backend.anchoring.store import AnchoringStore

# canonical hashing helper
from backend.utils.canon_json import canon_sha256_hex

from backend.handlers.liability_api_handler import get_liability_assessment
from backend.handlers.liability_latest_handler import get_latest_liability_for_timeline
from backend.handlers.legal_analyst_handler import router as legal_analyst_router
from backend.routers.workflow_api import router as workflow_router
from backend.routers.esign_api import router as esign_router
from backend.routers.agreements_api import router as agreements_router
from backend.routers.agreements_v2_api import router as agreements_v2_router
from backend.routers.feed_api import router as feed_router
from backend.routers.liability_api import router as liability_router
from backend.routers.vs01_documents_api import router as vs01_documents_router
from backend.routers.vs01_sign_api import router as vs01_sign_router
from backend.routers.vs01_receipts_api import router as vs01_receipts_router
from backend.routers.dev_storage_smoke_api import router as dev_storage_smoke_router
from backend.payments.webhooks import router as payments_onramp_webhook_router
from backend.payments.stripe_webhooks import router as stripe_webhook_router
from backend.routers.economics_v1_api import router as economics_v1_router
from backend.routers.genesis_referral_api import router as genesis_referral_router
from backend.routers.compliance_api import router as compliance_router
from backend.routers.client_events_api import router as client_events_router
from backend.routers.transcription_hero_api import router as transcription_hero_router
from backend.routers.agreement_memory_api import router as agreement_memory_router
from backend.routers.document_layout_api import router as document_layout_router
from backend.routers.integrations_api import router as integrations_router
from backend.routers.advanced_work_product_api import router as advanced_work_product_router
from backend.routers.affiliate_gamification_api import router as affiliate_gamification_router
from backend.routers.integration_hooks_api import router as integration_hooks_router
from backend.routers.ops_anchor_api import router as ops_anchor_router
from backend.routers.proof_status_api import router as proof_status_router
from backend.routers.admin_console_api import router as admin_console_router


# -------------------------------------------------
# App + Middleware
# -------------------------------------------------
app = FastAPI(title="CLAW Backend")
log_external_ai_policy_at_startup()

from backend.config.env_bootstrap import log_env_warnings_at_startup  # noqa: E402

log_env_warnings_at_startup()

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
        "/v1/proof/",
        "/v1/timeline/receipts/",
        "/api/agreements/",  # GET proof-status, access policy/validate, read-only agreement endpoints
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
async def claw_cache_control(request: Request, call_next):
    """Set Cache-Control on API responses; auth/webhook/health are always no-store."""
    from backend.config.http_cache_policy import cache_control_for_path

    response = await call_next(request)
    if "cache-control" not in {k.lower() for k in response.headers.keys()}:
        policy = cache_control_for_path(request.url.path, request.method)
        if policy:
            response.headers["Cache-Control"] = policy
    return response


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


def _rate_limit_rps_burst() -> tuple[float, float]:
    """
    Token-bucket limits for /v1/*. Unset env in local/dev/test => no limit (0,0).
    Production (CLAW_ENVIRONMENT not in local/dev/test) with unset vars => safe defaults
    (8 RPS, burst 16 per client IP) to reduce launch-day abuse/cost risk.
    Override with CLAW_RATE_LIMIT_RPS and CLAW_RATE_LIMIT_BURST.
    """
    rps = float(os.getenv("CLAW_RATE_LIMIT_RPS", "0") or 0)
    burst = float(os.getenv("CLAW_RATE_LIMIT_BURST", "0") or 0)
    if rps > 0 and burst > 0:
        return rps, burst
    env = os.getenv("CLAW_ENVIRONMENT", "local").strip().lower()
    if env in ("local", "dev", "test"):
        return 0.0, 0.0
    return 8.0, 16.0


def _rate_limit_allow(key: str) -> bool:
    rps, burst = _rate_limit_rps_burst()
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
    """
    Production: set CLAW_CORS_ALLOW_ORIGINS to a comma-separated list of allowed web origins
    (e.g. https://app.example.com,https://www.example.com). Empty in production => no CORS origins
    (browsers will block cross-origin API calls until configured).
    Local/dev/test: defaults to "*" for developer ergonomics.
    """
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


@app.middleware("http")
async def claw_cors_api_acao_fallback(request: Request, call_next):
    """
    If an API response is missing ACAO (e.g. misconfigured allow list + edge/proxy quirks),
    attach it when the Origin matches CLAW_CORS_ALLOW_ORIGINS so browser retries still see CORS.
    """
    response = await call_next(request)
    if response.headers.get("access-control-allow-origin"):
        return response
    origin = (request.headers.get("origin") or "").strip()
    if not origin or not str(request.url.path).startswith("/api/"):
        return response
    allowed = _cors_origins()
    if not allowed or allowed == ["*"]:
        return response
    if origin in allowed:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers.setdefault("Access-Control-Allow-Methods", "*")
        response.headers.setdefault("Access-Control-Allow-Headers", "*")
    return response


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


def _relaxed_claw_environment() -> bool:
    """local / dev / test — keep admin-secret-off and debug-default-on ergonomic."""
    return _environment().strip().lower() in ("local", "dev", "test")


def _is_production_like() -> bool:
    return not _relaxed_claw_environment()


def _debug_enabled() -> bool:
    """
    Production-like: default OFF unless CLAW_DEBUG is explicitly truthy.
    Relaxed envs: default ON unless CLAW_DEBUG is explicitly set to a falsey value.
    """
    raw = os.getenv("CLAW_DEBUG")
    if raw is None or not str(raw).strip():
        return _relaxed_claw_environment()
    return str(raw).strip().lower() in ("1", "true", "yes")


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


def _log_break_glass_admin(req: Request, action: str) -> None:
    """Privileged admin surface (shared secret header)."""
    try:
        log_break_glass_event(req, action, auth_channel="x-claw-admin-secret")
    except Exception:
        pass  # audit must not break operator paths


def _admin_ok(req: Request) -> bool:
    """
    Admin-only endpoints (anchor batch, deploy readiness, runtime summary).

    - Production-like (CLAW_ENVIRONMENT not local/dev/test): CLAW_ADMIN_SECRET is **required**;
      missing secret => deny (fail closed).
    - Relaxed envs: unset secret => allow (local ergonomics); set secret => header must match.
    """
    secret = os.getenv("CLAW_ADMIN_SECRET", "").strip()
    if _is_production_like():
        if not secret:
            return False
        return req.headers.get("x-claw-admin-secret") == secret
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
      GET /v1/timelines/*, GET /v1/receipts/* (VS01 filesystem receipts),
      GET /v1/timeline/receipts/* (legacy timeline-store receipts)
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


@app.get("/v1/timeline/receipts/{receipt_id}/verify")
def api_get_receipt_for_verify(receipt_id: str):
    store = TimelineStore()
    return get_receipt_for_verify(store=store, receipt_id=receipt_id)


# -------------------------------------------------
# Small UX helper models (additive; do not break protocol models)
# -------------------------------------------------
class AdminReceiptBatchAnchorRequeueBody(BaseModel):
    """Ops-only: re-queue a failed_retryable receipt-batch ``anchor_jobs`` row for the next drain."""

    job_id: str


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
    """Diagnostic liveness — always HTTP 200; optional subsystems may report degraded/error."""
    from backend.health.public_liveness import build_public_health_payload

    return JSONResponse(build_public_health_payload())


@app.get("/v1/healthz")
async def healthz():
    from backend.health.public_liveness import build_public_health_payload

    return JSONResponse(build_public_health_payload())


@app.get("/v1/readyz")
async def readyz():
    """
    Readiness for load balancers / orchestration: probes each **configured** Postgres launch domain.

    Liveness stays on ``GET /health`` / ``GET /v1/healthz`` (process up). If any configured domain
    returns ``error``, responds **503**. Skipped domains (SQLite fallback) do not fail readiness.
    Usage-economics metering Postgres is intentionally omitted here — see ``checks`` on
    ``GET /admin/deploy-readiness`` (``usage_economics_postgresql``).
    """
    from backend.db.readiness import launch_postgres_readiness_for_readyz

    checks = launch_postgres_readiness_for_readyz()
    failed_domains = [
        k for k, v in checks.items() if isinstance(v, dict) and v.get("status") == "error"
    ]
    bad = bool(failed_domains)
    if bad:
        headline = (
            "Configured PostgreSQL domain(s) unreachable: "
            + ", ".join(failed_domains)
            + "."
        )
    else:
        headline = (
            "All configured PostgreSQL domains reachable; "
            "skipped entries use SQLite or have no DSN."
        )
    body: dict = {
        "ok": not bad,
        "summary": {
            "headline": headline,
            "failed_domains": failed_domains,
            "scope": (
                "PostgreSQL reachability for launch domains in `checks` "
                "(`error` → 503; `skipped` → SQLite or no DSN). "
                "Usage-economics metering PG is not probed here — see "
                "`checks.usage_economics_postgresql` on GET /admin/deploy-readiness."
            ),
        },
        "checks": checks,
    }
    if bad:
        return JSONResponse(status_code=503, content=body)
    return JSONResponse(body)


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
                "daily_equivalent_block_count_by_network": anchor_cadence_summary(),
                "launch_policy": {
                    "canonical_chain": anchor_canonical_chain_policy(),
                    "mirror_dogecoin_enabled": anchor_mirror_dogecoin_enabled(),
                    "mirror_dogecoin_required": anchor_mirror_dogecoin_required(),
                    "target_cadence_days": launch_anchor_cadence_days(),
                    "dogecoin_mirror_every_nth_batch_close": dogecoin_mirror_every_nth_batch_close(),
                    "note": "Bitcoin is canonical. Dogecoin mirror jobs are enqueued every Nth batch close (default 2); mirror is secondary in verification.",
                    "execution": {
                        "bitcoin_provider": bitcoin_execution_provider_type(),
                        "dogecoin_provider": dogecoin_execution_provider_type(),
                        "third_party_base_url_configured": bool(third_party_anchor_base_url()),
                        "third_party_api_key_configured": third_party_anchor_api_key_configured(),
                    },
                },
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
    if _is_production_like() and not _debug_enabled():
        return JSONResponse(status_code=404, content={"detail": "not_found"})

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
    ub = body.get("usage_bundle")
    if isinstance(ub, dict):
        return JSONResponse(verify_usage_verification_bundle(ub))
    if isinstance(body, dict) and body.get("type") == "UsageVerificationBundle":
        return JSONResponse(verify_usage_verification_bundle(body))

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
                btc_txid = submit_commitment_for_network(
                    body.anchor_network,
                    body.frozen_manifest_sha256,
                    metadata={"job_kind": "timeline_immediate", "timeline_id": timeline_id},
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


@app.get("/v1/timeline/receipts/{receipt_id}")
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

    _log_break_glass_admin(req, BreakGlassAction.ADMIN_ANCHOR_RUN)

    if not admin_anchor_http_trigger_enabled():
        return JSONResponse(
            status_code=403,
            content={
                "error": "admin_anchor_http_disabled",
                "hint": "Set CLAW_ADMIN_ANCHOR_RUN_ENABLED=1 to allow HTTP-triggered anchors, "
                "or run `python -m backend.workers.run_anchor_worker` from a worker/cron.",
            },
        )

    if _anchor_mode_env() != "batch":
        return JSONResponse(status_code=409, content={"error": "Not in batch mode"})

    result = run_anchor_batch_cycle_from_env(
        payment_proof_header=_payment_header_value(req),
        request_context={
            **_request_context(req),
            "path": "/admin/anchor/run",
            "anchor_run_kind": "admin_http",
        },
    )
    return JSONResponse(result)


@app.post("/admin/anchor/receipt-batch/requeue")
async def admin_anchor_receipt_batch_requeue(
    req: Request, body: AdminReceiptBatchAnchorRequeueBody
):
    """
    Re-queue a single ``failed_retryable`` receipt-batch anchor job (Bitcoin or Dogecoin).

    Same auth and HTTP enablement as ``POST /admin/anchor/run``. Prefer this over ad-hoc SQL.
    """
    deny = _deny_write_if_verifier()
    if deny:
        return deny

    if not _admin_ok(req):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})

    _log_break_glass_admin(req, BreakGlassAction.ADMIN_ANCHOR_JOB_REQUEUE)

    if not admin_anchor_http_trigger_enabled():
        return JSONResponse(
            status_code=403,
            content={
                "error": "admin_anchor_http_disabled",
                "hint": "Set CLAW_ADMIN_ANCHOR_RUN_ENABLED=1 to allow this endpoint, "
                "or re-queue via an ops shell using AnchoringStore.requeue_failed_retryable_batch_anchor_job.",
            },
        )

    store = AnchoringStore()
    store.init_schema()
    ok, reason, jid = store.retry_failed_retryable_batch_anchor_job(job_id=body.job_id.strip())
    status = 200 if ok else 400
    if reason == "job_not_found":
        status = 404
    elif reason == "already_confirmed":
        status = 409
    return JSONResponse(
        {
            "ok": ok,
            "reason": reason,
            "job_id": jid or body.job_id.strip(),
            "requeued": ok,
        },
        status_code=status,
    )


@app.get("/admin/runtime-summary")
async def admin_runtime_summary(req: Request):
    """Non-secret deployment snapshot for operators (requires CLAW_ADMIN_SECRET when not local/dev/test)."""
    if not _admin_ok(req):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    _log_break_glass_admin(req, BreakGlassAction.ADMIN_RUNTIME_SUMMARY)
    return JSONResponse(public_runtime_summary())


@app.get("/admin/deploy-readiness")
async def admin_deploy_readiness(req: Request):
    """
    Aggregated DB / queue / RPC ping / optional artifact round-trip checks (no secrets in JSON).

    See docs/ops/DEPLOY_SMOKE_TEST.md. Profile: CLAW_DEPLOY_SMOKE_PROFILE and
    CLAW_DEPLOY_SMOKE_STORAGE_ROUND_TRIP.
    """
    if not _admin_ok(req):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    _log_break_glass_admin(req, BreakGlassAction.ADMIN_DEPLOY_READINESS)
    return JSONResponse(gather_deploy_readiness())


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
app.include_router(feed_router)
app.include_router(liability_router)
app.include_router(vs01_documents_router)
app.include_router(vs01_sign_router)
app.include_router(vs01_receipts_router)
app.include_router(proof_status_router)
# /internal/dev/* — omit in production-like env unless explicitly opted in (fail closed).
if _relaxed_claw_environment() or os.getenv("CLAW_DEV_STORAGE_SMOKE", "").strip() == "1":
    app.include_router(dev_storage_smoke_router)
app.include_router(payments_onramp_webhook_router)
app.include_router(stripe_webhook_router)
app.include_router(economics_v1_router)
app.include_router(genesis_referral_router)
app.include_router(compliance_router)
app.include_router(client_events_router)
app.include_router(transcription_hero_router)
app.include_router(agreement_memory_router)
app.include_router(document_layout_router)
app.include_router(integrations_router)
app.include_router(affiliate_gamification_router)
app.include_router(advanced_work_product_router)
app.include_router(integration_hooks_router)
app.include_router(ops_anchor_router)
app.include_router(admin_console_router)


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