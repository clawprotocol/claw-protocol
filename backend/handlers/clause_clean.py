# backend/handlers/clause_clean.py

from typing import List, Any

from backend.models.clauses import Clause


def normalize_clauses(raw_clauses: List[Any]) -> List[Clause]:
    """
    Convert a list of strings / dicts / Clause objects
    into a clean list of Clause models.
    """
    structured: List[Clause] = []

    for idx, item in enumerate(raw_clauses, start=1):
        if isinstance(item, Clause):
            structured.append(item)
        elif isinstance(item, dict):
            structured.append(Clause(**item))
        else:
            text = str(item)
            structured.append(
                Clause(
                    raw_text=text,
                    section=None,
                    title=None,
                    body=text,
                    type=None,
                    parties=[],
                    risk_flags=[],
                    source_doc=None,
                )
            )

    return structured
