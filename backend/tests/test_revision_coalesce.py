"""Revision coalesce: keep party contact, payment_terms, jurisdiction, feed, and payment_request when the model or partial commit omits them."""

import pytest

from backend.routers.agreements_v2_api import (
    AgreementDraft,
    AgreementDraftCreate,
    AgreementParty,
    _coalesce_revision_draft_with_base,
    _validate_revision_expectations,
)

pytestmark = pytest.mark.unit


def _base_draft() -> AgreementDraft:
    return AgreementDraft(
        id="ag-1",
        created_at="t0",
        updated_at="t1",
        title="MSA",
        jurisdiction="Oklahoma",
        parties=[
            AgreementParty(name="Client Co", role="Client", id="p1", email="c@example.com", phone=None),
            AgreementParty(name="Dev LLC", role="Developer", id="p2", email="d@example.com", phone="555"),
        ],
        purpose="Build the app. Oklahoma governing law.",
        payment_terms="$10,000 fixed fee, net 30.",
        duration="30 days",
        due_date="2026-07-01",
        effective_date="2026-06-01",
        feed_visibility="link_only",
        feed_party_anonymize=True,
        feed_show_financial_summary=True,
        feed_anchor_network="x",
        payment_request={"amount": "10000", "type": "fixed"},
        payment_required=True,
    )


def test_coalesce_restores_party_emails_when_revised_omits():
    base = _base_draft()
    revised = AgreementDraftCreate(
        title="MSA (revised)",
        jurisdiction="",
        parties=[
            AgreementParty(name="Client Co", role="Client", id="p1"),
            AgreementParty(name="Dev LLC", role="Developer", id="p2"),
        ],
        purpose="Adds mutual non-disparagement and 45-day delivery.",
        payment_terms="",
        duration=None,
        due_date=None,
        effective_date=None,
    )
    out = _coalesce_revision_draft_with_base(base, revised)
    assert out.parties[0].email == "c@example.com"
    assert out.parties[1].email == "d@example.com"
    assert out.parties[1].phone == "555"
    assert "non-disparagement" in (out.purpose or "").lower()
    assert out.payment_terms == base.payment_terms
    assert out.jurisdiction == "Oklahoma"
    assert out.feed_visibility == "link_only"
    assert out.feed_party_anonymize is True
    assert out.payment_request == base.payment_request
    assert out.payment_required is True


def test_coalesce_prefers_revised_nonempty_payment_terms():
    base = _base_draft()
    revised = AgreementDraftCreate(
        title=base.title,
        jurisdiction=base.jurisdiction,
        parties=list(base.parties),
        purpose=base.purpose,
        payment_terms="Net 45 after acceptance.",
        duration=base.duration,
        due_date=base.due_date,
        effective_date=base.effective_date,
    )
    out = _coalesce_revision_draft_with_base(base, revised)
    assert "Net 45" in (out.payment_terms or "")


def test_revision_preserves_payment_terms():
    """Simulate LLM returning empty payment_terms — coalesce must restore from base."""
    base = _base_draft()
    revised = AgreementDraftCreate(
        title="MSA",
        jurisdiction="Oklahoma",
        parties=list(base.parties),
        purpose="Only purpose changed.",
        payment_terms="",
        duration=base.duration,
        due_date=base.due_date,
        effective_date=base.effective_date,
    )
    out = _coalesce_revision_draft_with_base(base, revised)
    assert out.payment_terms == base.payment_terms
    assert "$10,000" in (out.payment_terms or "")


def test_validator_detects_missing_clause():
    base = _base_draft()
    revised = AgreementDraftCreate(
        title=base.title,
        jurisdiction=base.jurisdiction,
        parties=list(base.parties),
        purpose="General services. No cure language here.",
        payment_terms=base.payment_terms,
        duration=base.duration,
        due_date=base.due_date,
        effective_date=base.effective_date,
    )
    result = _validate_revision_expectations(base, revised, "add cure period")
    assert result["ok"] is False
    assert "missing_cure_period" in result["issues"]


def test_validator_ok_when_cure_period_present():
    base = _base_draft()
    revised = AgreementDraftCreate(
        title=base.title,
        jurisdiction=base.jurisdiction,
        parties=list(base.parties),
        purpose="Five business day cure period before termination.",
        payment_terms=base.payment_terms,
        duration=base.duration,
        due_date=base.due_date,
        effective_date=base.effective_date,
    )
    result = _validate_revision_expectations(base, revised, "add cure period")
    assert result["ok"] is True
    assert result["issues"] == []


def test_validator_cure_passes_five_parenthetical_business_days_remedy():
    base = _base_draft()
    revised = AgreementDraftCreate(
        title=base.title,
        jurisdiction=base.jurisdiction,
        parties=list(base.parties),
        purpose="Party shall have five (5) business days to remedy breach.",
        payment_terms=base.payment_terms,
        duration=base.duration,
        due_date=base.due_date,
        effective_date=base.effective_date,
    )
    r = _validate_revision_expectations(base, revised, "add a cure period for breach")
    assert r["ok"] is True
    assert "missing_cure_period" not in r["issues"]


def test_validator_cure_passes_opportunity_to_cure():
    base = _base_draft()
    revised = AgreementDraftCreate(
        title=base.title,
        jurisdiction=base.jurisdiction,
        parties=list(base.parties),
        purpose="Each side has a reasonable opportunity to cure defaults.",
        payment_terms=base.payment_terms,
        duration=base.duration,
        due_date=base.due_date,
        effective_date=base.effective_date,
    )
    r = _validate_revision_expectations(base, revised, "include cure period")
    assert r["ok"] is True


def test_validator_non_disparagement_passes_shall_not_disparage():
    base = _base_draft()
    revised = AgreementDraftCreate(
        title=base.title,
        jurisdiction=base.jurisdiction,
        parties=list(base.parties),
        purpose="The parties shall not disparage one another.",
        payment_terms=base.payment_terms,
        duration=base.duration,
        due_date=base.due_date,
        effective_date=base.effective_date,
    )
    r = _validate_revision_expectations(base, revised, "add non-disparagement")
    assert r["ok"] is True


def test_validator_timeline_passes_forty_five_days_spelled_out():
    base = _base_draft()
    revised = AgreementDraftCreate(
        title=base.title,
        jurisdiction=base.jurisdiction,
        parties=list(base.parties),
        purpose="Final delivery within forty-five days of kickoff.",
        payment_terms=base.payment_terms,
        duration="forty-five days",
        due_date=base.due_date,
        effective_date=base.effective_date,
    )
    r = _validate_revision_expectations(base, revised, "increase timeline to 45 days")
    assert r["ok"] is True
    assert "timeline_not_updated" not in r["issues"]


def test_validator_timeline_issue_code_when_45_requested_but_missing():
    base = _base_draft()
    revised = AgreementDraftCreate(
        title=base.title,
        jurisdiction=base.jurisdiction,
        parties=list(base.parties),
        purpose="Delivery in 30 days only.",
        payment_terms=base.payment_terms,
        duration="30 days",
        due_date=base.due_date,
        effective_date=base.effective_date,
    )
    r = _validate_revision_expectations(base, revised, "change delivery to 45 days")
    assert r["ok"] is False
    assert "timeline_not_updated" in r["issues"]
