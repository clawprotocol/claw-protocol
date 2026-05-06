"""PyMuPDF Story capability for agreement HTML→PDF (recipient export quality gate)."""

from __future__ import annotations

import io
import logging
from typing import Any, Final, Literal, NotRequired, TypedDict, cast

from backend.services.agreement_vs01_pdf_seed import (
    VS01_SIGNING_STORY_MARGIN_BOTTOM_PT,
    VS01_SIGNING_STORY_MARGIN_LEFT_PT,
    VS01_SIGNING_STORY_MARGIN_RIGHT_PT,
    VS01_SIGNING_STORY_MARGIN_TOP_PT,
    _import_fitz_module,
)

log = logging.getLogger(__name__)

PdfStoryEngine = Literal["pymupdf-story", "fallback"]

RECIPIENT_PREVIEW_PDF_STORY_RENDER_MODES: Final[frozenset[str]] = frozenset(
    {
        "story_html",
        "story_html_truncated",
    }
)

_capability_cache: dict[str, Any] | None = None
_logged_capability_line: bool = False


class AgreementPdfStoryCapability(TypedDict):
    """Structured Story / PyMuPDF status (no stack traces, safe for logs)."""

    available: bool
    engine: PdfStoryEngine
    reason: NotRequired[str]


def reset_agreement_pdf_story_capability_cache_for_tests() -> None:
    global _capability_cache, _logged_capability_line
    _capability_cache = None
    _logged_capability_line = False


def _log_capability_once(cap: AgreementPdfStoryCapability) -> None:
    global _logged_capability_line
    if _logged_capability_line:
        return
    _logged_capability_line = True
    avail = bool(cap.get("available"))
    eng = str(cap.get("engine") or "fallback")
    reason = (cap.get("reason") or "").strip()
    log.info(
        "[recipient-pdf-export] pymupdf_story_available=%s engine=%s",
        str(avail).lower(),
        eng,
    )
    if not avail and reason:
        log.warning("[recipient-pdf-export] pymupdf_story_unavailable reason=%s", reason[:500])


def assess_agreement_pdf_story_capability() -> AgreementPdfStoryCapability:
    """
    Whether PyMuPDF can run a minimal HTML Story render (same API as agreement PDF export).

    Result is cached for process lifetime. Call ``reset_agreement_pdf_story_capability_cache_for_tests`` in unit tests.
    """
    global _capability_cache
    if _capability_cache is not None:
        return cast(AgreementPdfStoryCapability, _capability_cache)

    fitz = _import_fitz_module()
    if fitz is None:
        out: AgreementPdfStoryCapability = {
            "available": False,
            "engine": "fallback",
            "reason": "pymupdf_import_failed",
        }
        _capability_cache = dict(out)
        _log_capability_once(out)
        return out

    if not hasattr(fitz, "Story") or not hasattr(fitz, "DocumentWriter"):
        out = {
            "available": False,
            "engine": "fallback",
            "reason": "pymupdf_story_api_missing",
        }
        _capability_cache = dict(out)
        _log_capability_once(out)
        return out

    try:
        wrapped = (
            "<!DOCTYPE html><html><head><meta charset='utf-8'/><title>cap</title></head>"
            "<body><p>LawDog PDF capability probe.</p></body></html>"
        )
        user_css = "body{margin:0;padding:0;font-family:Helvetica;font-size:11pt;}"
        buf = io.BytesIO()
        writer = fitz.DocumentWriter(buf)
        story = fitz.Story(html=wrapped, user_css=user_css, archive=None)
        mediabox = fitz.paper_rect("letter")
        where = mediabox + (
            VS01_SIGNING_STORY_MARGIN_LEFT_PT,
            VS01_SIGNING_STORY_MARGIN_TOP_PT,
            -VS01_SIGNING_STORY_MARGIN_RIGHT_PT,
            -VS01_SIGNING_STORY_MARGIN_BOTTOM_PT,
        )
        dev = writer.begin_page(mediabox)
        more, _filled = story.place(where)
        story.draw(dev)
        writer.end_page()
        writer.close()
        raw = buf.getvalue()
        if not raw.startswith(b"%PDF") or len(raw) < 64:
            out = {
                "available": False,
                "engine": "fallback",
                "reason": "pymupdf_story_smoke_invalid_pdf",
            }
            _capability_cache = dict(out)
            _log_capability_once(out)
            return out
        if more:
            log.warning(
                "[recipient-pdf-export] capability_smoke_truncated pages=1 more=%s",
                str(more),
            )
        out = {"available": True, "engine": "pymupdf-story"}
        _capability_cache = dict(out)
        _log_capability_once(out)
        return out
    except Exception as exc:
        out = {
            "available": False,
            "engine": "fallback",
            "reason": f"pymupdf_story_smoke_failed:{type(exc).__name__}",
        }
        _capability_cache = dict(out)
        _log_capability_once(out)
        return out
