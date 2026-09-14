from __future__ import annotations

import json
from pathlib import Path

from backend.agreements.completion_criteria_guard import (
    apply_completion_criteria_guard,
    unconfirmed_completion_criteria_question,
)

HARBOR_INTAKE = (
    "Draft a consulting services agreement between Harbor Peak Analytics LLC (Consultant) "
    "and Ironvale Manufacturing Inc. (Client). Scope is AI workflow implementation. "
    "Fixed fee $48,000. Term twelve months starting October 1, 2026. Governing law Delaware. "
    "Consultant owns pre-existing tools; Client owns deliverables after payment."
)
SAAS_INTAKE = (
    "Draft a 12-month SaaS subscription agreement between Orion Harbor LLC and Northwind Retail Inc. "
    "Orion Harbor LLC will provide hosted platform access and standard onboarding. "
    "Northwind Retail Inc pays $48,000 annual subscription, net 30. "
    "Governing law is New York. Scope is the hosted platform only — no professional services."
)
FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "evals/commercial-readiness/fixtures/consulting-unconfirmed-payment-replay.json"
)
COMPLETION_QUESTION = unconfirmed_completion_criteria_question(HARBOR_INTAKE)
COMPLETION_ANSWER = (
    "Completion is Client's written confirmation that the implemented AI workflow is in operational use."
)
SAAS_BODY = (
    "This SaaS Subscription Agreement is entered into by and between Orion Harbor LLC "
    "and Northwind Retail Inc.\n\n"
    "1. Services\n"
    "Provider will provide hosted platform access and standard onboarding. "
    "Scope is the hosted platform only — no professional services.\n\n"
    "2. Fees\n"
    "Northwind Retail Inc pays $48,000 annual subscription, net 30.\n"
)


def _replay() -> dict:
    return json.loads(FIXTURE.read_text())


def test_consulting_gap_asks_without_inventing_milestones() -> None:
    raw = _replay()
    cleaned, missing = apply_completion_criteria_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="",
        document_text=raw["authoritative_draft"],
        missing_material_info=[],
    )
    assert COMPLETION_QUESTION in missing
    assert cleaned == raw["authoritative_draft"]
    assert "accept or reject each milestone" not in cleaned
    assert "deemed accepted" not in cleaned.lower()
    assert "AI workflow implementation" in cleaned
    assert "deliverables" in cleaned.lower()


def test_explicit_completion_answer_is_appended_once() -> None:
    raw = _replay()
    cleaned, missing = apply_completion_criteria_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers=COMPLETION_ANSWER,
        document_text=raw["authoritative_draft"],
        missing_material_info=[],
    )
    assert COMPLETION_QUESTION not in missing
    assert COMPLETION_ANSWER in cleaned
    assert cleaned.lower().count("written confirmation that the implemented ai workflow") == 1
    again, again_missing = apply_completion_criteria_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers=COMPLETION_ANSWER,
        document_text=cleaned,
        missing_material_info=[],
    )
    assert COMPLETION_QUESTION not in again_missing
    assert again.lower().count("written confirmation that the implemented ai workflow") == 1


def test_hosted_saas_does_not_gain_consulting_acceptance() -> None:
    cleaned, missing = apply_completion_criteria_guard(
        intake=SAAS_INTAKE,
        user_gap_answers="",
        document_text=SAAS_BODY,
        missing_material_info=[],
    )
    assert missing == []
    assert cleaned == SAAS_BODY
    assert "deliverable" not in cleaned.lower()
    assert "acceptance" not in cleaned.lower()
    assert "milestone" not in cleaned.lower()
