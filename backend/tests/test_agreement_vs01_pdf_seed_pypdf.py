"""VS01 PDF seed: pypdf fallback path (no PyMuPDF required)."""

from __future__ import annotations

import pytest

from backend.services.agreement_vs01_pdf_seed import (
    _pdf_bytes_pypdf_letter_blank,
    agreement_rendered_html_to_pdf_bytes,
)

pytestmark = pytest.mark.unit


def test_pypdf_blank_letter_is_valid_pdf() -> None:
    raw, mode = _pdf_bytes_pypdf_letter_blank()
    assert raw.startswith(b"%PDF")
    assert len(raw) > 100
    assert mode == "pypdf_blank_no_fitz"


def test_agreement_rendered_html_import_error_uses_pypdf(monkeypatch) -> None:
    """Simulate missing PyMuPDF: module raises ImportError on first attribute use."""
    import sys
    import types

    class _FitzStub(types.ModuleType):
        def __getattr__(self, name: str):
            raise ImportError("pymupdf not installed")

    monkeypatch.setitem(sys.modules, "fitz", _FitzStub("fitz"))
    built = agreement_rendered_html_to_pdf_bytes("<p>Hello</p>", title="T")
    assert built.pdf_bytes.startswith(b"%PDF")
    assert built.render_mode == "pypdf_blank_no_fitz"
