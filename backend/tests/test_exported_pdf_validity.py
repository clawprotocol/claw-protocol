"""Structure checks for HTML→PDF export bytes (recipient / VS01 pipeline)."""

from __future__ import annotations

import io

import pytest

from backend.services.agreement_vs01_pdf_seed import (
    _pdf_bytes_embedded_minimal_letter,
    _pdf_bytes_pypdf_letter_blank,
    agreement_rendered_html_to_pdf_bytes,
)

pytestmark = pytest.mark.unit

# Loose cap for a tiny HTML fixture (1 page); catches accidental bloat / binary garbage.
_MAX_SAMPLE_EXPORT_BYTES = 2_000_000


def _assert_pdf_shell_valid(pdf_bytes: bytes) -> None:
    assert pdf_bytes.startswith(b"%PDF-"), "must start with %PDF-"
    tail = pdf_bytes[-4096:] if len(pdf_bytes) > 4096 else pdf_bytes
    assert b"%%EOF" in tail, "%%EOF must appear in final 4 KiB"
    assert b"startxref" in pdf_bytes, "startxref marker expected"

    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(io.BytesIO(pdf_bytes), strict=False)
    n = len(reader.pages)
    assert n > 0, "pypdf must see at least one page"

    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    buf = io.BytesIO()
    writer.write(buf)
    reader2 = PdfReader(io.BytesIO(buf.getvalue()), strict=False)
    assert len(reader2.pages) == n, "pypdf rewrite must preserve page count"


def test_pypdf_blank_fixture_is_valid_pdf() -> None:
    pytest.importorskip("pypdf")
    raw, mode = _pdf_bytes_pypdf_letter_blank()
    assert mode == "pypdf_blank_no_fitz"
    _assert_pdf_shell_valid(raw)


def test_embedded_minimal_letter_fixture_is_valid_pdf() -> None:
    raw, mode = _pdf_bytes_embedded_minimal_letter()
    assert mode == "embedded_minimal_letter_stdlib"
    _assert_pdf_shell_valid(raw)


def test_agreement_rendered_recipient_story_export_valid_when_pymupdf_available() -> None:
    pytest.importorskip("fitz")

    html = "<p style='margin:0'>LawDog QA export fixture.</p>"
    built = agreement_rendered_html_to_pdf_bytes(
        html,
        title="QA Fixture",
        story_css_profile="recipient",
    )
    assert built.render_mode in ("story_html", "story_html_truncated")
    assert len(built.pdf_bytes) < _MAX_SAMPLE_EXPORT_BYTES
    _assert_pdf_shell_valid(built.pdf_bytes)


def test_agreement_rendered_vs01_story_export_valid_when_pymupdf_available() -> None:
    pytest.importorskip("fitz")
    built = agreement_rendered_html_to_pdf_bytes(
        "<p>VS01 signing seed fixture.</p>",
        title="Seed",
        story_css_profile="vs01",
    )
    assert built.render_mode in ("story_html", "story_html_truncated", "plaintext_after_story_error")
    assert len(built.pdf_bytes) < _MAX_SAMPLE_EXPORT_BYTES
    _assert_pdf_shell_valid(built.pdf_bytes)
