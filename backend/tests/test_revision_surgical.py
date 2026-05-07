"""Unit tests for surgical vs material revise scope helpers."""

import pytest

from backend.agreements.revision_surgical import (
    instruction_requests_material_rewrite,
    is_overbroad_structured_revision,
    structured_field_is_overbroad,
    token_jaccard,
)

pytestmark = pytest.mark.unit


def test_instruction_requests_material_rewrite_positive() -> None:
    assert instruction_requests_material_rewrite("Improve clarity and structure")
    assert instruction_requests_material_rewrite("Upgrade the draft")
    assert instruction_requests_material_rewrite("Please completely rewrite the payment section from scratch")


def test_instruction_requests_material_rewrite_negative() -> None:
    assert not instruction_requests_material_rewrite("Net 30 and pause work after 15 days late")
    assert not instruction_requests_material_rewrite("Change payment to net 45")


def test_token_jaccard() -> None:
    assert token_jaccard("alpha beta gamma", "alpha beta delta") > 0.4
    assert token_jaccard("foo bar", "baz quux") < 0.2


def test_structured_field_is_overbroad_detects_wholesale_replace() -> None:
    orig = "Invoices are due on receipt. Milestones bill monthly. Late fees per Exhibit A."
    rev = " ".join(["Entirely new commercial framework unrelated to prior wording."] * 40)
    assert structured_field_is_overbroad(orig, rev)


def test_is_overbroad_structured_revision_payment_instruction() -> None:
    class _B:
        payment_terms = "Net 15. Invoices are issued monthly on the first business day."
        purpose = "Developer will perform services."

    class _A:
        payment_terms = "x " * 200
        purpose = "Developer will perform services."

    assert is_overbroad_structured_revision(_B(), _A(), "Net 30 and pause work after 15 days late")


def test_is_overbroad_skipped_for_material_instruction() -> None:
    class _B:
        payment_terms = "Net 15."
        purpose = "p"

    class _A:
        payment_terms = "x " * 200
        purpose = "p"

    assert not is_overbroad_structured_revision(_B(), _A(), "Improve clarity and structure")
