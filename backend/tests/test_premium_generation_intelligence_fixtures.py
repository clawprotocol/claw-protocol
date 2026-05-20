"""
Fixture-driven regression for build_premium_generation_intelligence_brief.

Loads qa/fixtures/*.json (no LLM calls). Curated IDs have hard expectations;
a soft audit lists prompts whose brief is weak vs fixture tags.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, TypedDict

import pytest

from backend.agreements.premium_generation_intelligence import build_premium_generation_intelligence_brief

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = REPO_ROOT / "qa" / "fixtures"

FIXTURE_FILES = (
    "creator-economy-prompts.json",
    "messy-prompts.json",
    "contradictory-prompts.json",
    "emotional-prompts.json",
    "crypto-prompts.json",
    "short-prompts.json",
)


class BriefExpectation(TypedDict, total=False):
    situation_any: List[str]
    tone_calm: bool
    min_contradictions: int
    requires_drafting_rule: bool
    must_address_any: List[str]


# Curated coverage: creator, SaaS, settlement, NDA, contradiction, emotional (+ sanity samples).
CURATED_EXPECTATIONS: Dict[str, BriefExpectation] = {
    # Creator / influencer
    "creator-001": {
        "situation_any": ["creator", "brand", "deliverable", "usage", "disclosure"],
        "must_address_any": ["scope_and_deliverables"],
    },
    "messy-004": {
        "situation_any": ["creator", "brand", "deliverable", "usage"],
        "must_address_any": ["scope_and_deliverables", "economics_and_payment"],
    },
    "creator-002": {"situation_any": ["creator", "brand", "disclosure"]},
    "creator-004": {"situation_any": ["creator", "brand", "deliverable", "usage"]},
    "creator-005": {"situation_any": ["creator", "brand"]},
    "short-005": {"situation_any": ["settlement", "release"]},
    "short-003": {"must_address_any": ["scope_and_deliverables", "economics_and_payment"]},
    "crypto-001": {"situation_any": ["crypto", "web3", "compliance"]},
    "short-004": {
        "situation_any": ["creator", "brand", "deliverable"],
    },
    # SaaS
    "short-002": {
        "situation_any": ["software", "subscription", "saas", "b2b", "access", "termination"],
    },
    "messy-002": {
        "situation_any": ["software", "subscription", "saas", "b2b", "access"],
    },
    "contra-002": {
        "situation_any": ["software", "subscription", "saas", "b2b"],
        "min_contradictions": 1,
        "requires_drafting_rule": True,
    },
    # Settlement / release
    "emo-003": {
        "situation_any": ["settlement", "release"],
    },
    # NDA
    "short-001": {
        "situation_any": ["confidential", "nda"],
        "must_address_any": ["governing_law_venue"],
    },
    # Contradictions
    "contra-001": {
        "min_contradictions": 1,
        "requires_drafting_rule": True,
    },
    "contra-003": {
        "min_contradictions": 1,
        "requires_drafting_rule": True,
    },
    "contra-005": {
        "min_contradictions": 1,
        "requires_drafting_rule": True,
    },
    # Emotional / high-stakes tone
    "emo-001": {"tone_calm": True},
    "emo-004": {"tone_calm": True},
    "emo-002": {"tone_calm": True},  # thanksgiving — calm tone path
}

# Tag → situation_line keywords (soft audit only).
TAG_SITUATION_HINTS: Dict[str, List[str]] = {
    "creator": ["creator", "brand", "ugc", "deliverable", "influencer", "sponsorship", "paid creator"],
    "saas": ["software", "subscription", "saas", "b2b", "platform", "access scope"],
    "settlement": ["settlement", "release"],
    "nda": ["confidential", "nda"],
    "contradictory": [],  # handled via contradiction_notes
}

# Known weak briefs vs tags — document gaps; do not fail CI unless product should fix.
KNOWN_WEAK_FIXTURE_IDS = frozenset(
    {
        "emo-001",  # tagged nda in fixture; brief is founder-shaped (tag mismatch only)
        "emo-002",  # tagged settlement; family loan without release vocabulary
        "emo-005",  # tagged saas; vendor security addendum without SaaS vocabulary
    }
)


def _load_all_fixtures() -> Dict[str, Dict[str, Any]]:
    by_id: Dict[str, Dict[str, Any]] = {}
    for name in FIXTURE_FILES:
        path = FIXTURE_DIR / name
        if not path.is_file():
            pytest.skip(f"fixture file missing: {path}")
        rows = json.loads(path.read_text(encoding="utf-8"))
        assert isinstance(rows, list), f"{name} must be a JSON array"
        for row in rows:
            fid = row.get("id")
            assert fid, f"{name}: row missing id"
            by_id[str(fid)] = {**row, "_source_file": name}
    return by_id


def _situation_matches(situation_line: str, keywords: List[str]) -> bool:
    low = situation_line.lower()
    return any(k.lower() in low for k in keywords)


def _assert_brief(brief: Dict[str, Any], exp: BriefExpectation) -> None:
    assert brief.get("situation_line"), "situation_line required"
    assert brief.get("tone_directive"), "tone_directive required"
    assert isinstance(brief.get("contradiction_notes"), list)
    assert isinstance(brief.get("must_address"), list)

    if exp.get("situation_any"):
        assert _situation_matches(brief["situation_line"], exp["situation_any"]), brief["situation_line"]

    if exp.get("tone_calm"):
        assert "calm" in brief["tone_directive"].lower()

    min_c = exp.get("min_contradictions", 0)
    if min_c:
        assert len(brief["contradiction_notes"]) >= min_c, brief["contradiction_notes"]

    if exp.get("requires_drafting_rule"):
        assert brief.get("drafting_rule"), "drafting_rule expected when contradictions present"

    if exp.get("must_address_any"):
        got = set(brief["must_address"])
        assert any(m in got for m in exp["must_address_any"]), brief["must_address"]


@pytest.fixture(scope="module")
def fixtures_by_id() -> Dict[str, Dict[str, Any]]:
    return _load_all_fixtures()


@pytest.mark.parametrize("fixture_id", sorted(CURATED_EXPECTATIONS.keys()))
def test_curated_fixture_brief(fixture_id: str, fixtures_by_id: Dict[str, Dict[str, Any]]) -> None:
    row = fixtures_by_id[fixture_id]
    brief = build_premium_generation_intelligence_brief(row["prompt"])
    _assert_brief(brief, CURATED_EXPECTATIONS[fixture_id])


def test_all_fixture_files_load(fixtures_by_id: Dict[str, Dict[str, Any]]) -> None:
    assert len(fixtures_by_id) >= 25


def test_every_fixture_has_nonempty_core_fields(fixtures_by_id: Dict[str, Dict[str, Any]]) -> None:
    for fid, row in fixtures_by_id.items():
        brief = build_premium_generation_intelligence_brief(row["prompt"])
        assert brief.get("situation_line"), fid
        assert brief.get("tone_directive"), fid
        assert isinstance(brief.get("must_address"), list), fid


def test_soft_audit_tag_alignment(fixtures_by_id: Dict[str, Dict[str, Any]]) -> None:
    """
    Surfaces prompts whose brief may be generic vs fixture tags.
    Fails only for unexpected weaknesses (not in KNOWN_WEAK_FIXTURE_IDS).
    """
    weak, unexpected = _collect_weak_fixture_briefs(fixtures_by_id)
    if unexpected:
        pytest.fail(
            "Unexpected weak intelligence briefs (fix brief builder or add to KNOWN_WEAK_FIXTURE_IDS):\n"
            + "\n".join(unexpected)
            + "\n\nKnown weak (documented):\n"
            + "\n".join(weak)
        )


def _collect_weak_fixture_briefs(
    fixtures_by_id: Dict[str, Dict[str, Any]],
) -> tuple[List[str], List[str]]:
    weak: List[str] = []

    for fid, row in fixtures_by_id.items():
        tags = [str(t).lower() for t in row.get("tags") or []]
        brief = build_premium_generation_intelligence_brief(row["prompt"])
        situation = brief.get("situation_line") or ""
        reasons: List[str] = []

        if "contradictory" in tags and not brief.get("contradiction_notes"):
            reasons.append("tag=contradictory but no contradiction_notes")

        if "emotional" in tags and "calm" not in (brief.get("tone_directive") or "").lower():
            low = row["prompt"].lower()
            if any(w in low for w in ("scared", "ghost", "angry", "lol", "ruin", "betrayal", "ex-")):
                reasons.append("tag=emotional but tone_directive not calm")

        for tag, hints in TAG_SITUATION_HINTS.items():
            if tag in tags and hints and not _situation_matches(situation, hints):
                reasons.append(f"tag={tag} but situation_line mismatch")

        if not brief.get("must_address") and any(
            re.search(p, row["prompt"], re.I)
            for p in (r"\$", r"\bfee\b", r"\bpayment\b", r"\bdeliverable\b", r"\btiktok", r"\bnda\b")
        ):
            reasons.append("sparse must_address despite economic/scope cues")

        if reasons:
            weak.append(f"{fid}: {'; '.join(reasons)}")

    known = [w for w in weak if w.split(":")[0] in KNOWN_WEAK_FIXTURE_IDS]
    unexpected = [w for w in weak if w.split(":")[0] not in KNOWN_WEAK_FIXTURE_IDS]
    return known, unexpected
