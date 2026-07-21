"""Phase 3C — completed agreement authorized-delta validation (backend mirror)."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

_WITNESS_RE = re.compile(r"\bIN WITNESS WHEREOF\b", re.I)
_SIGNATURE_LINE_RE = re.compile(r"^(?:By|Signature)\s*:", re.I)
_INITIALS_LINE_RE = re.compile(r"^Initials\s*:", re.I)
_DATE_LINE_RE = re.compile(r"^Date\s*:", re.I)
_NAME_LINE_RE = re.compile(r"^Name\s*:", re.I)
_TITLE_LINE_RE = re.compile(r"^Title\s*:", re.I)


def _witness_start(corpus: str) -> int:
    match = _WITNESS_RE.search(corpus)
    if match:
        return match.start()
    return int(len(corpus) * 0.72)


def _normalize_operative(corpus: str) -> str:
    end = _witness_start(corpus)
    text = corpus[:end].replace("\r\n", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _normalize_execution_tail(corpus: str) -> str:
    tail = corpus[_witness_start(corpus) :]
    lines: List[str] = []
    for raw in tail.split("\n"):
        line = raw.strip()
        if not line:
            continue
        if _SIGNATURE_LINE_RE.match(line):
            continue
        if _INITIALS_LINE_RE.match(line):
            continue
        if _DATE_LINE_RE.match(line):
            continue
        if _NAME_LINE_RE.match(line):
            continue
        if _TITLE_LINE_RE.match(line):
            continue
        if re.search(r"_{3,}", line):
            continue
        if line.lower().startswith("[signed:"):
            continue
        lines.append(line)
    return re.sub(r"\s+", " ", " ".join(lines)).strip().lower()


def _execution_headings(corpus: str) -> List[str]:
    tail = corpus[_witness_start(corpus) :]
    out: List[str] = []
    for raw in tail.split("\n"):
        trimmed = raw.strip()
        if not trimmed.endswith(":"):
            continue
        if re.match(r"^(?:By|Name|Title|Date|Initials|Signature)\s*:", trimmed, re.I):
            continue
        if 3 <= len(trimmed) <= 120:
            out.append(trimmed.lower())
    return out


def validate_completed_agreement_authorized_delta(
    *,
    frozen_corpus: str,
    completed_corpus: str,
    snapshot: Optional[Dict[str, Any]] = None,
) -> Tuple[bool, Optional[str], Optional[str]]:
    """Return (ok, error_code, detail)."""
    frozen_op = _normalize_operative(frozen_corpus or "")
    completed_op = _normalize_operative(completed_corpus or "")
    if frozen_op != completed_op:
        return False, "operative_clause_mutation", "operative_body_differs"

    if _execution_headings(frozen_corpus) != _execution_headings(completed_corpus):
        return False, "execution_heading_mutation", None

    if isinstance(snapshot, dict):
        parties = snapshot.get("parties") if isinstance(snapshot.get("parties"), list) else []
        completed_lower = (completed_corpus or "").lower()
        for party in parties:
            if not isinstance(party, dict):
                continue
            name = str(party.get("legalEntityName") or party.get("legal_entity_name") or "").strip().lower()
            if name and name not in completed_lower:
                return False, "legal_entity_mutation", name

    return True, None, None
