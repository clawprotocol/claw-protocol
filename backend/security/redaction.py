"""
First-pass text redaction for AI-bound sanitization.

Conservative regex/heuristic detection; not a substitute for legal anonymization.
All internal mappings are request-scope only (no persistence).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# Priority for overlap resolution (higher wins).
_CATEGORY_PRIORITY: dict[str, int] = {
    "ssn": 100,
    "email": 90,
    "case_id": 85,
    "phone": 80,
    "address": 75,
    "account": 70,
    "org": 65,
    "name": 60,
}

_PLACEHOLDER_PREFIX: dict[str, str] = {
    "email": "EMAIL",
    "phone": "PHONE",
    "address": "ADDRESS",
    "account": "ACCOUNT",
    "case_id": "CASE_ID",
    "ssn": "SSN",
    "name": "NAME",
    "org": "ORG",
}


@dataclass(frozen=True)
class RedactionResult:
    """Structured output from a single redaction pass."""

    redacted_text: str
    redaction_counts: dict[str, int] = field(default_factory=dict)
    redaction_categories: list[str] = field(default_factory=list)


@dataclass
class _Span:
    start: int
    end: int
    category: str

    def __len__(self) -> int:
        return self.end - self.start


def _merge_spans(spans: list[_Span]) -> list[_Span]:
    """
    Keep a non-overlapping set: higher category priority wins; then longer span; then earlier start.
    """
    if not spans:
        return []
    ordered = sorted(
        spans,
        key=lambda s: (
            -_CATEGORY_PRIORITY.get(s.category, 0),
            -len(s),
            s.start,
        ),
    )
    kept: list[_Span] = []
    for sp in ordered:
        overlaps = False
        for k in kept:
            if not (sp.end <= k.start or sp.start >= k.end):
                overlaps = True
                break
        if not overlaps:
            kept.append(sp)
    return sorted(kept, key=lambda s: (s.start, s.end))


# --- Pattern finders ---

_RE_EMAIL = re.compile(
    r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b",
    re.IGNORECASE,
)

_RE_SSN = re.compile(
    r"\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b",
)

# US phone: require formatting or +1 to reduce false positives on long IDs
_RE_PHONE = re.compile(
    r"(?:\+1\s*)?"
    r"(?:\(\s*\d{3}\s*\)|\b\d{3})[\s.\-]?\d{3}[\s.\-]?\d{4}\b"
    r"|\b\d{3}[\s.\-]\d{3}[\s.\-]\d{4}\b",
    re.IGNORECASE,
)

# Federal docket style; state-style; explicit labels
_RE_CASE_FEDERAL = re.compile(
    r"\b\d:\d{2}-(?:cv|cr|mj|mc|ap)-\d+\b",
    re.IGNORECASE,
)
_RE_CASE_STATEISH = re.compile(
    r"\b\d{2,4}-[A-Z]{1,4}-\d{2,8}\b",
)
_RE_CASE_LABELED = re.compile(
    r"(?i)\b(?:case|cause|docket)\s*(?:no\.?|number|#)?\s*[:\s]?\s*"
    r"([A-Z0-9]{1,3}:\d{2}-[a-z]{2}-\d+|[A-Z0-9][A-Z0-9\-]{2,25})\b",
)

# Street line + optional city, ST ZIP (conservative)
_RE_ADDRESS = re.compile(
    r"\b\d{1,6}\s+[NnSsEeWw]?\s*[A-Za-z0-9][A-Za-z0-9.'\-\s]{0,48}?"
    r"(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|"
    r"Boulevard|Blvd\.?|Court|Ct\.?|Way|Circle|Cir\.?|Place|Pl\.?)\b"
    r"(?:\s*,\s*[A-Za-z][A-Za-z\s.\-]{1,35},\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)?",
    re.IGNORECASE,
)

# Account / long numeric identifiers (after phones/SSN handled in merge order)
_RE_ACCOUNT_KEYWORD = re.compile(
    r"(?i)\b(?:account|acct|a/c|routing)\s*#?\s*[:\s]?\s*([\d\-\s]{8,22})\b",
)
_RE_LONG_DIGITS = re.compile(
    r"\b\d{12,19}\b",
)
_RE_CARD_LIKE = re.compile(
    r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b",
)

# Names: honorific + first + last; litigation roles + capitalized tokens
_RE_NAME_HONORIFIC = re.compile(
    r"\b(?:Mr\.|Ms\.|Mrs\.|Dr\.|Prof\.|Miss\b)\s+"
    r"([A-Z][a-z]+)\s+([A-Z][a-z]+)\b",
)
_RE_NAME_LITIGATION = re.compile(
    r"(?i)\b(?:plaintiff|defendant|petitioner|respondent|appellant|appellee|movant|deponent)\s+"
    r"([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b",
)

# Organization: capped phrase + suffix (optional, light touch)
_RE_ORG = re.compile(
    r"\b([A-Z][a-zA-Z&]+(?:\s+[A-Z][a-zA-Z&]+){0,4})\s+"
    r"(?:Inc\.?|LLC|L\.L\.C\.|Corp\.?|Corporation|Ltd\.?|Limited|LP|LLP)\b",
)


def _find_spans(text: str) -> list[_Span]:
    spans: list[_Span] = []

    for m in _RE_EMAIL.finditer(text):
        spans.append(_Span(m.start(), m.end(), "email"))

    for m in _RE_SSN.finditer(text):
        spans.append(_Span(m.start(), m.end(), "ssn"))

    for m in _RE_PHONE.finditer(text):
        digits = re.sub(r"\D", "", m.group(0))
        if len(digits) < 10:
            continue
        spans.append(_Span(m.start(), m.end(), "phone"))

    for m in _RE_CASE_FEDERAL.finditer(text):
        spans.append(_Span(m.start(), m.end(), "case_id"))
    for m in _RE_CASE_STATEISH.finditer(text):
        spans.append(_Span(m.start(), m.end(), "case_id"))
    for m in _RE_CASE_LABELED.finditer(text):
        spans.append(_Span(m.start(), m.end(), "case_id"))

    for m in _RE_ADDRESS.finditer(text):
        spans.append(_Span(m.start(), m.end(), "address"))

    for m in _RE_ACCOUNT_KEYWORD.finditer(text):
        spans.append(_Span(m.start(), m.end(), "account"))
    for m in _RE_CARD_LIKE.finditer(text):
        spans.append(_Span(m.start(), m.end(), "account"))
    for m in _RE_LONG_DIGITS.finditer(text):
        spans.append(_Span(m.start(), m.end(), "account"))

    for m in _RE_NAME_HONORIFIC.finditer(text):
        spans.append(_Span(m.start(), m.end(), "name"))
    for m in _RE_NAME_LITIGATION.finditer(text):
        spans.append(_Span(m.start(), m.end(), "name"))

    for m in _RE_ORG.finditer(text):
        spans.append(_Span(m.start(), m.end(), "org"))

    return spans


def _assign_placeholders(
    text: str,
    spans: list[_Span],
) -> tuple[str, dict[str, int], list[str]]:
    """Build redacted text and counts; stable numbering per category per normalized value."""
    if not spans:
        return text, {}, []

    spans_sorted = sorted(spans, key=lambda s: (s.start, s.end))
    counters: dict[str, int] = {}
    value_to_idx: dict[tuple[str, str], int] = {}
    replacements: list[tuple[int, int, str]] = []

    def placeholder_for(category: str, norm_key: str) -> str:
        key = (category, norm_key)
        if key not in value_to_idx:
            counters[category] = counters.get(category, 0) + 1
            value_to_idx[key] = counters[category]
        idx = value_to_idx[key]
        prefix = _PLACEHOLDER_PREFIX[category]
        return f"[{prefix}_{idx}]"

    for sp in spans_sorted:
        segment = text[sp.start : sp.end]
        if sp.category == "email":
            nk = segment.lower()
        elif sp.category == "phone":
            nk = re.sub(r"\D", "", segment)
        elif sp.category == "ssn":
            nk = re.sub(r"\D", "", segment)
        elif sp.category == "case_id":
            nk = re.sub(r"\s+", " ", segment.upper())
        elif sp.category == "account":
            nk = re.sub(r"\D", "", segment) or segment.lower()
        elif sp.category == "address":
            nk = re.sub(r"\s+", " ", segment.lower())
        elif sp.category == "name":
            nk = re.sub(r"\s+", " ", segment.lower())
        elif sp.category == "org":
            nk = re.sub(r"\s+", " ", segment.lower())
        else:
            nk = segment.lower()

        ph = placeholder_for(sp.category, nk)
        replacements.append((sp.start, sp.end, ph))

    # Apply from end to start
    out = text
    for start, end, ph in sorted(replacements, key=lambda t: t[0], reverse=True):
        out = out[:start] + ph + out[end:]

    categories_sorted = sorted(counters.keys())
    return out, {k: counters[k] for k in categories_sorted}, categories_sorted


def redact_text(raw: str) -> RedactionResult:
    """
    Redact sensitive-looking spans from raw text.

    Same normalized value within one call reuses the same placeholder index
    for that category. Mappings are not stored beyond this call.
    """
    if raw == "":
        return RedactionResult(redacted_text="", redaction_counts={}, redaction_categories=[])

    spans = _find_spans(raw)
    merged = _merge_spans(spans)
    redacted, counts, cats = _assign_placeholders(raw, merged)
    return RedactionResult(
        redacted_text=redacted,
        redaction_counts=counts,
        redaction_categories=cats,
    )


class TextRedactor:
    """
    Thin wrapper for future dependency injection / policy hooks.
    Stateless; safe to instantiate per request.
    """

    def redact(self, raw: str) -> RedactionResult:
        return redact_text(raw)
