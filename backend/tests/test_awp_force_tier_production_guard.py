"""CLAW_AWP_FORCE_TIER must not grant entitlement outside local/dev/test."""

from __future__ import annotations

import pytest

from backend.advanced_work_product.entitlements import awp_tier_for_org
from backend.tests.commercial_test_helpers import activate_pro_on_org, isolated_economics_store


def test_awp_force_tier_ignored_in_production_like_env(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    eco = isolated_economics_store(tmp_path, monkeypatch)
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("CLAW_AWP_FORCE_TIER", "full")
    assert awp_tier_for_org("org-no-sub", economics=eco) == "none"


def test_awp_force_tier_honored_in_test_env(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    eco = isolated_economics_store(tmp_path, monkeypatch)
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_AWP_FORCE_TIER", "full")
    assert awp_tier_for_org("org-no-sub", economics=eco) == "full"


def test_awp_force_tier_does_not_override_real_subscription_in_production(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    eco = isolated_economics_store(tmp_path, monkeypatch)
    activate_pro_on_org(eco, "org-real-pro")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("CLAW_AWP_FORCE_TIER", "none")
    assert awp_tier_for_org("org-real-pro", economics=eco) == "full"
