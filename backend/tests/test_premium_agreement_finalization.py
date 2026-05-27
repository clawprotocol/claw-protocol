"""Conditional second-pass Pro agreement finalization tests."""

from __future__ import annotations

import json
import logging
from typing import Any

from backend.agreements.premium_agreement_finalization import (
    build_premium_finalization_system_prompt,
    finalize_premium_agreement_if_needed,
)
from backend.agreements.premium_agreement_validation import validatePremiumAgreementDraft


def _intel(**overrides: Any) -> dict:
    base = {
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
    base.update(overrides)
    return base


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


def _validation(draft: str, intelligence: Any | None = None):
    return validatePremiumAgreementDraft(
        authoritativeDraft=draft,
        agreementIntelligence=intelligence or _intel(),
        originalIntake=_intake(),
    )


def _llm_returning(document_text: str, intelligence: Any | None = None):
    calls: list[dict] = []

    def fake_llm(**kwargs: Any) -> str:
        calls.append(kwargs)
        return json.dumps(
            {
                "authoritative_draft": document_text,
                "agreement_intelligence": intelligence or _intel(),
            }
        )

    fake_llm.calls = calls  # type: ignore[attr-defined]
    return fake_llm


def test_validation_passes_and_no_questions_returns_without_second_pass() -> None:
    fake_llm = _llm_returning(_valid_draft())
    result = finalize_premium_agreement_if_needed(
        original_intake=_intake(),
        first_draft=_valid_draft(),
        agreement_intelligence=_intel(),
        agreement_validation=_validation(_valid_draft()),
        clarification_answers={},
        call_legal_llm_fn=fake_llm,
    )

    assert result.finalized is False
    assert result.reason == "not_needed"
    assert result.document_text == _valid_draft()
    assert result.model_call_count == 0
    assert result.repair_attempted is False
    assert fake_llm.calls == []  # type: ignore[attr-defined]


def test_validation_failure_attempts_second_pass() -> None:
    fake_llm = _llm_returning(_valid_draft())
    result = finalize_premium_agreement_if_needed(
        original_intake=_intake(),
        first_draft=_invalid_draft(),
        agreement_intelligence=_intel(),
        agreement_validation=_validation(_invalid_draft()),
        clarification_answers={},
        call_legal_llm_fn=fake_llm,
    )

    assert result.reason == "validation_failed"
    assert result.repair_attempted is True
    assert result.model_call_count == 1
    assert len(fake_llm.calls) == 1  # type: ignore[attr-defined]


def test_clarification_answers_attempt_second_pass_even_when_validation_passes() -> None:
    fake_llm = _llm_returning(_valid_draft())
    result = finalize_premium_agreement_if_needed(
        original_intake=_intake(),
        first_draft=_valid_draft(),
        agreement_intelligence=_intel(
            recommended_questions=[
                {
                    "id": "q_support",
                    "topic": "support",
                    "question": "Should support renew monthly?",
                    "reason": "Material support clarification.",
                    "priority": "medium",
                }
            ]
        ),
        agreement_validation=_validation(_valid_draft()),
        clarification_answers={"q_support": "Support renews month-to-month unless cancelled on 30 days' notice."},
        call_legal_llm_fn=fake_llm,
    )

    assert result.reason == "clarifications_answered"
    assert result.repair_attempted is True
    assert result.model_call_count == 1


def test_conflicts_or_ambiguities_attempt_second_pass() -> None:
    intelligence = _intel(
        conflicts=[
            {
                "id": "conf_payment_timing",
                "topic": "payment timing",
                "description": "Net 15 and Net 45 both appear.",
                "conflicting_values": ["Net 15", "Net 45"],
                "severity": "high",
            }
        ]
    )
    fake_llm = _llm_returning(_valid_draft(), intelligence)
    result = finalize_premium_agreement_if_needed(
        original_intake=_intake(),
        first_draft=_valid_draft(),
        agreement_intelligence=intelligence,
        agreement_validation=_validation(_valid_draft(), intelligence),
        clarification_answers={},
        call_legal_llm_fn=fake_llm,
    )

    assert result.reason == "conflicts_or_ambiguities"
    assert result.model_call_count == 1


def test_repaired_draft_validates_sets_repair_succeeded_true() -> None:
    repaired = _valid_draft() + "\n\nClient owns paid deliverables after payment."
    fake_llm = _llm_returning(repaired)
    result = finalize_premium_agreement_if_needed(
        original_intake=_intake(),
        first_draft=_invalid_draft(),
        agreement_intelligence=_intel(),
        agreement_validation=_validation(_invalid_draft()),
        call_legal_llm_fn=fake_llm,
    )

    assert result.repair_succeeded is True
    assert result.finalized is True
    assert result.agreement_validation.passed is True
    assert result.document_text == repaired


def test_repaired_draft_still_fails_sets_repair_succeeded_false() -> None:
    still_bad = _invalid_draft().replace("TBD.", "Fees remain to be agreed.")
    fake_llm = _llm_returning(still_bad)
    result = finalize_premium_agreement_if_needed(
        original_intake=_intake(),
        first_draft=_invalid_draft(),
        agreement_intelligence=_intel(),
        agreement_validation=_validation(_invalid_draft()),
        call_legal_llm_fn=fake_llm,
    )

    assert result.repair_succeeded is False
    assert result.finalized is False
    assert result.agreement_validation.passed is False


def test_logs_do_not_include_agreement_body_text(caplog) -> None:
    caplog.set_level(logging.INFO)
    body_secret = "UNIQUE_BODY_PHRASE_DO_NOT_LOG"
    repaired_secret = "UNIQUE_REPAIRED_PHRASE_DO_NOT_LOG"
    fake_llm = _llm_returning(_valid_draft() + f"\n{repaired_secret}")

    finalize_premium_agreement_if_needed(
        original_intake=_intake(),
        first_draft=_invalid_draft() + f"\n{body_secret}",
        agreement_intelligence=_intel(),
        agreement_validation=_validation(_invalid_draft()),
        call_legal_llm_fn=fake_llm,
    )

    assert body_secret not in caplog.text
    assert repaired_secret not in caplog.text
    assert "[premium-finalization]" in caplog.text


def test_malformed_openai_finalization_response_handled_gracefully(caplog) -> None:
    caplog.set_level(logging.WARNING)

    def fake_llm(**_: Any) -> str:
        return "not-json commentary"

    result = finalize_premium_agreement_if_needed(
        original_intake=_intake(),
        first_draft=_invalid_draft(),
        agreement_intelligence=_intel(),
        agreement_validation=_validation(_invalid_draft()),
        call_legal_llm_fn=fake_llm,
    )

    assert result.reason == "validation_failed"
    assert result.repair_attempted is True
    assert result.repair_succeeded is False
    assert result.document_text == _invalid_draft()
    assert "response_error" in caplog.text


def test_finalization_prompt_contains_required_repair_instructions() -> None:
    prompt = build_premium_finalization_system_prompt()

    assert "Preserve all explicit terms" in prompt
    assert "Incorporate all user clarification answers" in prompt
    assert "Remove unresolved placeholders" in prompt
    assert "Repair numbering" in prompt
    assert "Preserve governing law" in prompt
    assert "Preserve payment structure" in prompt

