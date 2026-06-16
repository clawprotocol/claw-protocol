"""Canonical completed signed agreement PDF export (fully executed snapshot only)."""

from __future__ import annotations

import html
import re
from typing import Any, Dict, Tuple

from fastapi import HTTPException
from starlette.responses import Response

from backend.agreements.placeholder_template_safety import (
    strip_html_agreement_scan_text,
    validate_user_visible_agreement_text,
)
from backend.services.agreement_pdf_story_capability import (
    RECIPIENT_PREVIEW_PDF_STORY_RENDER_MODES,
    assess_agreement_pdf_story_capability,
)
from backend.services.agreement_vs01_pdf_seed import agreement_rendered_html_to_pdf_bytes
from backend.services.vs01_signer_completion import read_fully_executed_snapshot_from_draft

_RECIPIENT_PDF_EXPORT_UNAVAILABLE_USER = (
    "PDF export is temporarily unavailable. Please use Copy or Download text for now."
)


def read_completed_signed_corpus_plain(draft: Dict[str, Any]) -> str:
    """Authoritative signed agreement text for completed PDF export."""
    snap = read_fully_executed_snapshot_from_draft(draft)
    return str((snap or {}).get("corpus_plain") or "").strip()


def completed_signed_corpus_to_export_html(corpus_plain: str) -> str:
    """Single HTML renderer for completed signed exports — plain corpus, no live dashboard transforms."""
    body = html.escape((corpus_plain or "").strip())
    return (
        "<article style='max-width:720px;margin:0 auto'>"
        "<pre style='white-space:pre-wrap;font-family:Georgia,serif;font-size:15px;line-height:1.65;"
        "color:#0f172a;margin:0;padding:0;border:0;background:transparent'>"
        f"{body}</pre></article>"
    )


def _draft_placeholder_intake_corpus(draft: Any) -> str:
    parts: list[str] = []
    for p in getattr(draft, "parties", None) or []:
        nm = str(getattr(p, "name", None) or "").strip()
        em = str(getattr(p, "email", None) or "").strip()
        if nm:
            parts.append(nm)
        if em:
            parts.append(em)
    for key in ("purpose", "payment_terms", "title", "jurisdiction"):
        seg = str(getattr(draft, key, None) or "").strip()
        if seg:
            parts.append(seg)
    return "\n".join(parts)


def _completed_signed_pdf_filename(draft: Any) -> str:
    title = str(getattr(draft, "title", None) or "").strip() or "agreement"
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:80] or "agreement"
    return f"{slug}-signed.pdf"


def build_completed_signed_pdf_bytes(*, agreement_id: str, draft: Any) -> Tuple[bytes, str]:
    """
    Build canonical completed signed PDF bytes from stored fully_executed_snapshot only.

    Ignores any client/dashboard HTML so signature blocks stay identical across surfaces.
    """
    corpus_plain = read_completed_signed_corpus_plain(
        draft.model_dump() if hasattr(draft, "model_dump") else dict(draft)
    )
    if len(corpus_plain) < 80:
        raise HTTPException(status_code=409, detail="signed_snapshot_unavailable")

    html_for_export = completed_signed_corpus_to_export_html(corpus_plain)

    cap = assess_agreement_pdf_story_capability()
    if not cap.get("available"):
        raise HTTPException(
            status_code=503,
            detail={
                "code": "completed_signed_pdf_export_unavailable",
                "message": _RECIPIENT_PDF_EXPORT_UNAVAILABLE_USER,
            },
        )

    party_names_pdf = [
        str(getattr(p, "name", None) or "").strip()
        for p in (getattr(draft, "parties", None) or [])
        if str(getattr(p, "name", None) or "").strip()
    ]
    scan_plain = strip_html_agreement_scan_text(html_for_export or "")
    ok_ph_pdf, _, ph_diag_pdf = validate_user_visible_agreement_text(
        scan_plain,
        party_names=party_names_pdf,
        intake_raw=_draft_placeholder_intake_corpus(draft),
        surface="completed_signed_export_pdf",
        agreement_family="",
    )
    if not ok_ph_pdf:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "agreement_placeholder_blocked",
                "message": "This export still contains drafting placeholders. Resolve them before creating a PDF.",
                "placeholder": ph_diag_pdf,
            },
        )

    title = str(getattr(draft, "title", None) or "").strip() or "Agreement"
    built = agreement_rendered_html_to_pdf_bytes(
        html_for_export,
        title=title,
        story_css_profile="recipient",
    )
    if built.render_mode not in RECIPIENT_PREVIEW_PDF_STORY_RENDER_MODES:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "completed_signed_pdf_export_unavailable",
                "message": _RECIPIENT_PDF_EXPORT_UNAVAILABLE_USER,
            },
        )

    return built.pdf_bytes, _completed_signed_pdf_filename(draft)


def build_completed_signed_pdf_response(*, agreement_id: str, draft: Any) -> Response:
    pdf_bytes, filename = build_completed_signed_pdf_bytes(agreement_id=agreement_id, draft=draft)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
