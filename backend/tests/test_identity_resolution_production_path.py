"""Labeled identity parse fixture through production normalize and persist."""

from __future__ import annotations

import json
from pathlib import Path

from backend.quality_eval_live_replay import replay_legal_llm_completion
from backend.routers.agreements_v2_api import _parse_premium_intake_result

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "evals/commercial-readiness/fixtures/harbor-identity-resolution-parse-replay"
AMBIGUOUS_INTAKE = (
    "Draft a consulting agreement between Harbor Peak Analytics LLC (Consultant) "
    "and Ironvale Manufacturing Inc. (Client). Scope is AI workflow implementation. "
    "Fixed fee $48,000. Delaware. Alex Rivera, alex.rivera@advisor.test, is involved."
)
EXTRACTION_ONLY_INTAKE = (
    "Draft a consulting agreement between Harbor Peak Analytics LLC (Consultant) "
    "and Ironvale Manufacturing Inc. (Client). Scope is AI workflow implementation. "
    "Fixed fee $48,000. Delaware."
)


def test_normalized_parse_keeps_companies_and_preserves_unresolved_alex(monkeypatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("QUALITY_EVAL_REPLAY_LIVE_DIR", str(FIXTURE))
    raw = json.loads(
        replay_legal_llm_completion(
            [{"role": "system", "content": "premium_v1"}, {"role": "user", "content": AMBIGUOUS_INTAKE}],
            call_purpose="structured_extraction",
        )
        or "{}"
    )
    assert [p["name"] for p in raw["parties"]] == [
        "Harbor Peak Analytics LLC",
        "Ironvale Manufacturing Inc",
        "Alex Rivera",
        "Riley Chen",
    ]
    draft, extract = _parse_premium_intake_result(raw, AMBIGUOUS_INTAKE)
    assert [p.name for p in draft.parties] == [
        "Harbor Peak Analytics LLC",
        "Ironvale Manufacturing Inc",
    ]
    unresolved = draft.unresolved_identity_v1 or []
    names = {str(row.get("name")): row.get("source") for row in unresolved}
    assert names["Alex Rivera"] == "customer_mentioned"
    assert names["Riley Chen"] == "extraction_only"
    assert any("Alex Rivera" in ask for ask in extract.material_asks)


def test_extraction_only_person_does_not_become_a_party_or_question(monkeypatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("QUALITY_EVAL_REPLAY_LIVE_DIR", str(FIXTURE))
    raw = json.loads(
        replay_legal_llm_completion(
            [{"role": "system", "content": "premium_v1"}, {"role": "user", "content": EXTRACTION_ONLY_INTAKE}],
            call_purpose="structured_extraction",
        )
        or "{}"
    )
    draft, extract = _parse_premium_intake_result(raw, EXTRACTION_ONLY_INTAKE)
    assert [p.name for p in draft.parties] == [
        "Harbor Peak Analytics LLC",
        "Ironvale Manufacturing Inc",
    ]
    unresolved = draft.unresolved_identity_v1 or []
    assert all(row.get("source") == "extraction_only" for row in unresolved)
    assert not any("Riley Chen" in ask or "Alex Rivera" in ask for ask in extract.material_asks)
