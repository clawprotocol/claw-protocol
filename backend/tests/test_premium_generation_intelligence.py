"""Tests for deterministic Pro generation intelligence brief."""

import json

from backend.agreements.premium_generation_intelligence import build_premium_generation_intelligence_brief
from backend.routers.agreements_v2_api import (
    AgreementParty,
    PremiumFullDraftContext,
    PremiumFullDraftRequest,
    _detect_premium_scenario_category,
    build_premium_full_draft_user_payload_for_airlock,
)
from backend.security.ai_airlock import run_ai_airlock


def test_brief_flags_contradictions() -> None:
    intake = "Exclusive license only. Also non-exclusive worldwide. Full refunds anytime. No refunds ever."
    brief = build_premium_generation_intelligence_brief(intake)
    assert len(brief["contradiction_notes"]) >= 2
    assert brief.get("drafting_rule")


def test_brief_creator_situation_line() -> None:
    brief = build_premium_generation_intelligence_brief(
        "TikTok influencer brand deal, 3 reels, whitelisting 90 days, $8k flat"
    )
    assert "creator" in brief["situation_line"].lower() or "brand" in brief["situation_line"].lower()
    assert "scope_and_deliverables" in brief["must_address"]


def test_brief_clean_release_settlement() -> None:
    brief = build_premium_generation_intelligence_brief(
        "We owe each other money from a failed partnership. Want a clean release."
    )
    assert "settlement" in brief["situation_line"].lower() or "release" in brief["situation_line"].lower()


def test_brief_appearance_release_is_creator_not_settlement() -> None:
    brief = build_premium_generation_intelligence_brief(
        "Appearance release for conference photography and promotional video worldwide."
    )
    low = brief["situation_line"].lower()
    assert "creator" in low or "brand" in low
    assert "settlement" not in low


def test_brief_crypto_situation_line() -> None:
    brief = build_premium_generation_intelligence_brief(
        "NFT purchase grants personal non-commercial display license."
    )
    assert "crypto" in brief["situation_line"].lower() or "web3" in brief["situation_line"].lower()


def test_brief_must_address_deliverables_plural_and_paid() -> None:
    brief = build_premium_generation_intelligence_brief(
        "influencer deal 3 tiktoks. paid after posting."
    )
    assert "scope_and_deliverables" in brief["must_address"]
    assert "economics_and_payment" in brief["must_address"]


def test_brief_licensing_logo_situation_line() -> None:
    brief = build_premium_generation_intelligence_brief(
        "License my logo non-exclusive worldwide forever. Also they get exclusive rights in North America."
    )
    low = brief["situation_line"].lower()
    assert "licens" in low or "ip grant" in low
    assert "exclusive" in low or "non-exclusive" in low


def test_brief_founder_breakup_situation_line() -> None:
    brief = build_premium_generation_intelligence_brief(
        "My cofounder and I are splitting badly. He can't use our customer list or code. I'm scared he'll launch a copycat."
    )
    low = brief["situation_line"].lower()
    assert "founder" in low or "co-founder" in low
    assert "confidential" in low or "ip" in low


def test_brief_five_k_must_address_economics() -> None:
    brief = build_premium_generation_intelligence_brief("Consulting agreement. $5k fixed. Deliverables in 30 days.")
    assert "economics_and_payment" in brief["must_address"]
    assert "scope_and_deliverables" in brief["must_address"]


def test_brief_emotional_tone_directive() -> None:
    brief = build_premium_generation_intelligence_brief(
        "My ex-partner ghosted me and I'm scared they'll sue — need something calm"
    )
    assert "calm" in brief["tone_directive"].lower()


def test_scenario_detects_creator_signal() -> None:
    cat, sigs = _detect_premium_scenario_category(
        "Instagram creator sponsorship with deliverables and FTC disclosure"
    )
    assert cat == "business_commercial"
    assert "creator_influencer" in sigs


def test_scenario_detects_saas_signal() -> None:
    cat, sigs = _detect_premium_scenario_category("B2B SaaS subscription with API access and monthly fees")
    assert cat == "business_commercial"
    assert "saas_platform" in sigs


def test_user_payload_includes_brief_and_passes_airlock() -> None:
    intake = "Exclusive TikTok campaign. Also non-exclusive. $8k flat. FTC disclosure required."
    body = PremiumFullDraftRequest(
        intake_text=intake,
        context=PremiumFullDraftContext(
            title="Influencer Marketing Agreement",
            jurisdiction="California",
            parties=[AgreementParty(name="Brand Co", role="party"), AgreementParty(name="Creator", role="party")],
            purpose="Paid posts",
            payment_terms="$8,000 flat",
            duration="90 days",
            agreement_family="services_agreement",
        ),
    )
    user_payload, _ctx = build_premium_full_draft_user_payload_for_airlock(body)
    brief = user_payload.get("generation_intelligence_brief") or {}
    assert brief.get("situation_line")
    assert brief.get("contradiction_notes")
    wire = json.dumps(user_payload, ensure_ascii=False)
    assert run_ai_airlock(wire, policy_profile="agreement_outbound").blocked is False
