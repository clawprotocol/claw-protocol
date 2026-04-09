"""
Deterministic privilege-oriented workflow signals for CLAW.

This module does not perform legal analysis or conclude that material is
legally privileged. It applies conservative keyword/phrase heuristics so
callers can route content toward protected-mode and AI-airlock handling.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Final, Iterable, Sequence

# ---------------------------------------------------------------------------
# Reason codes (stable strings for logging, metrics, and policy wiring)
# ---------------------------------------------------------------------------

REASON_LEGAL_SENSITIVE_TERM: Final[str] = "LEGAL_SENSITIVE_TERM"
REASON_PRIVILEGE_CANDIDATE_TERM: Final[str] = "PRIVILEGE_CANDIDATE_TERM"
REASON_WORK_PRODUCT_SIGNAL: Final[str] = "WORK_PRODUCT_SIGNAL"
REASON_LITIGATION_SIGNAL: Final[str] = "LITIGATION_SIGNAL"

# ---------------------------------------------------------------------------
# Expandable inventories (lowercase; matching is case-insensitive)
# ---------------------------------------------------------------------------

# Representation / general legal-adjacent vocabulary.
LEGAL_SENSITIVE_SINGLE_TERMS: Final[frozenset[str]] = frozenset(
    {
        "attorney",
        "lawyer",
        "counsel",
    }
)

LEGAL_SENSITIVE_PHRASES: Final[tuple[str, ...]] = (
    "legal memo",
)

# Terms that suggest litigation or dispute posture.
LITIGATION_SINGLE_TERMS: Final[frozenset[str]] = frozenset(
    {
        "litigation",
        "lawsuit",
        "settlement",
        "subpoena",
        "plaintiff",
        "defendant",
        "discovery",
    }
)

LITIGATION_PHRASES: Final[tuple[str, ...]] = (
    "opposing counsel",
    "witness interview",
    "claim analysis",
    "defense strategy",
)

# Explicit privilege / work-product style signals.
PRIVILEGE_CANDIDATE_SINGLE_TERMS: Final[frozenset[str]] = frozenset(
    {
        "privileged",
    }
)

WORK_PRODUCT_PHRASES: Final[tuple[str, ...]] = (
    "work product",
)


def _phrase_pattern(phrase: str) -> re.Pattern[str]:
    # Word boundaries at ends; phrase may contain spaces.
    escaped = re.escape(phrase)
    return re.compile(rf"\b{escaped}\b", re.IGNORECASE)


def _word_pattern(term: str) -> re.Pattern[str]:
    return re.compile(rf"\b{re.escape(term)}\b", re.IGNORECASE)


def _compile_phrase_patterns(phrases: Sequence[str]) -> tuple[re.Pattern[str], ...]:
    return tuple(_phrase_pattern(p) for p in sorted(phrases))


def _compile_word_patterns(terms: Iterable[str]) -> tuple[re.Pattern[str], ...]:
    return tuple(_word_pattern(t) for t in sorted(terms))


_LEGAL_SENSITIVE_WORD_PATTERNS: Final[tuple[re.Pattern[str], ...]] = (
    _compile_word_patterns(LEGAL_SENSITIVE_SINGLE_TERMS)
)
_LEGAL_SENSITIVE_PHRASE_PATTERNS: Final[tuple[re.Pattern[str], ...]] = (
    _compile_phrase_patterns(LEGAL_SENSITIVE_PHRASES)
)

_LITIGATION_WORD_PATTERNS: Final[tuple[re.Pattern[str], ...]] = (
    _compile_word_patterns(LITIGATION_SINGLE_TERMS)
)
_LITIGATION_PHRASE_PATTERNS: Final[tuple[re.Pattern[str], ...]] = (
    _compile_phrase_patterns(LITIGATION_PHRASES)
)

_PRIVILEGE_WORD_PATTERNS: Final[tuple[re.Pattern[str], ...]] = (
    _compile_word_patterns(PRIVILEGE_CANDIDATE_SINGLE_TERMS)
)
_WORK_PRODUCT_PHRASE_PATTERNS: Final[tuple[re.Pattern[str], ...]] = (
    _compile_phrase_patterns(WORK_PRODUCT_PHRASES)
)


@dataclass(frozen=True)
class PrivilegePolicyDecision:
    """Outcome of deterministic privilege-oriented workflow classification."""

    is_legal_sensitive: bool
    is_privileged_candidate: bool
    requires_protected_mode: bool
    allow_external_ai: bool
    allow_raw_upload_to_ai: bool
    reason_codes: tuple[str, ...] = field(default_factory=tuple)

    # Note: tuple reason_codes keeps the result hashable and order stable.


def _any_match(text: str, patterns: Sequence[re.Pattern[str]]) -> bool:
    return any(p.search(text) for p in patterns)


def _collect_reason_codes(text: str) -> tuple[str, ...]:
    codes: list[str] = []

    if _any_match(text, _LEGAL_SENSITIVE_WORD_PATTERNS) or _any_match(
        text, _LEGAL_SENSITIVE_PHRASE_PATTERNS
    ):
        codes.append(REASON_LEGAL_SENSITIVE_TERM)

    if _any_match(text, _LITIGATION_WORD_PATTERNS) or _any_match(
        text, _LITIGATION_PHRASE_PATTERNS
    ):
        codes.append(REASON_LITIGATION_SIGNAL)

    if _any_match(text, _PRIVILEGE_WORD_PATTERNS):
        codes.append(REASON_PRIVILEGE_CANDIDATE_TERM)

    if _any_match(text, _WORK_PRODUCT_PHRASE_PATTERNS):
        codes.append(REASON_WORK_PRODUCT_SIGNAL)

    # Stable, de-duplicated ordering for determinism.
    return tuple(sorted(frozenset(codes)))


def evaluate_privilege_policy(text: str) -> PrivilegePolicyDecision:
    """
    Classify ``text`` using conservative keyword/phrase rules.

    Empty or whitespace-only input yields a non-restrictive decision with no
    reason codes. This is a safety classifier for workflow routing, not a
    legal conclusion about privilege or confidentiality.
    """
    normalized = text.strip()
    if not normalized:
        return PrivilegePolicyDecision(
            is_legal_sensitive=False,
            is_privileged_candidate=False,
            requires_protected_mode=False,
            allow_external_ai=True,
            allow_raw_upload_to_ai=True,
            reason_codes=(),
        )

    reason_codes = _collect_reason_codes(normalized)
    is_legal_sensitive = len(reason_codes) > 0
    is_privileged_candidate = (
        REASON_PRIVILEGE_CANDIDATE_TERM in reason_codes
        or REASON_WORK_PRODUCT_SIGNAL in reason_codes
    )

    if is_legal_sensitive:
        return PrivilegePolicyDecision(
            is_legal_sensitive=True,
            is_privileged_candidate=is_privileged_candidate,
            requires_protected_mode=True,
            allow_external_ai=False,
            allow_raw_upload_to_ai=False,
            reason_codes=reason_codes,
        )

    return PrivilegePolicyDecision(
        is_legal_sensitive=False,
        is_privileged_candidate=False,
        requires_protected_mode=False,
        allow_external_ai=True,
        allow_raw_upload_to_ai=True,
        reason_codes=reason_codes,
    )
