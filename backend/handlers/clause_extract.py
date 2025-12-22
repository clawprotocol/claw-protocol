# backend/handlers/clause_extract.py

from typing import List, Optional

from services.extraction_service import extract_text_from_bytes, split_text_into_clauses


def extract_clauses_from_bytes(content: bytes, filename: Optional[str] = None) -> List[str]:
    """
    Orchestrates raw text extraction + clause splitting.

    Returns a simple list of clause strings for the frontend MVP.
    """
    text = extract_text_from_bytes(content, filename=filename)
    clauses = split_text_into_clauses(text)
    # Filter out extremely short / empty clauses
    clauses = [c.strip() for c in clauses if c and c.strip()]
    return clauses
