import os

import pytest

from backend.config.env_bootstrap import collect_env_warnings, public_env_snapshot


def test_production_warnings_include_cors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.delenv("CLAW_CORS_ALLOW_ORIGINS", raising=False)
    warnings = collect_env_warnings()
    assert any("CLAW_CORS_ALLOW_ORIGINS" in w for w in warnings)


def test_public_env_snapshot_never_includes_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "super-secret")
    snap = public_env_snapshot()
    assert "super-secret" not in str(snap)
    assert snap["admin_secret_configured"] is True
