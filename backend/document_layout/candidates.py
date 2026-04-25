"""
Heuristic field candidates from layout — geometry from extraction only.
"""
from __future__ import annotations

import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

from backend.document_layout.coords import normalize_rect_pdf
from backend.document_layout.extract import LineRecord, PageLayout

SIGNABLE_FIELD_KINDS = frozenset(
    {
        "signature_line",
        "date_line",
        "printed_name_line",
        "initials_line",
        "freeform_blank_line",
        "amount_blank",
        "checkbox_like",
    }
)

_UNDERSCORE_RUN = re.compile(r"_{4,}")
_NUMERIC_BLANK = re.compile(r"^\s*[\$€£]?\s*_{2,}\s*$")
_DATE_HINT = re.compile(r"\bdate\b", re.I)
_SIG_HINT = re.compile(r"\bsignature\b|\bsign\s*here\b|\bsigner\b", re.I)
_NAME_HINT = re.compile(r"\bprint\s+name\b|\bname\s*\(print\)|\btyped\s+name\b|\blegal\s+name\b", re.I)
_INITIALS_HINT = re.compile(
    r"\binitials?\b|\binit\.?\b|\binitial\s+here\b|\binitial\s*:\s*_{2,}", re.I
)
_ADDR_HINT = re.compile(r"\baddress\b|\bstreet\b", re.I)
_AMOUNT_HINT = re.compile(r"\bamount\b|\btotal\b|\bbalance\s+due\b", re.I)
_CHECKBOX = re.compile(r"[☐☑✓✔□▢]")
_RESPOND_HINT = re.compile(r"\brespond\b|\breply\b|\bwithin\s+\d+\s+days\b", re.I)


def _guess_from_line_text(text: str) -> Tuple[str, float, str]:
    """Returns (field_type_guess, confidence, source_method)."""
    t = (text or "").strip()
    if not t:
        return "empty_line", 0.25, "heuristic"
    if _CHECKBOX.search(t):
        return "checkbox_like", 0.55, "heuristic"
    if _SIG_HINT.search(t) or (_UNDERSCORE_RUN.search(t) and "sign" in t.lower()):
        return "signature_line", 0.72, "heuristic"
    if _DATE_HINT.search(t) and (_UNDERSCORE_RUN.search(t) or len(t) < 80):
        return "date_line", 0.68, "heuristic"
    if _INITIALS_HINT.search(t) or (_UNDERSCORE_RUN.search(t) and "initial" in t.lower()):
        return "initials_line", 0.64, "heuristic"
    if _NAME_HINT.search(t):
        return "printed_name_line", 0.65, "heuristic"
    if _ADDR_HINT.search(t):
        return "address_line", 0.5, "heuristic"
    if _AMOUNT_HINT.search(t) or _NUMERIC_BLANK.match(t):
        return "amount_blank", 0.55, "heuristic"
    if _UNDERSCORE_RUN.search(t) or t.strip("_ .") == "":
        return "freeform_blank_line", 0.6, "heuristic"
    if len(t) < 3 and t in (".", ":", "-"):
        return "blank_or_punctuation", 0.3, "heuristic"
    return "unknown_line", 0.2, "layout"


def _label_from_line(line: LineRecord, page: PageLayout) -> Optional[str]:
    """Heuristic label: left portion of line text before long underscore."""
    raw = line.text.strip()
    m = _UNDERSCORE_RUN.search(raw)
    if m:
        left = raw[: m.start()].strip(" :\t-")
        if left and len(left) < 120:
            return left
    if ":" in raw[:80]:
        return raw.split(":", 1)[0].strip()[:120]
    return None


def _nearby_context(page: PageLayout, line: LineRecord, radius: float = 48.0) -> str:
    """Concatenate text from lines within vertical neighborhood (PDF pts)."""
    lx0, ly0, lx1, ly1 = line.bbox_pdf
    mid_y = (ly0 + ly1) / 2
    snippets: List[str] = []
    for b in page.blocks:
        for ln in b.lines:
            _, y0, _, y1 = ln.bbox_pdf
            cm = (y0 + y1) / 2
            if abs(cm - mid_y) <= radius:
                t = ln.text.strip()
                if t and t != line.text.strip():
                    snippets.append(t[:200])
    return " | ".join(snippets[:4])[:800]


def detect_field_candidates(pages: List[PageLayout]) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Build candidate regions from extracted lines.
    Returns (candidates, unresolved_ambiguities).
    """
    candidates: List[Dict[str, Any]] = []
    ambiguities: List[str] = []
    for page in pages:
        pw, ph = page.width_pt, page.height_pt
        for block in page.blocks:
            for line in block.lines:
                text = line.text or ""
                guess, conf, method = _guess_from_line_text(text)
                if guess in ("unknown_line",) and not _UNDERSCORE_RUN.search(text):
                    # Skip noisy body text unless it's a short line (possible form row)
                    if len(text) > 120:
                        continue
                if guess == "unknown_line" and len(text) > 60:
                    continue

                x0, y0, x1, y1 = line.bbox_pdf
                cid = f"cand_{uuid.uuid4().hex[:12]}"
                label = _label_from_line(line, page)
                nearby = _nearby_context(page, line)
                candidates.append(
                    {
                        "candidate_id": cid,
                        "page_number": page.page_number,
                        "field_type_guess": guess,
                        "label_text": label,
                        "nearby_text_context": nearby,
                        "bbox_pdf": {"x0": x0, "y0": y0, "x1": x1, "y1": y1},
                        "bbox_normalized": normalize_rect_pdf(x0, y0, x1, y1, pw, ph),
                        "confidence": round(min(0.97, max(0.05, conf)), 4),
                        "source_method": method,
                        "line_text_snippet": text[:500],
                    }
                )
                if guess in ("freeform_blank_line", "unknown_line") and conf < 0.35:
                    ambiguities.append(
                        f"Low confidence candidate {cid} page {page.page_number}: review suggested"
                    )

    if not any(c["field_type_guess"] == "checkbox_like" for c in candidates):
        ambiguities.append(
            "Checkbox geometry not inferred from vectors in this pass — review may be needed for form-style boxes"
        )
    return candidates, ambiguities


def likely_signable_regions(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Regions suggested for signing workflows — excludes critical types below placement threshold
    so they are not auto-trusted without review.
    """
    out = []
    for c in candidates:
        if c.get("field_type_guess") not in SIGNABLE_FIELD_KINDS:
            continue
        annotated = c.get("placement_threshold") is not None
        if annotated:
            if not c.get("auto_usable"):
                continue
        elif float(c.get("confidence") or 0) < 0.35:
            continue
        out.append(
            {
                "candidate_id": c["candidate_id"],
                "page_number": c["page_number"],
                "field_type_guess": c["field_type_guess"],
                "bbox_normalized": c.get("bbox_normalized"),
                "confidence": c.get("confidence_score", c.get("effective_confidence", c.get("confidence"))),
                "meets_placement_threshold": bool(c.get("meets_placement_threshold", True)),
                "auto_usable": bool(c.get("auto_usable", False)),
            }
        )
    return out
