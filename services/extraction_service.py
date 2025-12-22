# backend/services/extraction_service.py

from __future__ import annotations

import io
import re
from typing import Optional

import docx  # python-docx
from PyPDF2 import PdfReader


def extract_text_from_bytes(content: bytes, filename: Optional[str] = None) -> str:
    """
    Extracts raw text from a PDF or DOCX (or falls back to plain text).
    """

    lower_name = (filename or "").lower()

    # --- PDF ---
    if lower_name.endswith(".pdf"):
        try:
            pdf_reader = PdfReader(io.BytesIO(content))
            pages = [page.extract_text() or "" for page in pdf_reader.pages]
            return "\n".join(pages)
        except Exception:
            # Fall through to generic decode
            pass

    # --- DOCX ---
    if lower_name.endswith(".docx"):
        try:
            file_like = io.BytesIO(content)
            document = docx.Document(file_like)
            paragraphs = [p.text for p in document.paragraphs]
            return "\n".join(paragraphs)
        except Exception:
            # Fall through to generic decode
            pass

    # --- Fallback: assume it's text-like ---
    try:
        return content.decode("utf-8", errors="ignore")
    except Exception:
        # Very last resort
        return ""


def split_text_into_clauses(text: str) -> list[str]:
    """
    Very simple heuristic clause splitter.

    - Splits on numbered headings (1., 1.1, Section 1, etc.)
    - Also splits on double newlines as a fallback
    """

    if not text:
        return []

    # Normalize whitespace
    cleaned = re.sub(r"\r\n?", "\n", text)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)

    # Try to split on common legal section markers
    pattern = re.compile(
        r"(?m)^(?:\d+(\.\d+)*\.?|SECTION\s+\d+\.?)\s+",
        re.IGNORECASE,
    )

    # If pattern matches, use it to split and reattach headers to their bodies
    sections = []
    last_index = 0
    current_header = None

    for match in pattern.finditer(cleaned):
        if current_header is not None:
            # Previous header + body becomes a section
            section_text = cleaned[last_index:match.start()].strip()
            if section_text:
                sections.append(f"{current_header} {section_text}")
        current_header = match.group(0).strip()
        last_index = match.end()

    # Tail
    if current_header is not None:
        section_text = cleaned[last_index:].strip()
        if section_text:
            sections.append(f"{current_header} {section_text}")

    # If we didn't get anything meaningful, fallback to paragraphs
    if not sections:
        paragraphs = [p.strip() for p in cleaned.split("\n\n") if p.strip()]
        return paragraphs

    return sections
