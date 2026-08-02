"""Staging GTM auth magic-link mint — env gates, allowlist, redirect safety."""

from __future__ import annotations

from typing import Any, Dict

import pytest

from backend.security.staging_auth_magic_link import (
    mint_staging_auth_magic_link,
    reset_staging_auth_ip_rate_limit_for_tests,
    staging_auth_email_allowlisted,
    staging_auth_ip_rate_limit_ok,
    staging_auth_magic_link_environment_allowed,
    staging_auth_redirect_allowed,
)


@pytest.fixture(autouse=True)
def _reset_ip_hits() -> None:
    reset_staging_auth_ip_rate_limit_for_tests()


def test_environment_allows_staging_and_relaxed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    assert staging_auth_magic_link_environment_allowed() is True
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    assert staging_auth_magic_link_environment_allowed() is True
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    assert staging_auth_magic_link_environment_allowed() is False
    monkeypatch.delenv("CLAW_ENVIRONMENT", raising=False)
    assert staging_auth_magic_link_environment_allowed() is False


def test_allowlist_includes_lawdogtest2_and_plus_family(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLAW_STAGING_AUTH_EMAIL_ALLOWLIST", raising=False)
    assert staging_auth_email_allowlisted("cryptocurated21+lawdogtest2@gmail.com")
    assert staging_auth_email_allowlisted("CryptoCurated21+LawDogTest9@gmail.com")
    assert not staging_auth_email_allowlisted("random@example.com")
    monkeypatch.setenv("CLAW_STAGING_AUTH_EMAIL_ALLOWLIST", "qa+extra@example.com")
    assert staging_auth_email_allowlisted("qa+extra@example.com")


def test_redirect_rejects_production_and_non_callback() -> None:
    assert staging_auth_redirect_allowed(
        "https://believable-gentleness-staging.up.railway.app/app/auth/callback?next=/app"
    )
    assert staging_auth_redirect_allowed("http://localhost:5173/app/auth/callback?next=/app")
    assert not staging_auth_redirect_allowed(
        "https://believable-gentleness-production-3ab6.up.railway.app/app/auth/callback?next=/app"
    )
    assert not staging_auth_redirect_allowed("https://lawdog.me/app/auth/callback?next=/app")
    assert not staging_auth_redirect_allowed(
        "https://believable-gentleness-staging.up.railway.app/app"
    )
    assert not staging_auth_redirect_allowed("https://evil.example/app/auth/callback")


def test_ip_rate_limit() -> None:
    assert staging_auth_ip_rate_limit_ok("1.2.3.4") is True
    for _ in range(39):
        assert staging_auth_ip_rate_limit_ok("1.2.3.4") is True
    assert staging_auth_ip_rate_limit_ok("1.2.3.4") is False
    assert staging_auth_ip_rate_limit_ok("9.9.9.9") is True


def test_mint_calls_supabase_admin(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test")

    captured: Dict[str, Any] = {}

    class _Resp:
        status_code = 200
        text = "{}"

        def json(self) -> Dict[str, Any]:
            return {
                "action_link": "https://example.supabase.co/auth/v1/verify?token=abc&type=magiclink",
            }

    class _Client:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        def __enter__(self) -> "_Client":
            return self

        def __exit__(self, *args: Any) -> None:
            return None

        def post(self, url: str, headers: Dict[str, str], json: Dict[str, Any]) -> _Resp:
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return _Resp()

    monkeypatch.setattr("backend.security.staging_auth_magic_link.httpx.Client", _Client)

    link, _ = mint_staging_auth_magic_link(
        email="cryptocurated21+lawdogtest2@gmail.com",
        redirect_to="https://believable-gentleness-staging.up.railway.app/app/auth/callback?next=/app",
    )
    assert "verify" in link
    assert captured["url"].endswith("/auth/v1/admin/generate_link")
    assert captured["json"]["type"] == "magiclink"
    assert captured["json"]["email"] == "cryptocurated21+lawdogtest2@gmail.com"


def test_mint_blocked_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test")
    with pytest.raises(ValueError, match="environment_blocked"):
        mint_staging_auth_magic_link(
            email="cryptocurated21+lawdogtest2@gmail.com",
            redirect_to="https://believable-gentleness-staging.up.railway.app/app/auth/callback?next=/app",
        )
