"""PREMIUM_REWRITE revision path: similarity gate, escalation retries, agreement categories."""

import json
from unittest.mock import patch

import pytest

from backend.routers import agreements_v2_api as av
from backend.routers.agreements_v2_api import (
    AgreementDraft,
    AgreementDraftCreate,
    AgreementParty,
    agreement_revision_similarity,
)

pytestmark = pytest.mark.unit


def _draft(
    *,
    title: str,
    purpose: str,
    payment_terms: str = "$5,000 monthly",
    jurisdiction: str = "California",
    agreement_type: str = "",
) -> AgreementDraft:
    parties = [
        AgreementParty(name="Alpha LLC", role="Client", id="p1"),
        AgreementParty(name="Beta Person", role="Contractor", id="p2"),
    ]
    extra = f" {agreement_type}" if agreement_type else ""
    return AgreementDraft(
        id="ag-1",
        created_at="t0",
        updated_at="t1",
        title=title,
        jurisdiction=jurisdiction,
        parties=parties,
        purpose=purpose + extra,
        payment_terms=payment_terms,
        duration="12 months",
        due_date=None,
        effective_date="2026-05-01",
    )


CATEGORY_FIXTURES = [
    (
        "contractor",
        _draft(
            title="Independent Contractor Agreement",
            purpose="Beta will provide warehouse staffing support for Alpha.",
            agreement_type="contractor",
        ),
    ),
    (
        "consulting",
        _draft(
            title="Consulting Agreement",
            purpose="Strategic advisory on Series B materials and data room diligence.",
            agreement_type="consulting",
        ),
    ),
    (
        "recurring_service",
        _draft(
            title="Managed IT Services",
            purpose="Monthly monitoring, patching, and helpdesk during business hours.",
            payment_terms="$2,400 per month, net 15",
            agreement_type="recurring_service",
        ),
    ),
    (
        "nda",
        _draft(
            title="Mutual Non-Disclosure Agreement",
            purpose="Protect confidential business and technical information exchanged for a possible partnership.",
            payment_terms="N/A",
            agreement_type="nda",
        ),
    ),
    (
        "landlord_tenant_addendum",
        _draft(
            title="Lease Addendum — Pet Policy",
            purpose="Tenant may keep one dog under 40 lbs; additional cleaning fee applies at move-out.",
            jurisdiction="New York",
            agreement_type="landlord_tenant_addendum",
        ),
    ),
]


@pytest.mark.parametrize("slug,_draft_obj", CATEGORY_FIXTURES, ids=[x[0] for x in CATEGORY_FIXTURES])
def test_agreement_revision_similarity_categories_detect_material_rewrite(slug, _draft_obj):
    """Across representative agreement types, a meaningfully rewritten body lowers similarity vs baseline."""
    d0 = _draft_obj
    d1 = d0.model_copy(
        update={
            "purpose": (
                "1. Scope\n"
                "Rebuilt obligations with clearer milestones, acceptance criteria, and notice paths.\n"
                "2. Standards\n"
                "Work performed in a professional manner with weekly written status.\n"
                "3. IP & confidentiality\n"
                "Pre-existing materials remain with each party; project deliverables assigned as stated.\n"
            ),
            "payment_terms": d0.payment_terms + " Invoicing on the 1st; late fees only if specified by law.",
            "title": d0.title + " (Revised)",
        }
    )
    sim = agreement_revision_similarity(d0, d1)
    assert sim < av.PREMIUM_REVISION_SIMILARITY_CEILING, f"{slug} expected lower similarity, got {sim}"


def test_agreement_revision_similarity_identical_high():
    d = _draft(title="T", purpose="Same text")
    assert agreement_revision_similarity(d, d.model_copy()) >= 0.999


def test_starter_preview_uses_starter_payload_mode(monkeypatch):
    calls: list[dict] = []

    def _capture(**kwargs):
        calls.append({"messages": kwargs["messages"], "max_tokens": kwargs["max_tokens"]})
        return json.dumps(
            {
                "title": "T",
                "jurisdiction": "J",
                "parties": [{"name": "A", "role": "a"}, {"name": "B", "role": "b"}],
                "purpose": "p",
                "payment_terms": "x",
                "duration": None,
                "due_date": None,
                "effective_date": None,
            }
        )

    draft = _draft(title="Old", purpose="Old purpose unchanged for test")
    with patch("backend.routers.agreements_v2_api.call_legal_llm", side_effect=_capture):
        out = av._revise_with_instruction(draft, "make title clearer", ai_model_class="basic")
    assert out.title == "T"
    user_blob = json.loads(calls[0]["messages"][1]["content"])
    assert user_blob.get("mode") == "STARTER_PREVIEW"
    assert calls[0]["max_tokens"] == 350


def test_premium_rewrite_retries_when_similarity_too_high(monkeypatch):
    """First LLM return mirrors baseline → second attempt with escalation; third is different enough."""
    draft = _draft(
        title="Independent Contractor Agreement",
        purpose="Beta will provide warehouse staffing support for Alpha.",
    )
    identical = {
        "title": draft.title,
        "jurisdiction": draft.jurisdiction,
        "parties": [{"name": p.name, "role": p.role} for p in draft.parties],
        "purpose": draft.purpose,
        "payment_terms": draft.payment_terms,
        "duration": draft.duration,
        "due_date": draft.due_date,
        "effective_date": draft.effective_date,
    }
    upgraded = dict(identical)
    upgraded["purpose"] = (
        "SECTION 1 — SERVICES\n"
        "Contractor shall perform the services with professional skill and weekly written summaries.\n"
        "SECTION 2 — COMPENSATION\n"
        "Client pays USD 5,000 per calendar month as set forth in the statement of work.\n"
        "SECTION 3 — STANDARDS\n"
        "Deliverables subject to acceptance within five business days of submission.\n"
    )
    upgraded["title"] = "Independent Contractor Services Agreement — Alpha / Beta"

    responses = [json.dumps(identical), json.dumps(identical), json.dumps(upgraded)]
    monkeypatch.setattr(av, "PREMIUM_REVISION_SIMILARITY_CEILING", 0.87)
    monkeypatch.setattr(av, "PREMIUM_REVISION_MAX_ATTEMPTS", 3)

    def _seq(**_kwargs):
        return responses.pop(0)

    with patch("backend.routers.agreements_v2_api.call_legal_llm", side_effect=_seq):
        out = av._revise_with_instruction(draft, "Improve clarity and structure", ai_model_class="premium")
    assert "SECTION 1" in (out.purpose or "")
    assert av.agreement_revision_similarity(draft, out) <= 0.87


def test_premium_rewrite_payload_and_system_use_premium_mode(monkeypatch):
    seen_sys: list[str] = []
    seen_user: list[str] = []

    def _cap(**kwargs):
        sys_p = kwargs["messages"][0]["content"]
        user = kwargs["messages"][1]["content"]
        seen_sys.append(sys_p)
        seen_user.append(user)
        blob = json.loads(user)
        return json.dumps(
            {
                "title": blob["current_draft"]["title"] + " — polished",
                "jurisdiction": blob["current_draft"]["jurisdiction"],
                "parties": blob["current_draft"]["parties"],
                "purpose": "Rewritten purpose block with new sentences only for test similarity drop. " * 3,
                "payment_terms": blob["current_draft"]["payment_terms"],
                "duration": blob["current_draft"]["duration"],
                "due_date": None,
                "effective_date": blob["current_draft"]["effective_date"],
            }
        )

    draft = _draft(title="Consulting Agreement", purpose="Short old purpose.")
    with patch("backend.routers.agreements_v2_api.call_legal_llm", side_effect=_cap):
        av._revise_with_instruction(draft, "Upgrade the draft", ai_model_class="premium")
    assert seen_sys
    assert "PREMIUM_REWRITE" in seen_sys[0]
    user0 = json.loads(seen_user[0])
    assert user0.get("mode") == "PREMIUM_REWRITE"


def test_premium_llm_failure_returns_fallback_without_loop(monkeypatch):
    draft = _draft(title="T", purpose="p")

    def _boom(**_kwargs):
        raise RuntimeError("no llm")

    with patch("backend.routers.agreements_v2_api.call_legal_llm", side_effect=_boom):
        out = av._revise_with_instruction(draft, "change payment terms to net 45", ai_model_class="premium")
    assert "net 45" in (out.payment_terms or "").lower()
