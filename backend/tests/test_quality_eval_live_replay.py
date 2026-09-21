"""Captured live Harbor bodies can be replayed without a provider call."""

from __future__ import annotations

from pathlib import Path

from backend.quality_eval_live_replay import replay_legal_llm_completion

ROOT = Path(__file__).resolve().parents[2]
LIVE = ROOT / "evals/commercial-readiness/results/quality-eval-live/20260914T195201Z-5037"
SIX_ROW = ROOT / "evals/commercial-readiness/fixtures/harbor-20260915-six-row-parse-replay"
HARBOR = (
    "Draft a consulting services agreement between Harbor Peak Analytics LLC (Consultant) "
    "and Ironvale Manufacturing Inc. (Client). Scope is AI workflow implementation."
)


def test_replay_requires_local_env_and_dir(monkeypatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.delenv("QUALITY_EVAL_REPLAY_LIVE_DIR", raising=False)
    assert (
        replay_legal_llm_completion(
            [{"role": "user", "content": HARBOR}],
            call_purpose="agreement_drafting",
        )
        is None
    )


def test_replay_returns_captured_harbor_draft(monkeypatch) -> None:
    if not LIVE.is_dir():
        return
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("QUALITY_EVAL_REPLAY_LIVE_DIR", str(LIVE))
    parse = replay_legal_llm_completion(
        [{"role": "system", "content": "premium_v1"}, {"role": "user", "content": HARBOR}],
        call_purpose="structured_extraction",
    )
    assert parse and "AI workflow implementation" in parse
    draft = replay_legal_llm_completion(
        [{"role": "user", "content": HARBOR}],
        call_purpose="agreement_drafting",
    )
    assert draft and "AI workflow implementation" in draft
    assert "twelve (12) months" in draft
    saas = replay_legal_llm_completion(
        [{"role": "user", "content": "Orion Harbor LLC and Northwind Retail Inc hosted platform"}],
        call_purpose="agreement_drafting",
    )
    assert saas is None


def test_committed_six_row_parse_replay_does_not_invent_rejected_corpus(monkeypatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("QUALITY_EVAL_REPLAY_LIVE_DIR", str(SIX_ROW))
    parse = replay_legal_llm_completion(
        [{"role": "system", "content": "premium_v1"}, {"role": "user", "content": HARBOR}],
        call_purpose="structured_extraction",
    )
    assert parse and parse.count("@") >= 2
    assert "Maya Chen" in parse
    draft = replay_legal_llm_completion(
        [{"role": "user", "content": HARBOR}],
        call_purpose="agreement_drafting",
    )
    assert draft is None
