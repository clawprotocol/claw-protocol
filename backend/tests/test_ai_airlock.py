"""Focused tests for backend.security.ai_airlock."""

from __future__ import annotations

import pytest

from backend.security.ai_airlock import (
    BLOCK_REASON_PROTECTED_MODE_EXTERNAL_AI,
    AIAirlockResult,
    minimize_for_airlock,
    run_ai_airlock,
)
from backend.security.privilege_policy import (
    REASON_WORK_PRODUCT_SIGNAL,
    evaluate_privilege_policy,
)


def test_legal_sensitive_content_not_blocked_with_local_bypass(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.setenv("CLAW_ALLOW_EXTERNAL_AI_LOCAL", "1")
    raw = "We should discuss this with our attorney before filing."
    r = run_ai_airlock(raw)
    assert r.blocked is False
    assert "non_production_bypass" in "".join(r.transformation_summary)
    assert len((r.minimized_text or "").strip()) > 0


def test_legal_sensitive_content_blocked_no_payload_leak() -> None:
    raw = "We should discuss this with our attorney before filing."
    r = run_ai_airlock(raw)
    assert r.blocked is True
    assert r.block_reason == BLOCK_REASON_PROTECTED_MODE_EXTERNAL_AI
    assert r.redacted_text == ""
    assert r.minimized_text == ""
    assert r.redacted_length == 0
    assert r.minimized_length == 0
    assert r.original_length == len(raw)
    assert "blocked_before_transform" in r.transformation_summary
    assert "policy_reason_codes:" in "".join(r.transformation_summary)
    # Must not echo raw in safe outbound fields.
    assert raw not in r.redacted_text and raw not in r.minimized_text


def test_non_sensitive_passes_redaction_and_minimization() -> None:
    raw = "Hello, this is a routine status update with no legal terms."
    r = run_ai_airlock(raw)
    assert r.blocked is False
    assert r.block_reason is None
    assert r.redacted_text == raw
    assert r.minimized_text == raw.strip()
    assert r.original_length == len(raw)
    assert r.redacted_length == len(r.redacted_text)
    assert r.minimized_length == len(r.minimized_text)
    assert "redaction_applied" in r.transformation_summary
    assert "minimization_applied" in r.transformation_summary


def test_non_sensitive_email_redacted_in_outbound() -> None:
    raw = "Contact me at user@example.com for the schedule."
    r = run_ai_airlock(raw)
    assert r.blocked is False
    assert "[EMAIL_1]" in r.redacted_text
    assert "user@example.com" not in r.minimized_text
    assert "redaction_categories:email" in r.transformation_summary


def test_empty_input() -> None:
    r = run_ai_airlock("")
    assert r.blocked is False
    assert r.block_reason is None
    assert r.original_length == 0
    assert r.redacted_text == ""
    assert r.minimized_text == ""
    assert r.redacted_length == 0
    assert r.minimized_length == 0
    assert r.transformation_summary[0] == "privilege_policy_evaluated"


def test_whitespace_only_input_treated_as_empty_policy() -> None:
    r = run_ai_airlock("   \n\t  ")
    assert r.blocked is False
    assert r.minimized_text == ""


def test_oversized_input_minimized() -> None:
    chunk = "word "
    raw = chunk * 5000
    assert "attorney" not in raw.lower()
    cap = 200
    r = run_ai_airlock(raw, max_minimized_chars=cap)
    assert r.blocked is False
    assert len(r.minimized_text) <= cap
    assert "minimization_truncated" in r.transformation_summary
    assert r.minimized_length == len(r.minimized_text)
    assert r.original_length == len(raw)


def test_airlock_allows_counsel_in_commercial_agreement_json() -> None:
    """Regression: standalone 'counsel' must not block LawDog Pro JSON (repair payloads may echo model boilerplate)."""
    import json

    blob = json.dumps(
        {
            "intake": "SaaS agreement. Each party may consult independent counsel. Delaware law.",
            "context": {"title": "Services Agreement"},
        },
        ensure_ascii=False,
    )
    r = run_ai_airlock(blob)
    assert r.blocked is False
    assert len((r.minimized_text or "").strip()) > 0


def test_transformation_metadata_coherent_when_blocked() -> None:
    r = run_ai_airlock("privileged communication under work product doctrine")
    assert r.blocked is True
    assert r.policy_decision.requires_protected_mode is True
    assert r.minimized_length <= r.redacted_length
    assert tuple(r.transformation_summary) == r.transformation_summary


def test_commercial_ip_work_product_phrase_not_blocked() -> None:
    """Ordinary services agreements reference 'work product' as IP/deliverables, not privilege doctrine."""
    raw = (
        "Duties, comp, term/termination, IP for work product, and classification-appropriate terms. "
        "Deliverables include source files and assigned copyrights."
    )
    r = run_ai_airlock(raw)
    assert r.blocked is False
    assert REASON_WORK_PRODUCT_SIGNAL not in r.policy_decision.reason_codes


def test_work_product_doctrine_still_blocks() -> None:
    r = run_ai_airlock("Memo on the work product doctrine and trial preparation materials.")
    assert r.blocked is True
    assert REASON_WORK_PRODUCT_SIGNAL in r.policy_decision.reason_codes


def test_premium_full_draft_style_json_with_employment_intent_contract_passes_airlock() -> None:
    """Mirrors POST /premium-full-draft user JSON: employment intent contract used to embed 'IP for work product'."""
    import json

    intake = (
        "I need a freelance software development agreement. Anthem Blanchard is the client. "
        "Sarah Collins is the developer. Sarah will redesign and optimize the CryptoSpaces.net website. "
        "Fee is $7,500. $3,000 upfront and $4,500 on final delivery. Start May 1, 2026. Final delivery May 31, 2026."
    )
    payload = {
        "intake": intake,
        "scenario_category": "freelancer_service",
        "scenario_category_signals": ["freelancer"],
        "intent_contract": {
            "intent_id": "employment_contractor",
            "expected_title_terms": ["Services", "Agreement"],
            "minimum_section_expectations": (
                "Duties, comp, term/termination, IP for work product, and classification-appropriate terms."
            ),
            "ambiguity_policy": "require_user_details",
            "pro_strict": True,
        },
    }
    blob = json.dumps(payload, ensure_ascii=False)
    r = run_ai_airlock(blob)
    assert r.blocked is False
    d = evaluate_privilege_policy(blob)
    assert d.requires_protected_mode is False


def test_transformation_metadata_coherent_when_allowed() -> None:
    r = run_ai_airlock("ok")
    assert r.blocked is False
    assert r.minimized_length <= r.redacted_length
    assert r.original_length >= r.redacted_length >= r.minimized_length


def test_minimize_for_airlock_deterministic() -> None:
    s = "a " * 3000
    m1 = minimize_for_airlock(s, max_chars=100)
    m2 = minimize_for_airlock(s, max_chars=100)
    assert m1 == m2
    assert len(m1) <= 100


def test_airlock_agreement_outbound_allows_lawdog_qa_saas_reseller_prompt() -> None:
    raw = (
        "Create a SaaS reseller and white-label services agreement between Redwood Peak Ventures LLC, "
        "Atlas Harbor Technologies Inc., Meridian Workforce Group LLC, Prairie Signal Holdings LP, "
        "and NovaGrid Systems LLC. Scope includes white-label deployment of workflow automation software, "
        "API integrations, onboarding support, analytics dashboards, and ongoing maintenance. "
        "Total fee $124,750 paid across 5 milestone payments tied to deployment phases. "
        "Term 18 months with automatic month-to-month renewal unless terminated with 30 days notice. "
        "Governing law Delaware. Include confidentiality, data security obligations, intellectual property "
        "ownership, limitation of liability, indemnification, uptime/service level expectations, non-solicitation, "
        "termination for cause and convenience, dispute resolution, force majeure, audit rights, and electronic signatures."
    )
    r = run_ai_airlock(raw, policy_profile="agreement_outbound")
    assert r.blocked is False
    assert len((r.minimized_text or "").strip()) > 0


def test_airlock_agreement_outbound_allows_repair_json_with_attorney_fees() -> None:
    import json

    blob = json.dumps(
        {
            "repair_task": "full_draft_rewrite_after_rejection",
            "rejected_pro_draft": {
                "document_text": "Fees. The prevailing party may recover reasonable attorney fees and costs."
            },
        },
        ensure_ascii=False,
    )
    r = run_ai_airlock(blob, policy_profile="agreement_outbound")
    assert r.blocked is False


def test_airlock_default_profile_still_blocks_standalone_settlement_word() -> None:
    r = run_ai_airlock("settlement and mutual release for both parties.")
    assert r.blocked is True


def test_airlock_agreement_outbound_blocks_litigation_strategy_memo() -> None:
    r = run_ai_airlock(
        "Draft litigation strategy and attorney-client privileged lawsuit analysis for the CFO.",
        policy_profile="agreement_outbound",
    )
    assert r.blocked is True


def test_airlock_agreement_outbound_allows_premium_full_draft_style_saas_wire() -> None:
    import json

    from backend.routers.agreements_v2_api import (
        AgreementParty,
        PremiumFullDraftContext,
        PremiumFullDraftRequest,
        build_premium_full_draft_user_payload_for_airlock,
    )
    from backend.tests.test_privilege_policy import LAWDOG_QA_SAAS_RESELLER_PROMPT

    body = PremiumFullDraftRequest(
        intake_text=LAWDOG_QA_SAAS_RESELLER_PROMPT,
        context=PremiumFullDraftContext(
            title="Web Development Agreement",
            jurisdiction="Delaware",
            parties=[AgreementParty(name="A LLC", role="party"), AgreementParty(name="B LLC", role="party")],
            agreement_family="services_agreement",
        ),
    )
    wire, _ = build_premium_full_draft_user_payload_for_airlock(body)
    r = run_ai_airlock(json.dumps(wire, ensure_ascii=False), policy_profile="agreement_outbound")
    assert r.blocked is False


def test_airlock_result_is_typed() -> None:
    r = run_ai_airlock("x")
    assert isinstance(r, AIAirlockResult)
