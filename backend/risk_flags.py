# backend/risk_flags.py

"""
Lightweight risk flagging for clauses.

Not legal advice — just heuristic signals to help
Lawyer-DAO / reviewers prioritize their attention.
"""

from __future__ import annotations

from typing import List, Dict
from backend.models.clauses import Clause


KEYWORDS = {
    "termination": "termination",
    "terminate": "termination",
    "indemnify": "indemnity",
    "indemnification": "indemnity",
    "hold harmless": "indemnity",
    "exclusive": "exclusivity",
    "non-compete": "non_compete",
    "noncompete": "non_compete",
    "liquidated damages": "liquidated_damages",
    "limitation of liability": "liability_cap",
    "limit of liability": "liability_cap",
    "governing law": "governing_law",
    "jurisdiction": "jurisdiction",
    "arbitration": "arbitration",
    "confidential": "confidentiality",
    "non-disclosure": "confidentiality",
    "nda": "confidentiality",
    "most favored nation": "mfn",
    "mfns": "mfn",
}


def flag_clause_text(text: str) -> List[str]:
    lowered = text.lower()
    flags: List[str] = []

    for needle, label in KEYWORDS.items():
        if needle in lowered:
            flags.append(label)

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for f in flags:
        if f not in seen:
            seen.add(f)
            unique.append(f)
    return unique


def apply_risk_flags(clauses: List[Clause]) -> List[Clause]:
    """
    Mutates the Clause objects to add risk_flags.
    """
    for c in clauses:
        base = c.raw_text or c.body or ""
        c.risk_flags = flag_clause_text(base)
    return clauses
