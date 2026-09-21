"""Restricted evaluation capture: TRACE is metadata; DUMP+auth captures rejected paper."""

from __future__ import annotations

import json
from pathlib import Path

from backend.agreements.draft_quality_trace import (
    new_trace,
    redact_corpus_for_eval,
)
from backend.agreements.premium_agreement_validation import AgreementValidationResult
from backend.routers.agreements_v2_api import (
    AgreementIntelligence,
    PremiumFullDraftResponse,
    _premium_full_draft_finalize_http_response,
)


REJECTED = (
    "SYNTHETIC REJECTED PAPER (not the withheld 20260915 corpus).\n"
    "Consultant maya.chen@harborpeak.test will email 555-010-9999.\n"
    "fallback_applicable_party appears only as a diagnostic label."
)


def _auth(monkeypatch, tmp_path: Path, *, dump: bool) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DRAFT_QUALITY_TRACE", "1")
    monkeypatch.setenv("CLAW_DRAFT_QUALITY_TRACE_DIR", str(tmp_path))
    if dump:
        monkeypatch.setenv("CLAW_DRAFT_QUALITY_TRACE_DUMP", "1")
        monkeypatch.setenv("CLAW_DRAFT_QUALITY_EVAL_AUTH", "local-eval-auth")
        monkeypatch.setenv("CLAW_DRAFT_QUALITY_EVAL_AUTH_EXPECTED", "local-eval-auth")
    else:
        monkeypatch.delenv("CLAW_DRAFT_QUALITY_TRACE_DUMP", raising=False)
        monkeypatch.delenv("CLAW_DRAFT_QUALITY_EVAL_AUTH", raising=False)
        monkeypatch.delenv("CLAW_DRAFT_QUALITY_EVAL_AUTH_EXPECTED", raising=False)


def _failed_model() -> PremiumFullDraftResponse:
    return PremiumFullDraftResponse(
        title="Consulting Services Agreement",
        agreement_family="services_agreement",
        document_text=REJECTED,
        authoritative_draft=REJECTED,
        server_full_document_text=REJECTED,
        agreement_intelligence=AgreementIntelligence(),
        agreement_validation=AgreementValidationResult(passed=False),
        generation_outcome="ok",
        schema_validation_reasons=["fallback_applicable_party"],
        generation_ok=True,
        retryable=False,
    )


def test_trace_alone_persists_metadata_without_rejected_paper(monkeypatch, tmp_path: Path) -> None:
    _auth(monkeypatch, tmp_path, dump=False)
    trace = new_trace(
        trace_id="trace-only",
        model_id="stub",
        temperature=0.0,
        max_tokens=100,
        intake_text="Harbor Peak Analytics LLC consulting",
        payload_json_len=12,
    )
    response = _premium_full_draft_finalize_http_response(
        _failed_model(),
        intake_len=20,
        session_hint="trace-only",
        dq_trace=trace,
    )
    wire = json.loads(response.body)
    assert wire["document_text"] == ""
    assert wire["server_generation_failure_code"] == "agreement_validation_failed"
    payload = json.loads((tmp_path / "trace-only.json").read_text())
    assert "corpora_redacted" not in payload
    assert payload["summary"]["gate_reasons"]
    assert REJECTED not in json.dumps(payload)


def test_dump_authorized_captures_redacted_rejected_paper(monkeypatch, tmp_path: Path) -> None:
    _auth(monkeypatch, tmp_path, dump=True)
    trace = new_trace(
        trace_id="dump-auth",
        model_id="stub",
        temperature=0.0,
        max_tokens=100,
        intake_text="Harbor Peak Analytics LLC consulting",
        payload_json_len=12,
    )
    response = _premium_full_draft_finalize_http_response(
        _failed_model(),
        intake_len=20,
        session_hint="dump-auth",
        dq_trace=trace,
        rejected_corpus=REJECTED,
    )
    wire = json.loads(response.body)
    assert wire["document_text"] == wire["authoritative_draft"] == ""
    payload = json.loads((tmp_path / "dump-auth.json").read_text())
    redacted = payload["corpora_redacted"]["rejected_paper_before_wire_empty"]
    assert "SYNTHETIC REJECTED PAPER" in redacted
    assert "maya.chen@harborpeak.test" not in redacted
    assert "[REDACTED_EMAIL]" in redacted
    assert "[REDACTED_PHONE]" in redacted or "[REDACTED_DIGITS]" in redacted
    assert redact_corpus_for_eval(REJECTED) == redacted
