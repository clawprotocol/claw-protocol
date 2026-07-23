"""Shared auth helpers for commercial fail-closed tests.

Production-like paths mint ES256 tokens and mock Supabase JWKS.
Local HS256 remains available only with explicit opt-in helpers.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any, Dict, List, Optional

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric import ec
import jwt as pyjwt


DEFAULT_JWT_ISSUER = "https://example.supabase.co/auth/v1"
DEFAULT_JWT_AUDIENCE = "authenticated"
DEFAULT_CURRENT_KID = "test-es256-kid-current"
DEFAULT_PREVIOUS_KID = "test-es256-kid-previous"

_KEYPAIR_CACHE: Optional[Dict[str, ec.EllipticCurvePrivateKey]] = None


def _b64url_uint(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _ec_public_jwk(private_key: ec.EllipticCurvePrivateKey, *, kid: str) -> Dict[str, Any]:
    pub = private_key.public_key().public_numbers()
    x = pub.x.to_bytes(32, "big")
    y = pub.y.to_bytes(32, "big")
    return {
        "kty": "EC",
        "crv": "P-256",
        "alg": "ES256",
        "use": "sig",
        "kid": kid,
        "x": _b64url_uint(x),
        "y": _b64url_uint(y),
    }


def es256_signing_keys() -> Dict[str, ec.EllipticCurvePrivateKey]:
    """Stable in-process EC keypairs for JWKS fixture tests (current + previous)."""
    global _KEYPAIR_CACHE
    if _KEYPAIR_CACHE is None:
        _KEYPAIR_CACHE = {
            DEFAULT_CURRENT_KID: ec.generate_private_key(ec.SECP256R1(), default_backend()),
            DEFAULT_PREVIOUS_KID: ec.generate_private_key(ec.SECP256R1(), default_backend()),
        }
    return _KEYPAIR_CACHE


def es256_jwks_document(
    *,
    kids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    keys = es256_signing_keys()
    selected = kids or [DEFAULT_CURRENT_KID, DEFAULT_PREVIOUS_KID]
    return {"keys": [_ec_public_jwk(keys[kid], kid=kid) for kid in selected if kid in keys]}


def mint_es256_supabase_jwt(
    sub: str,
    *,
    issuer: str = DEFAULT_JWT_ISSUER,
    audience: str = DEFAULT_JWT_AUDIENCE,
    kid: str = DEFAULT_CURRENT_KID,
    ttl_seconds: int = 3600,
    exp: Optional[int] = None,
    private_key: Optional[ec.EllipticCurvePrivateKey] = None,
    extra: Optional[Dict[str, Any]] = None,
    include_kid: bool = True,
) -> str:
    key = private_key or es256_signing_keys()[kid]
    now = int(time.time())
    payload: Dict[str, Any] = {
        "sub": sub,
        "iss": issuer,
        "aud": audience,
        "iat": now,
        "exp": int(exp) if exp is not None else now + max(60, int(ttl_seconds)),
    }
    if extra:
        payload.update(extra)
    headers: Dict[str, Any] = {"alg": "ES256", "typ": "JWT"}
    if include_kid:
        headers["kid"] = kid
    return pyjwt.encode(payload, key, algorithm="ES256", headers=headers)


def mint_hs256_supabase_jwt(
    sub: str,
    *,
    secret: str,
    issuer: str,
    audience: str = "authenticated",
    ttl_seconds: int = 3600,
    extra: Optional[Dict[str, Any]] = None,
) -> str:
    """Local-only HS256 mint helper (requires CLAW_SUPABASE_JWT_HS256_LOCAL at verify time)."""
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload: Dict[str, Any] = {
        "sub": sub,
        "iss": issuer,
        "aud": audience,
        "iat": now,
        "exp": now + max(60, int(ttl_seconds)),
    }
    if extra:
        payload.update(extra)

    def _b64(obj: Any) -> str:
        raw = json.dumps(obj, separators=(",", ":"), sort_keys=True).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    h, p = _b64(header), _b64(payload)
    sig = hmac.new(secret.encode("utf-8"), f"{h}.{p}".encode("utf-8"), hashlib.sha256).digest()
    return f"{h}.{p}.{base64.urlsafe_b64encode(sig).decode('ascii').rstrip('=')}"


def install_mock_supabase_jwks(
    monkeypatch,
    *,
    document: Optional[Dict[str, Any]] = None,
    kids: Optional[List[str]] = None,
    fetch_error: Optional[BaseException] = None,
) -> None:
    """Mock JWKS HTTP fetch and clear the in-process cache."""
    from backend.security.supabase_jwt import reset_supabase_jwks_cache_for_tests

    reset_supabase_jwks_cache_for_tests()
    doc = document if document is not None else es256_jwks_document(kids=kids)

    def _fetch(_url: str) -> Dict[str, Any]:
        if fetch_error is not None:
            raise fetch_error
        return doc

    monkeypatch.setattr(
        "backend.security.supabase_jwt._fetch_jwks_document",
        _fetch,
    )


def owner_headers_relaxed(org_id: str, user_id: str = "test-owner") -> Dict[str, str]:
    """Relaxed env (CLAW_ENVIRONMENT=test): org + test-auth header."""
    return {
        "X-Claw-Org-Id": org_id,
        "X-Claw-Test-Auth-User-Id": user_id,
    }


def owner_headers_production_like(
    *,
    user_id: str = "staging-owner",
    issuer: str = DEFAULT_JWT_ISSUER,
    audience: str = DEFAULT_JWT_AUDIENCE,
    kid: str = DEFAULT_CURRENT_KID,
) -> Dict[str, str]:
    """Staging/production-like: user-{sub} org + ES256 JWT (test-auth impossible)."""
    token = mint_es256_supabase_jwt(
        user_id, issuer=issuer, audience=audience, kid=kid
    )
    return {
        "X-Claw-Org-Id": f"user-{user_id}",
        "Authorization": f"Bearer {token}",
    }


def configure_production_like_jwt(monkeypatch) -> None:
    """Configure issuer/audience + mocked JWKS for production-like Bearer verification."""
    monkeypatch.setenv("SUPABASE_JWT_ISSUER", DEFAULT_JWT_ISSUER)
    monkeypatch.setenv("SUPABASE_JWT_AUDIENCE", DEFAULT_JWT_AUDIENCE)
    monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)
    monkeypatch.delenv("CLAW_SUPABASE_JWT_SECRET", raising=False)
    monkeypatch.delenv("CLAW_SUPABASE_JWT_HS256_LOCAL", raising=False)
    install_mock_supabase_jwks(monkeypatch)


def configure_local_hs256_jwt(
    monkeypatch,
    *,
    secret: str = "unit-test-supabase-jwt-secret",
    issuer: str = DEFAULT_JWT_ISSUER,
) -> None:
    """Opt-in local HS256 path — impossible under staging/production-like env."""
    monkeypatch.setenv("CLAW_SUPABASE_JWT_HS256_LOCAL", "1")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    monkeypatch.setenv("SUPABASE_JWT_ISSUER", issuer)
    monkeypatch.setenv("SUPABASE_JWT_AUDIENCE", DEFAULT_JWT_AUDIENCE)


def persist_and_accept_review_snapshot(
    client,
    aid: str,
    corpus: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    generation_session_id: str = "gen_fixture",
) -> Dict[str, Any]:
    """Create + accept a server review snapshot (required before portable dispatch)."""
    from backend.services.accepted_review_snapshot import sha256_hex_text

    h = headers or {}
    create = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=h,
        json={
            "corpus_plain": corpus,
            "generation_session_id": generation_session_id,
            "claimed_digest": sha256_hex_text(corpus),
        },
    )
    assert create.status_code == 200, create.text
    snap = create.json()["snapshot"]
    accept = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot/accept",
        headers=h,
        json={
            "snapshot_id": snap["snapshot_id"],
            "expected_digest": snap["corpus_sha256"],
            "expected_accepted_snapshot_id": "",
            "accepting_session": generation_session_id,
        },
    )
    assert accept.status_code == 200, accept.text
    return accept.json()["accepted"]
