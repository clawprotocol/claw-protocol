"""Increment sidecar stays inactive; extras require the official historical ledger."""
from __future__ import annotations

import json
import shutil
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from backend.quality_eval_budget import QualityEvalBudget, QualityEvalBlocked, configured_budget
from backend.quality_eval_increment import (
    OFFICIAL_LEDGER_NAME,
    increment_reservation_gate,
    inspect_ledger_baselines,
    official_ledger_path,
    prepare_inactive_increment_policy,
    require_existing_historical_ledger,
)

ROOT = Path(__file__).resolve().parents[2]
OFFICIAL = official_ledger_path(ROOT)


def request(**overrides):
    return {
        "model": "gpt-5.4",
        "messages": [{"role": "user", "content": "Synthetic increment input"}],
        "purpose": "agreement_drafting",
        "max_tokens": 8000,
        **overrides,
    }


def _copy_official(tmp_path: Path) -> Path:
    if not OFFICIAL.is_file():
        pytest.fail(f"official quality-eval ledger missing: {OFFICIAL}")
    dest = tmp_path / OFFICIAL_LEDGER_NAME
    shutil.copy2(OFFICIAL, dest)
    return dest


def _activate(policy_path: Path) -> Path:
    policy = json.loads(policy_path.read_text())
    policy["active"] = True
    policy_path.write_text(json.dumps(policy, indent=2) + "\n")
    return policy_path


def test_official_ledger_remains_historical_and_unreset():
    baselines = inspect_ledger_baselines(OFFICIAL)
    assert baselines["attempts"] >= 15
    assert baselines["reserved"] >= 1_941_421
    assert baselines["buckets"]["primary"] >= 3
    assert baselines["buckets"]["bootstrap_parse"] >= 3


def test_prepared_increment_file_is_inactive():
    prepared = ROOT / "evals/commercial-readiness/quality-eval-increment-20260914.inactive.json"
    policy = json.loads(prepared.read_text())
    assert policy["active"] is False
    assert policy.get("authorization") in (None, {})
    assert "free_one_pager" in policy["excluded_purposes"]
    assert policy["max_additional_reserved_usd"] == 1.0
    assert policy["additional_allowance"]["primary"] == 2
    assert policy["additional_allowance"]["bootstrap_one_pager"] == 0


def test_inactive_increment_does_not_grant_exhausted_primary(tmp_path, monkeypatch):
    ledger = _copy_official(tmp_path)
    policy_path = tmp_path / "increment.json"
    prepare_inactive_increment_policy(ledger, policy_path)
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_QUALITY_EVAL_INCREMENT_PATH", str(policy_path))
    budget = QualityEvalBudget(ledger)
    before = budget.summary()
    with pytest.raises(QualityEvalBlocked, match="call_limit"):
        budget.reserve(**request())
    assert budget.summary()["attempts"] == before["attempts"]
    assert before["attempts"] >= 15


def test_replacement_ledger_cannot_obtain_increment_allowance(tmp_path, monkeypatch):
    fresh = QualityEvalBudget.create(tmp_path / OFFICIAL_LEDGER_NAME, model="gpt-5.4")
    official_policy = json.loads(
        (ROOT / "evals/commercial-readiness/quality-eval-increment-20260914.inactive.json").read_text()
    )
    official_policy["active"] = True
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_QUALITY_EVAL_INCREMENT_PATH", str(tmp_path / "increment.json"))
    (tmp_path / "increment.json").write_text(json.dumps(official_policy) + "\n")
    with pytest.raises(QualityEvalBlocked, match="replacement_ledger"):
        require_existing_historical_ledger(fresh.path, official_policy)


def test_active_increment_on_official_copy_enforces_inventory_and_exclusions(tmp_path, monkeypatch):
    ledger = _copy_official(tmp_path)
    policy_path = tmp_path / "increment.json"
    prepare_inactive_increment_policy(ledger, policy_path)
    _activate(policy_path)
    require_existing_historical_ledger(ledger, json.loads(policy_path.read_text()))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_QUALITY_EVAL_INCREMENT_PATH", str(policy_path))
    budget = QualityEvalBudget(ledger)
    first = budget.reserve(**request())
    second = budget.reserve(**request())
    with pytest.raises(QualityEvalBlocked, match="call_limit"):
        budget.reserve(**request())
    budget.finish(first, failed=True)
    budget.finish(second, failed=True)
    with pytest.raises(QualityEvalBlocked, match="excluded_eval_purpose"):
        budget.reserve(**request(model="gpt-4o-mini", purpose="free_one_pager", max_tokens=1200))
    with pytest.raises(QualityEvalBlocked, match="excluded_eval_purpose"):
        budget.reserve(**request(purpose="explicit_revision", max_tokens=12000))
    with pytest.raises(QualityEvalBlocked, match="excluded_eval_purpose"):
        budget.reserve(**request(purpose="recipient_negotiation", max_tokens=768))
    parse = request(purpose="structured_extraction", max_tokens=1200)
    budget.reserve(**parse)
    budget.reserve(**parse)
    with pytest.raises(QualityEvalBlocked, match="call_limit"):
        budget.reserve(**parse)


def test_increment_survives_restart_and_blocks_concurrent_overage(tmp_path, monkeypatch):
    ledger = _copy_official(tmp_path)
    policy_path = tmp_path / "increment.json"
    prepare_inactive_increment_policy(ledger, policy_path)
    _activate(policy_path)
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_QUALITY_EVAL_INCREMENT_PATH", str(policy_path))
    one = QualityEvalBudget(ledger).reserve(**request())
    QualityEvalBudget(ledger).finish(one, failed=True)
    restarted = QualityEvalBudget(ledger)
    two = restarted.reserve(**request())
    restarted.finish(two, failed=True)

    def attempt(_):
        try:
            QualityEvalBudget(ledger).reserve(**request())
            return True
        except QualityEvalBlocked:
            return False

    with ThreadPoolExecutor(max_workers=5) as executor:
        assert sum(executor.map(attempt, range(5))) == 0
    assert QualityEvalBudget(ledger).summary()["attempts"] == inspect_ledger_baselines(OFFICIAL)["attempts"] + 2


def test_increment_dollar_cap_is_one_dollar_additional(tmp_path, monkeypatch):
    ledger = _copy_official(tmp_path)
    policy_path = tmp_path / "increment.json"
    prepare_inactive_increment_policy(ledger, policy_path)
    policy = json.loads(policy_path.read_text())
    policy["active"] = True
    policy["max_additional_reserved_units"] = 1
    policy_path.write_text(json.dumps(policy) + "\n")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_QUALITY_EVAL_INCREMENT_PATH", str(policy_path))
    with pytest.raises(QualityEvalBlocked, match="increment_dollar_limit"):
        QualityEvalBudget(ledger).reserve(**request())


def test_increment_and_budget_env_cannot_enter_hosted(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("CLAW_QUALITY_EVAL_BUDGET_PATH", str(tmp_path / "approval.sqlite3"))
    monkeypatch.setenv("CLAW_QUALITY_EVAL_INCREMENT_PATH", str(tmp_path / "increment.json"))
    with pytest.raises(QualityEvalBlocked, match="local_only"):
        configured_budget()


def test_frontend_does_not_consult_eval_ledger_or_increment():
    hits: list[str] = []
    for path in (ROOT / "frontend/src").rglob("*"):
        if path.suffix not in {".ts", ".tsx", ".js"}:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if "CLAW_QUALITY_EVAL" in text or "quality-eval-approved-20260913" in text:
            hits.append(str(path.relative_to(ROOT)))
    assert hits == []


def test_customer_drafting_without_eval_env_does_not_open_ledger(monkeypatch):
    monkeypatch.delenv("CLAW_QUALITY_EVAL_BUDGET_PATH", raising=False)
    monkeypatch.delenv("CLAW_QUALITY_EVAL_INCREMENT_PATH", raising=False)
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    assert configured_budget() is None
    increment_reservation_gate(
        purpose="agreement_drafting",
        bucket="primary",
        count=0,
        bucket_count=0,
        reserved=0,
        reservation=1,
        ceiling=16_000_000,
        policy=None,
    )
