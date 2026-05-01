"""Render agreement HTML into a PDF for VS01 /v1/documents seeding (paid Pro sender-first bridge)."""

from __future__ import annotations

import re
from html import escape
from typing import Final

_MAX_HTML_CHARS: Final[int] = 1_200_000


def _strip_scripts_and_styles(html: str) -> str:
    s = html or ""
    s = re.sub(r"(?is)<script[^>]*>.*?</script>", "", s)
    s = re.sub(r"(?is)<style[^>]*>.*?</style>", "", s)
    return s[:_MAX_HTML_CHARS]


def agreement_rendered_html_to_pdf_bytes(html: str, *, title: str = "Agreement") -> bytes:
    """
    Best-effort HTML → multi-page Letter PDF via PyMuPDF Story + DocumentWriter.
    Falls back to plain-text layout if PyMuPDF is unavailable or HTML cannot be parsed.
    """
    import fitz  # PyMuPDF

    body_inner = _strip_scripts_and_styles(html)
    safe_title = escape((title or "Agreement").strip() or "Agreement", quote=True)
    wrapped = (
        "<!DOCTYPE html><html><head>"
        f'<meta charset="utf-8"/><title>{safe_title}</title>'
        "</head><body>"
        f"{body_inner}"
        "</body></html>"
    )
    user_css = (
        "body{font-family:Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.35;"
        "margin:0;padding:0;}"
    )

    try:
        doc = fitz.open()
        mediabox = fitz.paper_rect("letter")
        where = mediabox + (36, 36, -36, -36)
        writer = fitz.DocumentWriter(doc)
        story = fitz.Story(wrapped, user_css=user_css, archive=fitz.Archive())
        more = True
        while more:
            dev = writer.begin_page(mediabox)
            more, _filled = story.place(where)
            story.draw(dev)
            writer.end_page()
        try:
            return doc.tobytes(deflate=True, garbage=3)
        finally:
            doc.close()
    except Exception:
        doc = fitz.open()
        page = doc.new_page(width=612, height=792)
        plain = re.sub(r"(?s)<[^>]+>", " ", body_inner)
        plain = " ".join(plain.split())
        if not plain.strip():
            plain = "(empty agreement body)"
        plain = plain[:80_000]
        try:
            page.insert_textbox(
                fitz.Rect(36, 36, 576, 756),
                plain,
                fontsize=10,
                fontname="helv",
                align=getattr(fitz, "TEXT_ALIGN_LEFT", 0),
            )
        except Exception:
            page.insert_text((72, 72), plain[:6000], fontsize=10)
        try:
            return doc.tobytes(deflate=True, garbage=3)
        finally:
            doc.close()
