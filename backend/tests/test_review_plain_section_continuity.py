"""Review/plain section continuity: skipped integers FAIL; sequential PASS.

Does not remint leftover 1..8 outlines into 10/11/12/13.
Does not hard-code Texas / Northline / Harbor / Priya / Diego.
"""

from __future__ import annotations

import pytest

from backend.agreements.review_plain_section_continuity import (
    collect_review_plain_top_level_section_numbers,
    extract_supplied_governing_law,
    repair_review_plain_section_continuity,
    review_plain_has_late_skipped_section_numbers,
    review_plain_has_operative_governing_law,
    review_plain_has_skipped_section_numbers,
)


def _two_party_intake(*, client: str, provider: str, law: str) -> str:
    return (
        f"{client} is hiring {provider} to design a logo and brand kit for $2,400, "
        f"term 30 days, governing law {law}."
    )


def _services_body(*, client: str, provider: str, headings: list[tuple[int, str]], law_section: str | None = None) -> str:
    lines = [
        "SERVICES AGREEMENT",
        "",
        f'This Services Agreement (this "Agreement") is entered into as of the Effective Date '
        f'by and between {client} ("Client") and {provider} ("Service Provider").',
        "",
    ]
    for num, title in headings:
        lines.append(f"{num}. {title}")
        if "Force Majeure" in title:
            lines.append(
                "Neither party is liable for delay caused by events beyond its reasonable control."
            )
        elif "Notices" in title:
            lines.append("Any notice under this Agreement must be in writing and delivered as set forth below.")
            lines.append(f"If to {client}: {client} Email: notices-client@example.com")
            lines.append(f"If to {provider}: {provider} Email: notices-provider@example.com")
        elif "Independent Contractor" in title:
            lines.append("Designer is an independent contractor and may not assign this Agreement without consent.")
        else:
            lines.append(f"The parties agree to the {title.lower()} terms of this Agreement.")
        lines.append("")
        if law_section is not None and num == 12 and "Force Majeure" in title:
            lines.append(law_section)
            lines.append("")
    lines.extend(
        [
            "IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.",
            "",
            f"CLIENT: {client}",
            "By: ____________________",
            "",
            f"SERVICE PROVIDER: {provider}",
            "By: ____________________",
        ]
    )
    return "\n".join(lines)


def _sequential_1_through(n: int, *, client: str, provider: str) -> str:
    titles = {
        1: "Services and Deliverables",
        2: "Client Materials, Cooperation, and Approvals",
        3: "Fees and Payment",
        4: "Term and Termination",
        5: "Intellectual Property",
        6: "Confidentiality",
        7: "Representations and Warranties",
        8: "Limitation of Liability",
        9: "Indemnification",
        10: "Miscellaneous",
        11: "Independent Contractor and Assignment",
        12: "Force Majeure",
        13: "Governing Law",
        14: "Notices",
    }
    headings = [(i, titles.get(i, f"Section {i}")) for i in range(1, n + 1)]
    return _services_body(client=client, provider=provider, headings=headings)


def _twelve_then_fourteen(*, client: str, provider: str) -> str:
    headings = [(i, t) for i, t in [
        (1, "Services and Deliverables"),
        (2, "Client Materials, Cooperation, and Approvals"),
        (3, "Fees and Payment"),
        (4, "Term and Termination"),
        (5, "Intellectual Property"),
        (6, "Confidentiality"),
        (7, "Representations and Warranties"),
        (8, "Limitation of Liability"),
        (9, "Indemnification"),
        (10, "Miscellaneous"),
        (11, "Independent Contractor and Assignment"),
        (12, "Force Majeure"),
        (14, "Notices"),
    ]]
    return _services_body(client=client, provider=provider, headings=headings)


def _ten_then_twelve(*, client: str, provider: str) -> str:
    headings = [(i, t) for i, t in [
        (1, "Services and Deliverables"),
        (2, "Fees and Payment"),
        (3, "Term and Termination"),
        (4, "Intellectual Property"),
        (5, "Confidentiality"),
        (6, "Limitation of Liability"),
        (7, "Indemnification"),
        (8, "Independent Contractor and Assignment"),
        (9, "Force Majeure"),
        (10, "Miscellaneous"),
        (12, "Notices"),
    ]]
    return _services_body(client=client, provider=provider, headings=headings)


def _leftover_eight_section(*, client: str, provider: str) -> str:
    headings = [(i, t) for i, t in [
        (1, "Services and Deliverables"),
        (2, "Fees and Payment"),
        (3, "Term and Termination"),
        (4, "Intellectual Property"),
        (5, "Confidentiality"),
        (6, "Limitation of Liability"),
        (7, "Governing Law"),
        (8, "Notices"),
    ]]
    body = _services_body(client=client, provider=provider, headings=headings)
    return body.replace(
        "The parties agree to the governing law terms of this Agreement.",
        "This Agreement is governed by the laws of the jurisdiction named in the intake.",
    )


@pytest.mark.parametrize(
    ("law", "client", "provider"),
    [
        ("Oklahoma", "Cedar Ridge LLC", "Maple Grove Inc"),
        ("Colorado", "Riverbend Studio", "Oak Point LLC"),
        ("New York", "Summit Craft Co", "Harborline Design LLC"),
    ],
)
def test_detector_fails_12_then_14_and_10_then_12(law: str, client: str, provider: str) -> None:
    skipped_12_14 = _twelve_then_fourteen(client=client, provider=provider)
    skipped_10_12 = _ten_then_twelve(client=client, provider=provider)
    sequential = _sequential_1_through(14, client=client, provider=provider)

    assert review_plain_has_skipped_section_numbers(skipped_12_14) is True
    assert review_plain_has_late_skipped_section_numbers(skipped_12_14) is True
    assert 14 in collect_review_plain_top_level_section_numbers(skipped_12_14)
    assert 13 not in collect_review_plain_top_level_section_numbers(skipped_12_14)

    assert review_plain_has_skipped_section_numbers(skipped_10_12) is True
    assert review_plain_has_late_skipped_section_numbers(skipped_10_12) is True
    nums = collect_review_plain_top_level_section_numbers(skipped_10_12)
    assert 10 in nums and 12 in nums and 11 not in nums

    assert review_plain_has_skipped_section_numbers(sequential) is False
    assert collect_review_plain_top_level_section_numbers(sequential) == list(range(1, 15))
    assert law  # parametrize keeps the fixture ordinary two-party, not a single venue


def test_repair_fills_12_then_14_and_keeps_supplied_governing_law() -> None:
    client, provider, law = "Cedar Ridge LLC", "Maple Grove Inc", "Oklahoma"
    intake = _two_party_intake(client=client, provider=provider, law=law)
    raw = _twelve_then_fourteen(client=client, provider=provider)
    assert review_plain_has_skipped_section_numbers(raw) is True
    assert review_plain_has_operative_governing_law(raw, law) is False

    out = repair_review_plain_section_continuity(raw, original_intake=intake)
    assert review_plain_has_skipped_section_numbers(out["text"]) is False
    assert review_plain_has_operative_governing_law(out["text"], law) is True
    assert law in out["text"]
    assert "Texas" not in out["text"]
    assert "Northline" not in out["text"]
    assert "Harbor Marks" not in out["text"]
    nums = collect_review_plain_top_level_section_numbers(out["text"])
    for i in range(1, len(nums)):
        assert nums[i] == nums[i - 1] + 1


def test_repair_fills_10_then_12() -> None:
    client, provider, law = "Riverbend Studio", "Oak Point LLC", "Colorado"
    intake = _two_party_intake(client=client, provider=provider, law=law)
    raw = _ten_then_twelve(client=client, provider=provider)
    assert review_plain_has_skipped_section_numbers(raw) is True

    out = repair_review_plain_section_continuity(raw, original_intake=intake)
    assert review_plain_has_skipped_section_numbers(out["text"]) is False
    assert review_plain_has_operative_governing_law(out["text"], law) is True
    nums = collect_review_plain_top_level_section_numbers(out["text"])
    for i in range(1, len(nums)):
        assert nums[i] == nums[i - 1] + 1


def test_does_not_collapse_12_then_14_before_governing_law_is_known() -> None:
    raw = _twelve_then_fourteen(client="Cedar Ridge LLC", provider="Maple Grove Inc")
    out = repair_review_plain_section_continuity(raw)
    assert review_plain_has_skipped_section_numbers(out["text"]) is True
    assert 14 in collect_review_plain_top_level_section_numbers(out["text"])
    assert out["repairs"] == []


def test_leftover_eight_section_is_not_reminted_to_10_11_12_13() -> None:
    client, provider = "Summit Craft Co", "Harborline Design LLC"
    leftover = _leftover_eight_section(client=client, provider=provider)
    assert collect_review_plain_top_level_section_numbers(leftover) == list(range(1, 9))
    assert review_plain_has_skipped_section_numbers(leftover) is False

    out = repair_review_plain_section_continuity(
        leftover,
        original_intake=_two_party_intake(client=client, provider=provider, law="Delaware"),
    )
    nums = collect_review_plain_top_level_section_numbers(out["text"])
    assert 10 not in nums
    assert 11 not in nums
    assert 12 not in nums
    assert 13 not in nums
    assert nums[0] == 1
    assert review_plain_has_skipped_section_numbers(out["text"]) is False


@pytest.mark.parametrize("law", ["Oklahoma", "Colorado", "Delaware"])
def test_extract_supplied_governing_law_reads_customer_dump_order(law: str) -> None:
    intake = _two_party_intake(client="Cedar Ridge LLC", provider="Maple Grove Inc", law=law)
    assert extract_supplied_governing_law(intake) == law
    assert extract_supplied_governing_law("") == ""
