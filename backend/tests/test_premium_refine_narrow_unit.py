"""Unit tests for premium narrow-amendment path (no full FastAPI app import)."""

import json

import pytest

from backend.agreements.premium_refine_narrow import (
    classify_narrow_amendment_prompt,
    parse_quoted_sentence_insert,
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


def _fixture_payment_schedule_net30_pause() -> str:
    """Long body + Section 3 payment schedule (3.2) + unrelated following section (## 4)."""
    upfront = "Client pays fifty percent USD upfront upon execution."
    final_pay = "The remaining fifty percent is due within ten days of final delivery."
    parts = [
        "# Agreement\n\n",
        "## Parties\n\nParty A and Party B.\n\n",
        "## 2 Scope\n\n",
        "".join(f"Scope operational filler line {i} for length.\n" for i in range(180)),
        "\n## 3 Compensation and Payment\n\n",
        "This Section describes fees and milestone payments under the agreement.\n\n",
        "### 3.2 Payment Schedule\n\n",
        upfront + "\n\n",
        final_pay + "\n\n",
        "## 4 Intellectual Property\n\n",
        "Each party retains its pre-existing IP.\n\n",
        "## 5 Confidentiality\n\n",
        "Obligations survive termination.\n",
    ]
    return "".join(parts)


def test_payment_timing_pause_qa_phrase_narrow_insert_not_whole_clause_replace():
    """
    Regression: QA phrase should splice net/pause sentences after 3.2 body, preserving schedule lines verbatim.
    """
    qa = "Net 30 and pause work after 15 days late"
    assert classify_narrow_amendment_prompt(qa) == "payment_timing_pause"

    upfront = "Client pays fifty percent USD upfront upon execution."
    final_pay = "The remaining fifty percent is due within ten days of final delivery."
    ip_marker = "## 4 Intellectual Property\n\nEach party retains its pre-existing IP.\n"
    doc = _fixture_payment_schedule_net30_pause()
    assert len(doc) >= 200

    def no_llm(*_a, **_k):
        raise AssertionError("LLM must not run for deterministic payment_timing_pause insert")

    out = try_apply_narrow_amendment(
        kind="payment_timing_pause",
        current_document_text=doc,
        user_refinement_prompt=qa,
        call_legal_llm_fn=no_llm,
        llm_model=None,
    )
    assert out is not None
    text = out["updated_document_text"]
    low = text.lower()

    assert text.count(upfront) == 1
    assert text.count(final_pay) == 1
    idx_up = text.index(upfront)
    idx_fin = text.index(final_pay)
    assert idx_up < idx_fin
    assert text[idx_up : idx_up + len(upfront)] == upfront
    assert text[idx_fin : idx_fin + len(final_pay)] == final_pay
    assert doc.index(upfront) == idx_up
    assert doc.index(final_pay) == idx_fin

    assert "30 calendar days" in text
    assert "15 calendar days" in text
    assert "may pause work" in low
    assert "undisputed invoices" in low

    assert ip_marker in text
    assert text.count("## 4 Intellectual Property") == 1
    assert text.count("### 3.2 Payment Schedule") == 1

    insert_block_start = text.index("Unless otherwise agreed in writing")
    assert insert_block_start > idx_fin + len(final_pay)
    assert text.index(ip_marker) > insert_block_start

    assert len(text) <= int(len(doc) * 1.55)
    assert len(text) < len(doc) + 900


_CERT_MARKER = (
    "CERT_AI_REVISE_MARKER_POST175_0902T1958 — Notices for this agreement may also be "
    "delivered by confirmed electronic mail to the addresses on file."
)

_CERT_INSTR = (
    "In the Notices section, add this exact sentence as its own short paragraph "
    f'(do not remove existing text): "{_CERT_MARKER}" Keep all other sections unchanged.'
)


def _long_named_parties_doc() -> str:
    parts = [
        "# Agreement\n\n",
        "## Parties\n\n",
        'This Agreement is entered into by and between Cedar Peak Advisors LLC ("Client") '
        'and Blue Harbor Logistics LLC ("Service Provider").\n\n',
        "## Scope\n\n",
    ]
    parts.append("".join(f"Scope detail line {i} with mutual obligations.\n" for i in range(160)))
    parts.append(
        "\n## Notices\n\n"
        "Notices shall be delivered as set forth herein.\n\n"
        "## Termination\n\n"
        "Either party may terminate on thirty (30) days written notice.\n\n"
        "IN WITNESS WHEREOF\n\n"
        "CLIENT:\nCedar Peak Advisors LLC\n"
        "SERVICE PROVIDER:\nBlue Harbor Logistics LLC\n"
    )
    return "".join(parts)


def test_classify_quoted_sentence_insert_live_notices_marker():
    assert classify_narrow_amendment_prompt(_CERT_INSTR) == "quoted_sentence_insert"
    parsed = parse_quoted_sentence_insert(_CERT_INSTR)
    assert parsed is not None
    assert parsed[0] == _CERT_MARKER
    assert parsed[1] and parsed[1].lower() == "notices"


def test_quoted_sentence_insert_preserves_resolved_party_names_without_llm():
    doc = _long_named_parties_doc()

    def no_llm(*_a, **_k):
        raise AssertionError("LLM must not run for deterministic quoted-sentence insert")

    out = try_apply_narrow_amendment(
        kind="quoted_sentence_insert",
        current_document_text=doc,
        user_refinement_prompt=_CERT_INSTR,
        call_legal_llm_fn=no_llm,
        llm_model=None,
    )
    assert out is not None
    text = out["updated_document_text"]
    assert _CERT_MARKER in text
    assert "Cedar Peak Advisors LLC" in text
    assert "Blue Harbor Logistics LLC" in text
    assert "[ORG_1]" not in text
    assert "[ORG_2]" not in text
    assert text.index("## Notices") < text.index(_CERT_MARKER)
    assert text.index(_CERT_MARKER) < text.index("## Termination")
    assert text.index(_CERT_MARKER) < text.index("IN WITNESS WHEREOF")
    assert len(text) >= len(doc)


def _numbered_notices_before_governing_law() -> str:
    pad = "The parties agree to cooperate in good faith on the engagement terms. " * 40
    return "\n\n".join(
        [
            "SERVICES AGREEMENT",
            'This Agreement is entered into by Cedar Peak Design LLC ("Client") and Blue Harbor Media Inc ("Service Provider").',
            "1. Engagement and Scope of Services",
            "1.1 Services. Provider shall deliver a brand website refresh.",
            "10. Notices",
            "Any notice under this Agreement must be in writing.",
            "11. Governing Law",
            "This Agreement is governed by the laws of the State of Texas.",
            pad,
            "IN WITNESS WHEREOF, the Parties execute this Agreement.",
        ]
    )


def test_quoted_sentence_insert_lands_inside_numbered_notices_not_after_governing_law():
    doc = _numbered_notices_before_governing_law()

    def no_llm(*_a, **_k):
        raise AssertionError("LLM must not run for deterministic quoted-sentence insert")

    out = try_apply_narrow_amendment(
        kind="quoted_sentence_insert",
        current_document_text=doc,
        user_refinement_prompt=_CERT_INSTR,
        call_legal_llm_fn=no_llm,
        llm_model=None,
    )
    assert out is not None
    text = out["updated_document_text"]
    assert _CERT_MARKER in text
    assert text.index("10. Notices") < text.index(_CERT_MARKER)
    assert text.index(_CERT_MARKER) < text.index("11. Governing Law")
    assert "Cedar Peak Design LLC" in text
    assert "Blue Harbor Media Inc" in text


def test_quoted_sentence_insert_validates_when_insert_splits_mid_document_anchor_window():
    """Live-shaped bodies put Notices mid-doc; a 52-char window must not fail-close the insert."""
    pad = "The parties agree to cooperate in good faith on the engagement terms. " * 40
    doc = "\n\n".join(
        [
            "SERVICES AGREEMENT",
            'This Agreement is entered into as of the Effective Date by and between Cedar Peak Design LLC ("Client") and Blue Harbor Media Inc ("Service Provider").',
            "1. Engagement and Scope of Services",
            "1.1 Services. Provider shall deliver a brand website refresh, including homepage redesign, style guide, and CMS handoff.",
            "5. Confidentiality",
            "5.4 Required Disclosure. A Receiving Party may disclose Confidential Information if required by law.",
            "6. Representations, Warranties, and Compliance",
            "6.1 Mutual Authority. Each party has the full right and authority to enter into this Agreement.",
            "10. Notices",
            "Any notice under this Agreement must be in writing and delivered to the addresses specified by the parties.",
            "11. Governing Law",
            "This Agreement is governed by the laws of the State of Texas, without regard to conflict-of-laws principles.",
            pad,
            "IN WITNESS WHEREOF, the Parties execute this Agreement.",
            "CLIENT:",
            "Cedar Peak Design LLC",
            "SERVICE PROVIDER:",
            "Blue Harbor Media Inc",
        ]
    )

    def no_llm(*_a, **_k):
        raise AssertionError("LLM must not run for deterministic quoted-sentence insert")

    out = try_apply_narrow_amendment(
        kind="quoted_sentence_insert",
        current_document_text=doc,
        user_refinement_prompt=_CERT_INSTR,
        call_legal_llm_fn=no_llm,
        llm_model=None,
    )
    assert out is not None
    text = out["updated_document_text"]
    assert _CERT_MARKER in text
    assert text.index("10. Notices") < text.index(_CERT_MARKER) < text.index("11. Governing Law")
