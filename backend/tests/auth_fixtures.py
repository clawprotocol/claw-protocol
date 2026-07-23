"""Shared auth helpers for commercial fail-closed tests."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any, Dict, Optional


def mint_hs256_supabase_jwt(
    sub: str,
    *,
    secret: str,
    issuer: str,
    audience: str = "authenticated",
    ttl_seconds: int = 3600,
    extra: Optional[Dict[str, Any]] = None,
) -> str:
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


def owner_headers_relaxed(org_id: str, user_id: str = "test-owner") -> Dict[str, str]:
    """Relaxed env (CLAW_ENVIRONMENT=test): org + test-auth header."""
    return {
        "X-Claw-Org-Id": org_id,
        "X-Claw-Test-Auth-User-Id": user_id,
    }


def owner_headers_production_like(
    *,
    user_id: str = "staging-owner",
    secret: str = "unit-test-supabase-jwt-secret",
    issuer: str = "https://example.supabase.co/auth/v1",
    audience: str = "authenticated",
) -> Dict[str, str]:
    """Staging/production-like: user-{sub} org + signed JWT (test-auth impossible)."""
    token = mint_hs256_supabase_jwt(
        user_id, secret=secret, issuer=issuer, audience=audience
    )
    return {
        "X-Claw-Org-Id": f"user-{user_id}",
        "Authorization": f"Bearer {token}",
    }


def configure_production_like_jwt(monkeypatch, *, secret: str = "unit-test-supabase-jwt-secret") -> None:
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    monkeypatch.setenv("SUPABASE_JWT_ISSUER", "https://example.supabase.co/auth/v1")
    monkeypatch.setenv("SUPABASE_JWT_AUDIENCE", "authenticated")


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
