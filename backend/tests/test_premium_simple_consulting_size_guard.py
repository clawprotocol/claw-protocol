"""Simple Paid Pro consulting — length profile detection and quality gate."""

from __future__ import annotations

from typing import Any, Dict

import pytest

from backend.agreements.premium_full_draft_quality_gate import evaluate_premium_full_draft_quality
from backend.agreements.premium_simple_consulting_size_guard import (
    SIMPLE_CONSULTING_HARD_MAX_CHARS,
    SIMPLE_CONSULTING_PROFILE,
    append_simple_consulting_repair_directives,
    count_numbered_top_level_sections,
    enrich_user_payload_for_simple_consulting,
    evaluate_simple_consulting_document_length,
    is_simple_paid_pro_consulting_engagement,
)
from backend.routers.agreements_v2_api import (
    PremiumFullDraftRequest,
    build_premium_full_draft_user_payload_for_airlock,
)

pytestmark = pytest.mark.unit

TEST248_STYLE_INTAKE = (
    "I need a simple consulting agreement. Client is Acme Corp in California. "
    "Consultant is Jane Doe LLC. Fixed fee $8,500 for strategy and implementation "
    "support through December 2026. IP stays with client. Mutual confidentiality."
)


def _ctx() -> Dict[str, Any]:
    return {
        "title": "Consulting Services Agreement",
        "jurisdiction": "California",
        "parties": [
            {"name": "Acme Corp", "role": "Client"},
            {"name": "Jane Doe LLC", "role": "Consultant"},
        ],
        "purpose": "Strategy and implementation consulting.",
        "payment_terms": "8500 USD flat",
        "agreement_family": "services_agreement",
    }


def _acceptable_consulting_body() -> str:
    sections = [
        "CONSULTING SERVICES AGREEMENT\n",
        "1. PARTIES. Acme Corp and Jane Doe LLC.",
        "2. SCOPE. Strategy and implementation support through December 2026.",
        "3. COMPENSATION. Client pays a fixed fee of $8,500 upon execution.",
        "4. INTELLECTUAL PROPERTY. Deliverables vest in Client upon payment.",
        "5. CONFIDENTIALITY. Mutual obligations for two years.",
        "6. TERM AND TERMINATION. Either party may terminate on 14 days notice.",
        "7. LIMITATION OF LIABILITY. Cap at fees paid except gross negligence.",
        "8. GOVERNING LAW. California law; courts in San Francisco County.",
        "9. NOTICES. Email to designated business contacts.",
        "10. SIGNATURES. IN WITNESS WHEREOF the parties execute below.",
    ]
    body = "\n\n".join(sections)
    while len(body) < 6200:
        body += "\n\nOperative detail on deliverables, acceptance, and professional standards."
    assert 6000 <= len(body) <= SIMPLE_CONSULTING_HARD_MAX_CHARS
    return body


def _bloated_consulting_body() -> str:
    body = _acceptable_consulting_body()
    while len(body) < 17_000:
        body += "\n\n11. ENTERPRISE MSA RIDER. SOC2, PCI, and arbitration treatise padding.\n"
    return body


class TestSimpleConsultingDetection:
    def test_test248_style_intake_is_simple_consulting(self) -> None:
        assert is_simple_paid_pro_consulting_engagement(
            TEST248_STYLE_INTAKE,
            _ctx(),
            scenario_category="freelancer_service",
        )

    def test_complex_intake_not_simple(self) -> None:
        assert not is_simple_paid_pro_consulting_engagement(
            "We need a merger agreement with stock options and HIPAA.",
            _ctx(),
            scenario_category="business_commercial",
        )


class TestSimpleConsultingLengthEvaluation:
    def test_rejects_excessive_simple_consulting_length(self) -> None:
        ok, reasons = evaluate_simple_consulting_document_length(
            _bloated_consulting_body(),
            intake=TEST248_STYLE_INTAKE,
            context=_ctx(),
            scenario_category="freelancer_service",
        )
        assert ok is False
        assert any("simple_consulting_excessive_length" in r for r in reasons)

    def test_accepts_target_band_document(self) -> None:
        ok, reasons = evaluate_simple_consulting_document_length(
            _acceptable_consulting_body(),
            intake=TEST248_STYLE_INTAKE,
            context=_ctx(),
            scenario_category="freelancer_service",
        )
        assert ok is True
        assert reasons == []

    def test_quality_gate_rejects_bloat_for_simple_consulting(self) -> None:
        ok, reasons = evaluate_premium_full_draft_quality(
            intake=TEST248_STYLE_INTAKE,
            context=_ctx(),
            draft_title="Consulting Services Agreement",
            draft_family="services",
            draft_document_text=_bloated_consulting_body(),
            scenario_category="freelancer_service",
        )
        assert ok is False
        assert any("simple_consulting_excessive_length" in r for r in reasons)

    def test_quality_gate_passes_right_sized_simple_consulting(self) -> None:
        doc = _acceptable_consulting_body()
        ok, reasons = evaluate_premium_full_draft_quality(
            intake=TEST248_STYLE_INTAKE,
            context=_ctx(),
            draft_title="Consulting Services Agreement",
            draft_family="services",
            draft_document_text=doc,
            scenario_category="freelancer_service",
        )
        assert ok is True
        assert not any("simple_consulting" in r for r in reasons)


class TestSimpleConsultingPayloadEnrichment:
    def test_airlock_payload_includes_length_profile(self) -> None:
        body = PremiumFullDraftRequest(
            intake_text=TEST248_STYLE_INTAKE,
            context=_ctx(),
        )
        payload, _ = build_premium_full_draft_user_payload_for_airlock(body)
        assert payload.get("document_length_profile") == SIMPLE_CONSULTING_PROFILE
        assert payload.get("target_document_char_band")
        assert payload.get("length_discipline_directive")

    def test_repair_payload_gets_length_directive(self) -> None:
        out = append_simple_consulting_repair_directives(
            {"rejection_reasons": ["simple_consulting_excessive_length:17000>12000"]},
            ["simple_consulting_excessive_length:17000>12000"],
        )
        assert out.get("length_repair_directive")


class TestSectionCount:
    def test_counts_top_level_numbered_sections(self) -> None:
        doc = "1. One\n1.1 Sub\n2. Two\n3. Three\n"
        assert count_numbered_top_level_sections(doc) == 3
