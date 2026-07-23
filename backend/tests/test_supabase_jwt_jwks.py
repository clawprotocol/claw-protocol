"""Adversarial Supabase JWKS / ES256 verification (staging fail-closed)."""

from __future__ import annotations

import time
from typing import Any, Dict

import pytest
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.supabase_jwt import (
    public_supabase_jwt_readiness,
    reset_supabase_jwks_cache_for_tests,
    supabase_jwt_verifier_mode,
    verify_supabase_access_token,
)
from backend.tests.auth_fixtures import (
    DEFAULT_CURRENT_KID,
    DEFAULT_JWT_ISSUER,
    DEFAULT_PREVIOUS_KID,
    configure_local_hs256_jwt,
    configure_production_like_jwt,
    install_mock_supabase_jwks,
    mint_es256_supabase_jwt,
    mint_hs256_supabase_jwt,
    es256_jwks_document,
    es256_signing_keys,
)


@pytest.fixture()
def staging_env(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("CLAW_COMMERCIAL_MODE", raising=False)
    monkeypatch.delenv("CLAW_SUPABASE_JWT_HS256_LOCAL", raising=False)
    reset_supabase_jwks_cache_for_tests()
    configure_production_like_jwt(monkeypatch)
    yield


@pytest.fixture()
def client(staging_env):
    return TestClient(app)


def _workspace(client: TestClient, token: str, *, user_id: str = "owner-a"):
    return client.get(
        "/api/agreements/workspace-index",
        headers={
            "X-Claw-Org-Id": f"user-{user_id}",
            "Authorization": f"Bearer {token}",
        },
    )


def test_valid_es256_token_accepted(client: TestClient):
    token = mint_es256_supabase_jwt("owner-a")
    claims = verify_supabase_access_token(token)
    assert claims["sub"] == "owner-a"
    r = _workspace(client, token)
    assert r.status_code == 200, r.text


def test_current_and_previous_kid_accepted(client: TestClient, monkeypatch):
    install_mock_supabase_jwks(
        monkeypatch,
        kids=[DEFAULT_CURRENT_KID, DEFAULT_PREVIOUS_KID],
    )
    current = mint_es256_supabase_jwt("owner-a", kid=DEFAULT_CURRENT_KID)
    previous = mint_es256_supabase_jwt("owner-b", kid=DEFAULT_PREVIOUS_KID)
    assert verify_supabase_access_token(current)["sub"] == "owner-a"
    assert verify_supabase_access_token(previous)["sub"] == "owner-b"
    assert _workspace(client, current).status_code == 200
    assert _workspace(client, previous, user_id="owner-b").status_code == 200


def test_forged_wrong_key_denied(client: TestClient):
    forged_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
    token = mint_es256_supabase_jwt(
        "owner-a",
        kid=DEFAULT_CURRENT_KID,
        private_key=forged_key,
    )
    with pytest.raises(ValueError, match="invalid_jwt_signature"):
        verify_supabase_access_token(token)
    assert _workspace(client, token).status_code == 401


def test_hs256_and_none_algorithm_confusion_denied(client: TestClient, monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "should-not-enable-hs256-in-staging")
    hs = mint_hs256_supabase_jwt(
        "owner-a",
        secret="should-not-enable-hs256-in-staging",
        issuer=DEFAULT_JWT_ISSUER,
    )
    with pytest.raises(ValueError, match="unsupported_jwt_alg"):
        verify_supabase_access_token(hs)
    assert _workspace(client, hs).status_code == 401

    import base64
    import json

    def b64(o: Any) -> str:
        return base64.urlsafe_b64encode(
            json.dumps(o, separators=(",", ":")).encode()
        ).decode().rstrip("=")

    none_tok = (
        f"{b64({'alg': 'none', 'typ': 'JWT'})}."
        f"{b64({'sub': 'owner-a', 'iss': DEFAULT_JWT_ISSUER, 'aud': 'authenticated', 'exp': int(time.time()) + 3600})}."
    )
    with pytest.raises(ValueError, match="unsupported_jwt_alg"):
        verify_supabase_access_token(none_tok)
    assert _workspace(client, none_tok).status_code == 401


def test_missing_and_unknown_kid_denied_after_one_refresh(client: TestClient, monkeypatch):
    fetch_count = {"n": 0}
    doc = es256_jwks_document(kids=[DEFAULT_CURRENT_KID])

    def _fetch(_url: str) -> Dict[str, Any]:
        fetch_count["n"] += 1
        return doc

    monkeypatch.setattr("backend.security.supabase_jwt._fetch_jwks_document", _fetch)
    reset_supabase_jwks_cache_for_tests()

    missing_kid = mint_es256_supabase_jwt("owner-a", include_kid=False)
    with pytest.raises(ValueError, match="jwt_kid_required"):
        verify_supabase_access_token(missing_kid)
    assert fetch_count["n"] == 0

    unknown = mint_es256_supabase_jwt(
        "owner-a",
        kid="unknown-kid",
        private_key=es256_signing_keys()[DEFAULT_CURRENT_KID],
    )
    # First call loads cache; unknown kid forces one refresh; still unknown → fail closed.
    with pytest.raises(ValueError, match="jwt_kid_unknown"):
        verify_supabase_access_token(unknown)
    assert fetch_count["n"] == 2
    # Cooldown: subsequent unknown-kid probes must not refetch JWKS.
    with pytest.raises(ValueError, match="jwt_kid_unknown"):
        verify_supabase_access_token(unknown)
    assert fetch_count["n"] == 2
    assert _workspace(client, unknown).status_code == 401


def test_rotated_kid_accepted_after_one_jwks_refresh(client: TestClient, monkeypatch):
    fetch_count = {"n": 0}
    doc_holder: Dict[str, Any] = es256_jwks_document(kids=[DEFAULT_CURRENT_KID])

    def _fetch(_url: str) -> Dict[str, Any]:
        fetch_count["n"] += 1
        return doc_holder

    monkeypatch.setattr("backend.security.supabase_jwt._fetch_jwks_document", _fetch)
    reset_supabase_jwks_cache_for_tests()

    rotated = mint_es256_supabase_jwt("owner-a", kid=DEFAULT_PREVIOUS_KID)
    with pytest.raises(ValueError, match="jwt_kid_unknown"):
        verify_supabase_access_token(rotated)
    assert fetch_count["n"] == 2

    reset_supabase_jwks_cache_for_tests()
    doc_holder = es256_jwks_document(kids=[DEFAULT_CURRENT_KID, DEFAULT_PREVIOUS_KID])
    assert verify_supabase_access_token(rotated)["sub"] == "owner-a"
    assert _workspace(client, rotated).status_code == 200


def test_production_like_rejects_insecure_jwks_url(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("SUPABASE_JWT_ISSUER", "http://insecure.example/auth/v1")
    monkeypatch.setenv("SUPABASE_JWT_AUDIENCE", "authenticated")
    install_mock_supabase_jwks(monkeypatch)
    token = mint_es256_supabase_jwt(
        "owner-a",
        issuer="http://insecure.example/auth/v1",
    )
    with pytest.raises(ValueError, match="supabase_jwks_url_insecure"):
        verify_supabase_access_token(token)


def test_production_like_rejects_cross_host_jwks_override(monkeypatch, tmp_path):
    from backend.security.supabase_jwt import supabase_jwks_verifier_configured

    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("SUPABASE_JWT_ISSUER", DEFAULT_JWT_ISSUER)
    monkeypatch.setenv("SUPABASE_JWT_AUDIENCE", "authenticated")
    monkeypatch.setenv("SUPABASE_JWKS_URL", "https://evil.example/.well-known/jwks.json")
    install_mock_supabase_jwks(monkeypatch)
    assert supabase_jwks_verifier_configured() is False
    token = mint_es256_supabase_jwt("owner-a")
    with pytest.raises(ValueError, match="supabase_jwks_host_mismatch"):
        verify_supabase_access_token(token)


def test_jwks_index_requires_p256_crv():
    from backend.security.supabase_jwt import _index_jwks_keys

    missing_crv = {
        "keys": [
            {
                "kty": "EC",
                "kid": "no-crv",
                "alg": "ES256",
                "x": "AA",
                "y": "BB",
            }
        ]
    }
    assert _index_jwks_keys(missing_crv) == {}


def test_expired_wrong_issuer_audience_missing_sub_denied(client: TestClient):
    expired = mint_es256_supabase_jwt("owner-a", exp=int(time.time()) - 30)
    with pytest.raises(ValueError, match="jwt_expired"):
        verify_supabase_access_token(expired)

    wrong_iss = mint_es256_supabase_jwt("owner-a", issuer="https://evil.example/auth/v1")
    with pytest.raises(ValueError, match="jwt_iss_mismatch"):
        verify_supabase_access_token(wrong_iss)

    wrong_aud = mint_es256_supabase_jwt("owner-a", audience="service_role")
    with pytest.raises(ValueError, match="jwt_aud_mismatch"):
        verify_supabase_access_token(wrong_aud)

    missing_sub = mint_es256_supabase_jwt("owner-a", extra={"sub": ""})
    with pytest.raises(ValueError, match="missing_sub"):
        verify_supabase_access_token(missing_sub)

    # Signed ES256 token omitting exp must fail closed (not only unsigned shells).
    key = es256_signing_keys()[DEFAULT_CURRENT_KID]
    import jwt as pyjwt

    missing_exp = pyjwt.encode(
        {
            "sub": "owner-a",
            "iss": DEFAULT_JWT_ISSUER,
            "aud": "authenticated",
            "iat": int(time.time()),
        },
        key,
        algorithm="ES256",
        headers={"kid": DEFAULT_CURRENT_KID},
    )
    with pytest.raises(ValueError):
        verify_supabase_access_token(missing_exp)

    for tok in (expired, wrong_iss, wrong_aud, missing_sub, missing_exp):
        assert _workspace(client, tok).status_code == 401


def test_jwks_unavailable_fails_closed(client: TestClient, monkeypatch):
    def _boom(_url: str) -> Dict[str, Any]:
        raise ValueError("supabase_jwks_unavailable")

    monkeypatch.setattr("backend.security.supabase_jwt._fetch_jwks_document", _boom)
    reset_supabase_jwks_cache_for_tests()
    token = mint_es256_supabase_jwt("owner-a")
    with pytest.raises(ValueError, match="supabase_jwks_unavailable"):
        verify_supabase_access_token(token)
    assert _workspace(client, token).status_code == 401


def test_staging_rejects_test_auth_and_hs256_fallback(client: TestClient, monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "present-but-ignored")
    monkeypatch.setenv("CLAW_SUPABASE_JWT_HS256_LOCAL", "1")
    assert supabase_jwt_verifier_mode() == "jwks"

    test_auth = client.get(
        "/api/agreements/workspace-index",
        headers={
            "X-Claw-Org-Id": "user-attacker",
            "X-Claw-Test-Auth-User-Id": "attacker",
        },
    )
    assert test_auth.status_code == 401

    hs = mint_hs256_supabase_jwt(
        "attacker",
        secret="present-but-ignored",
        issuer=DEFAULT_JWT_ISSUER,
    )
    with pytest.raises(ValueError, match="unsupported_jwt_alg"):
        verify_supabase_access_token(hs)
    assert _workspace(client, hs, user_id="attacker").status_code == 401


def test_local_hs256_opt_in_works_only_in_relaxed_env(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    configure_local_hs256_jwt(monkeypatch, secret="local-hs256-secret")
    assert supabase_jwt_verifier_mode() == "hs256_local"
    tok = mint_hs256_supabase_jwt(
        "local-user",
        secret="local-hs256-secret",
        issuer=DEFAULT_JWT_ISSUER,
    )
    assert verify_supabase_access_token(tok)["sub"] == "local-user"

    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    with pytest.raises(ValueError, match="unsupported_jwt_alg"):
        verify_supabase_access_token(tok)


def test_public_readiness_reports_jwks_without_secrets(staging_env):
    snap = public_supabase_jwt_readiness()
    assert snap["supabase_jwt_jwks_configured"] is True
    assert snap["supabase_jwt_verifier_mode"] == "jwks"
    assert snap["supabase_auth_configured"] is True
    blob = str(snap).lower()
    assert "secret" not in blob or "configured" in blob
    assert "begin" not in blob
    assert "eyj" not in blob
