"""
End-to-end layout analysis pipeline.
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from backend.document_layout.candidates import (
    SIGNABLE_FIELD_KINDS,
    detect_field_candidates,
    likely_signable_regions,
)
from backend.document_layout.confidence_policy import annotate_field_candidates
from backend.document_layout.events import emit_document_layout_event
from backend.document_layout.extract import extract_spatial_pages, pages_to_review_dict
from backend.document_layout.llm_assist import assist_classify_candidates
from backend.document_layout.store import save_layout_analysis


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def run_layout_analysis(
    content: bytes,
    *,
    content_type: Optional[str] = None,
    document_id: Optional[str] = None,
    prefer_ocr: bool = False,
    assistive_llm: bool = True,
    persist: bool = True,
) -> Dict[str, Any]:
    """
    Produce reviewable layout JSON (coordinates from PyMuPDF / OCR only).
    """
    if not content:
        raise ValueError("empty_document")

    content_sha256 = hashlib.sha256(content).hexdigest()
    analysis_id = f"layout_{uuid.uuid4().hex}"

    emit_document_layout_event(
        "document_layout_analysis_started",
        analysis_id=analysis_id,
        document_id=document_id,
        content_sha256=content_sha256,
    )

    pages, extract_meta = extract_spatial_pages(content, content_type, prefer_ocr=prefer_ocr)
    pages_dict = pages_to_review_dict(pages)
    candidates, ambiguities = detect_field_candidates(pages)
    emit_document_layout_event(
        "field_candidates_detected",
        analysis_id=analysis_id,
        count=len(candidates),
    )

    if assistive_llm:
        candidates = assist_classify_candidates(candidates)

    annotate_field_candidates(candidates)

    low_band = sum(1 for c in candidates if c.get("confidence_band") == "low")
    if low_band:
        emit_document_layout_event(
            "field_confidence_low", analysis_id=analysis_id, count=low_band
        )
    critical_review = sum(
        1 for c in candidates if c.get("critical_field") and c.get("review_required")
    )
    if critical_review:
        emit_document_layout_event(
            "critical_field_review_required", analysis_id=analysis_id, count=critical_review
        )

    signable = likely_signable_regions(candidates)

    # Confidence summaries
    by_type: Dict[str, int] = {}
    for c in candidates:
        k = str(c.get("field_type_guess") or "unknown")
        by_type[k] = by_type.get(k, 0) + 1

    unresolved = list(ambiguities)
    low_conf = [
        c["candidate_id"]
        for c in candidates
        if not c.get("meets_placement_threshold") and c.get("field_type_guess") in SIGNABLE_FIELD_KINDS
    ]
    if low_conf:
        unresolved.append(
            f"{len(low_conf)} fill/sign regions are below type-specific confidence — human review recommended"
        )
    crit_low = [
        c["candidate_id"]
        for c in candidates
        if c.get("critical_field") and not c.get("meets_placement_threshold")
    ]
    if crit_low:
        unresolved.append(
            f"{len(crit_low)} signature, date, name, or initials region(s) need verification on the page"
        )

    review_needed = bool(unresolved) or any(
        c.get("review_required") for c in candidates if c.get("field_type_guess") in SIGNABLE_FIELD_KINDS
    )
    if review_needed:
        emit_document_layout_event(
            "field_localization_review_needed",
            analysis_id=analysis_id,
            reason="low_confidence_or_ambiguity",
        )

    payload: Dict[str, Any] = {
        "schema_version": "claw.document_layout.v1",
        "analysis_id": analysis_id,
        "document_id_ref": document_id,
        "content_sha256_analyzed": content_sha256,
        "disclaimer": "Advisory layout metadata only — not a proof artifact; do not merge into signed bundles.",
        "created_at": _utc_now_iso(),
        "page_count": len(pages),
        "extraction_meta": extract_meta,
        "pages": pages_dict.get("pages", []),
        "field_candidates": candidates,
        "likely_signable_regions": signable,
        "confidence_summaries": {
            "candidate_total": len(candidates),
            "signable_total": len(signable),
            "by_heuristic_type": by_type,
        },
        "unresolved_ambiguities": unresolved,
    }

    if persist:
        save_layout_analysis(analysis_id, payload)

    emit_document_layout_event(
        "document_layout_analysis_completed",
        analysis_id=analysis_id,
        page_count=len(pages),
        candidate_count=len(candidates),
    )
    return payload
