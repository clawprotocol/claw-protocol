"""Render agreement HTML into a PDF for VS01 /v1/documents seeding (paid Pro sender-first bridge)."""

from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass
from html import escape
from typing import Any, Final, Literal, Optional

log = logging.getLogger(__name__)

_MAX_HTML_CHARS: Final[int] = 1_200_000
_MAX_STORY_PAGES: Final[int] = 400

# US Letter Story layout: asymmetric bottom inset reserves space for the VS01 initials band
# (76x48px boxes, labels/shadow, and bottom margin) so agreement body never flows beneath initials.
VS01_SIGNING_STORY_MARGIN_LEFT_PT: Final[int] = 40
VS01_SIGNING_STORY_MARGIN_TOP_PT: Final[int] = 40
VS01_SIGNING_STORY_MARGIN_RIGHT_PT: Final[int] = 40
VS01_SIGNING_STORY_MARGIN_BOTTOM_PT: Final[int] = 220


def _import_fitz_module() -> Optional[Any]:
    """Return PyMuPDF module or None (patchable for tests)."""
    try:
        import fitz  # type: ignore[import-not-found,import-untyped]

        return fitz
    except ImportError:
        return None


def _pdf_bytes_embedded_minimal_letter() -> tuple[bytes, str]:
    """
    Valid single-page Letter PDF (612×792) with no third-party dependencies.

    Used when PyMuPDF and pypdf are both unavailable or pypdf fails at runtime.
    """
    header = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    o1 = b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    o2 = b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    o3 = b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n"
    body = header + o1 + o2 + o3
    off1 = len(header)
    off2 = off1 + len(o1)
    off3 = off2 + len(o2)
    xref_start = len(body)
    xref = b"xref\n0 4\n0000000000 65535 f \n"
    xref += f"{off1:010d} 00000 n \n".encode("ascii")
    xref += f"{off2:010d} 00000 n \n".encode("ascii")
    xref += f"{off3:010d} 00000 n \n".encode("ascii")
    trailer = (
        b"trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n"
        + str(xref_start).encode("ascii")
        + b"\n%%EOF\n"
    )
    raw = body + xref + trailer
    if not raw.startswith(b"%PDF"):
        raise RuntimeError("embedded_minimal_invalid")
    return raw, "embedded_minimal_letter_stdlib"


def _pdf_bytes_pypdf_letter_blank() -> tuple[bytes, str]:
    """Valid Letter-sized PDF via pypdf (preferred when PyMuPDF is unavailable)."""
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


def _pdf_bytes_letter_fallback() -> tuple[bytes, str]:
    """pypdf blank page, then stdlib-embedded minimal PDF (never fails for missing deps alone)."""
    try:
        return _pdf_bytes_pypdf_letter_blank()
    except Exception as exc:
        log.warning(
            "VS01 PDF seed: pypdf blank page unavailable (%s: %s); using embedded minimal PDF",
            type(exc).__name__,
            (str(exc) or "")[:400],
        )
        return _pdf_bytes_embedded_minimal_letter()


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


StoryCssProfile = Literal["vs01", "recipient"]


def _vs01_signing_story_user_css() -> str:
    """
    CSS for PyMuPDF Story: Letter @page with a dedicated VS01 initials footer reserve,
    plus body typography and draft footer stability.
    """
    return (
        f"@page{{size:letter;margin:40pt 40pt {VS01_SIGNING_STORY_MARGIN_BOTTOM_PT}pt 40pt;}}"
        "body{font-family:Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.35;"
        "margin:0;padding:0;}"
        "footer.ldg-draft-footer{break-inside:avoid;page-break-inside:avoid;"
        "orphans:3;widows:3;margin-top:28pt;padding-top:10pt;}"
    )


def _recipient_preview_export_user_css() -> str:
    """
    Typography aligned with agreement `_render_html` long-form path (Georgia ~15px / 1.65).
    Bottom margin is modest — recipient exports do not reserve VS01 auto-initials band.
    """
    return (
        "@page{size:letter;margin:48pt 52pt 56pt 52pt;}"
        "body{font-family:Georgia,'Times New Roman',Times,serif;font-size:15px;line-height:1.65;"
        "color:#0f172a;margin:0;padding:0;}"
        "h1,h2,h3,h4,p,li,td,th,table,pre,div,span,header,section,article{font-family:Georgia,'Times New Roman',Times,serif;}"
        "pre{white-space:pre-wrap;}"
        "footer.ldg-draft-footer{break-inside:avoid;page-break-inside:avoid;"
        "orphans:3;widows:3;margin-top:20pt;padding-top:10pt;}"
    )


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
            fitz.Rect(
                VS01_SIGNING_STORY_MARGIN_LEFT_PT,
                VS01_SIGNING_STORY_MARGIN_TOP_PT,
                612 - VS01_SIGNING_STORY_MARGIN_RIGHT_PT,
                792 - VS01_SIGNING_STORY_MARGIN_BOTTOM_PT,
            ),
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
    html: str,
    *,
    title: str = "Agreement",
    story_css_profile: StoryCssProfile = "vs01",
) -> AgreementVs01PdfBuild:
    """
    Best-effort HTML → multi-page Letter PDF via PyMuPDF Story + DocumentWriter (in-memory).

    Uses ``io.BytesIO`` + ``writer.close()`` so output is valid (see PyMuPDF DocumentWriter docs).
    Falls back to plain-text layout if Story fails. If PyMuPDF is unavailable or fails, uses pypdf
    blank Letter, then a stdlib-only minimal valid PDF so VS01 seed never fails solely on optional
    PDF libraries missing from the image.

    ``story_css_profile``: ``vs01`` uses Helvetica + bottom margin reserve for signing seed footers;
    ``recipient`` uses Georgia 15px/1.65 to align with agreement preview HTML.
    """
    body_inner = _strip_scripts_and_styles(html)
    fitz = _import_fitz_module()
    if fitz is None:
        pdf_bytes, mode = _pdf_bytes_letter_fallback()
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
            _recipient_preview_export_user_css()
            if story_css_profile == "recipient"
            else _vs01_signing_story_user_css()
        )

        mediabox = fitz.paper_rect("letter")
        where = mediabox + (
            VS01_SIGNING_STORY_MARGIN_LEFT_PT,
            VS01_SIGNING_STORY_MARGIN_TOP_PT,
            -VS01_SIGNING_STORY_MARGIN_RIGHT_PT,
            -VS01_SIGNING_STORY_MARGIN_BOTTOM_PT,
        )

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
        pdf_bytes, mode = _pdf_bytes_letter_fallback()
        return AgreementVs01PdfBuild(pdf_bytes=pdf_bytes, render_mode=mode)
