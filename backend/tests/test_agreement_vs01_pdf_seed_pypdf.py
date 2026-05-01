"""VS01 PDF seed: pypdf / embedded fallbacks when PyMuPDF is unavailable."""

from __future__ import annotations

import pytest

from backend.services.agreement_vs01_pdf_seed import (
    _pdf_bytes_embedded_minimal_letter,
    _pdf_bytes_letter_fallback,
    _pdf_bytes_pypdf_letter_blank,
    agreement_rendered_html_to_pdf_bytes,
)

pytestmark = pytest.mark.unit


def test_pypdf_importable_for_production_vs01_seed() -> None:
    """Railway/Docker must ship pypdf; fail fast in CI if dependency manifest is wrong."""
    import pypdf  # noqa: PLC0415
    from pypdf import PdfWriter  # noqa: PLC0415

    assert pypdf is not None
    w = PdfWriter()
    w.add_blank_page(width=72, height=72)
    assert w.pages is not None


def test_pypdf_blank_letter_is_valid_pdf() -> None:
    pytest.importorskip("pypdf")
    raw, mode = _pdf_bytes_pypdf_letter_blank()
    assert raw.startswith(b"%PDF")
    assert len(raw) > 100
    assert mode == "pypdf_blank_no_fitz"


def test_embedded_minimal_letter_is_valid_pdf() -> None:
    raw, mode = _pdf_bytes_embedded_minimal_letter()
    assert raw.startswith(b"%PDF")
    assert len(raw) > 200
    assert mode == "embedded_minimal_letter_stdlib"
    try:
        from pypdf import PdfReader  # noqa: PLC0415

        import io

        r = PdfReader(io.BytesIO(raw))
        assert len(r.pages) == 1
    except ImportError:
        pass


def test_letter_fallback_uses_embedded_when_pypdf_raises(monkeypatch) -> None:
    def _boom() -> tuple[bytes, str]:
        raise ModuleNotFoundError("No module named 'pypdf'")

    monkeypatch.setattr(
        "backend.services.agreement_vs01_pdf_seed._pdf_bytes_pypdf_letter_blank",
        _boom,
    )
    raw, mode = _pdf_bytes_letter_fallback()
    assert raw.startswith(b"%PDF")
    assert mode == "embedded_minimal_letter_stdlib"


def test_agreement_rendered_html_when_fitz_unavailable_uses_pypdf_or_embedded(monkeypatch) -> None:
    """VS01 seed must not depend on PyMuPDF alone; pypdf or stdlib minimal PDF."""
    monkeypatch.setattr(
        "backend.services.agreement_vs01_pdf_seed._import_fitz_module",
        lambda: None,
    )
    built = agreement_rendered_html_to_pdf_bytes("<p>Hello</p>", title="T")
    assert built.pdf_bytes.startswith(b"%PDF")
    assert built.render_mode in ("pypdf_blank_no_fitz", "embedded_minimal_letter_stdlib")


def test_agreement_rendered_html_import_error_uses_pypdf(monkeypatch) -> None:
    """Simulate broken PyMuPDF: first fitz use raises; outer handler uses letter fallback."""
    import sys
    import types

    class _FitzStub(types.ModuleType):
        def __getattr__(self, name: str):
            raise ImportError("pymupdf not installed")

    monkeypatch.setitem(sys.modules, "fitz", _FitzStub("fitz"))
    monkeypatch.setattr(
        "backend.services.agreement_vs01_pdf_seed._import_fitz_module",
        lambda: sys.modules["fitz"],
    )
    built = agreement_rendered_html_to_pdf_bytes("<p>Hello</p>", title="T")
    assert built.pdf_bytes.startswith(b"%PDF")
    assert built.render_mode in ("pypdf_blank_no_fitz", "embedded_minimal_letter_stdlib")
