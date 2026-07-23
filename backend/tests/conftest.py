"""Pytest defaults for commercial fail-closed auth.

Test-auth headers require an explicit relaxed CLAW_ENVIRONMENT.
Unset/blank environments are production-like and reject X-Claw-Test-* headers.
"""

from __future__ import annotations

import os

import pytest


@pytest.fixture(autouse=True)
def _claw_explicit_test_environment(monkeypatch: pytest.MonkeyPatch):
    """Ensure unit tests run with explicit CLAW_ENVIRONMENT=test unless overridden."""
    if not (os.getenv("CLAW_ENVIRONMENT") or "").strip():
        monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    yield


def owner_auth_headers(org_id: str, user_id: str = "test-owner") -> dict[str, str]:
    """Shared owner headers: org + explicit test-auth principal."""
    return {
        "X-Claw-Org-Id": org_id,
        "X-Claw-Test-Auth-User-Id": user_id,
    }
