"""Shared CORS allow-list and response header attachment for /api routes."""

from __future__ import annotations

import logging
import os
import re
from typing import Any, Dict, List, Optional

from starlette.requests import Request
from starlette.responses import Response

from backend.agreements.paid_pro_server_timing import CORS_EXPOSE_PAID_PRO_HEADERS
from backend.config.deployment_runtime import claw_environment

_log = logging.getLogger("claw.cors")

_PREMIUM_FULL_DRAFT_PATH = "/api/agreements/premium-full-draft"

# Canonical request headers for split-origin SPA → /api (keep in sync with frontend clawAgreementHeaders + premiumFullDraftApi).
CORS_ALLOW_REQUEST_HEADERS: List[str] = [
    "Content-Type",
    "Authorization",
    "X-Request-Id",
    "X-Claw-Org-Id",
    "X-Claw-Anon-Session",
    "X-Claw-Agreement-Id",
    "X-Claw-Affiliate-Code",
    "X-Claw-Paid-Pro-Perf-Trace",
    "X-Claw-Review-First-Persist",
    "X-Claw-Recipient-Access-Token",
    "X-Claw-Recipient-Link-Mint-Key",
    # Operator admin console + QA authorization (split-origin SPA).
    "X-Claw-Admin-Secret",
    "X-Claw-Admin-Reason",
    "X-Claw-Admin-User-Id",
    "X-Claw-Admin-Email",
    "X-Claw-User-Id",
]

CORS_ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"


def cors_allow_request_headers_csv() -> str:
    return ", ".join(CORS_ALLOW_REQUEST_HEADERS)


def cors_allow_request_header_allowed(requested: str) -> bool:
    """Case-insensitive match for Access-Control-Request-Headers preflight tokens."""
    token = (requested or "").strip().lower()
    if not token:
        return False
    allowed = {h.lower() for h in CORS_ALLOW_REQUEST_HEADERS}
    return token in allowed

# Middleware registration order (request: outer → inner). Last registered runs first.
CORS_MIDDLEWARE_STACK_REQUEST_ORDER: List[str] = [
    "claw_cors_api_acao_fallback",
    "CORSMiddleware (starlette)",
    "claw_request_size_limit",
    "claw_rate_limit",
    "claw_request_id",
    "claw_version_headers",
    "claw_cache_control",
    "verifier_only_guard",
]


def normalize_cors_origin(raw: str) -> str:
    """
    Browser Origin is scheme + host + port (no path). Normalize env/operator typos:
    quotes, trailing slash, whitespace, CR/LF.
    """
    s = (raw or "").strip().strip("\r\n")
    if not s:
        return ""
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        s = s[1:-1].strip()
    s = s.rstrip("/").strip()
    if s and not re.match(r"^https?://", s, re.I):
        return ""
    return s


def _parse_cors_origins_env() -> List[str]:
    env = os.getenv("CLAW_CORS_ALLOW_ORIGINS", "")
    if not env.strip():
        return []
    parts: List[str] = []
    for chunk in env.split(","):
        normalized = normalize_cors_origin(chunk)
        if normalized:
            parts.append(normalized)
    return parts


def cors_allowed_origins() -> List[str]:
    """
    Production: CLAW_CORS_ALLOW_ORIGINS comma-separated origins (normalized).
    Local/dev/test: defaults to ["*"] when unset.
    """
    parsed = _parse_cors_origins_env()
    if parsed:
        return parsed
    env = claw_environment()
    # Only explicit relaxed environments may default to wildcard CORS.
    if env in ("local", "dev", "test"):
        return ["*"]
    return []


def _railway_deploy_detected() -> bool:
    """Railway injects service metadata on hosted backends (split SPA/API deploys)."""
    return bool(
        os.getenv("RAILWAY_ENVIRONMENT", "").strip()
        or os.getenv("RAILWAY_SERVICE_ID", "").strip()
        or os.getenv("RAILWAY_PROJECT_ID", "").strip()
    )


def _origin_suffix_allowlist() -> List[str]:
    raw = os.getenv("CLAW_CORS_ALLOW_ORIGIN_SUFFIXES", "").strip()
    if raw:
        return [s.strip() for s in raw.split(",") if s.strip()]
    env = claw_environment()
    if env in ("staging", "qa", "preview", "test"):
        return [".up.railway.app", ".railway.app"]
    # Production Railway API + separate Railway SPA (e.g. believable-gentleness → claw-protocol).
    if _railway_deploy_detected():
        return [".up.railway.app", ".railway.app"]
    return []


def origin_is_allowed(origin: str) -> bool:
    o = normalize_cors_origin(origin)
    if not o:
        return False
    allowed = cors_allowed_origins()
    if allowed == ["*"]:
        return True
    if o in allowed:
        return True
    for suffix in _origin_suffix_allowlist():
        if suffix and o.endswith(suffix):
            return True
    return False


def apply_cors_headers_to_response(response: Response, origin: str) -> Response:
    """Attach ACAO + credentials when origin is allowed (idempotent)."""
    normalized = normalize_cors_origin(origin)
    if not normalized or not origin_is_allowed(normalized):
        return response
    existing_acao = (response.headers.get("access-control-allow-origin") or "").strip()
    # Starlette CORSMiddleware may emit "*" even with allow_credentials=True; browsers reject
    # credentialed cross-origin responses unless ACAO matches the request Origin exactly.
    if existing_acao and existing_acao != "*" and existing_acao == normalized:
        pass
    else:
        response.headers["Access-Control-Allow-Origin"] = normalized
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers.setdefault("Access-Control-Allow-Methods", CORS_ALLOW_METHODS)
    response.headers.setdefault("Access-Control-Allow-Headers", cors_allow_request_headers_csv())
    exposed = response.headers.get("access-control-expose-headers", "")
    for hdr in CORS_EXPOSE_PAID_PRO_HEADERS:
        if hdr.lower() not in exposed.lower():
            exposed = f"{exposed}, {hdr}".strip(", ")
    if exposed:
        response.headers["Access-Control-Expose-Headers"] = exposed
    return response


def cors_env_raw_meta() -> Dict[str, Any]:
    """Safe diagnostics — never log full secret env, only shape/length."""
    raw = os.getenv("CLAW_CORS_ALLOW_ORIGINS", "")
    return {
        "configured": bool(raw.strip()),
        "raw_len": len(raw),
        "has_crlf": "\r" in raw or "\n" in raw,
        "has_wrapping_quotes": bool(
            raw.strip().startswith('"') or raw.strip().startswith("'")
        ),
        "has_trailing_slash_on_first_origin": bool(
            raw.strip().split(",")[0].strip().endswith("/") if raw.strip() else False
        ),
    }


def cors_startup_diagnostics() -> Dict[str, Any]:
    allowed = cors_allowed_origins()
    return {
        "claw_environment": claw_environment(),
        "env_raw": cors_env_raw_meta(),
        "resolved_origin_count": len(allowed),
        "resolved_origins": allowed if allowed != ["*"] else ["*"],
        "allow_wildcard": allowed == ["*"],
        "origin_suffix_allowlist": _origin_suffix_allowlist(),
        "allow_credentials": True,
        "middleware_stack_request_order": CORS_MIDDLEWARE_STACK_REQUEST_ORDER,
    }


def log_cors_startup_diagnostics() -> None:
    snap = cors_startup_diagnostics()
    _log.info("[cors-startup] %s", snap)
    if snap["allow_wildcard"]:
        return
    if snap["resolved_origin_count"] == 0 and snap["claw_environment"] not in (
        "local",
        "dev",
        "test",
    ):
        _log.warning(
            "[cors-startup] CLAW_CORS_ALLOW_ORIGINS resolved to empty list — "
            "split-origin browsers will not receive Access-Control-Allow-Origin"
        )


def _cors_proof_layer(response: Response, origin: str) -> str:
    if not origin:
        return "no_origin_header"
    acao = (response.headers.get("access-control-allow-origin") or "").strip()
    if acao:
        return "acao_present"
    if origin_is_allowed(origin):
        return "allowed_origin_missing_acao"
    return "origin_not_in_allowlist"


def log_premium_full_draft_cors_proof(
    request: Request,
    response: Response,
    *,
    note: Optional[str] = None,
) -> None:
    """Proof log for QA: premium-full-draft (and OPTIONS preflight) ACAO attachment."""
    origin = normalize_cors_origin(request.headers.get("origin") or "")
    allowed = cors_allowed_origins()
    acao = (response.headers.get("access-control-allow-origin") or "").strip()
    acred = (response.headers.get("access-control-allow-credentials") or "").strip()
    payload: Dict[str, Any] = {
        "event": "premium_full_draft_cors_proof",
        "method": request.method,
        "path": request.url.path,
        "status": response.status_code,
        "request_origin": origin or None,
        "request_origin_allowed": origin_is_allowed(origin) if origin else False,
        "acao": acao or None,
        "acao_matches_request_origin": bool(origin and acao and acao == origin),
        "access_control_allow_credentials": acred or None,
        "resolved_origin_count": len(allowed),
        "cors_layer": _cors_proof_layer(response, origin),
        "env_configured": cors_env_raw_meta()["configured"],
    }
    if note:
        payload["note"] = note
    if origin and not payload["request_origin_allowed"]:
        payload["allowlist_hosts"] = [
            o.replace("https://", "").replace("http://", "") for o in allowed[:6]
        ]
    _log.info("[cors-response-proof] %s", payload)


def should_log_cors_proof_for_path(path: str, method: str) -> bool:
    p = (path or "").strip()
    if p == _PREMIUM_FULL_DRAFT_PATH:
        return True
    if method.upper() == "OPTIONS" and p.startswith("/api/agreements/"):
        return True
    return False


def attach_cors_from_request(request: Optional[Request], response: Response) -> Response:
    if request is None:
        return response
    origin = request.headers.get("origin") or ""
    return apply_cors_headers_to_response(response, origin)
