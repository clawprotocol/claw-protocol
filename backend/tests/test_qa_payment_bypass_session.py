"""Unit tests for HMAC QA payment bypass session cookies."""

from __future__ import annotations

import time

import pytest

from backend.security.qa_payment_bypass_session import (
    mint_qa_payment_bypass_session,
    verify_qa_payment_bypass_session,
)


def test_mint_and_verify_session(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_QA_PAYMENT_BYPASS_SESSION_SECRET", "session-secret")
    secret = b"session-secret"
    token = mint_qa_payment_bypass_session(secret=secret, ttl_seconds=300)
    payload = verify_qa_payment_bypass_session(token=token, secret=secret)
    assert payload["kind"] == "qa_admin"
    assert int(payload["exp"]) > int(time.time())


def test_expired_session_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_QA_PAYMENT_BYPASS_SESSION_SECRET", "session-secret")
    secret = b"session-secret"
    token = mint_qa_payment_bypass_session(secret=secret, ttl_seconds=-30)
    with pytest.raises(ValueError, match="session_expired"):
        verify_qa_payment_bypass_session(token=token, secret=secret)
