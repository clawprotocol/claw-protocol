"""Local stub must return contract-complete three- and four-party papers."""

from __future__ import annotations

import json

from backend.agreements.premium_full_draft_quality_gate import (
    premium_full_draft_body_meets_substance_floor,
)
from backend.llm_acceptance_stub import stub_legal_llm_completion

FOUR_PARTY_INTAKE = """
Draft a four-party precision medicine data platform agreement with separate execution blocks.
Party 1 (Platform Developer)
Lumen Bioinformatics Inc.
Represented by: Dr. Elena Vasquez
Title: Chief Science Officer
Email: elena.vasquez@lumenbio.com
Party 2 (Data Infrastructure Provider)
Thalassa Data Systems LLC
Represented by: Marcus Webb
Title: President
Email: marcus.webb@thalassadata.com
Party 3 (Analytics Integrator)
Coastal Meridian Analytics LLC
Represented by: Priya Nair
Title: Vice President of Operations
Email: priya.nair@coastalmeridian.com
Party 4 (Regulatory Compliance Advisor)
Vanguard Regulatory Sciences Ltd.
Represented by: James O'Sullivan
Title: Managing Director
Email: james.osullivan@vanguardregulatory.co
Lumen Bioinformatics Inc. receives $250,000 upon execution, $400,000 upon platform alpha delivery, and $350,000 upon validation report acceptance.
Thalassa Data Systems LLC receives $180,000 upon data pipeline readiness and $220,000 upon production cutover.
Coastal Meridian Analytics LLC receives $150,000 upon analytics module delivery and $175,000 upon user acceptance testing completion.
Vanguard Regulatory Sciences Ltd. receives $95,000 upon regulatory gap assessment and $105,000 upon audit readiness certification.
Massachusetts law governs. Nothing creates a partnership, joint venture, or employment relationship.
""".strip()

THREE_PARTY_INTAKE = """
Please draft a complete 3-party intellectual property license and royalty agreement between
Stonebridge Wellness LLC, NovaPath Learning Inc., and ClearSpring Distribution LLC.
Stonebridge Wellness LLC: 45%. NovaPath Learning Inc.: 35%. ClearSpring Distribution LLC: 20%.
Oklahoma governing law. Signers: Sandra Wells, Caleb Price, Maya Coleman.
""".strip()


def test_four_party_stub_is_not_sparse_or_harbor_paper() -> None:
    raw = stub_legal_llm_completion(
        [{"role": "user", "content": FOUR_PARTY_INTAKE}],
        call_purpose="agreement_drafting",
    )
    body = json.loads(raw)
    doc = str(body.get("document_text") or "")
    assert "PRECISION MEDICINE DATA PLATFORM AGREEMENT" in doc
    assert "Lumen Bioinformatics Inc." in doc
    assert "Thalassa Data Systems LLC" in doc
    assert "Coastal Meridian Analytics LLC" in doc
    assert "Vanguard Regulatory Sciences Ltd." in doc
    assert "Dr. Elena Vasquez" in doc
    assert "Marcus Webb" in doc
    assert "Priya Nair" in doc
    assert "James O'Sullivan" in doc
    assert "Massachusetts" in doc
    assert "$250,000" in doc
    assert "does not name a milestone payer" in doc
    assert "pays each listed milestone" not in doc
    assert "The \"Effective Date\" is the date on which the Agreement has been fully executed" not in doc
    assert "JOINT VENTURE AGREEMENT" not in doc
    assert "Harbor Peak Analytics LLC" not in doc
    assert "missing_material_info" in body
    assert body["missing_material_info"] == []
    ok, reasons = premium_full_draft_body_meets_substance_floor(
        doc,
        intake=FOUR_PARTY_INTAKE,
        context={"parties": body["parties"]},
    )
    assert ok, reasons


def test_three_party_stub_keeps_revenue_split_and_oklahoma() -> None:
    raw = stub_legal_llm_completion(
        [{"role": "user", "content": THREE_PARTY_INTAKE}],
        call_purpose="agreement_drafting",
    )
    body = json.loads(raw)
    doc = str(body.get("document_text") or "")
    assert "INTELLECTUAL PROPERTY LICENSE AND ROYALTY AGREEMENT" in doc
    assert "45% to Stonebridge Wellness LLC" in doc
    assert "35% to NovaPath Learning Inc." in doc
    assert "20% to ClearSpring Distribution LLC" in doc
    assert "Oklahoma" in doc
    assert "Sandra Wells" in doc
    assert "Caleb Price" in doc
    assert "Maya Coleman" in doc
    assert "Harbor Peak Analytics LLC" not in doc
    assert "Lumen Bioinformatics Inc." not in doc
    ok, reasons = premium_full_draft_body_meets_substance_floor(
        doc,
        intake=THREE_PARTY_INTAKE,
        context={"parties": body["parties"]},
    )
    assert ok, reasons


def test_four_party_revision_retains_owner_paper() -> None:
    current = "PRECISION MEDICINE DATA PLATFORM AGREEMENT\nLumen Bioinformatics Inc. Thalassa Data Systems LLC Coastal Meridian Analytics LLC Vanguard Regulatory Sciences Ltd. Lumen Bioinformatics Inc. pays each listed milestone amount to the named recipient."
    raw = stub_legal_llm_completion(
        [
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "intake_text": FOUR_PARTY_INTAKE,
                        "current_document_text": current,
                    }
                ),
            }
        ],
        call_purpose="explicit_revision",
    )
    body = json.loads(raw)
    assert body["document_text"] == current
    assert "pays each listed milestone" in body["document_text"]


def test_four_party_parse_and_one_pager_are_not_drafting_json() -> None:
    parsed = json.loads(
        stub_legal_llm_completion(
            [{"role": "user", "content": FOUR_PARTY_INTAKE}],
            call_purpose="structured_extraction",
        )
    )
    assert parsed["title"] == "Precision Medicine Data Platform Agreement"
    assert parsed["jurisdiction"] == "Massachusetts"
    assert "document_text" not in parsed
    one_pager = stub_legal_llm_completion(
        [{"role": "user", "content": FOUR_PARTY_INTAKE}],
        call_purpose="free_one_pager",
    )
    assert one_pager.startswith("PRECISION MEDICINE DATA PLATFORM AGREEMENT")
    assert not one_pager.lstrip().startswith("{")
    assert "does not name a milestone payer" in one_pager
    assert one_pager.count("This operational paragraph") < 4
