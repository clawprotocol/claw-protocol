"""Keep supplied date meanings. Do not treat effective, term start, invoice, and signature dates as the same fact."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional, Tuple

UNCONFIRMED_EFFECTIVE_DATE_QUESTION = (
    "Is the agreement effective date the same as the service start date, or a different date?"
)

_MONTH = (
    r"(?:January|February|March|April|May|June|July|August|September|October|November|December)"
)
_DATE = rf"{_MONTH}\s+\d{{1,2}},\s+\d{{4}}"
_DATE_RE = re.compile(_DATE, re.I)
_UNRESOLVED_RE = re.compile(
    r"\b(?:tbd|unspecified|unknown|undecided|not sure|contradict(?:ed|s|ion)?|to be (?:agreed|confirmed|determined))\b",
    re.I,
)
_INVOICE_OR_PAYMENT_RE = re.compile(r"\b(?:invoice|invoiced|payment due|payable|net\s*[- ]?\d+)\b", re.I)
_SIGNATURE_RE = re.compile(r"\b(?:signed on|signature date|date signed)\b", re.I)
_SERVICE_START_RE = re.compile(
    rf"(?:starting|beginning|begins?(?:\s+on)?|service start(?:s|ing)?(?:\s+on)?)\s+({_DATE})",
    re.I,
)
_TERM_START_RE = re.compile(
    rf"(?:term\s+(?:starts?|begins?)|services?\s+start)\s+(?:is\s+|on\s+)?({_DATE})",
    re.I,
)
_LABELED_EFFECTIVE_RE = re.compile(
    rf"(?:effective(?:\s+date)?\s+(?:is\s+|as of\s+)|is\s+effective(?:\s+as of)?\s+)({_DATE})",
    re.I,
)
_SAME_AS_START_RE = re.compile(
    r"effective date.{0,100}(?:the )?same|same as.{0,60}service start|same as the .{0,40}service start",
    re.I,
)
_OPENING_AS_OF_EFFECTIVE_RE = re.compile(
    r"(entered\s+into\s+)as\s+of\s+the\s+Effective\s+Date(\s+by\s+and\s+between)",
    re.I,
)
_OPENING_AS_OF_DATE_RE = re.compile(
    rf"(entered\s+into\s+)as\s+of\s+{_DATE}(?:\s+\(the\s+[\"']Effective Date[\"']\))?(\s+by\s+and\s+between)",
    re.I,
)
_OPENING_EFFECTIVE_AS_OF_RE = re.compile(
    rf"(,\s*)?effective\s+as\s+of\s+{_DATE}(?:\s+\(the\s+[\"']Effective Date[\"']\))?",
    re.I,
)
_IN_WITNESS_EFFECTIVE_RE = re.compile(
    r"(executed this Agreement)\s+as of the Effective Date\.?",
    re.I,
)
_ENTERED_INTO_BY_RE = re.compile(r"entered\s+into\s+by\s+and\s+between", re.I)
_TOP_SECTION_RE = re.compile(r"\n\s*1[.)]\s+")
_DATE_QUESTION_RE = re.compile(r"^Is the agreement effective date the same as ")
_DEFINED_EFFECTIVE_RE = re.compile(
    rf'(?:as of|effective as of)\s+({_DATE})\s+\(\s*the\s+["\']Effective Date["\']\s*\)|'
    rf'["\']Effective Date["\']\s+is\s+({_DATE})',
    re.I,
)


def unconfirmed_effective_date_question(service_start: Optional[str] = None) -> str:
    date = (service_start or "").strip()
    if not date:
        return UNCONFIRMED_EFFECTIVE_DATE_QUESTION
    return (
        f"Is the agreement effective date the same as the {date} service start, or a different date?"
    )


def is_date_meaning_question(question: str) -> bool:
    return bool(_DATE_QUESTION_RE.match((question or "").strip()))


def _statements(text: str) -> List[str]:
    out: List[str] = []
    for block in re.split(r"[\n;]+", text or ""):
        for sent in re.split(r"(?<=[.!?])\s+", block):
            piece = sent.strip()
            if piece:
                out.append(piece)
    return out


def _norm_date(value: Optional[str]) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _is_payment_or_signature(sent: str) -> bool:
    return bool(_INVOICE_OR_PAYMENT_RE.search(sent) or _SIGNATURE_RE.search(sent))


def _service_start_from(text: str) -> Optional[str]:
    found: Optional[str] = None
    for match in _SERVICE_START_RE.finditer(text or ""):
        if _is_payment_or_signature(match.group(0)):
            continue
        found = _norm_date(match.group(1))
    for match in _TERM_START_RE.finditer(text or ""):
        if _is_payment_or_signature(match.group(0)):
            continue
        found = _norm_date(match.group(1))
    return found


def _invoice_date_from(text: str) -> Optional[str]:
    found: Optional[str] = None
    for sent in _statements(text):
        if not _INVOICE_OR_PAYMENT_RE.search(sent):
            continue
        match = _DATE_RE.search(sent)
        if match:
            found = _norm_date(match.group(0))
    return found


def _labeled_effective(text: str) -> Tuple[Optional[str], bool, bool]:
    date: Optional[str] = None
    same_as_start = False
    contradicted = False
    for sent in _statements(text):
        if _is_payment_or_signature(sent):
            continue
        if _SAME_AS_START_RE.search(sent):
            same_as_start = True
            match = _DATE_RE.search(sent)
            if match:
                date = _norm_date(match.group(0))
            continue
        labeled = _LABELED_EFFECTIVE_RE.search(sent)
        if labeled:
            nxt = _norm_date(labeled.group(1))
            if date and date.lower() != nxt.lower():
                contradicted = True
            date = nxt
    return date, same_as_start, contradicted


@dataclass(frozen=True)
class DateMeanings:
    effective_date: Optional[str]
    service_start: Optional[str]
    invoice_date: Optional[str]
    same_as_service_start: bool
    contradicted: bool
    unresolved: bool
    needs_question: bool


def _defined_effective_from_paper(body: str) -> Optional[str]:
    match = _DEFINED_EFFECTIVE_RE.search(body or "")
    if not match:
        return None
    return _norm_date(match.group(1) or match.group(2))


def extract_date_meanings(intake: str, user_gap_answers: str = "", body: str = "") -> DateMeanings:
    answers = user_gap_answers or ""
    unresolved = bool(_UNRESOLVED_RE.search(answers))
    service_start = (
        _service_start_from(answers) or _service_start_from(intake) or _service_start_from(body)
    )
    invoice_date = _invoice_date_from(f"{answers}\n{intake}")
    ans_date, ans_same, ans_conflict = _labeled_effective(answers)
    in_date, in_same, in_conflict = _labeled_effective(intake)
    paper_date = _defined_effective_from_paper(body)
    effective = ans_date
    same_as_start = ans_same
    contradicted = ans_conflict
    if not effective and not same_as_start:
        effective = in_date or paper_date
        same_as_start = in_same
        contradicted = in_conflict
    if same_as_start and service_start and not effective:
        effective = service_start
    if (
        same_as_start
        and service_start
        and effective
        and effective.lower() != service_start.lower()
        and ans_date
    ):
        contradicted = True
    if unresolved or contradicted:
        effective = None
        same_as_start = False
    return DateMeanings(
        effective_date=effective,
        service_start=service_start,
        invoice_date=invoice_date,
        same_as_service_start=bool(same_as_start and effective and service_start),
        contradicted=contradicted,
        unresolved=unresolved,
        needs_question=not effective or unresolved or contradicted,
    )


def _opening_span(doc: str) -> Tuple[int, int]:
    match = _TOP_SECTION_RE.search(doc or "")
    end = match.start() if match else min(len(doc or ""), 900)
    return 0, end


def _rewrite_opening(opening: str, *, effective_date: Optional[str], confirmed: bool) -> str:
    out = opening
    if confirmed and effective_date:
        replacement = rf'\1as of {effective_date} (the "Effective Date")\2'
        if _OPENING_AS_OF_EFFECTIVE_RE.search(out):
            out = _OPENING_AS_OF_EFFECTIVE_RE.sub(replacement, out, count=1)
        elif _OPENING_AS_OF_DATE_RE.search(out):
            out = _OPENING_AS_OF_DATE_RE.sub(replacement, out, count=1)
        elif _OPENING_EFFECTIVE_AS_OF_RE.search(out):
            out = _OPENING_EFFECTIVE_AS_OF_RE.sub(
                f' effective as of {effective_date} (the "Effective Date")',
                out,
                count=1,
            )
        elif _ENTERED_INTO_BY_RE.search(out):
            out = _ENTERED_INTO_BY_RE.sub(
                f'entered into as of {effective_date} (the "Effective Date") by and between',
                out,
                count=1,
            )
        return out
    out = _OPENING_AS_OF_EFFECTIVE_RE.sub(r"\1\2", out, count=1)
    out = _OPENING_AS_OF_DATE_RE.sub(r"\1\2", out, count=1)
    out = _OPENING_EFFECTIVE_AS_OF_RE.sub("", out, count=1)
    out = re.sub(r",\s*\.", ".", out)
    return out


def _rewrite_in_witness(doc: str, *, confirmed: bool) -> str:
    if confirmed:
        return doc
    return _IN_WITNESS_EFFECTIVE_RE.sub(r"\1.", doc, count=1)


def apply_date_meaning_guard(
    *,
    intake: str,
    user_gap_answers: str,
    document_text: str,
    missing_material_info: Optional[List[str]] = None,
) -> Tuple[str, List[str]]:
    missing = [str(x).strip() for x in (missing_material_info or []) if str(x).strip()]
    missing = [m for m in missing if not is_date_meaning_question(m)]
    meanings = extract_date_meanings(intake, user_gap_answers, document_text)
    if not meanings.service_start and not re.search(
        r"(?:starting|beginning|effective date|term)", intake or "", re.I
    ):
        return document_text or "", missing
    doc = document_text or ""
    start, end = _opening_span(doc)
    opening = doc[start:end]
    rewritten = _rewrite_opening(
        opening,
        effective_date=meanings.effective_date,
        confirmed=not meanings.needs_question,
    )
    doc = doc[:start] + rewritten + doc[end:]
    doc = _rewrite_in_witness(doc, confirmed=not meanings.needs_question)
    if meanings.needs_question:
        missing.append(unconfirmed_effective_date_question(meanings.service_start))
    return doc, missing
