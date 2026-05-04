"""Unit tests for premium narrow-amendment path (no full FastAPI app import)."""

import json

import pytest

from backend.agreements.premium_refine_narrow import (
    classify_narrow_amendment_prompt,
    try_apply_narrow_amendment,
)

pytestmark = pytest.mark.unit


def _long_doc_with_payment() -> str:
    parts = ["# Agreement\n\n", "## Parties\n\nA and B.\n\n", "## Scope\n\n"]
    parts.append("".join(f"Scope detail line {i} with mutual obligations.\n" for i in range(160)))
    parts.append(
        "\n## Payment\n\nFees are net 30. Invoices monthly on the first business day.\n\n"
        "## Intellectual Property\n\nEach party retains pre-existing IP.\n\n"
        "## Confidentiality\n\nParties agree to mutual confidentiality obligations.\n\n"
        "## Termination\n\nEither party may terminate on thirty (30) days written notice.\n"
    )
    return "".join(parts)


def test_classify_narrow_amendment_prompt_late_fee_and_negatives():
    assert (
        classify_narrow_amendment_prompt("Add late fee of 5% after 10 days overdue. Preserve all other terms.")
        == "late_fee"
    )
    assert classify_narrow_amendment_prompt("Add a late fee of 5% after 10 days.") == "late_fee"
    assert classify_narrow_amendment_prompt("5% late fee after 10 days overdue") == "late_fee"
    assert classify_narrow_amendment_prompt("Add late fee of 5% after 10 days overdue.") == "late_fee"
    assert classify_narrow_amendment_prompt("Remove late fee clause") is None
    assert classify_narrow_amendment_prompt("Add governing law of Delaware") == "governing_law"
    assert classify_narrow_amendment_prompt("Clarify delivery acceptance criteria") == "delivery_acceptance"
    assert classify_narrow_amendment_prompt("Add support period of 90 days") == "support_period"
    assert classify_narrow_amendment_prompt("Add termination for convenience with 14 days notice") == "termination"


def test_try_apply_late_fee_deterministic_without_llm():
    doc = _long_doc_with_payment()

    def no_llm(*_a, **_k):
        raise AssertionError("LLM must not run for deterministic late-fee insert")

    out = try_apply_narrow_amendment(
        kind="late_fee",
        current_document_text=doc,
        user_refinement_prompt="Add late fee of 5% after 10 days overdue.",
        call_legal_llm_fn=no_llm,
        llm_model=None,
    )
    assert out is not None
    text = out["updated_document_text"]
    low = text.lower()
    assert "five percent (5%)" in low or "5%" in text
    assert "## Payment" in text
    assert "Confidentiality" in text
    assert len(text) >= int(len(doc) * 0.9)


def test_late_fee_deterministic_renumbers_subclause_numbers():
    """Inserting late fee before former 3.4 bumps Expenses/Taxes so there is no duplicate 3.4."""
    pad = "## Scope\n\n" + ("Mutual commitments line.\n" * 120)
    core = """## Payment

3.3 Invoicing

Net 30.

3.4 Expenses

Pass-through.

3.5 Taxes

Sales tax.
"""
    doc = pad + "\n\n" + core

    def no_llm(*_a, **_k):
        raise AssertionError("no llm")

    out = try_apply_narrow_amendment(
        kind="late_fee",
        current_document_text=doc,
        user_refinement_prompt="Add late fee of 5% after 10 days overdue.",
        call_legal_llm_fn=no_llm,
        llm_model=None,
    )
    assert out is not None
    text = out["updated_document_text"]
    assert "3.5 Expenses" in text
    assert "3.6 Taxes" in text
    assert "five percent (5%)" in text.lower()
    assert text.count("3.4 ") == 1


def test_late_fee_renumbers_consecutive_same_major_duplicate_numbers():
    """
    When the payment tail already has duplicate ``3.4`` line-start headings (bad upstream numbering),
    inserting a late-fee ``3.4`` must still yield a strictly increasing 3.4..3.7 chain (no duplicate majors).
    """
    pad = "## Scope\n\n" + ("Mutual commitments line.\n" * 80)
    core = """## Payment

3.3 Invoicing

Net 30.

3.4 Disputed Amounts

Good faith.

3.4 Expenses

Pass-through.

3.5 Taxes

Sales tax.
"""
    doc = pad + "\n\n" + core

    def no_llm(*_a, **_k):
        raise AssertionError("no llm")

    out = try_apply_narrow_amendment(
        kind="late_fee",
        current_document_text=doc,
        user_refinement_prompt="Add late fee of 5% after 10 days overdue.",
        call_legal_llm_fn=no_llm,
        llm_model=None,
    )
    assert out is not None
    text = out["updated_document_text"]
    assert "3.4 " in text
    assert "3.5 Disputed" in text
    assert "3.6 Expenses" in text
    assert "3.7 Taxes" in text
    assert "five percent (5%)" in text.lower()
    assert text.count("3.5 ") == 1
    assert text.count("3.6 ") == 1


def test_late_fee_insert_monotonic_renumbers_2_3_through_2_7():
    """After insert, no duplicate ``2.4`` — monotonic pass yields 2.4 Late, 2.5 Disputed, 2.6 Expenses, 2.7 Taxes."""
    pad = "## Scope\n\n" + ("Scope line.\n" * 120)
    core = """## Payment

2.3 Invoicing

Net 30.

2.4 Disputed Amounts

Good faith.

2.5 Expenses

Pass-through.

2.6 Taxes

Sales tax.
"""
    doc = pad + "\n\n" + core

    def no_llm(*_a, **_k):
        raise AssertionError("no llm")

    out = try_apply_narrow_amendment(
        kind="late_fee",
        current_document_text=doc,
        user_refinement_prompt="Add late fee of 5% after 10 days overdue. Preserve all other terms.",
        call_legal_llm_fn=no_llm,
        llm_model=None,
    )
    assert out is not None
    text = out["updated_document_text"]
    assert "2.4 " in text
    assert "2.5 Disputed" in text
    assert "2.6 Expenses" in text
    assert "2.7 Taxes" in text
    assert text.count("2.4 ") == 1
    assert "five percent (5%)" in text.lower()


def test_try_apply_late_fee_under_financial_terms_heading():
    pad = "## Scope\n\n" + ("Line of scope.\n" * 120)
    doc = (
        pad
        + "\n## Financial Terms\n\n"
        + "Net 30. Wire transfer acceptable.\n\n"
        + "## Confidentiality\n\nMutual NDA.\n"
    )

    def no_llm(*_a, **_k):
        raise AssertionError("no llm")

    out = try_apply_narrow_amendment(
        kind="late_fee",
        current_document_text=doc,
        user_refinement_prompt="Add late fee of 5% after 10 days overdue. Preserve all other terms.",
        call_legal_llm_fn=no_llm,
        llm_model=None,
    )
    assert out is not None
    assert "five percent (5%)" in out["updated_document_text"].lower()


def test_late_fee_insert_fees_and_payment_before_payment_schedule():
    pad = "## Scope\n\n" + ("Scope padding line.\n" * 120)
    doc = (
        pad
        + "\n## Fees and Payment\n\n"
        "The total fee is fifty thousand dollars USD.\n\n"
        "### Payment Schedule\n\n"
        "Invoices are due net thirty from invoice date.\n\n"
        "## Confidentiality\n\nMutual NDA.\n"
    )

    def no_llm(*_a, **_k):
        raise AssertionError("LLM must not run")

    out = try_apply_narrow_amendment(
        kind="late_fee",
        current_document_text=doc,
        user_refinement_prompt="Add late fee of 5% after 10 days overdue. Preserve all other terms.",
        call_legal_llm_fn=no_llm,
        llm_model=None,
    )
    assert out is not None
    text = out["updated_document_text"]
    low = text.lower()
    assert "five percent (5%)" in low or "5%" in text
    assert text.lower().find("late payment") < text.lower().find("payment schedule")


def test_try_apply_late_fee_llm_anchor_patch_fallback():
    # No Payment / Confidentiality headings so deterministic insert skips; LLM anchor patch applies.
    body = [
        "# Agreement\n\n## Scope\n\n",
        "x" * 1200,
        "\n\n## Obligations\n\nMutual NDA duties here. Each party will perform in good faith.\n",
    ]
    doc = "".join(body)
    anchor = "Mutual NDA duties here. Each party will perform in good faith."

    def fake_llm(messages=None, **kwargs):
        m = messages or kwargs.get("messages") or []
        assert m and "system" in m[0].get("role", "")
        return json.dumps(
            {
                "anchor": anchor,
                "new_paragraph": (
                    "Late Payment. Any undisputed amount not paid within ten (10) days after it becomes due may accrue "
                    "a late fee equal to five percent (5%) of the overdue amount, unless prohibited by applicable law."
                ),
            }
        )

    out = try_apply_narrow_amendment(
        kind="late_fee",
        current_document_text=doc,
        user_refinement_prompt="Add late fee 5% after 10 days overdue.",
        call_legal_llm_fn=fake_llm,
        llm_model="gpt-4o",
    )
    assert out is not None
    assert "five percent (5%)" in out["updated_document_text"].lower()
    assert len(out["updated_document_text"]) >= int(len(doc) * 0.9)


def test_classify_narrow_amendment_prompt_client_deliverables_final_payment():
    assert (
        classify_narrow_amendment_prompt(
            "add in the client will need to approve deliverables before final payment is due"
        )
        == "client_deliverables_final_payment"
    )


def _doc_client_deliverables_narrow_base() -> str:
    return (
        "# Agreement\n\n## Scope\n\nMonthly deliverables per the statement of work.\n\n"
        "## Payment\n\n"
        + ("Net 30 invoicing detail line.\n" * 120)
        + "\n## 4 Final Payment\n\nDue on completion of milestones.\n\nIN WITNESS WHEREOF\n\n__ /s/ __\n"
    )


def test_try_apply_client_deliverables_final_payment_deterministic_without_llm():
    doc = _doc_client_deliverables_narrow_base()

    def no_llm(*_a, **_k):
        raise AssertionError("LLM must not run for deterministic client-deliverables insert")

    out = try_apply_narrow_amendment(
        kind="client_deliverables_final_payment",
        current_document_text=doc,
        user_refinement_prompt="add in the client will need to approve deliverables before final payment is due",
        call_legal_llm_fn=no_llm,
        llm_model=None,
    )
    assert out is not None
    text = out["updated_document_text"]
    low = text.lower()
    assert "deliverables" in low
    assert "final payment" in low
    assert "approval" in low
    assert "in witness whereof" in low
    assert len(text) >= int(len(doc) * 0.9)
