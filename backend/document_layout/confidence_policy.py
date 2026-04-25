"""
Conservative confidence scoring for document field localization.

- Geometry/heuristic signal is carried in ``geometry_confidence`` (deterministic from extraction + line heuristics).
- ``confidence_score`` blends heuristic + assist pessimistically (min) so LLM relabeling cannot lift a weak line to "safe" alone.
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Tuple

ConfidenceBand = Literal["high", "medium", "low"]

# Critical signing / identity fields — higher bars, human review by default.
CRITICAL_FIELD_TYPES = frozenset(
    {
        "signature_line",
        "date_line",
        "printed_name_line",
        "initials_line",
    }
)

_PLACEMENT_THRESHOLDS: Dict[str, float] = {
    "signature_line": 0.70,
    "date_line": 0.68,
    "printed_name_line": 0.68,
    "initials_line": 0.68,
    "amount_blank": 0.50,
    "freeform_blank_line": 0.48,
    "checkbox_like": 0.50,
    "address_line": 0.48,
    "text_field": 0.48,
    "unknown_line": 0.40,
    "body_text": 0.35,
    "boilerplate": 0.35,
    "response_request_region": 0.45,
}

_DEFAULT_PLACEMENT_THRESHOLD = 0.45
_SOFT_FLOOR_RATIO = 0.85

# Critical fields only skip confirmation in downstream/automation when score + geometry are clearly strong.
CRITICAL_AUTOMATION_SCORE = 0.88


def is_critical_field_type(field_type: Optional[str]) -> bool:
    ft = (field_type or "").strip()
    return ft in CRITICAL_FIELD_TYPES


def placement_threshold_for_type(field_type: Optional[str]) -> float:
    ft = (field_type or "").strip()
    return float(_PLACEMENT_THRESHOLDS.get(ft, _DEFAULT_PLACEMENT_THRESHOLD))


def effective_placement_field_type(candidate: Dict[str, Any]) -> str:
    return str(candidate.get("field_type_guess") or candidate.get("field_type_assist") or "unknown_line")


def geometry_confidence(candidate: Dict[str, Any]) -> float:
    """Deterministic detector/heuristic confidence only (not superseded by assist)."""
    try:
        g = float(candidate.get("confidence") or 0.0)
    except (TypeError, ValueError):
        g = 0.0
    return max(0.0, min(1.0, g))


def compute_confidence_score(candidate: Dict[str, Any]) -> float:
    """
    Pessimistic blend: assist never raises trust above geometry/heuristic baseline.
    """
    base = geometry_confidence(candidate)
    assist_c = candidate.get("assist_confidence")
    if assist_c is None:
        return base
    try:
        ac = float(assist_c)
    except (TypeError, ValueError):
        ac = base
    ac = max(0.0, min(1.0, ac))
    return max(0.0, min(1.0, min(base, ac)))


# Backwards-compatible alias
def compute_effective_confidence(candidate: Dict[str, Any]) -> float:
    return compute_confidence_score(candidate)


def compute_confidence_band(score: float, threshold: float) -> ConfidenceBand:
    if score >= threshold:
        return "high"
    if score >= threshold * _SOFT_FLOOR_RATIO:
        return "medium"
    return "low"


def professional_ux_label(field_type: str, band: ConfidenceBand, *, critical: bool) -> str:
    """Short, non-overclaiming copy for field review UI."""
    ft = (field_type or "unknown_line").strip()
    if ft == "signature_line":
        base = "Possible signature area"
    elif ft == "date_line":
        base = "Possible date field"
    elif ft in ("printed_name_line",):
        base = "Possible legal name / printed name field"
    elif ft == "initials_line":
        base = "Possible initials field"
    elif ft == "address_line":
        base = "Possible address field"
    elif ft == "amount_blank":
        base = "Possible amount or number field"
    elif ft == "freeform_blank_line":
        base = "Possible blank line / fillable area"
    elif ft == "checkbox_like":
        base = "Possible checkbox"
    else:
        base = "Possible form field"

    if band == "low" or (critical and band != "high"):
        return f"{base} — review required before use"
    if band == "medium":
        return f"{base} — uncertain; please verify on the document"
    if critical:
        return f"{base} — verify before sending"
    return f"{base}"


def build_safety_reasons(
    *,
    band: ConfidenceBand,
    critical: bool,
    auto_usable: bool,
    ambiguous_overlap: bool,
    meets_placement_threshold: bool,
    geometry_conf: float,
    threshold: float,
    score: float,
) -> Tuple[List[str], str]:
    reasons: List[str] = []
    if ambiguous_overlap:
        reasons.append("Overlaps another likely field on the page — intent is ambiguous.")
    if band == "low":
        reasons.append(
            f"Confidence is low for this field type (score {score:.0%} vs. ~{threshold * _SOFT_FLOOR_RATIO:.0%} floor)."
        )
    elif band == "medium":
        reasons.append(
            f"Confidence is medium (score {score:.0%}; full trust requires ~{threshold:.0%} for this type)."
        )
    if critical and not auto_usable:
        if geometry_conf < threshold:
            reasons.append(
                "Heuristic geometry/text signal is below the critical-field bar — assistive reasoning cannot override this alone."
            )
        elif score < CRITICAL_AUTOMATION_SCORE:
            reasons.append(
                "Signature-related fields need strong agreement between layout and assist before automated use."
            )
        elif ambiguous_overlap:
            pass
        else:
            reasons.append("Conservative policy: confirm critical fields on the document before use.")
    if critical and not meets_placement_threshold:
        reasons.append("Below type-specific trust threshold for critical fields.")
    if not reasons:
        return [], ""
    return reasons, " ".join(reasons)


def _norm_rect(b: Dict[str, Any]) -> Optional[Tuple[float, float, float, float]]:
    try:
        x = float(b.get("x", -1))
        y = float(b.get("y", -1))
        w = float(b.get("width", -1))
        h = float(b.get("height", -1))
    except (TypeError, ValueError):
        return None
    if min(w, h) <= 0:
        return None
    return x, y, w, h


def _iou(a: Tuple[float, float, float, float], b: Tuple[float, float, float, float]) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    a_x2, a_y2 = ax + aw, ay + ah
    b_x2, b_y2 = bx + bw, by + bh
    ix0, iy0 = max(ax, bx), max(ay, by)
    ix1, iy1 = min(a_x2, b_x2), min(a_y2, b_y2)
    iw, ih = max(0.0, ix1 - ix0), max(0.0, iy1 - iy0)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    ua = aw * ah + bw * bh - inter
    return float(inter / ua) if ua > 0 else 0.0


_OVERLAP_IOU_MIN = 0.22
_OVERLAP_TYPES = frozenset(
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


def apply_overlap_ambiguity(candidates: List[Dict[str, Any]]) -> None:
    """Mark candidates whose bboxes overlap on the same page as competing intent (deterministic)."""
    by_page: Dict[int, List[Dict[str, Any]]] = {}
    for c in candidates:
        if not isinstance(c, dict):
            continue
        pn = int(c.get("page_number") or 0)
        ft = str(c.get("field_type_guess") or "")
        if ft not in _OVERLAP_TYPES:
            continue
        by_page.setdefault(pn, []).append(c)

    ambiguous_ids = set()
    for pn, rows in by_page.items():
        n = len(rows)
        for i in range(n):
            for j in range(i + 1, n):
                ra = _norm_rect(rows[i].get("bbox_normalized") or {})
                rb = _norm_rect(rows[j].get("bbox_normalized") or {})
                if not ra or not rb:
                    continue
                if _iou(ra, rb) >= _OVERLAP_IOU_MIN:
                    ambiguous_ids.add(str(rows[i].get("candidate_id") or ""))
                    ambiguous_ids.add(str(rows[j].get("candidate_id") or ""))

    for c in candidates:
        if not isinstance(c, dict):
            continue
        cid = str(c.get("candidate_id") or "")
        if cid in ambiguous_ids:
            c["ambiguous_overlap"] = True


def compute_auto_usable(
    field_type: str,
    *,
    band: ConfidenceBand,
    geometry_conf: float,
    score: float,
    threshold: float,
    ambiguous_overlap: bool,
    critical: bool,
) -> bool:
    if ambiguous_overlap:
        return False
    if band != "high":
        return False
    if geometry_conf + 1e-9 < threshold:
        return False
    if score + 1e-9 < threshold:
        return False
    if critical:
        return score >= CRITICAL_AUTOMATION_SCORE and geometry_conf >= threshold
    return True


def compute_review_required(
    *,
    critical: bool,
    band: ConfidenceBand,
    auto_usable: bool,
    ambiguous_overlap: bool,
) -> bool:
    if ambiguous_overlap:
        return True
    if band == "low":
        return True
    if critical:
        return not auto_usable
    if band == "medium":
        return True
    return False


def user_guidance_message(
    field_type: str,
    score: float,
    *,
    meets_threshold: bool,
    critical: bool,
    band: ConfidenceBand,
) -> str:
    if meets_threshold and not critical and band == "high":
        return "This suggestion meets our bar for a non-critical field. A quick visual check is still wise."
    if meets_threshold and critical and band == "high":
        return (
            "This critical field scores above our cautious automatic threshold, but you should still "
            "confirm the highlight aligns with the intended line on the original page."
        )
    if critical:
        th = placement_threshold_for_type(field_type)
        return (
            f"We are not treating this as safe to use without review "
            f"(score about {score:.0%}; critical fields target ~{th:.0%} or higher with strong agreement). "
            "Confirm on the document or adjust the box."
        )
    return (
        "This detection is uncertain for its field type. Compare the highlight to the source page before relying on it."
    )


def annotate_candidate(candidate: Dict[str, Any]) -> Dict[str, Any]:
    """Annotate a single candidate (in-place). Call ``apply_overlap_ambiguity`` on the full list after all rows."""
    ft = effective_placement_field_type(candidate)
    geom = geometry_confidence(candidate)
    score = compute_confidence_score(candidate)
    thresh = placement_threshold_for_type(ft)
    critical = is_critical_field_type(ft)
    meets = score >= thresh
    band = compute_confidence_band(score, thresh)
    ambiguous = bool(candidate.get("ambiguous_overlap"))

    auto_ok = compute_auto_usable(
        ft,
        band=band,
        geometry_conf=geom,
        score=score,
        threshold=thresh,
        ambiguous_overlap=ambiguous,
        critical=critical,
    )
    review_req = compute_review_required(
        critical=critical,
        band=band,
        auto_usable=auto_ok,
        ambiguous_overlap=ambiguous,
    )
    reasons, reason_one = build_safety_reasons(
        band=band,
        critical=critical,
        auto_usable=auto_ok,
        ambiguous_overlap=ambiguous,
        meets_placement_threshold=meets,
        geometry_conf=geom,
        threshold=thresh,
        score=score,
    )

    candidate["geometry_confidence"] = round(geom, 4)
    candidate["confidence_score"] = round(score, 4)
    candidate["effective_confidence"] = round(score, 4)
    candidate["confidence_band"] = band
    candidate["placement_field_type"] = ft
    candidate["placement_threshold"] = round(thresh, 4)
    candidate["meets_placement_threshold"] = meets
    candidate["critical_field"] = critical
    candidate["auto_usable"] = auto_ok
    candidate["review_required"] = review_req
    candidate["low_confidence"] = band == "low" or (critical and band != "high")
    candidate["safety_reasons"] = reasons
    candidate["safety_reason"] = reason_one
    candidate["ux_label"] = professional_ux_label(ft, band, critical=critical)
    candidate["confidence_user_guidance"] = user_guidance_message(
        ft, score, meets_threshold=meets, critical=critical, band=band
    )
    return candidate


def candidate_policy_snapshot(c: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure policy annotations exist (e.g. legacy rows without overlap recompute — conservative single-candidate path)."""
    if not isinstance(c, dict):
        return {}
    if c.get("confidence_band") is not None:
        return c
    cc = dict(c)
    cc.setdefault("ambiguous_overlap", False)
    annotate_candidate(cc)
    return cc


def annotate_field_candidates(candidates: List[Dict[str, Any]]) -> None:
    for c in candidates:
        if isinstance(c, dict):
            c.setdefault("ambiguous_overlap", False)
    apply_overlap_ambiguity(candidates)
    for c in candidates:
        if isinstance(c, dict):
            annotate_candidate(c)


def matches_need_localization_review(matches: List[Dict[str, Any]]) -> bool:
    if not matches:
        return True
    return any(bool(m.get("review_required")) for m in matches)


def localization_guidance_summary(matches: List[Dict[str, Any]]) -> Optional[str]:
    if not matches:
        return "No matches found — try different wording or open field review to place manually."
    risky = [m for m in matches if m.get("review_required")]
    if not risky:
        return None
    top = risky[0]
    return str(top.get("guidance_message") or "Review recommended for at least one match.")
