"""Operator signing-token env helpers and access policy surface."""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.config.agreement_signing_token import (
    detected_signing_token_env_var,
    operator_signing_token_secret_configured,
    review_link_mint_enabled,
)
from backend.main import app


def test_detected_signing_token_env_var_prefers_primary(monkeypatch):
    monkeypatch.delenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", raising=False)
    monkeypatch.delenv("CLAW_SIGNING_TOKEN_SECRET", raising=False)
    assert detected_signing_token_env_var() is None

    monkeypatch.setenv("CLAW_SIGNING_TOKEN_SECRET", "alias-secret")
    assert detected_signing_token_env_var() == "CLAW_SIGNING_TOKEN_SECRET"

    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "primary-secret")
    assert detected_signing_token_env_var() == "CLAW_AGREEMENT_SIGNING_TOKEN_SECRET"


def test_operator_signing_token_secret_accepts_either_env_name(monkeypatch):
    monkeypatch.delenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", raising=False)
    monkeypatch.delenv("CLAW_SIGNING_TOKEN_SECRET", raising=False)
    assert operator_signing_token_secret_configured() is False

    monkeypatch.setenv("CLAW_SIGNING_TOKEN_SECRET", "alias-secret")
    assert operator_signing_token_secret_configured() is True

    monkeypatch.delenv("CLAW_SIGNING_TOKEN_SECRET", raising=False)
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "primary-secret")
    assert operator_signing_token_secret_configured() is True


def test_review_link_mint_disabled_in_production_without_secret(monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.delenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", raising=False)
    monkeypatch.delenv("CLAW_SIGNING_TOKEN_SECRET", raising=False)
    assert review_link_mint_enabled() is False

    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "prod-secret")
    assert review_link_mint_enabled() is True


def test_access_policy_reports_review_link_mint_enabled(monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.delenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", raising=False)
    monkeypatch.setenv("CLAW_SIGNING_TOKEN_SECRET", "policy-alias-secret")
    client = TestClient(app)
    r = client.get("/api/agreements/access/policy")
    assert r.status_code == 200
    body = r.json()
    assert body["signing_token_configured"] is True
    assert body["review_link_mint_enabled"] is True
    assert body["signing_token_env_var_detected"] == "CLAW_SIGNING_TOKEN_SECRET"
