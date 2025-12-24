from __future__ import annotations

import io
import re
from typing import Optional

import docx  # python-docx
from pypdf import PdfReader


def extract_text_from_bytes(content: bytes, filename: Optional[str] = None) -> str:
    lower_name = (filename or "").lower()

    # PDF
    if lower_name.endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(content))
            pages = [page.extract_text() or "" for page in reader.pages]
            return "\n".join(pages)
        except Exception:
            pass

    # DOCX
    if lower_name.endswith(".docx"):
        try:
            docf = docx.Document(io.BytesIO(content))
            paragraphs = [p.text for p in docf.paragraphs]
            return "\n".join(paragraphs)
        except Exception:
            pass

    # Fallback
    try:
        return content.decode("utf-8", errors="ignore")
    except Exception:
        return ""
    

def split_text_into_clauses(text: str) -> list[str]:
    if not text:
        return []

    cleaned = re.sub(r"\r\n?", "\n", text)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)

    pattern = re.compile(
        r"(?m)^(?:\d+(\.\d+)*\.?|SECTION\s+\d+\.?)\s+",
        re.IGNORECASE,
    )

    sections = []
    last_index = 0
    current_header = None

    for match in pattern.finditer(cleaned):
        if current_header is not None:
            section_text = cleaned[last_index:match.start()].strip()
            if section_text:
                sections.append(f"{current_header} {section_text}")

        current_header = match.group(0).strip()
        last_index = match.end()

    if current_header is not None:
        section_text = cleaned[last_index:].strip()
        if section_text:
            sections.append(f"{current_header} {section_text}")

    if not sections:
        return [p.strip() for p in cleaned.split("\n\n") if p.strip()]

    return sections
