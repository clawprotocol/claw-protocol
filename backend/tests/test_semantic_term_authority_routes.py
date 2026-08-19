"""Route-level / gate tests for SoT authority + truncation + owner accept."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.agreements.semantic_term_authority import assert_persistable_paid_pro_corpus

FIXTURE = (
    Path(__file__).resolve().parent
    / "fixtures"
    / "semantic_term_families.json"
)


@pytest.fixture(scope="module")
def families() -> list:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    return list(data["families"])


def test_parity_fixture_families_block_without_authority(families: list) -> None:
    for fam in families:
        if not fam.get("backend_code"):
            continue
        corpus = f"Agreement body.{fam['unauthorized_fragment']}"
        r = assert_persistable_paid_pro_corpus(
            corpus=corpus,
            intake_text="Simple consulting. No special risk terms.",
            prior_server_corpus="Agreement body.",
        )
        assert r.blocked is True, fam["id"]
        assert any(f.code == fam["backend_code"] for f in r.findings), fam["id"]


def test_parity_fixture_families_allow_with_intake_authority(families: list) -> None:
    for fam in families:
        if not fam.get("backend_code"):
            continue
        corpus = f"Agreement body.{fam['unauthorized_fragment']}"
        r = assert_persistable_paid_pro_corpus(
            corpus=corpus,
            intake_text=fam["authority_intake_fragment"],
            prior_server_corpus="Agreement body.",
        )
        assert r.blocked is False, fam["id"]


def test_truncation_cannot_replace_last_valid_document() -> None:
    prior = "Last valid substantive agreement body with parties and fees."
    r = assert_persistable_paid_pro_corpus(
        corpus="partial truncated draft",
        intake_text="anything",
        prior_server_corpus=prior,
        finish_reason="length",
    )
    assert r.blocked is True
    assert any(f.code == "finish_reason_length" for f in r.findings)


def test_empty_degraded_cannot_freeze() -> None:
    r = assert_persistable_paid_pro_corpus(
        corpus="   ",
        intake_text="intake",
        prior_server_corpus="prior valid",
    )
    assert r.blocked is True
    assert any(f.code == "empty_or_degraded_corpus" for f in r.findings)


def test_boolean_owner_explicit_accept_is_insufficient() -> None:
    clause = "target monthly uptime availability of 99.5%, excluding scheduled maintenance"
    blocked = assert_persistable_paid_pro_corpus(
        corpus=clause,
        intake_text="no sla",
        prior_server_corpus="",
        owner_explicit_accept=True,
    )
    assert blocked.blocked is True
    assert any(f.code == "acceptance_record_required" for f in blocked.findings)
    from backend.agreements.explicit_acceptance_authority import establish_explicit_acceptance

    rec = establish_explicit_acceptance(
        tenant_id="org-t",
        actor_id="user-t",
        agreement_id="agr-t",
        agreement_version="1",
        accepted_text=clause,
        source_action="pro_redline_accept_import",
        source_proposal_id="p1",
    )
    ok = assert_persistable_paid_pro_corpus(
        corpus=clause,
        intake_text="no sla",
        prior_server_corpus="",
        explicit_acceptance=rec,
    )
    assert ok.blocked is False
    empty = assert_persistable_paid_pro_corpus(
        corpus="",
        intake_text="no sla",
        explicit_acceptance=rec,
    )
    assert empty.blocked is True


def test_retry_fallback_cannot_bypass_truncation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_ALLOW_UNAUTHORIZED_SEMANTIC_INSERTS", "1")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    r = assert_persistable_paid_pro_corpus(
        corpus="retry body",
        intake_text="x",
        finish_reason="length",
    )
    assert r.blocked is True
