from __future__ import annotations

import pytest

from backend.services.agreement_pdf_story_capability import (
    RECIPIENT_PREVIEW_PDF_STORY_RENDER_MODES,
    assess_agreement_pdf_story_capability,
    reset_agreement_pdf_story_capability_cache_for_tests,
)

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _reset_capability_cache() -> None:
    reset_agreement_pdf_story_capability_cache_for_tests()
    yield
    reset_agreement_pdf_story_capability_cache_for_tests()


def test_recipient_preview_story_render_modes_frozenset() -> None:
    assert "story_html" in RECIPIENT_PREVIEW_PDF_STORY_RENDER_MODES
    assert "story_html_truncated" in RECIPIENT_PREVIEW_PDF_STORY_RENDER_MODES
    assert "plaintext_after_story_error" not in RECIPIENT_PREVIEW_PDF_STORY_RENDER_MODES


def test_assess_capability_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    def fake() -> None:
        calls["n"] += 1
        return None

    monkeypatch.setattr("backend.services.agreement_pdf_story_capability._import_fitz_module", fake)
    a = assess_agreement_pdf_story_capability()
    b = assess_agreement_pdf_story_capability()
    assert a == b
    assert calls["n"] == 1
    assert a["available"] is False
    assert a["engine"] == "fallback"
    assert a.get("reason") == "pymupdf_import_failed"


def test_assess_capability_story_api_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    class _NoStory:
        pass

    monkeypatch.setattr(
        "backend.services.agreement_pdf_story_capability._import_fitz_module",
        lambda: _NoStory(),
    )
    cap = assess_agreement_pdf_story_capability()
    assert cap["available"] is False
    assert cap.get("reason") == "pymupdf_story_api_missing"


def test_assess_capability_success_smoke() -> None:
    pytest.importorskip("fitz")
    cap = assess_agreement_pdf_story_capability()
    if not cap["available"]:
        pytest.skip(f"PyMuPDF Story smoke not available in this environment: {cap.get('reason')}")
    assert cap["engine"] == "pymupdf-story"
