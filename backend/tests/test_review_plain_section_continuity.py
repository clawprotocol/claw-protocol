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


def _sequential_1_through_12_wrapped_notices(*, client: str, provider: str, law: str, attn_a: str, attn_b: str) -> str:
    """Live persist class: sequential 1..12, wrapped heading 2, subsections, Notices Attn/If-to.

    After Notices, include wrap remnants / numbered If-to / street lines that must not
    be read as skipped integers. Notices is last (no 13 Miscellaneous).
    """
    return "\n".join(
        [
            "SERVICES AGREEMENT",
            "",
            f'This Services Agreement (this "Agreement") is entered into as of the Effective Date '
            f'by and between {client} ("Client") and {provider} ("Service Provider").',
            "",
            "1. Services and Deliverables",
            f"{provider} will provide design services for a logo and brand kit.",
            "(a) primary mark",
            "(b) color system",
            "(c) usage guide",
            "",
            "2. Revisions,",
            "Client Input, and Changes",
            "The flat fee in this Agreement includes up to two rounds of reasonable revisions.",
            "",
            "3. Fees and Payment",
            "Fees are due as stated in this Agreement.",
            "",
            "4. Term and Termination",
            "The engagement continues until the deliverables are complete.",
            "4.1 Early Termination",
            "Either party may terminate for material breach after written notice.",
            "",
            "5. Intellectual Property",
            "Client owns final deliverables upon payment.",
            "5.1 Portfolio License",
            f"{provider} retains a limited portfolio license.",
            "",
            "6. Confidentiality",
            "Each party keeps non-public information confidential.",
            "",
            "7. Representations and Warranties",
            "Each party represents it has authority to enter this Agreement.",
            "",
            "8. Indemnification",
            "Each party indemnifies the other for third-party claims arising from its breach.",
            "",
            "9. Liability Allocation",
            "Mutual indemnification applies. Liability for indirect damages is excluded. Total liability is capped at fees paid.",
            "",
            "10. Independent Contractor and Assignment",
            "This Agreement cannot be assigned without prior written consent, except for a merger or sale.",
            "",
            "11. Governing Law",
            f"This Agreement is governed by the laws of {law}, without regard to conflict-of-laws principles.",
            "",
            "12. Notices",
            "Any notice under this Agreement must be in writing and delivered via email, personal delivery, or overnight courier.",
            "Notices may be delivered by:",
            "1. Email",
            "2. Personal delivery",
            "3. Overnight courier",
            "",
            f"If to {client}:",
            client,
            f"Attn: {attn_a}",
            f"Email: notices-{client.split()[0].lower()}@example.test",
            "10. Main Street",
            "",
            f"If to {provider}:",
            provider,
            f"Attn: {attn_b}",
            f"Email: notices-{provider.split()[0].lower()}@example.test",
            "1. If to leftover wrap should not count",
            "",
            "2. Revisions,",
            "Client Input, and Changes",
            "",
            "IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.",
            "",
            f"CLIENT: {client}",
            "By: ____________________",
            "",
            f"SERVICE PROVIDER: {provider}",
            "By: ____________________",
        ]
    )


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


@pytest.mark.parametrize(
    ("law", "client", "provider", "attn_a", "attn_b"),
    [
        ("Oklahoma", "Cedar Ridge LLC", "Maple Grove Inc", "Jordan Hale", "Morgan Ellis"),
        ("Colorado", "Riverbend Studio", "Oak Point LLC", "Casey Quinn", "Riley Chen"),
        ("New York", "Summit Craft Co", "Harborline Design LLC", "Avery Cole", "Sam Ortiz"),
    ],
)
def test_sequential_wrapped_heading_1_through_12_is_not_a_skip(
    law: str, client: str, provider: str, attn_a: str, attn_b: str
) -> None:
    """Persist Review 1..12 with wrapped heading 2 + Notices Attn must not false-refuse."""
    sequential = _sequential_1_through_12_wrapped_notices(
        client=client, provider=provider, law=law, attn_a=attn_a, attn_b=attn_b
    )
    nums = collect_review_plain_top_level_section_numbers(sequential)
    assert nums == list(range(1, 13))
    assert review_plain_has_skipped_section_numbers(sequential) is False
    assert review_plain_has_late_skipped_section_numbers(sequential) is False
    assert "13." not in [f"{n}." for n in nums]
    assert law in sequential
    assert "Texas" not in sequential
    assert "Northline" not in sequential
    assert "Priya" not in sequential
    assert "Diego" not in sequential

    skipped_12_14 = _twelve_then_fourteen(client=client, provider=provider)
    assert review_plain_has_late_skipped_section_numbers(skipped_12_14) is True
    assert 14 in collect_review_plain_top_level_section_numbers(skipped_12_14)
    assert 13 not in collect_review_plain_top_level_section_numbers(skipped_12_14)


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
