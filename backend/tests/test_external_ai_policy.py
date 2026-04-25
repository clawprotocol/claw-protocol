"""CLAW_ALLOW_EXTERNAL_AI_LOCAL: non-prod only bypass for protected-mode airlock."""

from __future__ import annotations

import pytest

from backend.config import external_ai_policy as ep


def test_bypass_requires_explicit_flag_and_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.setenv("CLAW_ALLOW_EXTERNAL_AI_LOCAL", "1")
    assert ep.is_non_production_external_ai_bypass_active() is True

    monkeypatch.setenv("CLAW_ALLOW_EXTERNAL_AI_LOCAL", "0")
    assert ep.is_non_production_external_ai_bypass_active() is False

    monkeypatch.setenv("CLAW_ALLOW_EXTERNAL_AI_LOCAL", "1")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    assert ep.is_non_production_external_ai_bypass_active() is True


@pytest.mark.parametrize("env", ("production", "prod"))
def test_bypass_never_in_production(monkeypatch: pytest.MonkeyPatch, env: str) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", env)
    monkeypatch.setenv("CLAW_ALLOW_EXTERNAL_AI_LOCAL", "1")
    assert ep.is_non_production_external_ai_bypass_active() is False


def test_bypass_rejected_for_unknown_or_preprod_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ALLOW_EXTERNAL_AI_LOCAL", "1")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "preprod")
    assert ep.is_non_production_external_ai_bypass_active() is False
