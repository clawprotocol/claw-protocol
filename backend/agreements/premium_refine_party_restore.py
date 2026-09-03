"""
Restore identity placeholders introduced by a premium-refine remint.

When the pre-refine corpus already had resolved party names, a candidate that
rewrites them to ``[ORG_n]`` / ``[PARTY_n]`` must not be emitted. Hollow
starter drafts that already contain those slots are left untouched so genuine
template protection still fails closed.
"""

from __future__ import annotations

import re
from typing import List, Tuple

_IDENTITY_BRACKET_RE = re.compile(
    r"\[\s*(?P<kind>ORG|PARTY|PERSON|ENTITY|CLIENT|COMPANY|ORGANIZATION)[_\s\-]*(?P<idx>[1-9]\d*)\s*\]",
    re.IGNORECASE,
)

_BETWEEN_RE = re.compile(
    r"by\s+and\s+between\s+(.+?)\s+and\s+(.+?)(?:\s*\(|\s*,|\s*\.|$)",
    re.IGNORECASE | re.DOTALL,
)

_ORG_SUFFIX_RE = re.compile(
    r"\b([A-Z][A-Za-z0-9&.'’\-]+(?:\s+[A-Z][A-Za-z0-9&.'’\-]+){0,5}\s+"
    r"(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|LP|L\.P\.|PLLC))\b"
)

_SIGNATURE_NAME_RE = re.compile(
    r"(?im)^(?:CLIENT|CUSTOMER|SERVICE\s+PROVIDER|PROVIDER|VENDOR|CONSULTANT|"
    r"PARTY\s+[AB]|COMPANY)\s*[:\-]\s*([A-Z][^\n]{2,80})$"
)

_TITLE_CASE_NAME_RE = re.compile(
    r"\b([A-Z][a-zA-Z&.'’\-]+(?:\s+[A-Z][a-zA-Z&.'’\-]+){1,4})\b"
)

_GENERIC_NAME = re.compile(
    r"^(?:this|agreement|the|parties|party|client|customer|provider|vendor|"
    r"confidentiality|mutual|scope|services|payment|notices?|general|provisions|"
    r"intellectual|property|termination|witness|whereof|section|article)$",
    re.IGNORECASE,
)


def corpus_has_identity_placeholders(text: str) -> bool:
    return bool(_IDENTITY_BRACKET_RE.search(text or ""))


def _clean_name(raw: str) -> str:
    t = re.sub(r"\s+", " ", (raw or "").strip())
    t = re.sub(r'\s*\(\s*["\']?(?:client|customer|provider|vendor|party)[^)]*\)\s*$', "", t, flags=re.I)
    t = t.strip(" \t,.;:\"'")
    return t


def _usable_name(name: str) -> bool:
    t = _clean_name(name)
    if len(t) < 3 or len(t) > 120:
        return False
    if corpus_has_identity_placeholders(t):
        return False
    if _GENERIC_NAME.match(t):
        return False
    words = t.split()
    if len(words) < 2:
        return False
    return True


def extract_resolved_party_names(text: str) -> List[str]:
    """Best-effort ordered legal/business names from a resolved commercial corpus."""
    src = text or ""
    out: List[str] = []
    seen: set[str] = set()

    def add(raw: str) -> None:
        t = _clean_name(raw)
        if not _usable_name(t):
            return
        key = t.lower()
        if key in seen:
            return
        seen.add(key)
        out.append(t)

    m = _BETWEEN_RE.search(src)
    if m:
        add(m.group(1))
        add(m.group(2))

    for m in _SIGNATURE_NAME_RE.finditer(src):
        add(m.group(1))

    for m in _ORG_SUFFIX_RE.finditer(src):
        add(m.group(1))

    if len(out) < 2:
        for m in _TITLE_CASE_NAME_RE.finditer(src):
            add(m.group(1))
            if len(out) >= 4:
                break

    return out


def restore_refine_party_placeholders(*, original: str, candidate: str) -> Tuple[str, bool]:
    """
    Replace ``[ORG_n]`` / ``[PARTY_n]`` in ``candidate`` using names from ``original``
    when the original corpus was already resolved.

    Returns ``(text, restored)``. Hollow originals (already placeholder-bearing) are
    returned unchanged so template protection still rejects them downstream.
    """
    cand = candidate or ""
    orig = original or ""
    if not cand or not orig:
        return cand, False
    if corpus_has_identity_placeholders(orig):
        return cand, False
    if not corpus_has_identity_placeholders(cand):
        return cand, False
    names = extract_resolved_party_names(orig)
    if len(names) < 2:
        return cand, False

    def repl(match: re.Match[str]) -> str:
        idx = int(match.group("idx"))
        if 1 <= idx <= len(names):
            return names[idx - 1]
        return match.group(0)

    restored = _IDENTITY_BRACKET_RE.sub(repl, cand)
    if restored == cand:
        return cand, False
    return restored, True


__all__ = [
    "corpus_has_identity_placeholders",
    "extract_resolved_party_names",
    "restore_refine_party_placeholders",
]
