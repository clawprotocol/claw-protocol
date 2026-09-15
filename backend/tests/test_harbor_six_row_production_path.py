"""Replay the saved six-row Harbor parse at the provider boundary.

Drafting is not the withheld 20260915 rejected corpus. A labeled synthetic
failure is used only to prove recoverable rejection capture.
"""

from __future__ import annotations

import json
from pathlib import Path

from backend.quality_eval_live_replay import replay_legal_llm_completion
from backend.routers.agreements_v2_api import (
    _normalize_parsed_draft,
    _parse_premium_intake_result,
)

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "evals/commercial-readiness/fixtures/harbor-20260915-six-row-parse-replay"
HARBOR_INTAKE = (
    "Draft a consulting services agreement between Harbor Peak Analytics LLC (Consultant) "
    "and Ironvale Manufacturing Inc. (Client). Scope is AI workflow implementation. "
    "Fixed fee $48,000. Consultant signer Maya Chen, maya.chen@harborpeak.test. "
    "Client signer Jordan Hale, jordan.hale@ironvale.test. "
    "Service start October 1, 2026. Term twelve months. Delaware law."
)


def test_replay_returns_six_row_premium_parse(monkeypatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("QUALITY_EVAL_REPLAY_LIVE_DIR", str(FIXTURE))
    raw = replay_legal_llm_completion(
        [{"role": "system", "content": "premium_v1"}, {"role": "user", "content": HARBOR_INTAKE}],
        call_purpose="structured_extraction",
    )
    assert raw
    parsed = json.loads(raw)
    names = [p["name"] for p in parsed["parties"]]
    assert names == [
        "Harbor Peak Analytics LLC",
        "Ironvale Manufacturing Inc",
        "Maya Chen",
        "Jordan Hale",
        "maya.chen@harborpeak.test",
        "jordan.hale@ironvale.test",
    ]
    draft = replay_legal_llm_completion(
        [{"role": "user", "content": HARBOR_INTAKE}],
        call_purpose="agreement_drafting",
    )
    assert draft is None


def test_production_normalize_and_outgoing_parties_keep_consultant_client(monkeypatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("QUALITY_EVAL_REPLAY_LIVE_DIR", str(FIXTURE))
    raw = json.loads(
        replay_legal_llm_completion(
            [{"role": "system", "content": "premium_v1"}, {"role": "user", "content": HARBOR_INTAKE}],
            call_purpose="structured_extraction",
        )
        or "{}"
    )
    draft, extract = _parse_premium_intake_result(raw, HARBOR_INTAKE)
    assert [p.name for p in draft.parties] == [
        "Harbor Peak Analytics LLC",
        "Ironvale Manufacturing Inc",
    ]
    assert [p.role for p in draft.parties] == ["Consultant", "Client"]
    assert draft.parties[0].signer_name == "Maya Chen"
    assert draft.parties[0].email == "maya.chen@harborpeak.test"
    assert draft.parties[1].signer_name == "Jordan Hale"
    assert draft.parties[1].email == "jordan.hale@ironvale.test"
    assert draft.purpose
    assert "dashboard setup" not in (draft.purpose or "").lower()
    persisted = _normalize_parsed_draft(
        {
            "title": draft.title,
            "jurisdiction": draft.jurisdiction,
            "purpose": draft.purpose,
            "payment_terms": draft.payment_terms,
            "parties": [p.model_dump(by_alias=True) for p in draft.parties],
        },
        HARBOR_INTAKE,
    )
    assert [p.role for p in persisted.parties] == ["Consultant", "Client"]
    assert extract.material_asks == []


def test_recoverable_rejection_keeps_customer_facts_and_empties_rejected_paper(monkeypatch, tmp_path) -> None:
    from backend.agreements.draft_quality_trace import new_trace
    from backend.agreements.premium_agreement_validation import AgreementValidationResult
    from backend.routers.agreements_v2_api import (
        AgreementIntelligence,
        PremiumFullDraftResponse,
        _premium_full_draft_finalize_http_response,
    )

    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("QUALITY_EVAL_REPLAY_LIVE_DIR", str(FIXTURE))
    monkeypatch.setenv("CLAW_DRAFT_QUALITY_TRACE", "1")
    monkeypatch.setenv("CLAW_DRAFT_QUALITY_TRACE_DUMP", "1")
    monkeypatch.setenv("CLAW_DRAFT_QUALITY_EVAL_AUTH", "local-eval-auth")
    monkeypatch.setenv("CLAW_DRAFT_QUALITY_EVAL_AUTH_EXPECTED", "local-eval-auth")
    monkeypatch.setenv("CLAW_DRAFT_QUALITY_TRACE_DIR", str(tmp_path))

    raw = json.loads(
        replay_legal_llm_completion(
            [{"role": "system", "content": "premium_v1"}, {"role": "user", "content": HARBOR_INTAKE}],
            call_purpose="structured_extraction",
        )
        or "{}"
    )
    draft, _extract = _parse_premium_intake_result(raw, HARBOR_INTAKE)
    assert [p.name for p in draft.parties] == [
        "Harbor Peak Analytics LLC",
        "Ironvale Manufacturing Inc",
    ]
    assert draft.parties[0].signer_name == "Maya Chen"
    assert draft.parties[0].email == "maya.chen@harborpeak.test"
    assert draft.jurisdiction == "Delaware"
    assert "AI workflow implementation" in (draft.purpose or "")

    rejected = (
        "SYNTHETIC REJECTED PAPER (not the withheld 20260915 corpus).\n"
        "This text must not become accepted-paper authority.\n"
        "maya.chen@harborpeak.test 555-010-9999"
    )
    trace = new_trace(
        trace_id="six-row-reject",
        model_id="stub",
        temperature=0.0,
        max_tokens=100,
        intake_text=HARBOR_INTAKE,
        payload_json_len=12,
    )
    response = _premium_full_draft_finalize_http_response(
        PremiumFullDraftResponse(
            title=draft.title or "Consulting Services Agreement",
            agreement_family="services_agreement",
            document_text=rejected,
            authoritative_draft=rejected,
            server_full_document_text=rejected,
            agreement_intelligence=AgreementIntelligence(),
            agreement_validation=AgreementValidationResult(passed=False),
            generation_outcome="ok",
            schema_validation_reasons=["fallback_applicable_party"],
            generation_ok=True,
            retryable=False,
        ),
        intake_len=len(HARBOR_INTAKE),
        session_hint="six-row-reject",
        dq_trace=trace,
        rejected_corpus=rejected,
    )
    wire = json.loads(response.body)
    assert wire["generation_ok"] is False
    assert wire["retryable"] is True
    assert wire["server_generation_failure_code"] == "agreement_validation_failed"
    assert all(
        wire[key] == ""
        for key in (
            "document_text",
            "authoritative_draft",
            "server_full_document_text",
            "server_repair_document_text",
        )
    )
    assert rejected not in json.dumps(wire)
    payload = json.loads((tmp_path / "six-row-reject.json").read_text())
    redacted = payload["corpora_redacted"]["rejected_paper_before_wire_empty"]
    assert "SYNTHETIC REJECTED PAPER" in redacted
    assert "maya.chen@harborpeak.test" not in redacted
    assert draft.parties[0].signer_name == "Maya Chen"
    assert draft.payment_terms
