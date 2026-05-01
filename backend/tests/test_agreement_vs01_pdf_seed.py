from __future__ import annotations

import pytest

pytest.importorskip("fitz")

from backend.services.agreement_vs01_pdf_seed import agreement_rendered_html_to_pdf_bytes

pytestmark = pytest.mark.unit


def test_agreement_rendered_html_to_pdf_bytes_smoke() -> None:
    built = agreement_rendered_html_to_pdf_bytes(
        "<p>Hello <b>world</b></p>",
        title="Test Agreement",
    )
    assert built.pdf_bytes.startswith(b"%PDF")
    assert len(built.pdf_bytes) > 200
    assert built.render_mode in (
        "story_html",
        "story_html_truncated",
        "plaintext_after_story_error",
    )
