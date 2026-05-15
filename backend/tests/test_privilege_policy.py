"""Tests for deterministic privilege-oriented workflow classification."""

from backend.security.privilege_policy import (
    REASON_LEGAL_SENSITIVE_TERM,
    REASON_LITIGATION_SIGNAL,
    REASON_PRIVILEGE_CANDIDATE_TERM,
    REASON_WORK_PRODUCT_SIGNAL,
    PrivilegePolicyDecision,
    evaluate_privilege_policy,
    first_privilege_airlock_block_diagnostic,
)


def test_litigation_sensitive_text() -> None:
    text = (
        "The plaintiff filed a lawsuit; we need discovery responses "
        "before meeting opposing counsel."
    )
    d = evaluate_privilege_policy(text)
    assert d.is_legal_sensitive is True
    assert d.requires_protected_mode is True
    assert d.allow_external_ai is False
    assert d.allow_raw_upload_to_ai is False
    assert REASON_LITIGATION_SIGNAL in d.reason_codes


def test_commercial_agreement_counsel_phrase_not_protected_mode() -> None:
    """Routine B2B drafting often mentions counsel; must not trip protected-mode external-AI block."""
    text = (
        "SaaS reseller agreement. Each party may consult independent counsel. "
        "Include confidentiality, indemnification, and dispute resolution."
    )
    d = evaluate_privilege_policy(text)
    assert d.requires_protected_mode is False
    assert d.allow_external_ai is True
    assert REASON_LEGAL_SENSITIVE_TERM not in d.reason_codes


def test_commercial_non_legal_text() -> None:
    text = (
        "Q4 revenue targets, enterprise pricing, and channel partner "
        "discounts for the rollout."
    )
    d = evaluate_privilege_policy(text)
    assert d == PrivilegePolicyDecision(
        is_legal_sensitive=False,
        is_privileged_candidate=False,
        requires_protected_mode=False,
        allow_external_ai=True,
        allow_raw_upload_to_ai=True,
        reason_codes=(),
    )


def test_mixed_text_one_strong_litigation_signal() -> None:
    text = (
        "Ship the plaintiff-facing analytics tile by Friday; "
        "focus on conversion metrics and SKU velocity."
    )
    d = evaluate_privilege_policy(text)
    assert d.is_legal_sensitive is True
    assert REASON_LITIGATION_SIGNAL in d.reason_codes
    assert d.requires_protected_mode is True


def test_empty_and_whitespace() -> None:
    assert evaluate_privilege_policy("") == PrivilegePolicyDecision(
        is_legal_sensitive=False,
        is_privileged_candidate=False,
        requires_protected_mode=False,
        allow_external_ai=True,
        allow_raw_upload_to_ai=True,
        reason_codes=(),
    )
    assert evaluate_privilege_policy("   \n\t  ") == PrivilegePolicyDecision(
        is_legal_sensitive=False,
        is_privileged_candidate=False,
        requires_protected_mode=False,
        allow_external_ai=True,
        allow_raw_upload_to_ai=True,
        reason_codes=(),
    )


def test_casing_variation() -> None:
    d = evaluate_privilege_policy("ATTORNEY-CLIENT WORK PRODUCT DOCTRINE draft")
    assert d.is_legal_sensitive is True
    assert REASON_LEGAL_SENSITIVE_TERM in d.reason_codes
    assert REASON_WORK_PRODUCT_SIGNAL in d.reason_codes
    assert d.is_privileged_candidate is True


def test_multiple_categories_sorted_reason_codes() -> None:
    text = (
        "Privileged notes on work product doctrine; coordinate litigation "
        "with outside counsel per the legal memo."
    )
    d = evaluate_privilege_policy(text)
    assert d.is_legal_sensitive is True
    assert d.is_privileged_candidate is True
    expected = sorted(
        {
            REASON_LEGAL_SENSITIVE_TERM,
            REASON_LITIGATION_SIGNAL,
            REASON_PRIVILEGE_CANDIDATE_TERM,
            REASON_WORK_PRODUCT_SIGNAL,
        }
    )
    assert list(d.reason_codes) == expected


LAWDOG_QA_SAAS_RESELLER_PROMPT = (
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


def test_lawdog_qa_saas_reseller_prompt_allowed_under_agreement_outbound_profile() -> None:
    d = evaluate_privilege_policy(LAWDOG_QA_SAAS_RESELLER_PROMPT, policy_profile="agreement_outbound")
    assert d.requires_protected_mode is False
    assert d.allow_external_ai is True
    assert d.reason_codes == ()


def test_settlement_single_word_default_profile_triggers_litigation() -> None:
    d = evaluate_privilege_policy("settlement and mutual release for both parties.", policy_profile="default")
    assert REASON_LITIGATION_SIGNAL in d.reason_codes
    assert d.requires_protected_mode is True


def test_settlement_single_word_agreement_outbound_profile_allows() -> None:
    d = evaluate_privilege_policy("settlement and mutual release for both parties.", policy_profile="agreement_outbound")
    assert REASON_LITIGATION_SIGNAL not in d.reason_codes
    assert d.allow_external_ai is True


def test_plaintiff_still_blocks_under_agreement_outbound_profile() -> None:
    d = evaluate_privilege_policy(
        "SaaS agreement; plaintiff alleges breach by vendor.",
        policy_profile="agreement_outbound",
    )
    assert REASON_LITIGATION_SIGNAL in d.reason_codes
    assert d.requires_protected_mode is True


def test_standalone_attorney_word_still_blocks_default_profile() -> None:
    d = evaluate_privilege_policy("We should discuss this with our attorney before filing.")
    assert REASON_LEGAL_SENSITIVE_TERM in d.reason_codes
    assert d.requires_protected_mode is True


def test_reasonable_attorney_fees_boilerplate_allowed_agreement_outbound() -> None:
    """Repair JSON often echoes operative fee-shifting language with a standalone 'attorney' token."""
    d = evaluate_privilege_policy(
        "The prevailing party shall recover reasonable attorney fees and costs.",
        policy_profile="agreement_outbound",
    )
    assert d.requires_protected_mode is False
    assert d.allow_external_ai is True
    assert d.reason_codes == ()


def test_opposing_counsel_subpoena_privileged_memo_lawsuit_strategy_blocked_outbound() -> None:
    for text in (
        "Include a meeting with opposing counsel next week.",
        "Respond to the subpoena for customer records.",
        "Privileged legal memo summarizing exposure.",
        "Outline lawsuit strategy for the board.",
    ):
        d = evaluate_privilege_policy(text, policy_profile="agreement_outbound")
        assert d.requires_protected_mode is True, text


def test_first_privilege_airlock_block_diagnostic_stable_ids() -> None:
    diag = first_privilege_airlock_block_diagnostic("contact my attorney", policy_profile="default")
    assert diag is not None
    assert diag.reason_code == REASON_LEGAL_SENSITIVE_TERM
    assert diag.rule_category == "legal_sensitive_word"
    assert diag.matched_rule_id == "legal_sensitive_word:attorney"

    d2 = first_privilege_airlock_block_diagnostic(
        "Meet opposing counsel next Tuesday.", policy_profile="agreement_outbound"
    )
    assert d2 is not None
    assert d2.rule_category == "litigation_phrase"
    assert d2.matched_rule_id == "litigation_phrase:opposing_counsel"
