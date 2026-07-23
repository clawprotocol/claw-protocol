"""Verify Supabase Auth JWT — user id derived server-side only.

Staging / production-like: asymmetric JWKS verification (ES256 / ECC P-256).
Local / dev / test: optional opt-in HS256 via ``CLAW_SUPABASE_JWT_HS256_LOCAL=1``;
HS256 is impossible when the environment is production-like or commercial.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import threading
import time
from typing import Any, Dict, List, Literal, Optional, Tuple

import httpx
import jwt
from fastapi import HTTPException, Request
from jwt import PyJWK

_log = logging.getLogger("claw.security.supabase_jwt")

SupabaseJwtVerifierMode = Literal["jwks", "hs256_local", "absent"]

# Bounded JWKS cache TTL (seconds).
_JWKS_CACHE_TTL_MIN = 30
_JWKS_CACHE_TTL_DEFAULT = 300
_JWKS_CACHE_TTL_MAX = 3600
_JWKS_HTTP_TIMEOUT_SEC = 5.0

_jwks_lock = threading.Lock()
# issuer -> (fetched_at_monotonic, keys_by_kid)
_jwks_cache: Dict[str, Tuple[float, Dict[str, Dict[str, Any]]]] = {}
# issuer -> monotonic time of last unknown-kid force refresh (DoS cooldown)
_jwks_last_force_refresh: Dict[str, float] = {}
_JWKS_FORCE_REFRESH_COOLDOWN_SEC = 30.0


def supabase_jwt_secret() -> str:
    """Legacy HS256 shared secret — local opt-in only; unused for staging/production JWKS."""
    return (
        os.getenv("SUPABASE_JWT_SECRET", "").strip()
        or os.getenv("CLAW_SUPABASE_JWT_SECRET", "").strip()
    )


def supabase_jwt_issuer() -> str:
    return (
        os.getenv("SUPABASE_JWT_ISSUER", "").strip()
        or os.getenv("CLAW_SUPABASE_JWT_ISSUER", "").strip()
    )


def supabase_jwt_audience() -> str:
    return (
        os.getenv("SUPABASE_JWT_AUDIENCE", "").strip()
        or os.getenv("CLAW_SUPABASE_JWT_AUDIENCE", "").strip()
        or "authenticated"
    )


def supabase_jwks_url() -> str:
    """JWKS URL derived from issuer (``<issuer>/.well-known/jwks.json``)."""
    iss = supabase_jwt_issuer().rstrip("/")
    if not iss:
        return ""
    override = (
        os.getenv("SUPABASE_JWKS_URL", "").strip()
        or os.getenv("CLAW_SUPABASE_JWKS_URL", "").strip()
    )
    if override:
        return override.rstrip("/")
    return f"{iss}/.well-known/jwks.json"


def _assert_jwks_url_trustworthy(jwks_url: str) -> None:
    """
    Staging/production-like: JWKS must be HTTPS and host-bound to the issuer.

    ``SUPABASE_JWKS_URL`` overrides are allowed only when the URL host matches the
    configured issuer host (same Supabase project). Cross-host overrides fail closed.
    """
    from urllib.parse import urlparse

    from backend.security.commercial_auth import commercial_mode_enforced, is_production_like_claw_environment

    if not (commercial_mode_enforced() or is_production_like_claw_environment()):
        return
    if not jwks_url.lower().startswith("https://"):
        raise ValueError("supabase_jwks_url_insecure")
    iss = supabase_jwt_issuer().rstrip("/")
    if not iss:
        raise ValueError("supabase_jwt_issuer_not_configured")
    iss_host = (urlparse(iss).hostname or "").strip().lower()
    jwks_host = (urlparse(jwks_url).hostname or "").strip().lower()
    if not iss_host or not jwks_host or iss_host != jwks_host:
        raise ValueError("supabase_jwks_host_mismatch")


def _jwks_cache_ttl_seconds() -> int:
    raw = os.getenv("CLAW_SUPABASE_JWKS_CACHE_TTL_SEC", "").strip()
    if not raw:
        return _JWKS_CACHE_TTL_DEFAULT
    try:
        ttl = int(raw)
    except ValueError:
        return _JWKS_CACHE_TTL_DEFAULT
    return max(_JWKS_CACHE_TTL_MIN, min(_JWKS_CACHE_TTL_MAX, ttl))


def _hs256_local_opt_in_enabled() -> bool:
    """HS256 shared-secret path — explicit local/dev/test opt-in only."""
    from backend.security.commercial_auth import commercial_mode_enforced, is_production_like_claw_environment

    if commercial_mode_enforced() or is_production_like_claw_environment():
        return False
    flag = os.getenv("CLAW_SUPABASE_JWT_HS256_LOCAL", "").strip().lower()
    return flag in ("1", "true", "yes", "on")


def supabase_jwt_verifier_mode() -> SupabaseJwtVerifierMode:
    """
    Non-secret classification of how Bearer tokens are verified.

    - ``jwks``: issuer configured; staging/production-like always uses JWKS/ES256
    - ``hs256_local``: relaxed env + ``CLAW_SUPABASE_JWT_HS256_LOCAL`` + secret
    - ``absent``: no usable verifier configuration
    """
    from backend.security.commercial_auth import commercial_mode_enforced, is_production_like_claw_environment

    if is_production_like_claw_environment() or commercial_mode_enforced():
        return "jwks" if supabase_jwt_issuer() else "absent"
    if _hs256_local_opt_in_enabled() and supabase_jwt_secret():
        return "hs256_local"
    if supabase_jwt_issuer():
        return "jwks"
    return "absent"


def supabase_jwks_verifier_configured() -> bool:
    """True when JWKS verification is configured (issuer → JWKS URL). Never exposes keys."""
    if not (supabase_jwt_issuer() and supabase_jwks_url()):
        return False
    try:
        _assert_jwks_url_trustworthy(supabase_jwks_url())
    except ValueError:
        return False
    return True


def supabase_auth_configured() -> bool:
    """True when some Bearer verification path is configured (JWKS or local HS256 opt-in)."""
    mode = supabase_jwt_verifier_mode()
    if mode == "jwks":
        return supabase_jwks_verifier_configured()
    if mode == "hs256_local":
        return bool(supabase_jwt_secret())
    return False


def reset_supabase_jwks_cache_for_tests() -> None:
    """Clear in-process JWKS cache (unit tests only)."""
    with _jwks_lock:
        _jwks_cache.clear()
        _jwks_last_force_refresh.clear()


def _b64u_decode(seg: str) -> bytes:
    pad = "=" * ((4 - len(seg) % 4) % 4)
    return base64.urlsafe_b64decode((seg + pad).encode("ascii"))


def _parse_jwt_parts(token: str) -> Tuple[Dict[str, Any], Dict[str, Any], str, str, str]:
    parts = str(token or "").strip().split(".")
    if len(parts) != 3:
        raise ValueError("invalid_jwt_format")
    try:
        header = json.loads(_b64u_decode(parts[0]))
        payload = json.loads(_b64u_decode(parts[1]))
    except (ValueError, json.JSONDecodeError) as exc:
        raise ValueError("invalid_jwt_format") from exc
    if not isinstance(header, dict) or not isinstance(payload, dict):
        raise ValueError("invalid_jwt_payload")
    return header, payload, parts[0], parts[1], parts[2]


def _validate_standard_claims(payload: Dict[str, Any], *, require_iss_aud: bool) -> None:
    exp_raw = payload.get("exp")
    if exp_raw is None or exp_raw == "" or exp_raw == 0:
        raise ValueError("jwt_exp_required")
    try:
        exp = int(exp_raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("jwt_exp_invalid") from exc
    if int(time.time()) > exp:
        raise ValueError("jwt_expired")

    sub = str(payload.get("sub") or "").strip()
    if not sub:
        raise ValueError("missing_sub")

    if not require_iss_aud:
        return

    iss_required = supabase_jwt_issuer()
    if not iss_required:
        raise ValueError("supabase_jwt_issuer_not_configured")
    iss = str(payload.get("iss") or "").strip()
    if iss != iss_required:
        raise ValueError("jwt_iss_mismatch")

    aud_required = supabase_jwt_audience()
    aud = payload.get("aud")
    if isinstance(aud, list):
        aud_ok = aud_required in [str(x).strip() for x in aud]
    else:
        aud_ok = str(aud or "").strip() == aud_required
    if not aud_ok:
        raise ValueError("jwt_aud_mismatch")


def _fetch_jwks_document(jwks_url: str) -> Dict[str, Any]:
    """HTTP GET JWKS document. Overridable in tests via monkeypatch."""
    try:
        with httpx.Client(timeout=_JWKS_HTTP_TIMEOUT_SEC) as client:
            res = client.get(jwks_url)
    except Exception as exc:
        _log.warning("supabase_jwks_fetch_failed reason=network")
        raise ValueError("supabase_jwks_unavailable") from exc
    if res.status_code != 200:
        _log.warning("supabase_jwks_fetch_failed reason=http_status status=%s", res.status_code)
        raise ValueError("supabase_jwks_unavailable")
    try:
        doc = res.json()
    except Exception as exc:
        _log.warning("supabase_jwks_fetch_failed reason=invalid_json")
        raise ValueError("supabase_jwks_unavailable") from exc
    if not isinstance(doc, dict) or not isinstance(doc.get("keys"), list):
        raise ValueError("supabase_jwks_unavailable")
    return doc


def _index_jwks_keys(doc: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for item in doc.get("keys") or []:
        if not isinstance(item, dict):
            continue
        kid = str(item.get("kid") or "").strip()
        kty = str(item.get("kty") or "").strip()
        alg = str(item.get("alg") or "").strip()
        crv = str(item.get("crv") or "").strip()
        if not kid:
            continue
        # Accept EC P-256 keys only (Supabase asymmetric JWT signing).
        if kty != "EC":
            continue
        if crv != "P-256":
            continue
        if alg and alg not in ("ES256",):
            continue
        out[kid] = item
    return out


def _load_jwks_keys(*, issuer: str, force_refresh: bool) -> Dict[str, Dict[str, Any]]:
    jwks_url = supabase_jwks_url()
    if not jwks_url:
        raise ValueError("supabase_jwt_issuer_not_configured")
    _assert_jwks_url_trustworthy(jwks_url)
    ttl = float(_jwks_cache_ttl_seconds())
    now = time.monotonic()
    with _jwks_lock:
        cached = _jwks_cache.get(issuer)
        if cached and not force_refresh:
            fetched_at, keys = cached
            if (now - fetched_at) < ttl and keys:
                return keys
        if force_refresh and cached:
            last_force = _jwks_last_force_refresh.get(issuer, 0.0)
            if (now - last_force) < _JWKS_FORCE_REFRESH_COOLDOWN_SEC:
                # Cooldown: do not amplify JWKS fetches on unknown-kid probes.
                return cached[1]
            _jwks_last_force_refresh[issuer] = now
    doc = _fetch_jwks_document(jwks_url)
    keys = _index_jwks_keys(doc)
    if not keys:
        raise ValueError("supabase_jwks_unavailable")
    with _jwks_lock:
        _jwks_cache[issuer] = (time.monotonic(), keys)
        if force_refresh:
            _jwks_last_force_refresh[issuer] = time.monotonic()
    return keys


def _verify_es256_with_jwks(token: str, header: Dict[str, Any]) -> Dict[str, Any]:
    kid = str(header.get("kid") or "").strip()
    if not kid:
        raise ValueError("jwt_kid_required")
    alg = str(header.get("alg") or "").strip()
    if alg != "ES256":
        raise ValueError("unsupported_jwt_alg")

    issuer = supabase_jwt_issuer()
    if not issuer:
        raise ValueError("supabase_jwt_issuer_not_configured")

    keys = _load_jwks_keys(issuer=issuer, force_refresh=False)
    jwk_dict = keys.get(kid)
    if jwk_dict is None:
        # Key rotation: one JWKS refresh (cooldown-bounded across requests), then fail closed.
        keys = _load_jwks_keys(issuer=issuer, force_refresh=True)
        jwk_dict = keys.get(kid)
    if jwk_dict is None:
        raise ValueError("jwt_kid_unknown")

    try:
        public_key = PyJWK.from_dict(jwk_dict).key
        payload = jwt.decode(
            token,
            key=public_key,
            algorithms=["ES256"],
            audience=supabase_jwt_audience(),
            issuer=issuer,
            options={
                "require": ["exp", "sub", "iss", "aud"],
                "verify_aud": True,
                "verify_iss": True,
                "verify_exp": True,
            },
        )
    except jwt.ExpiredSignatureError as exc:
        raise ValueError("jwt_expired") from exc
    except jwt.InvalidIssuerError as exc:
        raise ValueError("jwt_iss_mismatch") from exc
    except jwt.InvalidAudienceError as exc:
        raise ValueError("jwt_aud_mismatch") from exc
    except jwt.InvalidTokenError as exc:
        raise ValueError("invalid_jwt_signature") from exc
    except Exception as exc:
        raise ValueError("invalid_jwt_signature") from exc

    if not isinstance(payload, dict):
        raise ValueError("invalid_jwt_payload")
    sub = str(payload.get("sub") or "").strip()
    if not sub:
        raise ValueError("missing_sub")
    return payload


def _verify_hs256_local(token: str, header: Dict[str, Any], payload: Dict[str, Any], h64: str, p64: str, s64: str) -> Dict[str, Any]:
    if not _hs256_local_opt_in_enabled():
        raise ValueError("unsupported_jwt_alg")
    alg = str(header.get("alg") or "").strip()
    if alg != "HS256":
        raise ValueError("unsupported_jwt_alg")
    secret = supabase_jwt_secret()
    if not secret:
        raise ValueError("supabase_jwt_not_configured")
    sig = _b64u_decode(s64)
    expected = hmac.new(secret.encode("utf-8"), f"{h64}.{p64}".encode("utf-8"), hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        raise ValueError("invalid_jwt_signature")
    _validate_standard_claims(payload, require_iss_aud=bool(supabase_jwt_issuer()))
    return payload


def verify_supabase_access_token(token: str) -> Dict[str, Any]:
    """
    Validate Supabase access token.

    Production-like / commercial: JWKS + ES256 only (no HS256 / shared-secret fallback).
    Local/dev/test: JWKS when issuer is set; HS256 only with ``CLAW_SUPABASE_JWT_HS256_LOCAL=1``.
    """
    from backend.security.commercial_auth import commercial_mode_enforced, is_production_like_claw_environment

    header, payload, h64, p64, s64 = _parse_jwt_parts(token)
    alg = str(header.get("alg") or "").strip()
    if not alg or alg.lower() == "none":
        raise ValueError("unsupported_jwt_alg")

    strict = commercial_mode_enforced() or is_production_like_claw_environment()
    mode = supabase_jwt_verifier_mode()
    if mode == "absent":
        if strict:
            raise ValueError("supabase_jwt_issuer_not_configured")
        raise ValueError("supabase_jwt_not_configured")

    if strict:
        # Staging/production: ES256 + JWKS only — never HS256 even if a secret exists.
        if alg != "ES256":
            raise ValueError("unsupported_jwt_alg")
        return _verify_es256_with_jwks(token, header)

    # Relaxed environments.
    if alg == "ES256":
        if not supabase_jwks_verifier_configured():
            raise ValueError("supabase_jwt_issuer_not_configured")
        return _verify_es256_with_jwks(token, header)
    if alg == "HS256":
        return _verify_hs256_local(token, header, payload, h64, p64, s64)
    raise ValueError("unsupported_jwt_alg")


def extract_bearer_token(request: Request) -> Optional[str]:
    auth = (request.headers.get("authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return None


def _test_auth_user_id(request: Request) -> Optional[str]:
    """
    Test auth header — only when CLAW_ENVIRONMENT is explicitly local/dev/test.

    Impossible when unset, blank, staging, qa, preview, production, or commercial.
    """
    from backend.security.commercial_auth import test_auth_headers_allowed

    if not test_auth_headers_allowed():
        return None
    uid = (request.headers.get("X-Claw-Test-Auth-User-Id") or "").strip()
    return uid or None


def require_supabase_user_id(request: Request) -> str:
    """Return verified Supabase user id or raise 401."""
    token = extract_bearer_token(request)
    if token:
        try:
            claims = verify_supabase_access_token(token)
            return str(claims["sub"]).strip()
        except ValueError as exc:
            # Never echo token material — reason codes only.
            raise HTTPException(
                status_code=401,
                detail={"code": "invalid_auth_token", "message": str(exc)},
            ) from exc
    test_uid = _test_auth_user_id(request)
    if test_uid:
        return test_uid
    raise HTTPException(
        status_code=401,
        detail={"code": "auth_required", "message": "Supabase JWT or test auth header required."},
    )


def public_supabase_jwt_readiness() -> Dict[str, Any]:
    """Non-secret readiness fields for runtime summary / access policy."""
    return {
        "supabase_jwt_jwks_configured": supabase_jwks_verifier_configured(),
        "supabase_jwt_verifier_mode": supabase_jwt_verifier_mode(),
        "supabase_auth_configured": supabase_auth_configured(),
    }
