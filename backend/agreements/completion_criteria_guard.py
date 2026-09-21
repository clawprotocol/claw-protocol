"""Ask for consulting completion meaning without inventing milestones, SLAs, or SaaS acceptance process."""

from __future__ import annotations

import re
from typing import List, Optional, Tuple

UNCONFIRMED_COMPLETION_CRITERIA_QUESTION = "What should mark completion of the consulting work?"
AI_WORKFLOW_COMPLETION_QUESTION = (
    "What should mark completion of the AI workflow implementation work?"
)

_COMPLETION_MEANING_RE = re.compile(
    r"\b(?:complete when|completion (?:is|means|occurs)|work is complete when|"
    r"written confirmation that|accepted when (?:the )?client)\b",
    re.I,
)
_HOSTED_SAAS_RE = re.compile(
    r"\b(?:saas|software as a service|hosted platform|subscription agreement|annual subscription)\b",
    re.I,
)
_NO_PROFESSIONAL_SERVICES_RE = re.compile(
    r"\b(?:no professional services|hosted platform only|hosted platform access)\b",
    re.I,
)
_CONSULTING_DEAL_RE = re.compile(
    r"\b(?:consulting|professional services|implementation work|ai workflow implementation)\b",
    re.I,
)
_SCOPE_HEADING_RE = re.compile(
    r"^(\d+)\.\s+(?:SCOPE(?:\s+OF\s+SERVICES)?|SERVICES|DELIVERABLES)\b\.?",
    re.I | re.M,
)
_NEXT_TOP_RE = re.compile(r"^(?:\d{1,2})\.(?!\d)\s+\S", re.M)
_COMPLETION_QUESTION_RE = re.compile(r"^What should mark completion of ")


def unconfirmed_completion_criteria_question(scope_cue: str = "") -> str:
    if re.search(r"ai workflow implementation", scope_cue or "", re.I):
        return AI_WORKFLOW_COMPLETION_QUESTION
    return UNCONFIRMED_COMPLETION_CRITERIA_QUESTION


def is_completion_criteria_question(question: str) -> bool:
    return bool(_COMPLETION_QUESTION_RE.match((question or "").strip()))


def is_hosted_saas_deal(intake: str, body: str = "") -> bool:
    blob = f"{intake}\n{body}"
    return bool(_HOSTED_SAAS_RE.search(blob) and _NO_PROFESSIONAL_SERVICES_RE.search(blob))


def has_completion_meaning(text: str) -> bool:
    return bool(_COMPLETION_MEANING_RE.search(text or ""))


def _scope_span(doc: str) -> Optional[Tuple[int, int]]:
    heading = _SCOPE_HEADING_RE.search(doc or "")
    if not heading or heading.start() is None:
        return None
    start = heading.start()
    after = start + len(heading.group(0))
    rest = (doc or "")[after:]
    nxt = _NEXT_TOP_RE.search(rest)
    end = after + (nxt.start() if nxt and nxt.start() is not None else len(rest))
    return start, end


def _statements(text: str) -> List[str]:
    out: List[str] = []
    for block in re.split(r"[\n;]+", text or ""):
        for sent in re.split(r"(?<=[.!?])\s+", block):
            piece = sent.strip()
            if piece:
                out.append(piece)
    return out


def _completion_from_answers(answers: str) -> str:
    chosen = ""
    for sent in _statements(answers):
        if _COMPLETION_MEANING_RE.search(sent):
            chosen = sent
    if not chosen:
        return ""
    text = re.sub(r"\s+", " ", chosen).strip()
    if re.search(r"^(?:completion is|work is complete when|complete when)\b", text, re.I):
        return text if text.endswith(".") else f"{text}."
    if text[:1].isupper():
        return f"Work is complete when {text[0].lower() + text[1:]}".rstrip(".") + "."
    return f"Work is complete when {text}".rstrip(".") + "."


def apply_completion_criteria_guard(
    *,
    intake: str,
    user_gap_answers: str,
    document_text: str,
    missing_material_info: Optional[List[str]] = None,
) -> Tuple[str, List[str]]:
    missing = [str(x).strip() for x in (missing_material_info or []) if str(x).strip()]
    missing = [m for m in missing if not is_completion_criteria_question(m)]
    doc = document_text or ""
    if is_hosted_saas_deal(intake, doc):
        return doc, missing
    if not _CONSULTING_DEAL_RE.search(f"{intake}\n{doc}"):
        return doc, missing
    answers = user_gap_answers or ""
    if has_completion_meaning(f"{answers}\n{intake}") or has_completion_meaning(doc):
        if has_completion_meaning(answers) and not has_completion_meaning(doc):
            sentence = _completion_from_answers(answers)
            span = _scope_span(doc)
            if sentence and span and sentence[:-1] not in doc:
                start, end = span
                section = doc[start:end].rstrip()
                doc = f"{doc[:start]}{section} {sentence}\n\n{doc[end:]}"
        return doc, missing
    missing.append(unconfirmed_completion_criteria_question(f"{intake}\n{doc}"))
    return doc, missing
