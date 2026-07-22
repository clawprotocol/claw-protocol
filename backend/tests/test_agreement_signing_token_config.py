"""Operator signing-token env helpers and access policy surface."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.config.agreement_signing_token import (
    SigningTokenSecretMissingInProductionError,
    _DEV_FALLBACK_SIGNING_TOKEN_RAW,
    detected_signing_token_env_var,
    operator_signing_token_secret_configured,
    resolve_signing_token_secret_raw,
    review_link_mint_enabled,
    signing_token_readiness_public,
    signing_token_secret_source,
)
from backend.main import app

_EXPLICIT = "unit-test-explicit-signing-token-secret-32b"


def test_detected_signing_token_env_var_prefers_primary(monkeypatch):
    monkeypatch.delenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", raising=False)
    monkeypatch.delenv("CLAW_SIGNING_TOKEN_SECRET", raising=False)
    assert detected_signing_token_env_var() is None

    monkeypatch.setenv("CLAW_SIGNING_TOKEN_SECRET", _EXPLICIT)
    assert detected_signing_token_env_var() == "CLAW_SIGNING_TOKEN_SECRET"

    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _EXPLICIT + "-primary")
    assert detected_signing_token_env_var() == "CLAW_AGREEMENT_SIGNING_TOKEN_SECRET"


def test_operator_signing_token_secret_accepts_either_env_name(monkeypatch):
    monkeypatch.delenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", raising=False)
    monkeypatch.delenv("CLAW_SIGNING_TOKEN_SECRET", raising=False)
    assert operator_signing_token_secret_configured() is False

    monkeypatch.setenv("CLAW_SIGNING_TOKEN_SECRET", _EXPLICIT)
    assert operator_signing_token_secret_configured() is True

    monkeypatch.delenv("CLAW_SIGNING_TOKEN_SECRET", raising=False)
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _EXPLICIT)
    assert operator_signing_token_secret_configured() is True


def test_local_and_test_permit_documented_fallback(monkeypatch):
    monkeypatch.delenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", raising=False)
    monkeypatch.delenv("CLAW_SIGNING_TOKEN_SECRET", raising=False)
    for env in ("local", "dev", "test"):
        monkeypatch.setenv("CLAW_ENVIRONMENT", env)
        assert signing_token_secret_source() == "fallback"
        assert operator_signing_token_secret_configured() is False
        assert review_link_mint_enabled() is True
        assert resolve_signing_token_secret_raw() == _DEV_FALLBACK_SIGNING_TOKEN_RAW


def test_staging_rejects_missing_blank_and_fallback_derived(monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.delenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", raising=False)
    monkeypatch.delenv("CLAW_SIGNING_TOKEN_SECRET", raising=False)
    assert signing_token_secret_source() == "absent"
    assert operator_signing_token_secret_configured() is False
    assert review_link_mint_enabled() is False
    with pytest.raises(SigningTokenSecretMissingInProductionError):
        resolve_signing_token_secret_raw()

    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "   ")
    assert signing_token_secret_source() == "absent"
    with pytest.raises(SigningTokenSecretMissingInProductionError):
        resolve_signing_token_secret_raw()

    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _DEV_FALLBACK_SIGNING_TOKEN_RAW)
    assert signing_token_secret_source() == "fallback"
    assert operator_signing_token_secret_configured() is False
    with pytest.raises(SigningTokenSecretMissingInProductionError):
        resolve_signing_token_secret_raw()

    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "too-short")
    assert signing_token_secret_source() == "absent"
    with pytest.raises(SigningTokenSecretMissingInProductionError):
        resolve_signing_token_secret_raw()


def test_production_retains_fail_closed(monkeypatch):
    for env in ("production", "prod"):
        monkeypatch.setenv("CLAW_ENVIRONMENT", env)
        monkeypatch.delenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", raising=False)
        monkeypatch.delenv("CLAW_SIGNING_TOKEN_SECRET", raising=False)
        assert review_link_mint_enabled() is False
        with pytest.raises(SigningTokenSecretMissingInProductionError):
            resolve_signing_token_secret_raw()

        monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _EXPLICIT)
        assert review_link_mint_enabled() is True
        assert resolve_signing_token_secret_raw() == _EXPLICIT


def test_staging_accepts_only_explicit_secret(monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _EXPLICIT)
    assert signing_token_secret_source() == "explicit"
    assert operator_signing_token_secret_configured() is True
    assert review_link_mint_enabled() is True
    assert resolve_signing_token_secret_raw() == _EXPLICIT


def test_review_link_mint_disabled_in_production_without_secret(monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.delenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", raising=False)
    monkeypatch.delenv("CLAW_SIGNING_TOKEN_SECRET", raising=False)
    assert review_link_mint_enabled() is False

    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _EXPLICIT)
    assert review_link_mint_enabled() is True


def test_access_policy_reports_review_link_mint_enabled(monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.delenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", raising=False)
    monkeypatch.setenv("CLAW_SIGNING_TOKEN_SECRET", _EXPLICIT)
    client = TestClient(app)
    r = client.get("/api/agreements/access/policy")
    assert r.status_code == 200
    body = r.json()
    assert body["signing_token_configured"] is True
    assert body["signing_token_secret_source"] == "explicit"
    assert body["review_link_mint_enabled"] is True
    assert body["signing_token_env_var_detected"] == "CLAW_SIGNING_TOKEN_SECRET"
    # Never leak secret material
    blob = str(body)
    assert _EXPLICIT not in blob
    assert _DEV_FALLBACK_SIGNING_TOKEN_RAW not in blob


def test_readiness_public_never_leaks_secret_or_mac(monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _EXPLICIT)
    frag = signing_token_readiness_public()
    assert frag == {
        "signing_token_configured": True,
        "signing_token_secret_source": "explicit",
        "signing_token_env_var_detected": "CLAW_AGREEMENT_SIGNING_TOKEN_SECRET",
        "review_link_mint_enabled": True,
    }
    assert "mac" not in frag
    assert _EXPLICIT not in str(frag)

    from backend.config.deployment_runtime import public_runtime_summary
    from backend.config.env_bootstrap import public_env_snapshot

    for snap in (public_runtime_summary(), public_env_snapshot()):
        text = str(snap)
        assert _EXPLICIT not in text
        assert _DEV_FALLBACK_SIGNING_TOKEN_RAW not in text
        assert snap.get("signing_token_secret_source") == "explicit"
        assert snap.get("signing_token_configured") is True
        assert "envelopeAttestation" not in text
        assert '"mac"' not in text
