"""Render agreement HTML into a PDF for VS01 /v1/documents seeding (paid Pro sender-first bridge)."""

from __future__ import annotations

import io
import re
from dataclasses import dataclass
from html import escape
from typing import Final

_MAX_HTML_CHARS: Final[int] = 1_200_000
_MAX_STORY_PAGES: Final[int] = 400


def _pdf_bytes_pypdf_letter_blank() -> tuple[bytes, str]:
    """Valid Letter-sized PDF without PyMuPDF (VS01 seed fallback when fitz is unavailable)."""
    from io import BytesIO

    from pypdf import PdfWriter

    buf = BytesIO()
    w = PdfWriter()
    w.add_blank_page(width=612, height=792)
    w.write(buf)
    raw = buf.getvalue()
    if not raw.startswith(b"%PDF"):
        raise RuntimeError("pypdf_blank_invalid")
    return raw, "pypdf_blank_no_fitz"


@dataclass(frozen=True)
class AgreementVs01PdfBuild:
    """PDF bytes plus a short render-mode label for operator logs (no document body)."""

    pdf_bytes: bytes
    render_mode: str


def _strip_scripts_and_styles(html: str) -> str:
    s = html or ""
    s = re.sub(r"(?is)<script[^>]*>.*?</script>", "", s)
    s = re.sub(r"(?is)<style[^>]*>.*?</style>", "", s)
    return s[:_MAX_HTML_CHARS]


def _plaintext_pdf_bytes(fitz: object, body_inner: str) -> bytes:
    plain = re.sub(r"(?s)<[^>]+>", " ", body_inner)
    plain = " ".join(plain.split())
    if not plain.strip():
        plain = "(empty agreement body)"
    plain = plain[:80_000]
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
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


def agreement_rendered_html_to_pdf_bytes(
    html: str, *, title: str = "Agreement"
) -> AgreementVs01PdfBuild:
    """
    Best-effort HTML → multi-page Letter PDF via PyMuPDF Story + DocumentWriter (in-memory).

    Uses ``io.BytesIO`` + ``writer.close()`` so output is valid (see PyMuPDF DocumentWriter docs).
    Falls back to plain-text layout if Story fails. If PyMuPDF is unavailable, uses a pypdf blank
    Letter page (still a valid VS01 document body).
    """
    body_inner = _strip_scripts_and_styles(html)
    try:
        import fitz  # type: ignore[import-not-found,import-untyped]
    except ImportError:
        pdf_bytes, mode = _pdf_bytes_pypdf_letter_blank()
        return AgreementVs01PdfBuild(pdf_bytes=pdf_bytes, render_mode=mode)

    try:
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

        mediabox = fitz.paper_rect("letter")
        where = mediabox + (36, 36, -36, -36)

        try:
            buf = io.BytesIO()
            writer = fitz.DocumentWriter(buf)
            story = fitz.Story(html=wrapped, user_css=user_css, archive=None)
            more = True
            pages = 0
            while more and pages < _MAX_STORY_PAGES:
                dev = writer.begin_page(mediabox)
                more, _filled = story.place(where)
                story.draw(dev)
                writer.end_page()
                pages += 1
            writer.close()
            raw = buf.getvalue()
            if raw.startswith(b"%PDF") and len(raw) > 32:
                mode = (
                    "story_html_truncated"
                    if more and pages >= _MAX_STORY_PAGES
                    else "story_html"
                )
                return AgreementVs01PdfBuild(pdf_bytes=raw, render_mode=mode)
        except Exception:
            pass

        pdf_bytes = _plaintext_pdf_bytes(fitz, body_inner)
        return AgreementVs01PdfBuild(
            pdf_bytes=pdf_bytes,
            render_mode="plaintext_after_story_error",
        )
    except Exception:
        pdf_bytes, mode = _pdf_bytes_pypdf_letter_blank()
        return AgreementVs01PdfBuild(pdf_bytes=pdf_bytes, render_mode=mode)
