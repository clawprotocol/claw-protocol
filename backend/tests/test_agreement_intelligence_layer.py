"""First-stage Agreement Intelligence extraction contract for premium full draft."""

import logging

from backend.routers.agreements_v2_api import (
    AgreementIntelligence,
    _normalize_premium_full_draft_result,
    _premium_full_draft_system_prompt,
)


def _base_raw(intelligence: dict) -> dict:
    return {
        "title": "AI Automation Services Agreement",
        "agreement_family": "AI automation services",
        "authoritative_draft": "Complete agreement body with sections, signatures, and operative terms.",
        "agreement_intelligence": intelligence,
        "key_terms_found": ["Texas law", "$95,000 fee"],
        "missing_material_info": [],
    }


def _empty_intelligence() -> dict:
    return {
        "extracted_terms": {
            "parties": [],
            "party_roles": [],
        },
        "ambiguities": [],
        "conflicts": [],
        "missing_material_terms": [],
        "recommended_questions": [],
        "quality_flags": [],
    }


def test_governing_law_supplied_zero_governing_law_questions() -> None:
    intel = _empty_intelligence()
    intel["extracted_terms"]["governing_law"] = "Texas"
    intel["recommended_questions"] = []

    out = _normalize_premium_full_draft_result(_base_raw(intel))

    assert out.agreement_intelligence.extracted_terms.governing_law == "Texas"
    assert not [
        q
        for q in out.agreement_intelligence.recommended_questions
        if "governing" in q.topic.lower() or "law" in q.question.lower()
    ]


def test_explicit_payment_structure_supplied_no_duplicate_payment_question() -> None:
    intel = _empty_intelligence()
    intel["extracted_terms"]["payment_terms"] = {
        "total_amount": "$95,000",
        "currency": "USD",
        "milestones": [
            {"label": "Kickoff", "percentage": "50%", "trigger": "start"},
            {"label": "Rollout", "percentage": "25%", "trigger": "rollout"},
            {"label": "Acceptance", "percentage": "25%", "trigger": "acceptance"},
        ],
        "recurring_support": {"amount": "$4,500", "cadence": "month", "renewal": None},
    }

    out = _normalize_premium_full_draft_result(_base_raw(intel))
    payment = out.agreement_intelligence.extracted_terms.payment_terms

    assert payment is not None
    assert payment.total_amount == "$95,000"
    assert [m.percentage for m in payment.milestones] == ["50%", "25%", "25%"]
    assert payment.recurring_support is not None
    assert payment.recurring_support.amount == "$4,500"
    assert not [
        q
        for q in out.agreement_intelligence.recommended_questions
        if "payment" in q.topic.lower() or "fee" in q.question.lower()
    ]


def test_ambiguous_support_renewal_generates_question() -> None:
    intel = _empty_intelligence()
    intel["extracted_terms"]["support_terms"] = {
        "included": True,
        "standard": "$4,500/month optional support",
    }
    intel["ambiguities"] = [
        {
            "id": "amb_support_renewal",
            "topic": "support renewal",
            "description": "Optional support is priced monthly, but renewal/cancellation mechanics are not stated.",
            "severity": "medium",
        }
    ]
    intel["recommended_questions"] = [
        {
            "id": "q_support_renewal",
            "topic": "support renewal",
            "question": "Does optional support renew month-to-month until cancelled, and how much notice is required?",
            "reason": "Renewal mechanics affect ongoing obligations.",
            "priority": "medium",
        }
    ]

    out = _normalize_premium_full_draft_result(_base_raw(intel))

    assert out.agreement_intelligence.ambiguities[0].topic == "support renewal"
    assert out.agreement_intelligence.recommended_questions[0].id == "q_support_renewal"


def test_conflicting_payment_terms_detected_with_clarification_question() -> None:
    intel = _empty_intelligence()
    intel["conflicts"] = [
        {
            "id": "conf_payment_timing",
            "topic": "payment timing",
            "description": "The intake says Net 15 in one place and Net 45 elsewhere.",
            "conflicting_values": ["Net 15", "Net 45"],
            "severity": "high",
        }
    ]
    intel["recommended_questions"] = [
        {
            "id": "q_payment_timing",
            "topic": "payment timing",
            "question": "Should invoices be due Net 15 or Net 45?",
            "reason": "The payment timing is internally conflicting.",
            "priority": "high",
        }
    ]

    out = _normalize_premium_full_draft_result(_base_raw(intel))

    assert out.agreement_intelligence.conflicts[0].conflicting_values == ["Net 15", "Net 45"]
    assert out.agreement_intelligence.recommended_questions[0].priority == "high"


def test_minimal_complete_intake_has_no_unnecessary_questions() -> None:
    intel = _empty_intelligence()
    intel["extracted_terms"].update(
        {
            "parties": [
                {"name": "Client LLC", "role": "Client"},
                {"name": "Provider LLC", "role": "Provider"},
            ],
            "party_roles": [
                {"party_name": "Client LLC", "role": "Client"},
                {"party_name": "Provider LLC", "role": "Provider"},
            ],
            "governing_law": "Texas",
            "payment_terms": {"total_amount": "$10,000", "currency": "USD", "milestones": []},
            "termination_terms": {
                "convenience_termination": True,
                "breach_termination": True,
                "notice_period": "30 days",
            },
            "electronic_signatures": True,
        }
    )

    out = _normalize_premium_full_draft_result(_base_raw(intel))

    assert out.agreement_intelligence.recommended_questions == []
    assert out.agreement_intelligence.missing_material_terms == []


def test_openai_malformed_agreement_intelligence_falls_back_without_crash(caplog) -> None:
    caplog.set_level(logging.WARNING)
    raw = _base_raw({"extracted_terms": {"parties": "not-a-list"}})

    out = _normalize_premium_full_draft_result(raw)

    assert isinstance(out.agreement_intelligence, AgreementIntelligence)
    assert out.agreement_intelligence.extracted_terms.parties == []
    assert "event=parse_failure" in caplog.text


def test_prompt_declares_authoritative_draft_and_sparse_questions() -> None:
    prompt = _premium_full_draft_system_prompt()

    assert "agreement_intelligence" in prompt
    assert "authoritative_draft" in prompt
    assert "Duplicate or unnecessary clarification questions are harmful UX" in prompt
    assert "Do NOT ask about governing law, payment structure, or ownership when already clearly supplied" in prompt
