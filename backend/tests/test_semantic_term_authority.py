"""Fail-closed semantic-term authority gate."""

from __future__ import annotations

import pytest

from backend.agreements.semantic_term_authority import (
    assert_persistable_paid_pro_corpus,
    unauthorized_semantic_inserts_allowed,
)


def test_production_cannot_allow_unauthorized(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("CLAW_ALLOW_UNAUTHORIZED_SEMANTIC_INSERTS", "1")
    assert unauthorized_semantic_inserts_allowed() is False


def test_blocks_uptime_without_authority() -> None:
    corpus = (
        "Provider will use commercially reasonable efforts to maintain availability"
        ", with a target monthly uptime availability of 99.5%, excluding scheduled maintenance"
    )
    r = assert_persistable_paid_pro_corpus(
        corpus=corpus,
        intake_text="SaaS between A Inc and B LLC. No SLA.",
        prior_server_corpus="Provider will use commercially reasonable efforts to maintain availability.",
    )
    assert r.blocked is True
    assert any(f.code == "uptime_99_5" for f in r.findings)


def test_allows_uptime_when_in_intake() -> None:
    corpus = "target monthly uptime availability of 99.5%, excluding scheduled maintenance"
    r = assert_persistable_paid_pro_corpus(
        corpus=corpus,
        intake_text="Include 99.5% uptime SLA.",
        prior_server_corpus="",
    )
    assert r.blocked is False


def test_allows_when_present_on_prior_server() -> None:
    clause = "target monthly uptime availability of 99.5%, excluding scheduled maintenance"
    r = assert_persistable_paid_pro_corpus(
        corpus=clause,
        intake_text="no sla mentioned",
        prior_server_corpus=clause,
    )
    assert r.blocked is False


def test_truncation_always_blocks(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_ALLOW_UNAUTHORIZED_SEMANTIC_INSERTS", "1")
    r = assert_persistable_paid_pro_corpus(
        corpus="partial draft",
        intake_text="anything",
        finish_reason="length",
    )
    assert r.blocked is True
    assert any(f.code == "finish_reason_length" for f in r.findings)


def test_blocks_attorneys_fees_negotiation_survival_milestones_ai() -> None:
    cases = [
        (
            "attorneys_fees_prevailing",
            " The prevailing Party in any action or proceeding arising out of or relating to this Agreement is entitled to recover its reasonable attorneys’ fees and costs to the extent permitted by applicable law.",
        ),
        (
            "negotiation_15_business_days",
            " The parties will engage in good faith negotiations for at least fifteen (15) business days before commencing litigation, arbitration, or other formal proceedings.",
        ),
        (
            "milestone_acceptance_invented",
            "Acceptance: Each milestone is deemed accepted when the designated party representative confirms completion in writing",
        ),
        (
            "ai_workflow_acceptance_floor",
            "1. ACCEPTANCE AND DEMONSTRATION REVIEW\nProvider will demo.",
        ),
        (
            "mutual_consulting_lol_cap",
            "Direct damages are capped to fees paid in the twelve (12) months preceding the claim.",
        ),
    ]
    for code, fragment in cases:
        r = assert_persistable_paid_pro_corpus(
            corpus=f"Agreement body.{fragment}",
            intake_text="Simple consulting. No special risk terms.",
            prior_server_corpus="Agreement body.",
        )
        assert r.blocked is True, code
        assert any(f.code == code for f in r.findings), (code, r.findings)
