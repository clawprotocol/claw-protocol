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


def test_agreement_outbound_allows_exact_saas_reseller_qa_prompt() -> None:
    d = evaluate_privilege_policy(LAWDOG_QA_SAAS_RESELLER_PROMPT, policy_profile="agreement_outbound")
    assert d.requires_protected_mode is False
    assert d.allow_external_ai is True
    assert d.reason_codes == ()


def test_agreement_outbound_allows_commercial_dispute_boilerplate() -> None:
    text = (
        "SaaS agreement: indemnify, defend, and hold harmless; third-party claims, damages, and losses; "
        "reasonable attorneys’ fees; exclusive jurisdiction and venue in Delaware courts; "
        "dispute resolution through mediation then binding arbitration; limitation of liability; "
        "governing law; litigation costs; any lawsuit between the parties shall be brought only in said courts; "
        "each party may retain counsel of its choosing."
    )
    d = evaluate_privilege_policy(text, policy_profile="agreement_outbound")
    assert d.requires_protected_mode is False
    assert d.reason_codes == ()


def test_agreement_outbound_still_blocks_high_signal_litigation_strategy() -> None:
    for text in (
        "Draft our litigation strategy for the board.",
        "Prepare discovery strategy before we meet opposing counsel.",
        "This is pending lawsuit material and active litigation notes.",
        "Attorney-client privilege applies to this analysis.",
        "Memo on the work product doctrine.",
        "Follow the litigation hold and deposition preparation checklist.",
    ):
        d = evaluate_privilege_policy(text, policy_profile="agreement_outbound")
        assert d.requires_protected_mode is True, text


def test_agreement_outbound_allows_privileged_and_confidential_without_memo_phrase() -> None:
    d = evaluate_privilege_policy(
        "All information marked as privileged and confidential shall be protected.",
        policy_profile="agreement_outbound",
    )
    assert d.requires_protected_mode is False
    assert d.reason_codes == ()


def test_defense_strategy_and_claim_analysis_still_block_default_profile() -> None:
    for text in (
        "We need a defense strategy before the witness interview.",
        "Attach the claim analysis spreadsheet.",
    ):
        d = evaluate_privilege_policy(text, policy_profile="default")
        assert d.requires_protected_mode is True, text


def test_agreement_outbound_allows_defense_strategy_security_usage() -> None:
    """“Defense strategy” alone is intake-heavy; outbound allows security / commercial phrasing."""
    d = evaluate_privilege_policy(
        "Vendor shall implement a layered defense strategy for endpoints and cloud configuration.",
        policy_profile="agreement_outbound",
    )
    assert d.requires_protected_mode is False


def test_agreement_outbound_allows_legal_memo_word_outbound() -> None:
    d = evaluate_privilege_policy(
        "The parties acknowledge this is not a legal memo or regulatory filing.",
        policy_profile="agreement_outbound",
    )
    assert d.requires_protected_mode is False


def test_premium_full_draft_user_wire_airlock_allows_qa_saas_prompt() -> None:
    """Same JSON assembly as POST /premium-full-draft user message must pass agreement_outbound airlock."""
    import json

    from backend.routers.agreements_v2_api import (
        AgreementParty,
        PremiumFullDraftContext,
        PremiumFullDraftRequest,
        build_premium_full_draft_user_payload_for_airlock,
    )
    from backend.security.ai_airlock import run_ai_airlock

    body = PremiumFullDraftRequest(
        intake_text=LAWDOG_QA_SAAS_RESELLER_PROMPT,
        context=PremiumFullDraftContext(
            title="Web Development Agreement",
            jurisdiction="Delaware",
            parties=[
                AgreementParty(name="Redwood Peak Ventures LLC", role="party"),
                AgreementParty(name="Atlas Harbor Technologies Inc.", role="party"),
            ],
            purpose="Reseller and white-label services",
            payment_terms="$124,750 milestones",
            duration="18 months",
            agreement_family="services_agreement",
            material_asks=["confidentiality", "indemnification", "dispute resolution", "audit rights"],
            deterministic_intent_id="web_presence",
            intent_contract={
                "intent_id": "software_web_dev",
                "minimum_section_expectations": "Build scope, acceptance, change orders, IP, warranty/support, fees.",
                "user_fact_summary": LAWDOG_QA_SAAS_RESELLER_PROMPT[:900],
                "pro_strict": True,
            },
        ),
    )
    user_payload, _ctx = build_premium_full_draft_user_payload_for_airlock(body)
    wire = json.dumps(user_payload, ensure_ascii=False)
    r = run_ai_airlock(wire, policy_profile="agreement_outbound")
    assert r.blocked is False


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
        "Notes from yesterday's deposition on the customer claim.",
    ):
        d = evaluate_privilege_policy(text, policy_profile="agreement_outbound")
        assert d.requires_protected_mode is True, text


def test_litigation_and_lawsuit_standalone_allowed_under_agreement_outbound() -> None:
    """Forum / fee-shifting boilerplate uses standalone litigation/lawsuit tokens."""
    for text in (
        "Disputes may be brought in any court of competent jurisdiction; the parties consent to litigation costs allocation.",
        "Each party waives any right to a jury trial for disputes arising out of this agreement, including any lawsuit between the parties.",
        "Governing law Delaware; exclusive venue in state or federal courts; mediation and arbitration as optional steps before litigation.",
    ):
        d = evaluate_privilege_policy(text, policy_profile="agreement_outbound")
        assert d.requires_protected_mode is False, text
        assert d.reason_codes == (), text


def test_commercial_boilerplate_terms_allowed_agreement_outbound() -> None:
    d = evaluate_privilege_policy(
        "Include reasonable attorneys' fees for the prevailing party, indemnification, audit rights, "
        "limitation of liability, termination for cause, governing law New York, dispute resolution, "
        "mediation, arbitration, and jurisdiction in the courts of New York County.",
        policy_profile="agreement_outbound",
    )
    assert d.requires_protected_mode is False
    assert d.reason_codes == ()


def test_deposition_still_blocks_under_agreement_outbound() -> None:
    d = evaluate_privilege_policy(
        "Prepare for the deposition next Tuesday and circulate the outline.",
        policy_profile="agreement_outbound",
    )
    assert REASON_LITIGATION_SIGNAL in d.reason_codes


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
