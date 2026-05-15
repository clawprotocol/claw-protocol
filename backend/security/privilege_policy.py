"""
Deterministic privilege-oriented workflow signals for CLAW.

This module does not perform legal analysis or conclude that material is
legally privileged. It applies conservative keyword/phrase heuristics so
callers can route content toward protected-mode and AI-airlock handling.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Final, Iterable, Literal, Optional, Sequence

AirlockPolicyProfile = Literal["default", "agreement_outbound"]

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

# Representation / general legal-adjacent vocabulary (default / protected-mode profile).
# For ``agreement_outbound``, standalone ``attorney`` / ``lawyer`` are **not** evaluated:
# premium repair JSON often echoes operative boilerplate such as "reasonable attorney fees",
# which must not trip the pre-LLM block for the second pass.
LEGAL_SENSITIVE_SINGLE_TERMS: Final[frozenset[str]] = frozenset(
    {
        "attorney",
        "lawyer",
        # "counsel" alone appears in routine commercial agreements ("independent counsel",
        # "each party may consult counsel") and in LawDog repair payloads; do not block
        # outbound agreement drafting. Retain phrase-level matches like "opposing counsel"
        # under litigation signals.
    }
)

LEGAL_SENSITIVE_PHRASES: Final[tuple[str, ...]] = (
    "legal memo",
)

# ``agreement_outbound`` skips intake-style ``legal memo`` phrase matching: repair JSON and
# adjacent privilege phrasing can contain ``legal`` + ``memo`` tokens without being an intake memo.
LEGAL_SENSITIVE_PHRASES_AGREEMENT_OUTBOUND: Final[tuple[str, ...]] = tuple(
    p for p in LEGAL_SENSITIVE_PHRASES if p != "legal memo"
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
        "deposition",
    }
)

# Outbound commercial agreement drafting (JSON repair payloads, etc.): allow standalone
# "settlement" / "discovery" (payment settlement, API discovery), and generic "litigation" /
# "lawsuit" (forum, fee-shifting, carve-outs) while keeping hard litigation-intake tokens.
LITIGATION_SINGLE_TERMS_AGREEMENT_OUTBOUND: Final[frozenset[str]] = frozenset(
    LITIGATION_SINGLE_TERMS - frozenset({"settlement", "discovery", "litigation", "lawsuit"})
)

# High-signal litigation / intake posture phrases shared by both profiles.
_LITIGATION_PHRASES_SHARED: Final[tuple[str, ...]] = (
    "active lawsuit",
    "active litigation",
    "attorney client privilege",
    "attorney-client privilege",
    "criminal defense",
    "deposition preparation",
    "discovery strategy",
    "litigation hold",
    "litigation strategy",
    "lawsuit strategy",
    "opposing counsel",
    "pending litigation",
    "pending lawsuit",
)

# Default profile only: investigation / intake phrasing uncommon in outbound agreement JSON.
_LITIGATION_PHRASES_DEFAULT_ONLY: Final[tuple[str, ...]] = (
    "claim analysis",
    "defense strategy",
    "file a lawsuit",
    "filed a lawsuit",
    "witness interview",
)

LITIGATION_PHRASES_DEFAULT: Final[tuple[str, ...]] = tuple(
    sorted(frozenset(_LITIGATION_PHRASES_SHARED + _LITIGATION_PHRASES_DEFAULT_ONLY))
)
LITIGATION_PHRASES_AGREEMENT_OUTBOUND: Final[tuple[str, ...]] = tuple(sorted(frozenset(_LITIGATION_PHRASES_SHARED)))

# Explicit privilege / work-product style signals.
PRIVILEGE_CANDIDATE_SINGLE_TERMS: Final[frozenset[str]] = frozenset(
    {
        "privileged",
    }
)

# ``agreement_outbound``: do not treat standalone ``privileged`` as a block (e.g. “privileged
# access”, “privileged and confidential”); keep explicit privilege-intake phrases only.
PRIVILEGE_PHRASES_AGREEMENT_OUTBOUND: Final[tuple[str, ...]] = ("privileged legal memo",)

# Legal-doctrine signals only. Plain "work product" appears in routine commercial/IP clauses
# (deliverables, commissioned designs, software dev) and must not trip protected-mode by itself.
WORK_PRODUCT_PHRASES: Final[tuple[str, ...]] = (
    "attorney work product",
    "attorneys work product",
    "legal work product",
    "privileged work product",
    "work product doctrine",
    "work-product doctrine",
    "work product privilege",
    "work product protection",
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
_LEGAL_SENSITIVE_PHRASE_PATTERNS_AGREEMENT_OUTBOUND: Final[tuple[re.Pattern[str], ...]] = (
    _compile_phrase_patterns(LEGAL_SENSITIVE_PHRASES_AGREEMENT_OUTBOUND)
)

_LITIGATION_WORD_PATTERNS_DEFAULT: Final[tuple[re.Pattern[str], ...]] = (
    _compile_word_patterns(LITIGATION_SINGLE_TERMS)
)
_LITIGATION_WORD_PATTERNS_AGREEMENT_OUTBOUND: Final[tuple[re.Pattern[str], ...]] = (
    _compile_word_patterns(LITIGATION_SINGLE_TERMS_AGREEMENT_OUTBOUND)
)
_LITIGATION_PHRASE_PATTERNS_DEFAULT: Final[tuple[re.Pattern[str], ...]] = (
    _compile_phrase_patterns(LITIGATION_PHRASES_DEFAULT)
)
_LITIGATION_PHRASE_PATTERNS_AGREEMENT_OUTBOUND: Final[tuple[re.Pattern[str], ...]] = (
    _compile_phrase_patterns(LITIGATION_PHRASES_AGREEMENT_OUTBOUND)
)

_PRIVILEGE_WORD_PATTERNS: Final[tuple[re.Pattern[str], ...]] = (
    _compile_word_patterns(PRIVILEGE_CANDIDATE_SINGLE_TERMS)
)
_PRIVILEGE_PHRASE_PATTERNS_AGREEMENT_OUTBOUND: Final[tuple[re.Pattern[str], ...]] = (
    _compile_phrase_patterns(PRIVILEGE_PHRASES_AGREEMENT_OUTBOUND)
)
_WORK_PRODUCT_PHRASE_PATTERNS: Final[tuple[re.Pattern[str], ...]] = (
    _compile_phrase_patterns(WORK_PRODUCT_PHRASES)
)


@dataclass(frozen=True)
class PrivilegeAirlockBlockDiagnostic:
    """
    Production-safe first-hit signal for logging when outbound AI is blocked.

    ``matched_rule_id`` is a stable slug (no user-substance echo beyond a dictionary term).
    """

    reason_code: str
    rule_category: Literal[
        "legal_sensitive_word",
        "legal_sensitive_phrase",
        "litigation_word",
        "litigation_phrase",
        "privilege_word",
        "privilege_phrase",
        "work_product_phrase",
    ]
    matched_rule_id: str


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


def _collect_reason_codes(
    text: str,
    *,
    policy_profile: AirlockPolicyProfile = "default",
) -> tuple[str, ...]:
    codes: list[str] = []

    legal_sensitive_words_hit = (
        policy_profile != "agreement_outbound"
        and _any_match(text, _LEGAL_SENSITIVE_WORD_PATTERNS)
    )
    ls_phrase_patterns = (
        _LEGAL_SENSITIVE_PHRASE_PATTERNS_AGREEMENT_OUTBOUND
        if policy_profile == "agreement_outbound"
        else _LEGAL_SENSITIVE_PHRASE_PATTERNS
    )
    if legal_sensitive_words_hit or _any_match(text, ls_phrase_patterns):
        codes.append(REASON_LEGAL_SENSITIVE_TERM)

    lit_word_patterns = (
        _LITIGATION_WORD_PATTERNS_AGREEMENT_OUTBOUND
        if policy_profile == "agreement_outbound"
        else _LITIGATION_WORD_PATTERNS_DEFAULT
    )
    lit_phrase_patterns = (
        _LITIGATION_PHRASE_PATTERNS_AGREEMENT_OUTBOUND
        if policy_profile == "agreement_outbound"
        else _LITIGATION_PHRASE_PATTERNS_DEFAULT
    )
    if _any_match(text, lit_word_patterns) or _any_match(text, lit_phrase_patterns):
        codes.append(REASON_LITIGATION_SIGNAL)

    if policy_profile == "agreement_outbound":
        if _any_match(text, _PRIVILEGE_PHRASE_PATTERNS_AGREEMENT_OUTBOUND):
            codes.append(REASON_PRIVILEGE_CANDIDATE_TERM)
    else:
        if _any_match(text, _PRIVILEGE_WORD_PATTERNS):
            codes.append(REASON_PRIVILEGE_CANDIDATE_TERM)

    if _any_match(text, _WORK_PRODUCT_PHRASE_PATTERNS):
        codes.append(REASON_WORK_PRODUCT_SIGNAL)

    # Stable, de-duplicated ordering for determinism.
    return tuple(sorted(frozenset(codes)))


def first_privilege_airlock_block_diagnostic(
    text: str,
    *,
    policy_profile: AirlockPolicyProfile = "default",
) -> Optional[PrivilegeAirlockBlockDiagnostic]:
    """
    Return the first policy signal that would contribute to a block, in the same relative
    ordering as :func:`_collect_reason_codes` (for stable ops logging).
    """
    normalized = text.strip()
    if not normalized:
        return None

    if policy_profile != "agreement_outbound":
        for term in sorted(LEGAL_SENSITIVE_SINGLE_TERMS):
            if _word_pattern(term).search(normalized):
                return PrivilegeAirlockBlockDiagnostic(
                    reason_code=REASON_LEGAL_SENSITIVE_TERM,
                    rule_category="legal_sensitive_word",
                    matched_rule_id=f"legal_sensitive_word:{term}",
                )
    ls_phrases = (
        LEGAL_SENSITIVE_PHRASES_AGREEMENT_OUTBOUND
        if policy_profile == "agreement_outbound"
        else LEGAL_SENSITIVE_PHRASES
    )
    for phrase in ls_phrases:
        if _phrase_pattern(phrase).search(normalized):
            slug = re.sub(r"\s+", "_", phrase.strip().lower())
            return PrivilegeAirlockBlockDiagnostic(
                reason_code=REASON_LEGAL_SENSITIVE_TERM,
                rule_category="legal_sensitive_phrase",
                matched_rule_id=f"legal_sensitive_phrase:{slug}",
            )

    lit_terms: frozenset[str] = (
        LITIGATION_SINGLE_TERMS_AGREEMENT_OUTBOUND
        if policy_profile == "agreement_outbound"
        else LITIGATION_SINGLE_TERMS
    )
    for term in sorted(lit_terms):
        if _word_pattern(term).search(normalized):
            return PrivilegeAirlockBlockDiagnostic(
                reason_code=REASON_LITIGATION_SIGNAL,
                rule_category="litigation_word",
                matched_rule_id=f"litigation_word:{term}",
            )
    lit_phrases = (
        LITIGATION_PHRASES_AGREEMENT_OUTBOUND
        if policy_profile == "agreement_outbound"
        else LITIGATION_PHRASES_DEFAULT
    )
    for phrase in lit_phrases:
        if _phrase_pattern(phrase).search(normalized):
            slug = re.sub(r"\s+", "_", phrase.strip().lower())
            return PrivilegeAirlockBlockDiagnostic(
                reason_code=REASON_LITIGATION_SIGNAL,
                rule_category="litigation_phrase",
                matched_rule_id=f"litigation_phrase:{slug}",
            )

    if policy_profile == "agreement_outbound":
        for phrase in PRIVILEGE_PHRASES_AGREEMENT_OUTBOUND:
            if _phrase_pattern(phrase).search(normalized):
                slug = re.sub(r"\s+", "_", phrase.strip().lower())
                return PrivilegeAirlockBlockDiagnostic(
                    reason_code=REASON_PRIVILEGE_CANDIDATE_TERM,
                    rule_category="privilege_phrase",
                    matched_rule_id=f"privilege_phrase:{slug}",
                )
    else:
        for term in sorted(PRIVILEGE_CANDIDATE_SINGLE_TERMS):
            if _word_pattern(term).search(normalized):
                return PrivilegeAirlockBlockDiagnostic(
                    reason_code=REASON_PRIVILEGE_CANDIDATE_TERM,
                    rule_category="privilege_word",
                    matched_rule_id=f"privilege_word:{term}",
                )
    for phrase in WORK_PRODUCT_PHRASES:
        if _phrase_pattern(phrase).search(normalized):
            slug = re.sub(r"\s+", "_", phrase.strip().lower())
            return PrivilegeAirlockBlockDiagnostic(
                reason_code=REASON_WORK_PRODUCT_SIGNAL,
                rule_category="work_product_phrase",
                matched_rule_id=f"work_product_phrase:{slug}",
            )
    return None


def evaluate_privilege_policy(
    text: str,
    *,
    policy_profile: AirlockPolicyProfile = "default",
) -> PrivilegePolicyDecision:
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

    reason_codes = _collect_reason_codes(normalized, policy_profile=policy_profile)
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
