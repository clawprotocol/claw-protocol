from __future__ import annotations

import pytest

pytest.importorskip("fitz")

from backend.services.agreement_vs01_pdf_seed import agreement_rendered_html_to_pdf_bytes


def test_agreement_rendered_html_to_pdf_bytes_smoke() -> None:
    raw = agreement_rendered_html_to_pdf_bytes(
        "<p>Hello <b>world</b></p>",
        title="Test Agreement",
    )
    assert raw.startswith(b"%PDF")
    assert len(raw) > 200
