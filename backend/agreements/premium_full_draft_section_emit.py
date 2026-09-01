"""Sequential top-level integer producer for premium-full-draft ``document_text``.

Skip producer (named): premium-full-draft LLM ``document_text`` / ``authoritative_draft``
emission. The model writes planned outline integers (coverage-map / HOUSE STYLE numbering,
length discipline 6–12 sections) and those integers were previously shipped as-is.
When it omitted a planned section (typically governing law) it kept later headings
numbered as planned — live Review painted 12 Force Majeure then 14 Notices.
``_broken_numbering_or_references`` only warned. This is not leftover esign.

This module is the authoritative assigner of top-level integers after that LLM
draft exists. It remints existing headings to sequential 1..N. A missing supplied
term (governing law) is emitted as a new SECTION at the next integer, never as a
hole (N then N+2). Already-sequential leftover 1..8 is identity.

``repair_review_plain_section_continuity`` is defense in depth AFTER this producer.
A corpus that still has skipped integers here must be refused, not repair-then-accepted.
"""

from __future__ import annotations

from typing import Optional

from backend.agreements.review_plain_section_continuity import (
    _insert_governing_law_section,
    _renumber_all_top_level_sequential,
    extract_supplied_governing_law,
    review_plain_has_late_skipped_section_numbers,
    review_plain_has_operative_governing_law,
    review_plain_has_skipped_section_numbers,
)

SKIPPED_TOP_LEVEL_SECTION_INTEGERS = "skipped_top_level_section_integers"


def emit_sequential_premium_full_draft_sections(
    document_text: str,
    *,
    original_intake: str = "",
    jurisdiction: str = "",
) -> dict:
    """Emit premium-full-draft ``document_text`` with sequential top-level integers 1..N.

    Does not call ``repair_review_plain_section_continuity``. Does not invent leftover
    sections 10/11/12/13. Does not invent a governing-law venue when intake is silent.
    """
    repairs: list[str] = []
    working = (document_text or "").replace("\r\n", "\n")
    if not working.strip():
        return {"text": working, "repairs": repairs}

    gov = extract_supplied_governing_law(original_intake, jurisdiction=jurisdiction)
    if gov and not review_plain_has_operative_governing_law(working, gov):
        inserted, extra = _insert_governing_law_section(working, gov)
        working = inserted
        repairs.extend(extra)
        repairs.append("premium_full_draft_section_emit:insert_supplied_governing_law")

    reminted, extra = _renumber_all_top_level_sequential(working)
    working = reminted
    if extra:
        repairs.append("premium_full_draft_section_emit:sequential_1_n")
        repairs.extend(extra)

    return {"text": working.replace("\n\n\n", "\n\n").strip(), "repairs": repairs}


def refuse_skipped_top_level_section_integers(
    plain: str,
    *,
    late_only: bool = False,
) -> Optional[str]:
    """Return a reject code when top-level integers skip. Repair-then-accept is forbidden.

    ``late_only`` is the persist Review gate: refuse 10-then-12 / 12-then-14 without
    refusing leftover persist-Review seeds that have an early 2-then-10 hole.
    premium-full-draft uses ``late_only=False`` so any skip after sequential emit is FAIL.
    """
    if late_only:
        if review_plain_has_late_skipped_section_numbers(plain):
            return SKIPPED_TOP_LEVEL_SECTION_INTEGERS
        return None
    if review_plain_has_skipped_section_numbers(plain):
        return SKIPPED_TOP_LEVEL_SECTION_INTEGERS
    return None
