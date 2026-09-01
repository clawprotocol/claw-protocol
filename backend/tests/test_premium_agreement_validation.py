"""Deterministic premium agreement draft validation regression tests."""

from backend.agreements.premium_agreement_validation import validatePremiumAgreementDraft


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
        },
        "ambiguities": [],
        "conflicts": [],
        "missing_material_terms": [],
        "recommended_questions": [],
        "quality_flags": [],
    }


def _valid_minimal() -> str:
    return """
Services Agreement

This Agreement is between Red Mesa Logistics LLC ("Client") and Harbor Peak Automation LLC ("Service Provider").
Service Provider will provide automation consulting services and deliver the agreed workflow configuration.
Client will pay Service Provider $10,000 for the services. The parties agree to cooperate and perform their obligations.
This Agreement is governed by Texas law.
The parties may sign this Agreement electronically, and signatures show acceptance.
""".strip()


def test_minimal_valid_agreement_passes_with_minimum_elements_true() -> None:
    result = validatePremiumAgreementDraft(
        authoritativeDraft=_valid_minimal(),
        agreementIntelligence=_intel(),
        originalIntake="Texas law. Red Mesa pays Harbor Peak $10,000 for automation services. Electronic signatures.",
    )

    assert result.passed is True
    assert result.minimum_contract_elements.identifiable_parties is True
    assert result.minimum_contract_elements.agreement_purpose_or_scope is True
    assert result.minimum_contract_elements.exchange_of_value_or_consideration is True
    assert result.minimum_contract_elements.obligations_or_performance is True
    assert result.minimum_contract_elements.execution_or_acceptance_mechanism is True


def test_enterprise_detailed_agreement_passes_cleanly() -> None:
    draft = """
AI Automation Services Agreement

1. Parties and Purpose
This Agreement is between Red Mesa Logistics LLC ("Client") and Harbor Peak Automation LLC ("Service Provider").
Service Provider will design, configure, and support AI automation workflows for Client's logistics operations.

2. Fees and Milestones
Client will pay a total fee of $95,000: 50% at kickoff, 25% at rollout, and 25% at acceptance. Optional support is $4,500 per month if elected in writing.

3. Ownership and Background Materials
Client owns paid deliverables after payment. Service Provider retains pre-existing tools, templates, and know-how.

4. Confidentiality
Each party will protect non-public information and use it only to perform this Agreement.

5. Third-Party AI Platforms
Service Provider does not guarantee the uptime of third-party AI platforms or external APIs.

6. Termination and Notices
Either party may terminate for material breach after written notice and a reasonable cure period. Notices may be sent by email.

7. Governing Law
Texas law governs this Agreement.

8. Electronic Signatures
Electronic signatures and counterparts are permitted and evidence acceptance by the parties.
""".strip()
    result = validatePremiumAgreementDraft(
        authoritativeDraft=draft,
        agreementIntelligence=_intel(),
        originalIntake=(
            "Red Mesa Logistics LLC / Harbor Peak Automation LLC, $95,000 fee split 50/25/25, "
            "$4,500/mo optional support, Texas law, confidentiality, email notices, ownership, "
            "third-party AI no uptime guarantee, electronic signatures."
        ),
    )

    assert result.passed is True
    assert result.failures == []


def test_empty_confidentiality_heading_fails() -> None:
    draft = _valid_minimal() + "\n\n4. Confidentiality\n\n5. Termination\nEither party may terminate by notice."
    result = validatePremiumAgreementDraft(
        authoritativeDraft=draft,
        agreementIntelligence=_intel(),
        originalIntake="Texas law. Confidentiality requested.",
    )

    assert any(f.code == "empty_required_section" and f.section == "4. Confidentiality" for f in result.failures)


def test_governing_law_customer_dump_order_is_not_silently_dropped() -> None:
    """Intake form ``governing law Oklahoma`` must be treated as a supplied term."""
    draft = _valid_minimal().replace("This Agreement is governed by Texas law.", "The parties will confirm venue later.")
    intel = _intel()
    intel["extracted_terms"]["governing_law"] = ""
    result = validatePremiumAgreementDraft(
        authoritativeDraft=draft,
        agreementIntelligence=intel,
        originalIntake=(
            "Cedar Ridge LLC is hiring Maple Grove Inc to design a logo and brand kit "
            "for $2,400, term 30 days, governing law Oklahoma."
        ),
    )
    assert any(f.code == "governing_law_missing_or_mismatch" for f in result.failures)


def test_governing_law_supplied_but_draft_to_be_agreed_fails() -> None:
    draft = _valid_minimal().replace("This Agreement is governed by Texas law.", "Governing law: to be agreed.")
    result = validatePremiumAgreementDraft(
        authoritativeDraft=draft,
        agreementIntelligence=_intel(),
        originalIntake="Texas governing law.",
    )

    assert any(f.code in {"governing_law_placeholder", "placeholder_tbd"} for f in result.failures)


def test_total_fee_of_total_fee_fails() -> None:
    result = validatePremiumAgreementDraft(
        authoritativeDraft=_valid_minimal() + "\nClient shall pay a total fee of total fee.",
        agreementIntelligence=_intel(),
        originalIntake="Texas law. $10,000 fee.",
    )

    assert any(f.code == "duplicated_total_fee_phrase" for f in result.failures)


def test_applicable_party_fallback_fails() -> None:
    result = validatePremiumAgreementDraft(
        authoritativeDraft=_valid_minimal() + "\nThe applicable Party shall insert the correct obligation.",
        agreementIntelligence=_intel(),
        originalIntake="Texas law.",
    )

    assert any(f.code == "fallback_applicable_party" for f in result.failures)


def test_duplicate_fee_structures_fail_or_warn() -> None:
    draft = _valid_minimal() + "\nInvoices are due Net 15. Later invoices are due Net 45."
    result = validatePremiumAgreementDraft(
        authoritativeDraft=draft,
        agreementIntelligence=_intel(),
        originalIntake="Texas law. Pay $10,000.",
    )

    codes = {f.code for f in result.failures} | {w.code for w in result.warnings}
    assert "conflicting_payment_timing" in codes


def test_repeated_scope_bullets_warn_or_fail() -> None:
    repeated = "\n".join(
        [
            "- Provider will configure the same automation workflow scope bullet for the client operations.",
            "- Provider will configure the same automation workflow scope bullet for the client operations.",
            "- Provider will configure the same automation workflow scope bullet for the client operations.",
        ]
    )
    result = validatePremiumAgreementDraft(
        authoritativeDraft=_valid_minimal() + "\n\nOwnership\n" + repeated,
        agreementIntelligence=_intel(),
        originalIntake="Texas law. Ownership allocation requested.",
    )

    codes = {f.code for f in result.failures} | {w.code for w in result.warnings}
    assert "repeated_artifact_text" in codes


def test_missing_signature_execution_structure_sets_minimum_false() -> None:
    draft = _valid_minimal().replace(
        "The parties may sign this Agreement electronically, and signatures show acceptance.",
        "The parties understand the terms above.",
    )
    result = validatePremiumAgreementDraft(
        authoritativeDraft=draft,
        agreementIntelligence=_intel(),
        originalIntake="Texas law.",
    )

    assert result.minimum_contract_elements.execution_or_acceptance_mechanism is False
    assert any("execution_or_acceptance_mechanism" in f.code for f in result.failures)


def test_malformed_intelligence_object_runs_safely_without_crash() -> None:
    result = validatePremiumAgreementDraft(
        authoritativeDraft=_valid_minimal(),
        agreementIntelligence={"extracted_terms": {"parties": "bad-shape"}},
        originalIntake="Texas law. Red Mesa and Harbor Peak sign automation services.",
    )

    assert result.summary.failure_count >= 0
    assert isinstance(result.passed, bool)

