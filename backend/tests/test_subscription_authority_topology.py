"""Subscription authority topology guard — production fail-closed for multi-replica SQLite."""

from __future__ import annotations

import pytest

from backend.billing.subscription_authority_topology import (
    SubscriptionAuthorityTopologyError,
    assess_subscription_authority_topology,
    assert_subscription_authority_topology_at_startup,
    configured_serving_process_count,
    require_subscription_authority_topology_or_raise,
)


@pytest.mark.parametrize("env", ["local", "dev", "test"])
def test_relaxed_env_allows_multi_worker_sqlite(monkeypatch: pytest.MonkeyPatch, env: str) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", env)
    monkeypatch.setenv("WEB_CONCURRENCY", "4")
    monkeypatch.setenv("CLAW_WEB_REPLICA_COUNT", "3")
    result = assess_subscription_authority_topology()
    assert result["status"] == "skipped"
    assert_subscription_authority_topology_at_startup()


@pytest.mark.parametrize("env", ["production", "prod", "staging", "preview"])
def test_production_like_env_fails_multi_worker(monkeypatch: pytest.MonkeyPatch, env: str) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", env)
    monkeypatch.setenv("WEB_CONCURRENCY", "2")
    monkeypatch.delenv("CLAW_WEB_REPLICA_COUNT", raising=False)
    monkeypatch.delenv("RAILWAY_REPLICA_COUNT", raising=False)
    result = assess_subscription_authority_topology()
    assert result["status"] == "error"
    assert "WEB_CONCURRENCY=2" in result["detail"]
    with pytest.raises(SystemExit):
        assert_subscription_authority_topology_at_startup()
    with pytest.raises(SubscriptionAuthorityTopologyError):
        require_subscription_authority_topology_or_raise()


def test_unset_claw_environment_defaults_to_relaxed_local(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLAW_ENVIRONMENT", raising=False)
    monkeypatch.setenv("WEB_CONCURRENCY", "4")
    result = assess_subscription_authority_topology()
    assert result["status"] == "skipped"
    assert_subscription_authority_topology_at_startup()


def test_empty_claw_environment_is_production_like(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "")
    monkeypatch.setenv("WEB_CONCURRENCY", "2")
    result = assess_subscription_authority_topology()
    assert result["status"] == "error"


def test_production_like_env_fails_multi_replica(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("WEB_CONCURRENCY", "1")
    monkeypatch.setenv("CLAW_WEB_REPLICA_COUNT", "2")
    result = assess_subscription_authority_topology()
    assert result["status"] == "error"
    assert "replica_count=2" in result["detail"]


def test_production_like_env_allows_single_process(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("WEB_CONCURRENCY", "1")
    monkeypatch.delenv("CLAW_WEB_REPLICA_COUNT", raising=False)
    monkeypatch.delenv("RAILWAY_REPLICA_COUNT", raising=False)
    result = assess_subscription_authority_topology()
    assert result["status"] == "ok"
    assert_subscription_authority_topology_at_startup()


def test_explicit_economics_db_path_does_not_relax_multi_replica_guard(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", "/mnt/shared/economics.sqlite3")
    monkeypatch.setenv("WEB_CONCURRENCY", "1")
    monkeypatch.setenv("CLAW_WEB_REPLICA_COUNT", "2")
    result = assess_subscription_authority_topology()
    assert result["status"] == "error"
    assert result["economics_db_path_explicit"] is True


def test_ambiguous_web_concurrency_defaults_to_single_process(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("WEB_CONCURRENCY", "not-a-number")
    result = assess_subscription_authority_topology()
    assert result["status"] == "ok"
    assert configured_serving_process_count() == 1


def test_railway_replica_count_honored_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("WEB_CONCURRENCY", "1")
    monkeypatch.delenv("CLAW_WEB_REPLICA_COUNT", raising=False)
    monkeypatch.setenv("RAILWAY_REPLICA_COUNT", "3")
    result = assess_subscription_authority_topology()
    assert result["status"] == "error"
    assert result["effective_serving_processes"] == 3
