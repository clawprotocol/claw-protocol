"""
Meaning-preservation invariants for repair/patch evaluation.

Section hashes and forbidden-token checks are insufficient. These checks
compare canonical fact packs and operative language classes between corpora.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


MONEY_RE = re.compile(
    r"\$\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?|\b\d+(?:\.\d+)?\s*%|\b\d+\s*/\s*month\b",
    re.I,
)
DATE_RE = re.compile(
    r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b"
    r"|\b\d{4}-\d{2}-\d{2}\b"
    r"|\b\d+\s*\(\s*\d+\s*\)\s*(?:business\s+)?days?\b",
    re.I,
)
PARTY_LINE_RE = re.compile(r"\b([A-Z][A-Za-z0-9&.,'\- ]{2,}(?:LLC|Inc\.|Corp\.|LP|LLP|Co\.))\b")
DEFINED_TERM_RE = re.compile(r"\"([A-Z][A-Za-z0-9 ]{2,40})\"")
MODAL_RE = re.compile(r"\b(shall|may|must|will not|shall not)\b", re.I)
GOV_LAW_RE = re.compile(r"governed by the laws of(?: the State of)? ([A-Za-z ]+)", re.I)
NEGATION_RE = re.compile(r"\b(?:not|no|never|without|except|unless)\b", re.I)


@dataclass
class InvariantFinding:
    dimension: str
    severity: str
    message: str
    before: Any = None
    after: Any = None


def _norm_set(items: List[str]) -> set[str]:
    return {re.sub(r"\s+", " ", i).strip().lower() for i in items if i and i.strip()}


def compare_invariants(
    *,
    before: str,
    after: str,
    expected_parties: Optional[List[str]] = None,
) -> Tuple[bool, List[InvariantFinding]]:
    findings: List[InvariantFinding] = []
    b, a = before or "", after or ""

    money_b, money_a = set(MONEY_RE.findall(b)), set(MONEY_RE.findall(a))
    if money_b - money_a:
        findings.append(
            InvariantFinding(
                "monetary_amounts",
                "blocker",
                "Monetary amounts present before repair missing after",
                sorted(money_b),
                sorted(money_a),
            )
        )
    if money_a - money_b:
        findings.append(
            InvariantFinding(
                "monetary_amounts",
                "blocker",
                "New monetary amounts introduced by repair",
                sorted(money_b),
                sorted(money_a),
            )
        )

    dates_b, dates_a = set(DATE_RE.findall(b)), set(DATE_RE.findall(a))
    if dates_b != dates_a:
        findings.append(
            InvariantFinding(
                "dates_durations",
                "warning",
                "Date/duration tokens changed",
                sorted(dates_b),
                sorted(dates_a),
            )
        )

    if expected_parties:
        for p in expected_parties:
            if p and p.lower() not in a.lower():
                findings.append(
                    InvariantFinding(
                        "parties_roles",
                        "blocker",
                        f"Expected party missing after repair: {p}",
                        expected_parties,
                        None,
                    )
                )

    defs_b = _norm_set(DEFINED_TERM_RE.findall(b))
    defs_a = _norm_set(DEFINED_TERM_RE.findall(a))
    if defs_b - defs_a:
        findings.append(
            InvariantFinding(
                "defined_terms",
                "warning",
                "Defined terms dropped",
                sorted(defs_b - defs_a),
                sorted(defs_a),
            )
        )

    gov_b = GOV_LAW_RE.findall(b)
    gov_a = GOV_LAW_RE.findall(a)
    if gov_b and gov_a and gov_b[0].strip().lower() != gov_a[0].strip().lower():
        findings.append(
            InvariantFinding(
                "governing_law_forum",
                "blocker",
                "Governing law changed",
                gov_b[0],
                gov_a[0],
            )
        )

    # Negation density proxy — large swings warrant review.
    neg_b = len(NEGATION_RE.findall(b))
    neg_a = len(NEGATION_RE.findall(a))
    if neg_b >= 3 and abs(neg_a - neg_b) / max(neg_b, 1) > 0.5:
        findings.append(
            InvariantFinding(
                "negation",
                "warning",
                "Negation density shifted sharply",
                neg_b,
                neg_a,
            )
        )

    modal_b = sorted({m.lower() for m in MODAL_RE.findall(b)})
    modal_a = sorted({m.lower() for m in MODAL_RE.findall(a)})
    if set(modal_b) != set(modal_a) and (set(modal_b) ^ set(modal_a)):
        findings.append(
            InvariantFinding(
                "shall_may_standards",
                "warning",
                "Modal obligation tokens changed set",
                modal_b,
                modal_a,
            )
        )

    for needle, dim in (
        (r"limitation of liability|liability cap", "liability_standards_caps"),
        (r"except as|carve-?out|provided that", "exceptions_carveouts"),
        (r"terminat(?:e|ion)|injunctive relief|specific performance", "remedies_termination"),
    ):
        in_b = bool(re.search(needle, b, re.I))
        in_a = bool(re.search(needle, a, re.I))
        if in_b != in_a:
            findings.append(
                InvariantFinding(
                    dim,
                    "blocker" if in_b and not in_a else "warning",
                    f"{dim} presence changed",
                    in_b,
                    in_a,
                )
            )

    blockers = [f for f in findings if f.severity == "blocker"]
    return (len(blockers) == 0), findings


def findings_as_dicts(findings: List[InvariantFinding]) -> List[Dict[str, Any]]:
    return [
        {
            "dimension": f.dimension,
            "severity": f.severity,
            "message": f.message,
            "before": f.before,
            "after": f.after,
        }
        for f in findings
    ]
