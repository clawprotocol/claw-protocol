"""API route contract tests for explicit premium finalization."""

from __future__ import annotations

import json
import logging
from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend.agreements.premium_agreement_validation import validatePremiumAgreementDraft
from backend.main import app

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-premium-finalization"}


def _intel() -> dict:
    return {
        "extracted_terms": {
            "parties": [
                {"name": "Red Mesa Logistics LLC", "role": "Client"},
                {"name": "Harbor Peak Automation LLC", "role": "Service Provider"},
            ],
            "party_roles": [
                {"party_name": "Red Mesa Logistics LLC", "role": "Client"},
                {"party_name": "Harbor Peak Automation LLC", "role": "Service Provider"},
            ],
            "governing_law": "Texas",
            "payment_terms": {"total_amount": "$10,000", "currency": "USD", "milestones": []},
        },
        "ambiguities": [],
        "conflicts": [],
        "missing_material_terms": [],
        "recommended_questions": [],
        "quality_flags": [],
    }


def _intake() -> str:
    return (
        "Red Mesa Logistics LLC hires Harbor Peak Automation LLC for automation consulting services. "
        "$10,000 fixed fee. Texas governing law. Electronic signatures are allowed."
    )


def _valid_draft() -> str:
    return """
AI Automation Services Agreement

1. Parties and Purpose
This Agreement is between Red Mesa Logistics LLC ("Client") and Harbor Peak Automation LLC ("Service Provider").
Service Provider will provide automation consulting services and deliver the agreed workflow configuration.

2. Fees
Client will pay Service Provider a fixed fee of $10,000 for the services. The parties agree to cooperate and perform their obligations.

3. Governing Law
Texas law governs this Agreement.

4. Signatures
The parties may sign this Agreement electronically, and signatures show acceptance.
""".strip()


def _invalid_draft() -> str:
    return """
AI Automation Services Agreement

1. Parties and Purpose
This Agreement is between Red Mesa Logistics LLC ("Client") and Harbor Peak Automation LLC ("Service Provider").
Service Provider will provide automation consulting services.

2. Fees
TBD.

3. Governing Law
Governing law: to be agreed.

4. Confidentiality

5. Signatures
The parties may sign this Agreement electronically, and signatures show acceptance.
""".strip()


def _validation(draft: str) -> dict:
    return validatePremiumAgreementDraft(
        authoritativeDraft=draft,
        agreementIntelligence=_intel(),
        originalIntake=_intake(),
    ).model_dump(mode="json")


def _payload(draft: str, **overrides: Any) -> dict:
    payload = {
        "original_intake": _intake(),
        "first_draft": draft,
        "agreement_intelligence": _intel(),
        "agreement_validation": _validation(draft),
        "clarification_answers": [],
    }
    payload.update(overrides)
    return payload


def _patch_llm(monkeypatch: pytest.MonkeyPatch, response_text: str) -> list[dict]:
    calls: list[dict] = []

    def fake_llm(**kwargs: Any) -> str:
        calls.append(kwargs)
        return response_text

    monkeypatch.setattr("backend.agreements.premium_agreement_finalization.call_legal_llm", fake_llm)
    return calls


def test_route_validation_passes_no_answers_returns_not_needed(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _patch_llm(monkeypatch, json.dumps({"authoritative_draft": _valid_draft(), "agreement_intelligence": _intel()}))
    client = TestClient(app)

    res = client.post("/api/agreements/premium/finalize", headers=_ORG_H, json=_payload(_valid_draft()))

    assert res.status_code == 200
    data = res.json()
    assert data["finalized"] is False
    assert data["reason"] == "not_needed"
    assert data["document_text"] == _valid_draft()
    assert data["model_call_count"] == 0
    assert calls == []


def test_route_validation_fails_attempts_finalization(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _patch_llm(monkeypatch, json.dumps({"authoritative_draft": _valid_draft(), "agreement_intelligence": _intel()}))
    client = TestClient(app)

    res = client.post("/api/agreements/premium/finalize", headers=_ORG_H, json=_payload(_invalid_draft()))

    assert res.status_code == 200
    data = res.json()
    assert data["reason"] == "validation_failed"
    assert data["repair_attempted"] is True
    assert data["model_call_count"] == 1
    assert len(calls) == 1
    assert data["agreement_validation"]["passed"] is True


def test_route_clarification_answers_attempt_finalization(monkeypatch: pytest.MonkeyPatch) -> None:
    repaired = _valid_draft() + "\n\nSupport renews month-to-month unless cancelled on 30 days' notice."
    calls = _patch_llm(monkeypatch, json.dumps({"authoritative_draft": repaired, "agreement_intelligence": _intel()}))
    client = TestClient(app)

    res = client.post(
        "/api/agreements/premium/finalize",
        headers=_ORG_H,
        json=_payload(
            _valid_draft(),
            clarification_answers=[
                {
                    "question_id": "q_support_renewal",
                    "question": "Does support renew monthly?",
                    "answer": "Support renews month-to-month unless cancelled on 30 days' notice.",
                }
            ],
        ),
    )

    assert res.status_code == 200
    data = res.json()
    assert data["reason"] == "clarifications_answered"
    assert data["repair_attempted"] is True
    assert data["model_call_count"] == 1
    assert len(calls) == 1


def test_route_malformed_request_returns_safe_4xx() -> None:
    client = TestClient(app)

    res = client.post(
        "/api/agreements/premium/finalize",
        headers=_ORG_H,
        json={"original_intake": _intake(), "agreement_intelligence": None},
    )

    assert 400 <= res.status_code < 500


def test_route_malformed_model_response_returns_graceful_result(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_llm(monkeypatch, "not-json commentary")
    client = TestClient(app)

    res = client.post("/api/agreements/premium/finalize", headers=_ORG_H, json=_payload(_invalid_draft()))

    assert res.status_code == 200
    data = res.json()
    assert data["reason"] == "validation_failed"
    assert data["repair_attempted"] is True
    assert data["repair_succeeded"] is False
    assert data["document_text"] == _invalid_draft()


def test_route_logs_do_not_include_body_text(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO)
    body_secret = "UNIQUE_ROUTE_BODY_PHRASE_DO_NOT_LOG"
    repaired_secret = "UNIQUE_ROUTE_REPAIRED_PHRASE_DO_NOT_LOG"
    repaired = _valid_draft() + f"\n\n{repaired_secret}"
    _patch_llm(monkeypatch, json.dumps({"authoritative_draft": repaired, "agreement_intelligence": _intel()}))
    client = TestClient(app)

    res = client.post(
        "/api/agreements/premium/finalize",
        headers=_ORG_H,
        json=_payload(_invalid_draft() + f"\n\n{body_secret}", agreement_validation=_validation(_invalid_draft())),
    )

    assert res.status_code == 200
    assert body_secret not in caplog.text
    assert repaired_secret not in caplog.text
    assert "[premium-finalize-route]" in caplog.text


def test_route_gracefully_handles_missing_intelligence_and_validation(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _patch_llm(monkeypatch, json.dumps({"authoritative_draft": _valid_draft(), "agreement_intelligence": _intel()}))
    client = TestClient(app)

    res = client.post(
        "/api/agreements/premium/finalize",
        headers=_ORG_H,
        json={
            "original_intake": _intake(),
            "first_draft": _valid_draft(),
            "agreement_intelligence": None,
            "agreement_validation": None,
        },
    )

    assert res.status_code == 200
    data = res.json()
    assert data["reason"] in {"not_needed", "validation_failed"}
    assert data["agreement_validation"]["passed"] is True
    assert len(calls) <= 1

