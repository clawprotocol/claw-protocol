from typing import List, Optional

from services.extraction_service import extract_text_from_bytes, split_text_into_clauses


def extract_clauses_from_bytes(content: bytes, filename: Optional[str] = None) -> List[str]:
    """
    Orchestrates raw text extraction + clause splitting.

    - Supports PDF, DOCX via extraction_service
    - Supports plain text (.txt) as a safe fallback
    - Never throws for unknown formats (best-effort decode)

    Returns a simple list of clause strings for the frontend MVP.
    """
    name = (filename or "").lower()

    # ----
    # Plain text / fallback path
    # ----
    if name.endswith(".txt") or not name.endswith((".pdf", ".docx")):
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            # Last-resort fallback: replace invalid bytes
            text = content.decode("utf-8", errors="replace")
    else:
        # ----
        # Structured document path (PDF / DOCX)
        # ----
        text = extract_text_from_bytes(content, filename=filename)

    clauses = split_text_into_clauses(text)

    # Filter out empty / extremely short clauses
    clauses = [c.strip() for c in clauses if c and c.strip()]

    return clauses
