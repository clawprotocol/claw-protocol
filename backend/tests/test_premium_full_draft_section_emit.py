"""premium-full-draft sequential section emit + refuse gate.

The skip producer is premium-full-draft LLM ``document_text`` integers accepted as-is.
These tests inspect ``emit_sequential_premium_full_draft_sections`` output BEFORE
``repair_review_plain_section_continuity``. Identity-through of 12-then-14 or
10-then-12 is FAIL. Repair-then-accept is not proof.

Does not remint leftover 1..8 into 10/11/12/13.
Does not hard-code Texas / Northline / Harbor / Priya / Diego.
"""

from __future__ import annotations

import pytest

from backend.agreements.premium_full_draft_section_emit import (
    SKIPPED_TOP_LEVEL_SECTION_INTEGERS,
    emit_sequential_premium_full_draft_sections,
    refuse_skipped_top_level_section_integers,
)
from backend.agreements.review_plain_section_continuity import (
    collect_review_plain_top_level_section_numbers,
    repair_review_plain_section_continuity,
    review_plain_has_operative_governing_law,
    review_plain_has_skipped_section_numbers,
)
from backend.services.accepted_review_snapshot import MIN_CORPUS_LEN, create_pending_snapshot
from backend.tests.test_review_plain_section_continuity import (
    _as_persist_review_html,
    _as_persist_review_markup,
    _leftover_eight_section,
    _sequential_1_through,
    _sequential_1_through_12_wrapped_notices,
    _ten_then_twelve,
    _twelve_then_fourteen,
    _two_party_intake,
)

pytestmark = pytest.mark.unit


def _pad_to_persist_floor(plain: str) -> str:
    if len(plain) >= MIN_CORPUS_LEN:
        return plain
    pad = "Each party shall perform its obligations in good faith. "
    extra = pad * ((MIN_CORPUS_LEN - len(plain)) // len(pad) + 2)
    return plain.replace(
        "IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.",
        f"{extra.strip()}\n\nIN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.",
    )


def _assert_sequential(plain: str) -> None:
    nums = collect_review_plain_top_level_section_numbers(plain)
    assert review_plain_has_skipped_section_numbers(plain) is False
    assert nums == list(range(1, len(nums) + 1))


@pytest.mark.parametrize(
    ("law", "client", "provider"),
    [
        ("Oklahoma", "Cedar Ridge LLC", "Maple Grove Inc"),
        ("Colorado", "Riverbend Studio", "Oak Point LLC"),
        ("New York", "Summit Craft Co", "Harborline Design LLC"),
    ],
)
def test_producer_output_before_repair_fails_12_then_14_and_10_then_12(
    law: str, client: str, provider: str
) -> None:
    intake = _two_party_intake(client=client, provider=provider, law=law)
    skipped_12_14 = _twelve_then_fourteen(client=client, provider=provider)
    skipped_10_12 = _ten_then_twelve(client=client, provider=provider)

    assert review_plain_has_skipped_section_numbers(skipped_12_14) is True
    assert review_plain_has_skipped_section_numbers(skipped_10_12) is True

    emitted_12_14 = emit_sequential_premium_full_draft_sections(
        skipped_12_14, original_intake=intake
    )
    emitted_10_12 = emit_sequential_premium_full_draft_sections(
        skipped_10_12, original_intake=intake
    )

    # BEFORE review_plain_section_continuity repair — identity-through is FAIL.
    assert "repair_review_plain_section_continuity" not in emitted_12_14.get("repairs", [])
    _assert_sequential(emitted_12_14["text"])
    _assert_sequential(emitted_10_12["text"])
    assert review_plain_has_operative_governing_law(emitted_12_14["text"], law) is True
    assert law in emitted_12_14["text"]
    assert "Texas" not in emitted_12_14["text"]
    assert "Northline" not in emitted_12_14["text"]
    assert "Harbor Marks" not in emitted_12_14["text"]
    assert "Priya" not in emitted_12_14["text"]
    assert "Diego" not in emitted_12_14["text"]

    repaired = repair_review_plain_section_continuity(
        emitted_12_14["text"], original_intake=intake
    )
    assert repaired["text"] == emitted_12_14["text"] or not review_plain_has_skipped_section_numbers(
        repaired["text"]
    )


def test_identity_emit_of_12_then_14_is_refused_by_gate() -> None:
    raw = _twelve_then_fourteen(client="Cedar Ridge LLC", provider="Maple Grove Inc")
    assert refuse_skipped_top_level_section_integers(raw) == SKIPPED_TOP_LEVEL_SECTION_INTEGERS
    raw_10 = _ten_then_twelve(client="Riverbend Studio", provider="Oak Point LLC")
    assert refuse_skipped_top_level_section_integers(raw_10) == SKIPPED_TOP_LEVEL_SECTION_INTEGERS

    sequential = _sequential_1_through(14, client="Cedar Ridge LLC", provider="Maple Grove Inc")
    assert refuse_skipped_top_level_section_integers(sequential) is None


def test_leftover_eight_section_stays_1_through_8() -> None:
    client, provider = "Summit Craft Co", "Harborline Design LLC"
    leftover = _leftover_eight_section(client=client, provider=provider)
    assert collect_review_plain_top_level_section_numbers(leftover) == list(range(1, 9))

    emitted = emit_sequential_premium_full_draft_sections(
        leftover,
        original_intake=_two_party_intake(client=client, provider=provider, law="Delaware"),
    )
    nums = collect_review_plain_top_level_section_numbers(emitted["text"])
    assert nums == list(range(1, 9))
    assert 10 not in nums
    assert 11 not in nums
    assert 12 not in nums
    assert 13 not in nums
    assert refuse_skipped_top_level_section_integers(emitted["text"]) is None


@pytest.mark.parametrize(
    ("law", "client", "provider", "attn_a", "attn_b"),
    [
        ("Oklahoma", "Cedar Ridge LLC", "Maple Grove Inc", "Jordan Hale", "Morgan Ellis"),
        ("Colorado", "Riverbend Studio", "Oak Point LLC", "Casey Quinn", "Riley Chen"),
        ("New York", "Summit Craft Co", "Harborline Design LLC", "Avery Cole", "Sam Ortiz"),
    ],
)
def test_persist_accepts_sequential_wrapped_heading_1_through_12(
    law: str, client: str, provider: str, attn_a: str, attn_b: str
) -> None:
    sequential = _pad_to_persist_floor(
        _sequential_1_through_12_wrapped_notices(
            client=client, provider=provider, law=law, attn_a=attn_a, attn_b=attn_b
        )
    )
    assert collect_review_plain_top_level_section_numbers(sequential) == list(range(1, 13))
    assert refuse_skipped_top_level_section_integers(sequential, late_only=True) is None
    ok, err, snap, _reg = create_pending_snapshot(
        agreement_id=f"agr_wrap_1_12_{law.lower().replace(' ', '_')}",
        corpus_plain=sequential,
    )
    assert ok is True
    assert err is None
    assert snap is not None
    persisted_nums = collect_review_plain_top_level_section_numbers(snap["corpusPlain"])
    assert persisted_nums == list(range(1, 13))
    assert "Texas" not in snap["corpusPlain"]
    assert "Northline" not in snap["corpusPlain"]
    assert "Priya" not in snap["corpusPlain"]
    assert "Diego" not in snap["corpusPlain"]


@pytest.mark.parametrize(
    ("law", "client", "provider", "attn_a", "attn_b"),
    [
        ("Oklahoma", "Cedar Ridge LLC", "Maple Grove Inc", "Jordan Hale", "Morgan Ellis"),
        ("Colorado", "Riverbend Studio", "Oak Point LLC", "Casey Quinn", "Riley Chen"),
        ("New York", "Summit Craft Co", "Harborline Design LLC", "Avery Cole", "Sam Ortiz"),
    ],
)
def test_persist_accepts_sequential_html_markup_1_through_12(
    law: str, client: str, provider: str, attn_a: str, attn_b: str
) -> None:
    sequential = _pad_to_persist_floor(
        _sequential_1_through_12_wrapped_notices(
            client=client, provider=provider, law=law, attn_a=attn_a, attn_b=attn_b
        )
    )
    variants = (
        _as_persist_review_html(sequential),
        _as_persist_review_markup(sequential),
        sequential.replace("12. Notices", "12.&nbsp;Notices").replace(
            "2. Revisions,",
            '<h2 class="premium-doc-section-heading">2. Revisions,</h2>',
        ),
    )
    for idx, corpus in enumerate(variants):
        assert collect_review_plain_top_level_section_numbers(corpus) == list(range(1, 13))
        assert refuse_skipped_top_level_section_integers(corpus, late_only=True) is None
        ok, err, snap, _reg = create_pending_snapshot(
            agreement_id=f"agr_persist_html_{law.lower().replace(' ', '_')}_{idx}",
            corpus_plain=_pad_to_persist_floor(corpus),
        )
        assert ok is True
        assert err is None
        assert snap is not None
        assert collect_review_plain_top_level_section_numbers(snap["corpusPlain"]) == list(
            range(1, 13)
        )
        assert "Texas" not in snap["corpusPlain"]
        assert "Northline" not in snap["corpusPlain"]
        assert "Priya" not in snap["corpusPlain"]
        assert "Diego" not in snap["corpusPlain"]


def test_persist_refuses_12_then_14_and_10_then_12_without_repair() -> None:
    skipped_12_14 = _pad_to_persist_floor(
        _twelve_then_fourteen(client="Cedar Ridge LLC", provider="Maple Grove Inc")
    )
    skipped_10_12 = _pad_to_persist_floor(
        _ten_then_twelve(client="Riverbend Studio", provider="Oak Point LLC")
    )
    assert review_plain_has_skipped_section_numbers(skipped_12_14) is True
    assert review_plain_has_skipped_section_numbers(skipped_10_12) is True

    ok, err, snap, _reg = create_pending_snapshot(
        agreement_id="agr_skip_12_14",
        corpus_plain=skipped_12_14,
    )
    assert ok is False
    assert err == SKIPPED_TOP_LEVEL_SECTION_INTEGERS
    assert snap is None

    ok, err, snap, _reg = create_pending_snapshot(
        agreement_id="agr_skip_10_12",
        corpus_plain=skipped_10_12,
    )
    assert ok is False
    assert err == SKIPPED_TOP_LEVEL_SECTION_INTEGERS
    assert snap is None

    skipped_12_14_html = _pad_to_persist_floor(_as_persist_review_html(skipped_12_14))
    skipped_10_12_html = _pad_to_persist_floor(_as_persist_review_html(skipped_10_12))
    ok, err, snap, _reg = create_pending_snapshot(
        agreement_id="agr_skip_12_14_html",
        corpus_plain=skipped_12_14_html,
    )
    assert ok is False
    assert err == SKIPPED_TOP_LEVEL_SECTION_INTEGERS
    assert snap is None
    ok, err, snap, _reg = create_pending_snapshot(
        agreement_id="agr_skip_10_12_html",
        corpus_plain=skipped_10_12_html,
    )
    assert ok is False
    assert err == SKIPPED_TOP_LEVEL_SECTION_INTEGERS
    assert snap is None


def test_persist_accepts_leftover_1_through_8() -> None:
    leftover = _pad_to_persist_floor(
        _leftover_eight_section(client="Summit Craft Co", provider="Harborline Design LLC")
    )
    assert collect_review_plain_top_level_section_numbers(leftover) == list(range(1, 9))
    ok, err, snap, _reg = create_pending_snapshot(
        agreement_id="agr_leftover_eight",
        corpus_plain=leftover,
    )
    assert ok is True
    assert err is None
    assert snap is not None
    persisted_nums = collect_review_plain_top_level_section_numbers(snap["corpusPlain"])
    assert persisted_nums == list(range(1, 9))


def test_persist_late_gate_does_not_refuse_early_2_then_10_seed() -> None:
    """Unrelated persist Review seed class (2 then 10). Must not trip the late-skip gate."""
    seed = _pad_to_persist_floor(
        "\n".join(
            [
                "SERVICES AGREEMENT",
                "",
                "This Agreement is between Cedar Ridge LLC and Maple Grove Inc.",
                "",
                "2. Term",
                "The engagement continues for 30 days.",
                "",
                "10. Liability",
                "Each party's aggregate liability is limited to fees paid.",
                "",
                "11. Governing Law",
                "This Agreement is governed by the laws of the applicable jurisdiction.",
                "",
                "12. Notices",
                "Notices must be in writing.",
                "",
                "13. Miscellaneous",
                "This Agreement is the entire agreement of the parties.",
                "",
                "IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.",
            ]
        )
    )
    assert refuse_skipped_top_level_section_integers(seed, late_only=True) is None
    ok, err, snap, _reg = create_pending_snapshot(
        agreement_id="agr_early_hole_seed",
        corpus_plain=seed,
    )
    assert ok is True
    assert err is None
    assert snap is not None


def test_missing_term_is_next_integer_never_a_hole() -> None:
    client, provider, law = "Cedar Ridge LLC", "Maple Grove Inc", "Oklahoma"
    raw = _twelve_then_fourteen(client=client, provider=provider)
    emitted = emit_sequential_premium_full_draft_sections(
        raw, original_intake=_two_party_intake(client=client, provider=provider, law=law)
    )
    nums = collect_review_plain_top_level_section_numbers(emitted["text"])
    _assert_sequential(emitted["text"])
    assert 13 in nums
    assert review_plain_has_operative_governing_law(emitted["text"], law) is True
