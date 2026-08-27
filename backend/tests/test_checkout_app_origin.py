"""Checkout success/cancel origins — local, staging, production, hostile values."""

from __future__ import annotations

from backend.billing.checkout_app_origin import (
    LOCAL_DEFAULT_ORIGIN,
    PRODUCTION_CANONICAL_ORIGIN,
    STAGING_CANONICAL_ORIGIN,
    build_checkout_cancel_url,
    build_checkout_success_url,
    drop_starter_review_from_after_pay_return,
    resolve_checkout_app_origin,
)


def test_local_defaults_to_localhost():
    assert resolve_checkout_app_origin(environment="local", configured="") == LOCAL_DEFAULT_ORIGIN
    assert resolve_checkout_app_origin(environment="dev", configured="") == LOCAL_DEFAULT_ORIGIN
    assert resolve_checkout_app_origin(environment="test", configured="") == LOCAL_DEFAULT_ORIGIN


def test_local_accepts_explicit_loopback_origin():
    assert (
        resolve_checkout_app_origin(environment="local", configured="http://127.0.0.1:5173")
        == "http://127.0.0.1:5173"
    )


def test_local_rejects_external_configured_origin():
    assert (
        resolve_checkout_app_origin(environment="local", configured="https://evil.example")
        == LOCAL_DEFAULT_ORIGIN
    )


def test_staging_uses_canonical_when_unset():
    assert resolve_checkout_app_origin(environment="staging", configured="") == STAGING_CANONICAL_ORIGIN


def test_staging_rejects_localhost_and_hostile_origins():
    assert (
        resolve_checkout_app_origin(environment="staging", configured="http://localhost:5173")
        == STAGING_CANONICAL_ORIGIN
    )
    assert (
        resolve_checkout_app_origin(environment="staging", configured="https://evil.example")
        == STAGING_CANONICAL_ORIGIN
    )
    assert (
        resolve_checkout_app_origin(environment="staging", configured="https://lawdog.me")
        == STAGING_CANONICAL_ORIGIN
    )


def test_staging_accepts_trusted_configured_origin():
    assert (
        resolve_checkout_app_origin(environment="staging", configured=STAGING_CANONICAL_ORIGIN + "/")
        == STAGING_CANONICAL_ORIGIN
    )


def test_production_uses_canonical_and_rejects_localhost():
    assert resolve_checkout_app_origin(environment="production", configured="") == PRODUCTION_CANONICAL_ORIGIN
    assert (
        resolve_checkout_app_origin(environment="production", configured="http://localhost:5173")
        == PRODUCTION_CANONICAL_ORIGIN
    )
    assert (
        resolve_checkout_app_origin(environment="prod", configured="https://evil.example")
        == PRODUCTION_CANONICAL_ORIGIN
    )


def test_unknown_environment_is_production_like_not_localhost():
    assert resolve_checkout_app_origin(environment="", configured="") == PRODUCTION_CANONICAL_ORIGIN
    assert (
        resolve_checkout_app_origin(environment="railway", configured="http://localhost:5173")
        == PRODUCTION_CANONICAL_ORIGIN
    )


def test_success_url_preserves_draft_recovery_and_session_placeholder():
    url = build_checkout_success_url(
        return_to="/app/create",
        origin=STAGING_CANONICAL_ORIGIN,
    )
    assert url.startswith(f"{STAGING_CANONICAL_ORIGIN}/app/create?")
    assert "premiumCompletion=1" in url
    assert "checkout_session_id={CHECKOUT_SESSION_ID}" in url
    assert url.count("premiumCompletion=1") == 1
    assert "restore=starterReview" not in url


def test_success_url_drops_starter_review_and_keeps_last_good_premium_completion():
    url = build_checkout_success_url(
        return_to="/app/create?restore=starterReview",
        origin=STAGING_CANONICAL_ORIGIN,
    )
    assert url.startswith(f"{STAGING_CANONICAL_ORIGIN}/app/create?")
    assert "restore=starterReview" not in url
    assert "restoreAgreementId=" not in url
    assert "premiumCompletion=1" in url
    assert "checkout_session_id={CHECKOUT_SESSION_ID}" in url


def test_drop_starter_review_leaves_send_path_alone():
    path = drop_starter_review_from_after_pay_return(
        "/app/send/3405d65b-f4fc-4b33-81d8-84a0734b927b?phase=send"
    )
    assert path == "/app/send/3405d65b-f4fc-4b33-81d8-84a0734b927b?phase=send"


def test_success_url_rejects_external_return_path():
    url = build_checkout_success_url(
        return_to="https://evil.example/phish",
        origin=STAGING_CANONICAL_ORIGIN,
    )
    assert url.startswith(f"{STAGING_CANONICAL_ORIGIN}/app/create?")
    assert "evil.example" not in url


def test_cancel_url_stays_on_canonical_checkout_path():
    url = build_checkout_cancel_url(
        agreement_id="__claw_create_checkout__",
        origin=STAGING_CANONICAL_ORIGIN,
    )
    assert url == f"{STAGING_CANONICAL_ORIGIN}/app/checkout/__claw_create_checkout__"
