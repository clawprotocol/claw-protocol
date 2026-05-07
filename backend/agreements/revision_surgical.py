"""
Surgical vs material scope for premium structured revise (AgreementDraft JSON).

Used by agreements_v2_api._revise_with_instruction to avoid “regenerate section” behavior
when the user asked for narrow payment / timing edits.
"""

from __future__ import annotations

import re
from typing import Any

_TOKEN_WORD = re.compile(r"[a-z0-9]+", re.IGNORECASE)


def token_jaccard(a: str, b: str) -> float:
    sa = {m.group(0).lower() for m in _TOKEN_WORD.finditer(a or "")}
    sb = {m.group(0).lower() for m in _TOKEN_WORD.finditer(b or "")}
    if not sa and not sb:
        return 1.0
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def instruction_requests_material_rewrite(instr: str) -> bool:
    """
    True only when the user clearly asked for a broad polish / restructure / upgrade.

    Default (False) = surgical / minimal-change expectations.
    """
    t = (instr or "").strip().lower()
    if not t:
        return False
    broad_patterns = [
        r"\brewrite\b.*\b(entire|whole|full)\b",
        r"\bfrom scratch\b",
        r"\bredraft\b",
        r"\boverhaul\b",
        r"\bmaterially upgrade\b",
        r"\bsubstantially rewrite\b",
        r"\bupgrade the draft\b",
        r"\bimprove clarity and structure\b",
        r"\bpolish the (whole|entire) agreement\b",
        r"\brestructure\b.*\b(agreement|contract|draft)\b",
        r"\bprofessionally rewrite\b",
        r"\bfull revision\b",
        r"\brevise extensively\b",
        r"\bcompletely rewrite\b",
    ]
    return any(re.search(p, t) for p in broad_patterns)


def structured_field_is_overbroad(
    original: str,
    revised: str,
    *,
    max_expansion: float = 1.7,
    min_jaccard: float = 0.38,
) -> bool:
    """
    Heuristic: revised text replaced too much of a clause relative to the original.

    Uses token Jaccard overlap plus expansion ratio (length).
    """
    o = (original or "").strip()
    r = (revised or "").strip()
    if len(o) < 28:
        return False
    if not r:
        return False
    ratio = len(r) / max(len(o), 1)
    jac = token_jaccard(o, r)
    if ratio > max_expansion and jac < min_jaccard:
        return True
    if ratio > 1.35 and jac < min_jaccard:
        return True
    if jac < 0.22 and ratio > 1.05:
        return True
    return False


def is_overbroad_structured_revision(
    before: Any,
    after: Any,
    instr: str,
) -> bool:
    """
    True when a narrow-looking instruction likely produced a wholesale field rewrite.

    Skipped when the user explicitly requested a material rewrite.
    """
    if instruction_requests_material_rewrite(instr):
        return False
    ins = (instr or "").lower()
    paymentish = bool(
        re.search(
            r"\b(net\s*\d+|net\s+thirty|net\s+forty|net\s+sixty|payment|invoice|fee|compensat|"
            r"late|overdue|pause|suspend)\b",
            ins,
        )
    )
    if not paymentish:
        return False
    bpt, apt = (before.payment_terms or "").strip(), (after.payment_terms or "").strip()
    if bpt and apt and structured_field_is_overbroad(bpt, apt):
        return True
    bp, ap = (before.purpose or "").strip(), (after.purpose or "").strip()
    if bp and ap and len(ap) > int(len(bp) * 1.45) and token_jaccard(bp, ap) < 0.4:
        return True
    return False


MINIMAL_REVISION_RETRY_SUFFIX = (
    "\n\n---\nMINIMAL_EDIT_RETRY (internal; do not echo this header in output): "
    "The prior JSON changed too much unrelated language relative to `current_draft`. "
    "Re-output the full JSON, but change **only** what the user instruction requires. "
    "Keep every unaffected field **character-for-character** identical to `current_draft` when possible. "
    "For `payment_terms` and `purpose`, preserve existing sentences verbatim; prefer **one or two short "
    "appended sentences** over replacing paragraphs. Do not add commentary or restated background."
)


__all__ = [
    "MINIMAL_REVISION_RETRY_SUFFIX",
    "instruction_requests_material_rewrite",
    "is_overbroad_structured_revision",
    "structured_field_is_overbroad",
    "token_jaccard",
]
