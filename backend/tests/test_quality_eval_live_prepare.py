"""Live increment authorization is explicit and stops before provider contact."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from backend.quality_eval_budget import QualityEvalBlocked
from backend.quality_eval_increment import (
    OFFICIAL_LEDGER_NAME,
    official_ledger_path,
    prepare_inactive_increment_policy,
)
from backend.quality_eval_live_prepare import (
    DEFAULT_INACTIVE_POLICY,
    LivePrepareBlocked,
    assert_live_provider_may_be_contacted,
    prepare_authorized_live_boundary,
    product_source_hashes,
    resolve_increment_selection,
)

ROOT = Path(__file__).resolve().parents[2]


def _authorized_copy(tmp_path: Path) -> Path:
    src = json.loads(DEFAULT_INACTIVE_POLICY.read_text())
    src["active"] = True
    src["authorization"] = {
        "kind": "explicit_increment_approval",
        "max_additional_reserved_usd": 1.0,
    }
    dest = tmp_path / "quality-eval-increment-authorized-copy.json"
    dest.write_text(json.dumps(src, indent=2) + "\n")
    return dest


def test_default_policy_stays_inactive_and_unauthorized():
    policy = json.loads(DEFAULT_INACTIVE_POLICY.read_text())
    assert policy["active"] is False
    assert policy.get("authorization") in (None, {})
    selection = resolve_increment_selection(DEFAULT_INACTIVE_POLICY, authorize=True)
    assert selection["authorized"] is False
    assert selection["reason"] == "increment_inactive"
    with pytest.raises(LivePrepareBlocked, match="increment_not_authorized"):
        assert_live_provider_may_be_contacted(selection)


def test_active_copy_without_authorization_record_stops_before_retrieve(tmp_path):
    src = json.loads(DEFAULT_INACTIVE_POLICY.read_text())
    src["active"] = True
    src["authorization"] = None
    dest = tmp_path / "quality-eval-increment-active-no-record.json"
    dest.write_text(json.dumps(src, indent=2) + "\n")
    selection = resolve_increment_selection(dest, authorize=True)
    assert selection["authorized"] is False
    assert selection["reason"] == "increment_authorization_record_required"
    called = {"n": 0}

    def retrieve():
        called["n"] += 1
        return {"OPENAI_API_KEY": "sk-should-not-run"}

    with pytest.raises(LivePrepareBlocked, match="increment_not_authorized"):
        prepare_authorized_live_boundary(
            selection=selection,
            ledger_path=tmp_path / "unused.sqlite3",
            retrieve=retrieve,
        )
    assert called["n"] == 0


def test_active_copy_without_authorize_flag_stops_before_retrieve(tmp_path):
    path = _authorized_copy(tmp_path)
    selection = resolve_increment_selection(path, authorize=False)
    assert selection["active"] is True
    assert selection["authorized"] is False
    called = {"n": 0}

    def retrieve():
        called["n"] += 1
        return {"OPENAI_API_KEY": "sk-should-not-run"}

    with pytest.raises(LivePrepareBlocked, match="increment_not_authorized"):
        prepare_authorized_live_boundary(
            selection=selection,
            ledger_path=tmp_path / "unused.sqlite3",
            retrieve=retrieve,
        )
    assert called["n"] == 0


def test_authorized_copy_reaches_mocked_provider_and_keeps_ledger_protections(tmp_path, monkeypatch):
    official = official_ledger_path(ROOT)
    ledger = tmp_path / OFFICIAL_LEDGER_NAME
    shutil.copy2(official, ledger)
    policy_path = tmp_path / "increment.json"
    prepare_inactive_increment_policy(ledger, policy_path)
    policy = json.loads(policy_path.read_text())
    policy["active"] = True
    policy["authorization"] = {
        "kind": "explicit_increment_approval",
        "max_additional_reserved_usd": 1.0,
    }
    policy_path.write_text(json.dumps(policy) + "\n")
    selection = resolve_increment_selection(policy_path, authorize=True)
    assert selection["authorized"] is True
    called = {"n": 0}

    def retrieve():
        called["n"] += 1
        return {"OPENAI_API_KEY": "sk-mock-not-live", "CLAW_LLM_MODEL_BASIC": "gpt-4o-mini"}

    prepared = prepare_authorized_live_boundary(
        selection=selection,
        ledger_path=ledger,
        retrieve=retrieve,
    )
    assert called["n"] == 1
    assert prepared["credentials_present"] is True
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_QUALITY_EVAL_INCREMENT_PATH", str(policy_path))
    from backend.quality_eval_budget import QualityEvalBudget

    budget = QualityEvalBudget(ledger)
    first = budget.reserve(
        model="gpt-5.4",
        messages=[{"role": "user", "content": "Synthetic increment input"}],
        purpose="agreement_drafting",
        max_tokens=8000,
    )
    budget.finish(first, failed=True)
    restarted = QualityEvalBudget(ledger)
    second = restarted.reserve(
        model="gpt-5.4",
        messages=[{"role": "user", "content": "Synthetic increment input"}],
        purpose="agreement_drafting",
        max_tokens=8000,
    )
    restarted.finish(second, failed=True)
    with pytest.raises(QualityEvalBlocked, match="call_limit"):
        restarted.reserve(
            model="gpt-5.4",
            messages=[{"role": "user", "content": "Synthetic increment input"}],
            purpose="agreement_drafting",
            max_tokens=8000,
        )
    with pytest.raises(QualityEvalBlocked, match="excluded_eval_purpose"):
        restarted.reserve(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": "one pager"}],
            purpose="free_one_pager",
            max_tokens=1200,
        )


def test_product_source_hashes_ignore_increment_policy_activation(tmp_path):
    before = product_source_hashes(ROOT)
    assert "evals/commercial-readiness/quality-eval-increment-20260914.inactive.json" not in before
    # Selecting/activating a temp policy does not change product hashes.
    _authorized_copy(tmp_path)
    after = product_source_hashes(ROOT)
    assert before == after


def test_runner_live_stops_before_credentials_when_inactive(tmp_path):
    import subprocess
    import sys

    hashes = product_source_hashes(ROOT)
    preflight = tmp_path / "preflight"
    offline = tmp_path / "offline"
    preflight.mkdir()
    offline.mkdir()
    (preflight / "status.json").write_text('{"status":"PASS"}\n')
    (preflight / "identity.json").write_text(json.dumps({"source_files_sha256": hashes}) + "\n")
    (offline / "status.json").write_text('{"status":"OFFLINE_JOURNEY_PASS"}\n')
    (offline / "identity.json").write_text(json.dumps({"source_files_sha256": hashes}) + "\n")
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/run_quality_eval_local.py"),
            "--live",
            "--preflight",
            str(preflight),
            "--offline-journey-evidence",
            str(offline),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    combined = result.stderr + result.stdout
    assert "increment_not_authorized" in combined
    assert "railway" not in combined.lower() or "increment_not_authorized" in combined
