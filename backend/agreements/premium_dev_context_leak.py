"""
P0: detect LLM regurgitation of local dev / repo / env text in premium agreement bodies.
"""

from __future__ import annotations

import copy
import re
from typing import Any, Dict, List, Tuple

_LEAK_PATTERNS: List[Tuple[str, re.Pattern[str]]] = [
    ("localhost", re.compile(r"localhost", re.I)),
    ("127.0.0.1", re.compile(r"127\.0\.0\.1")),
    ("VITE_", re.compile(r"VITE_")),
    ("npm run", re.compile(r"npm\s+run", re.I)),
    ("cd /", re.compile(r"cd\s*\/\s*", re.I)),
    ("Users/", re.compile(r"Users/")),
    ("Desktop/", re.compile(r"Desktop/", re.I)),
    ("frontend", re.compile(r"\bfrontend\b", re.I)),
    ("backend", re.compile(r"\bbackend\b", re.I)),
    (".env", re.compile(r"\.env\b", re.I)),
    ("API_BASE", re.compile(r"API_BASE")),
]


def premium_document_text_has_dev_context_leak(text: str) -> Tuple[bool, List[str]]:
    raw = text or ""
    hits: List[str] = []
    for name, rgx in _LEAK_PATTERNS:
        if rgx.search(raw):
            hits.append(name)
    if hits:
        return True, sorted(set(hits))
    return False, []


def _drop_lines_with_leak(s: str) -> str:
    out: List[str] = []
    for line in (s or "").replace("\r\n", "\n").split("\n"):
        if not (line or "").strip():
            continue
        bad, _ = premium_document_text_has_dev_context_leak(line)
        if not bad:
            out.append(line)
    return "\n".join(out)


def _strip_str(s: str) -> str:
    t = _drop_lines_with_leak(s)
    for _name, rgx in _LEAK_PATTERNS:
        t = rgx.sub(" ", t)
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def _strip_value(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, str):
        return _strip_str(v)
    if isinstance(v, (bool, int, float)):
        return v
    if isinstance(v, list):
        return [_strip_value(x) for x in v]
    if isinstance(v, dict):
        return {k: _strip_value(val) for k, val in v.items()}
    return v


def sanitize_premium_intake_for_retry(intake: str) -> str:
    t = _strip_str(intake)
    if t and len(t.strip()) >= 8:
        return t
    return (
        "Commercial agreement between the named parties. "
        "Key obligations, payment, term, and law as implied by the structured context fields (supplemental raw text omitted)."
    )[:22_000]


def serialize_context_clean(ctx: Dict[str, Any] | None) -> Dict[str, Any] | None:
    if ctx is None:
        return None
    return _strip_value(copy.deepcopy(ctx))


__all__ = [
    "premium_document_text_has_dev_context_leak",
    "serialize_context_clean",
    "sanitize_premium_intake_for_retry",
]
