"""Deterministic recipient instruction merge (no LLM)."""

import pytest

pytestmark = pytest.mark.unit


def _dev_agreement():
    from backend.routers.agreements_v2_api import AgreementDraft, AgreementParty

    now = "2026-01-01T00:00:00Z"
    return AgreementDraft(
        id="ag_test_det",
        title="Development agreement",
        jurisdiction="California",
        parties=[
            AgreementParty(name="Studio LLC", role="owner"),
            AgreementParty(name="Client LLC", role="party"),
        ],
        purpose="Custom software development.",
        payment_terms="Net 15.",
        duration="6 months",
        due_date=None,
        effective_date="2026-02-01",
        created_at=now,
        updated_at=now,
        versions=[],
        audit_log=[],
    )


def test_recipient_merge_net30_and_pause_work():
    from backend.routers.agreements_v2_api import _recipient_deterministic_merge_instruction

    base = _dev_agreement()
    inst = (
        "Please update the payment terms to Net 30. "
        "Also add that the developer may pause work if payment is more than 15 days late."
    )
    out = _recipient_deterministic_merge_instruction(base, inst)
    assert "Net 30" in (out.payment_terms or "")
    assert "pause work" in (out.purpose or "").lower()
    assert "15" in (out.purpose or "")


def test_recipient_merge_no_op_boilerplate():
    from backend.routers.agreements_v2_api import _maybe_apply_recipient_deterministic_no_op_patch, AgreementDraftCreate

    base = _dev_agreement()
    revised = AgreementDraftCreate(
        title=base.title,
        jurisdiction=base.jurisdiction,
        parties=list(base.parties),
        purpose=base.purpose,
        payment_terms=base.payment_terms,
        duration=base.duration,
        due_date=base.due_date,
        effective_date=base.effective_date,
    )
    out = _maybe_apply_recipient_deterministic_no_op_patch(base, "Thanks, looks good to me.", revised)
    assert out.payment_terms == base.payment_terms
    assert out.purpose == base.purpose


def test_recipient_merge_governing_law_and_confidentiality():
    from backend.routers.agreements_v2_api import _recipient_deterministic_merge_instruction

    base = _dev_agreement()
    inst = "Change governing law to New York. Add an NDA / confidentiality clause."
    out = _recipient_deterministic_merge_instruction(base, inst)
    assert "new york" in (out.jurisdiction or "").lower()
    assert "confidential" in (out.purpose or "").lower()
