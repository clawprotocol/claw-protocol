from __future__ import annotations

import pytest

from backend.services.agreement_vs01_pdf_seed import (
    VS01_SIGNING_STORY_MARGIN_BOTTOM_PT,
    _completed_signed_export_user_css,
    _recipient_preview_export_user_css,
    _vs01_signing_story_user_css,
    agreement_rendered_html_to_pdf_bytes,
)

pytestmark = pytest.mark.unit


def test_vs01_signing_story_reserves_at_least_three_quarter_inch_bottom() -> None:
    assert VS01_SIGNING_STORY_MARGIN_BOTTOM_PT >= 300


def test_vs01_signing_story_user_css_has_letter_page_and_bottom_margin() -> None:
    css = _vs01_signing_story_user_css()
    assert "@page" in css
    assert "letter" in css
    assert "300pt" in css


def test_completed_signed_export_user_css_bolds_headings_and_script_signatures() -> None:
    css = _completed_signed_export_user_css()
    assert "completed-signed-section-heading" in css
    assert "font-weight:700" in css
    assert "completed-signed-signature-script" in css
    assert "Brush Script MT" in css
    assert "48pt" in css


def test_recipient_preview_export_user_css_uses_georgia() -> None:
    css = _recipient_preview_export_user_css()
    assert "Georgia" in css
    assert "@page" in css


def test_agreement_rendered_html_to_pdf_bytes_smoke() -> None:
    pytest.importorskip("fitz")
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


def test_agreement_rendered_html_recipient_profile_smoke() -> None:
    pytest.importorskip("fitz")
    built = agreement_rendered_html_to_pdf_bytes(
        "<p style='margin:0'>Recipient export</p>",
        title="Agreement",
        story_css_profile="recipient",
    )
    assert built.pdf_bytes.startswith(b"%PDF")
    assert len(built.pdf_bytes) > 200


def test_persist_review_profile_uses_commercial_letter_not_leftover_300pt_band() -> None:
    pytest.importorskip("fitz")
    import fitz  # type: ignore[import-not-found,import-untyped]

    html = "<pre>" + ("Commercial letter body. " * 80) + "</pre>"
    leftover = agreement_rendered_html_to_pdf_bytes(html, title="T", story_css_profile="vs01")
    commercial = agreement_rendered_html_to_pdf_bytes(
        html, title="T", story_css_profile="persist_review"
    )
    assert leftover.render_mode == "story_html"
    assert commercial.render_mode == "story_html"

    def _ymax(raw: bytes) -> float:
        doc = fitz.open(stream=raw, filetype="pdf")
        try:
            ymax = 0.0
            for page in doc:
                for block in page.get_text("dict").get("blocks", []):
                    if block.get("type") != 0:
                        continue
                    bbox = block.get("bbox") or (0, 0, 0, 0)
                    ymax = max(ymax, float(bbox[3]))
            return ymax
        finally:
            doc.close()

    leftover_ymax = _ymax(leftover.pdf_bytes)
    commercial_ymax = _ymax(commercial.pdf_bytes)
    assert leftover_ymax <= 500
    assert commercial_ymax > 500
