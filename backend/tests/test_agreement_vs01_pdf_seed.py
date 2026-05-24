from __future__ import annotations

import pytest

from backend.services.agreement_vs01_pdf_seed import (
    VS01_SIGNING_STORY_MARGIN_BOTTOM_PT,
    _recipient_preview_export_user_css,
    _vs01_signing_story_user_css,
    agreement_rendered_html_to_pdf_bytes,
)

pytestmark = pytest.mark.unit


def test_vs01_signing_story_reserves_at_least_three_quarter_inch_bottom() -> None:
    assert VS01_SIGNING_STORY_MARGIN_BOTTOM_PT >= 160


def test_vs01_signing_story_user_css_has_letter_page_and_bottom_margin() -> None:
    css = _vs01_signing_story_user_css()
    assert "@page" in css
    assert "letter" in css
    assert "72pt" in css


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
