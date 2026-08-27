"""CORS policy for split-origin SPA → /api (premium-full-draft QA path)."""

from __future__ import annotations

import logging
from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend.cors_policy import (
    CORS_ALLOW_REQUEST_HEADERS,
    cors_allow_request_header_allowed,
    cors_allowed_origins,
    cors_startup_diagnostics,
    log_cors_startup_diagnostics,
    normalize_cors_origin,
    origin_is_allowed,
)


def test_cors_allow_request_headers_includes_paid_pro_perf_trace_case_insensitive() -> None:
    assert "X-Claw-Paid-Pro-Perf-Trace" in CORS_ALLOW_REQUEST_HEADERS
    assert "X-Claw-Review-First-Persist" in CORS_ALLOW_REQUEST_HEADERS
    assert "X-Claw-Draft-Idempotency-Key" in CORS_ALLOW_REQUEST_HEADERS
    assert "X-Claw-Admin-Secret" in CORS_ALLOW_REQUEST_HEADERS
    assert "X-Claw-Admin-Reason" in CORS_ALLOW_REQUEST_HEADERS
    assert "X-Claw-User-Id" in CORS_ALLOW_REQUEST_HEADERS
    assert cors_allow_request_header_allowed("x-claw-review-first-persist")
    assert cors_allow_request_header_allowed("x-claw-draft-idempotency-key")
    assert cors_allow_request_header_allowed("x-claw-paid-pro-perf-trace")
    assert cors_allow_request_header_allowed("x-claw-admin-secret")
    assert cors_allow_request_header_allowed("x-claw-admin-reason")
    assert cors_allow_request_header_allowed("x-claw-user-id")
    assert cors_allow_request_header_allowed("X-CLAW-ORG-ID")
    assert cors_allow_request_header_allowed("x-claw-entitlement-repair-org")
    assert cors_allow_request_header_allowed("X-Claw-Entitlement-Repair-Org")
    assert "X-Claw-Entitlement-Repair-Org" in CORS_ALLOW_REQUEST_HEADERS
    assert cors_allow_request_header_allowed("content-type")
    assert not cors_allow_request_header_allowed("x-claw-unknown-header")


@pytest.mark.parametrize("env", ["staging", "production", "prod", None, "   ", "unknown"])
def test_non_relaxed_cors_does_not_default_to_wildcard_when_origins_unset(
    monkeypatch: pytest.MonkeyPatch, env: str | None
) -> None:
    """Regression: cors_policy must not treat unset/staging as relaxed ["*"] default."""
    monkeypatch.delenv("CLAW_CORS_ALLOW_ORIGINS", raising=False)
    monkeypatch.delenv("CLAW_CORS_ALLOW_ORIGIN_SUFFIXES", raising=False)
    monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    if env is None:
        monkeypatch.delenv("CLAW_ENVIRONMENT", raising=False)
    else:
        monkeypatch.setenv("CLAW_ENVIRONMENT", env)
    origins = cors_allowed_origins()
    assert origins != ["*"]
    assert "*" not in origins


def test_normalize_cors_origin_strips_quotes_trailing_slash_and_crlf() -> None:
    assert (
        normalize_cors_origin(
            '"https://believable-gentleness-production-3ab6.up.railway.app/"\r\n'
        )
        == "https://believable-gentleness-production-3ab6.up.railway.app"
    )
    assert normalize_cors_origin("  https://qa.example.com/  ") == "https://qa.example.com"


def test_railway_production_allows_up_railway_app_origin_suffix(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("CLAW_CORS_ALLOW_ORIGINS", raising=False)
    monkeypatch.delenv("CLAW_CORS_ALLOW_ORIGIN_SUFFIXES", raising=False)
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    assert origin_is_allowed("https://believable-gentleness-production-3ab6.up.railway.app")
    assert origin_is_allowed("https://claw-protocol-production.up.railway.app")


def test_origin_allowed_when_env_has_trailing_slash_typo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "CLAW_CORS_ALLOW_ORIGINS",
        "https://believable-gentleness-production-3ab6.up.railway.app/",
    )
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    assert origin_is_allowed("https://believable-gentleness-production-3ab6.up.railway.app")
    assert "https://believable-gentleness-production-3ab6.up.railway.app/" not in cors_allowed_origins()


def test_cors_startup_diagnostics_reads_env_at_runtime(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv(
        "CLAW_CORS_ALLOW_ORIGINS",
        "https://believable-gentleness-production-3ab6.up.railway.app",
    )
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    caplog.set_level(logging.INFO, logger="claw.cors")
    log_cors_startup_diagnostics()
    snap = cors_startup_diagnostics()
    assert snap["resolved_origin_count"] == 1
    assert snap["resolved_origins"] == [
        "https://believable-gentleness-production-3ab6.up.railway.app"
    ]
    assert any("[cors-startup]" in r.message for r in caplog.records)


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch, tmp_path: Any) -> TestClient:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv(
        "CLAW_CORS_ALLOW_ORIGINS",
        "https://believable-gentleness-production-3ab6.up.railway.app",
    )
    from backend.main import app

    return TestClient(app)


def test_options_premium_full_draft_preflight_returns_acao_railway_production_suffix(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.delenv("CLAW_CORS_ALLOW_ORIGINS", raising=False)
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    from backend.main import app

    caplog.set_level(logging.INFO, logger="claw.cors")
    client = TestClient(app)
    origin = "https://believable-gentleness-production-3ab6.up.railway.app"
    res = client.options(
        "/api/agreements/premium-full-draft",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert res.status_code in (200, 204)
    assert res.headers.get("access-control-allow-origin") == origin
    allow_methods = (res.headers.get("access-control-allow-methods") or "").upper()
    assert "POST" in allow_methods
    assert "OPTIONS" in allow_methods


def test_options_premium_full_draft_preflight_returns_acao(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger="claw.cors")
    origin = "https://believable-gentleness-production-3ab6.up.railway.app"
    res = client.options(
        "/api/agreements/premium-full-draft",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type, x-claw-org-id, x-claw-paid-pro-perf-trace",
        },
    )
    assert res.status_code in (200, 204)
    assert res.headers.get("access-control-allow-origin") == origin
    allow_methods = (res.headers.get("access-control-allow-methods") or "").upper()
    assert "POST" in allow_methods
    assert "OPTIONS" in allow_methods
    allow_headers = (res.headers.get("access-control-allow-headers") or "").lower()
    assert "x-claw-paid-pro-perf-trace" in allow_headers
    assert "x-claw-org-id" in allow_headers
    assert "content-type" in allow_headers
    assert any("[cors-response-proof]" in r.message for r in caplog.records)


def test_http_error_response_includes_acao_for_allowed_origin(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("CLAW_CORS_ALLOW_ORIGINS", "https://qa-frontend.example.com")
    from backend.main import app

    caplog.set_level(logging.INFO, logger="claw.cors")
    client = TestClient(app)
    origin = "https://qa-frontend.example.com"
    res = client.post(
        "/api/agreements/premium-full-draft",
        headers={"Origin": origin, "Content-Type": "application/json"},
        json={"intake_text": "x"},
    )
    assert res.status_code in (401, 422, 400, 500, 503)
    assert res.headers.get("access-control-allow-origin") == origin
    allow_headers = (res.headers.get("access-control-allow-headers") or "").lower()
    assert "x-claw-paid-pro-perf-trace" in allow_headers
    proof = [r for r in caplog.records if "[cors-response-proof]" in r.message]
    assert proof, "expected premium-full-draft cors proof log line"


def test_http_error_response_includes_perf_trace_header_when_sent(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any,
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("CLAW_CORS_ALLOW_ORIGINS", "https://qa-frontend.example.com")
    from backend.main import app

    client = TestClient(app)
    origin = "https://qa-frontend.example.com"
    res = client.post(
        "/api/agreements/premium-full-draft",
        headers={
            "Origin": origin,
            "Content-Type": "application/json",
            "X-Claw-Paid-Pro-Perf-Trace": "1",
            "X-Claw-Org-Id": "org_test",
        },
        json={"intake_text": "x"},
    )
    assert res.status_code in (200, 401, 422, 400, 500, 503)
    assert res.headers.get("access-control-allow-origin") == origin
    allow_headers = (res.headers.get("access-control-allow-headers") or "").lower()
    assert "x-claw-paid-pro-perf-trace" in allow_headers


def test_options_admin_overview_preflight_allows_admin_secret_header(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger="claw.cors")
    origin = "https://believable-gentleness-production-3ab6.up.railway.app"
    res = client.options(
        "/v1/admin/overview",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "content-type, x-claw-admin-secret",
        },
    )
    assert res.status_code in (200, 204)
    assert res.headers.get("access-control-allow-origin") == origin
    assert res.headers.get("access-control-allow-credentials") == "true"
    allow_headers = (res.headers.get("access-control-allow-headers") or "").lower()
    assert "x-claw-admin-secret" in allow_headers
    assert "content-type" in allow_headers


def test_admin_overview_forbidden_includes_acao_for_allowed_origin(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "admin-test-secret")
    monkeypatch.setenv("CLAW_CORS_ALLOW_ORIGINS", "https://lawdog.me")
    from backend.main import app

    client = TestClient(app)
    origin = "https://lawdog.me"
    res = client.get(
        "/v1/admin/overview",
        headers={"Origin": origin, "x-claw-admin-secret": "wrong-secret"},
    )
    assert res.status_code == 403
    assert res.headers.get("access-control-allow-origin") == origin
    assert res.headers.get("access-control-allow-credentials") == "true"


def test_qa_payment_bypass_authorization_includes_acao_for_allowed_origin(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("CLAW_CORS_ALLOW_ORIGINS", "https://lawdog.me")
    from backend.main import app

    client = TestClient(app)
    origin = "https://lawdog.me"
    res = client.get(
        "/v1/workspace/qa-payment-bypass/authorization",
        headers={"Origin": origin},
    )
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == origin
    assert res.headers.get("access-control-allow-credentials") == "true"


def test_options_admin_overview_preflight_allows_admin_secret_header(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger="claw.cors")
    origin = "https://believable-gentleness-production-3ab6.up.railway.app"
    res = client.options(
        "/v1/admin/overview",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "content-type, x-claw-admin-secret",
        },
    )
    assert res.status_code in (200, 204)
    assert res.headers.get("access-control-allow-origin") == origin
    assert res.headers.get("access-control-allow-credentials") == "true"
    allow_headers = (res.headers.get("access-control-allow-headers") or "").lower()
    assert "x-claw-admin-secret" in allow_headers
    assert "content-type" in allow_headers


def test_admin_overview_forbidden_includes_acao_for_allowed_origin(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("CLAW_ADMIN_SECRET", "admin-test-secret")
    monkeypatch.setenv("CLAW_CORS_ALLOW_ORIGINS", "https://lawdog.me")
    from backend.main import app

    client = TestClient(app)
    origin = "https://lawdog.me"
    res = client.get(
        "/v1/admin/overview",
        headers={"Origin": origin, "x-claw-admin-secret": "wrong-secret"},
    )
    assert res.status_code == 403
    assert res.headers.get("access-control-allow-origin") == origin
    assert res.headers.get("access-control-allow-credentials") == "true"


def test_qa_payment_bypass_authorization_includes_acao_for_allowed_origin(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("CLAW_CORS_ALLOW_ORIGINS", "https://lawdog.me")
    from backend.main import app

    client = TestClient(app)
    origin = "https://lawdog.me"
    res = client.get(
        "/v1/workspace/qa-payment-bypass/authorization",
        headers={"Origin": origin},
    )
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == origin
    assert res.headers.get("access-control-allow-credentials") == "true"


def test_options_agreements_draft_preflight_allows_draft_idempotency_header(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any, caplog: pytest.LogCaptureFixture
) -> None:
    """
    Staging repro: FE sends X-Claw-Draft-Idempotency-Key on review-ready persist.
    Explicit CORS allow-list must include it or preflight blocks POST and /app stays empty.
    """
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.setenv(
        "CLAW_CORS_ALLOW_ORIGINS",
        "https://believable-gentleness-staging.up.railway.app",
    )
    from backend.main import app

    caplog.set_level(logging.INFO, logger="claw.cors")
    client = TestClient(app)
    origin = "https://believable-gentleness-staging.up.railway.app"
    res = client.options(
        "/api/agreements/draft",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": (
                "authorization, content-type, x-claw-org-id, "
                "x-claw-review-first-persist, x-claw-draft-idempotency-key"
            ),
        },
    )
    assert res.status_code in (200, 204)
    assert res.headers.get("access-control-allow-origin") == origin
    allow_headers = (res.headers.get("access-control-allow-headers") or "").lower()
    assert "x-claw-draft-idempotency-key" in allow_headers
    assert "x-claw-review-first-persist" in allow_headers
    assert "content-type" in allow_headers


def test_verify_checkout_session_preflight_allows_entitlement_repair_header_from_staging_frontend(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any
) -> None:
    """After-pay verify uses clawAgreementHeaders (X-Claw-Entitlement-Repair-Org)."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.setenv(
        "CLAW_CORS_ALLOW_ORIGINS",
        "https://believable-gentleness-staging.up.railway.app",
    )
    from backend.main import app

    client = TestClient(app)
    origin = "https://believable-gentleness-staging.up.railway.app"
    res = client.options(
        "/v1/billing/verify-checkout-session",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": (
                "authorization, content-type, x-claw-org-id, x-claw-entitlement-repair-org"
            ),
        },
    )
    assert res.status_code in (200, 204)
    assert res.headers.get("access-control-allow-origin") == origin
    assert res.headers.get("access-control-allow-credentials") == "true"
    allow_headers = (res.headers.get("access-control-allow-headers") or "").lower()
    assert "x-claw-entitlement-repair-org" in allow_headers
    assert "authorization" in allow_headers
    assert "content-type" in allow_headers
