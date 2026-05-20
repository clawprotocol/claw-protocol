"""
Free vs Pro output QA — deterministic layers only (no OpenAI).

Validates Pro-only intelligence brief injection and priority fixture signals.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.agreements.premium_generation_intelligence import build_premium_generation_intelligence_brief
from backend.routers.agreements_v2_api import (
    AgreementParty,
    PremiumFullDraftContext,
    PremiumFullDraftRequest,
    build_premium_full_draft_user_payload_for_airlock,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = REPO_ROOT / "qa" / "fixtures"

PRIORITY_IDS = (
    "creator-001",
    "messy-004",
    "short-002",
    "contra-001",
    "emo-001",
    "crypto-001",
    "short-001",
    "emo-003",
    "short-003",
)


def _load_fixture(fid: str) -> dict:
    for path in FIXTURE_DIR.glob("*.json"):
        rows = json.loads(path.read_text(encoding="utf-8"))
        for row in rows:
            if row.get("id") == fid:
                return row
    raise KeyError(fid)


@pytest.mark.parametrize("fixture_id", PRIORITY_IDS)
def test_priority_fixture_brief_has_core_fields(fixture_id: str) -> None:
    row = _load_fixture(fixture_id)
    brief = build_premium_generation_intelligence_brief(row["prompt"])
    assert brief.get("situation_line")
    assert brief.get("tone_directive")
    assert isinstance(brief.get("must_address"), list)


def test_pro_payload_includes_generation_intelligence_brief() -> None:
    row = _load_fixture("creator-001")
    body = PremiumFullDraftRequest(
        intake_text=row["prompt"],
        context=PremiumFullDraftContext(
            title="Influencer Marketing Agreement",
            jurisdiction="California",
            parties=[AgreementParty(name="Brand", role="party"), AgreementParty(name="Creator", role="party")],
            purpose="UGC",
            payment_terms="TBD",
            duration="90 days",
            agreement_family="services_agreement",
        ),
    )
    payload, _ = build_premium_full_draft_user_payload_for_airlock(body)
    brief = payload.get("generation_intelligence_brief") or {}
    assert brief.get("situation_line")
    assert "creator" in brief["situation_line"].lower() or "brand" in brief["situation_line"].lower()


def test_crypto_fixture_gets_cautious_crypto_line() -> None:
    row = _load_fixture("crypto-001")
    brief = build_premium_generation_intelligence_brief(row["prompt"])
    line = brief["situation_line"].lower()
    assert "crypto" in line or "web3" in line
    assert "securities" in line or "compliance" in line
    assert "invest" not in line


def test_emotional_fixture_gets_calm_tone_directive() -> None:
    row = _load_fixture("emo-001")
    brief = build_premium_generation_intelligence_brief(row["prompt"])
    assert "calm" in brief["tone_directive"].lower()


def test_contradictory_fixture_gets_contradiction_notes_and_drafting_rule() -> None:
    row = _load_fixture("contra-001")
    brief = build_premium_generation_intelligence_brief(row["prompt"])
    assert len(brief.get("contradiction_notes") or []) >= 1
    assert brief.get("drafting_rule")


def test_saas_fixture_gets_saas_situation_line() -> None:
    row = _load_fixture("short-002")
    brief = build_premium_generation_intelligence_brief(row["prompt"])
    low = brief["situation_line"].lower()
    assert any(k in low for k in ("software", "subscription", "saas", "b2b"))


def test_settlement_fixture_gets_release_situation_line() -> None:
    row = _load_fixture("emo-003")
    brief = build_premium_generation_intelligence_brief(row["prompt"])
    low = brief["situation_line"].lower()
    assert "settlement" in low or "release" in low


def test_nda_fixture_gets_confidentiality_situation_line() -> None:
    row = _load_fixture("short-001")
    brief = build_premium_generation_intelligence_brief(row["prompt"])
    low = brief["situation_line"].lower()
    assert "confidential" in low or "nda" in low


def test_contra_001_licensing_situation_and_contradiction() -> None:
    row = _load_fixture("contra-001")
    brief = build_premium_generation_intelligence_brief(row["prompt"])
    assert "licens" in brief["situation_line"].lower() or "ip grant" in brief["situation_line"].lower()
    assert len(brief.get("contradiction_notes") or []) >= 1


def test_emo_001_founder_situation_and_calm_tone() -> None:
    row = _load_fixture("emo-001")
    brief = build_premium_generation_intelligence_brief(row["prompt"])
    assert "founder" in brief["situation_line"].lower() or "co-founder" in brief["situation_line"].lower()
    assert "calm" in brief["tone_directive"].lower()


def test_short_003_economics_must_address() -> None:
    row = _load_fixture("short-003")
    brief = build_premium_generation_intelligence_brief(row["prompt"])
    assert "economics_and_payment" in brief["must_address"]
