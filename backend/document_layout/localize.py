"""
Natural-language localization over precomputed candidates (deterministic geometry).
"""
from __future__ import annotations

import re
from typing import Any, Dict, List

from backend.document_layout.candidates import _RESPOND_HINT
from backend.document_layout.confidence_policy import (
    compute_auto_usable,
    compute_confidence_band,
    compute_effective_confidence,
    compute_review_required,
    effective_placement_field_type,
    geometry_confidence,
    is_critical_field_type,
    placement_threshold_for_type,
    user_guidance_message,
)


def _score_text_match(query_lower: str, c: Dict[str, Any]) -> float:
    hay = " ".join(
        [
            str(c.get("label_text") or ""),
            str(c.get("nearby_text_context") or ""),
            str(c.get("line_text_snippet") or ""),
            str(c.get("field_type_guess") or ""),
            str(c.get("field_type_assist") or ""),
        ]
    ).lower()
    score = 0.0
    for tok in re.findall(r"[a-z0-9]{3,}", query_lower):
        if tok in hay:
            score += 0.12
    if query_lower in hay:
        score += 0.4
    return min(1.0, score)


def localize_query(query: str, analysis: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Map a natural-language query to ranked candidates.
    Geometry always comes from analysis — this only filters / ranks / explains.
    """
    q = (query or "").strip().lower()
    cands: List[Dict[str, Any]] = list(analysis.get("field_candidates") or [])
    if not q:
        return []

    results: List[Dict[str, Any]] = []
    type_filters: List[str] = []
    if "signature" in q and "line" not in q:
        type_filters.append("signature_line")
    if "signature line" in q or "sign here" in q:
        type_filters.append("signature_line")
    if "date" in q:
        type_filters.append("date_line")
    if "fillable" in q or "blank" in q or "blanks" in q:
        type_filters.extend(["freeform_blank_line", "amount_blank", "printed_name_line", "date_line", "signature_line"])
    if "recipient" in q and "name" in q:
        type_filters.extend(["printed_name_line", "address_line"])
    if "name" in q and "print" in q:
        type_filters.append("printed_name_line")
    if "response" in q or "deadline" in q or "reply" in q:
        type_filters.append("response_request_region")

    filtered = cands
    if type_filters:
        tf = set(type_filters)
        filtered = [c for c in cands if c.get("field_type_guess") in tf or c.get("field_type_assist") in tf]
    if not filtered:
        filtered = cands

    # Letter / demand: scan layout text for response-deadline language (bbox from lines, not LLM)
    pages = analysis.get("pages") or []
    if "response" in q or "letter" in q or "demand" in q or "deadline" in q:
        for p in pages:
            page_no = p.get("page_number")
            for block in p.get("text_blocks") or []:
                for line in block.get("lines") or []:
                    t = str(line.get("text") or "")
                    if _RESPOND_HINT.search(t):
                        tb_conf = 0.52
                        tb_thresh = placement_threshold_for_type("response_request_region")
                        tb_meets = tb_conf >= tb_thresh
                        tb_band = compute_confidence_band(tb_conf, tb_thresh)
                        results.append(
                            {
                                "match_kind": "text_block",
                                "page_number": page_no,
                                "bbox_normalized": line.get("bbox_normalized"),
                                "nearby_text": t[:600],
                                "confidence": tb_conf,
                                "confidence_score": tb_conf,
                                "confidence_band": tb_band,
                                "effective_field_type": "response_request_region",
                                "placement_threshold": round(tb_thresh, 4),
                                "meets_placement_threshold": tb_meets,
                                "auto_usable": tb_band == "high" and tb_meets,
                                "review_required": tb_band != "high",
                                "guidance_message": user_guidance_message(
                                    "response_request_region",
                                    tb_conf,
                                    meets_threshold=tb_meets,
                                    critical=False,
                                    band=tb_band,
                                ),
                                "human_readable_explanation": "Line matches response / deadline style language from layout text.",
                            }
                        )

    for c in filtered:
        base_conf = compute_effective_confidence(c)
        ft = effective_placement_field_type(c)
        th = placement_threshold_for_type(ft)
        text_boost = _score_text_match(q, c)
        if text_boost == 0 and type_filters:
            text_boost = 0.15
        combined = base_conf * 0.65 + text_boost
        if is_critical_field_type(ft):
            combined = min(combined, base_conf * 0.88 + text_boost * 0.55)
        final = min(0.98, combined)
        geom = geometry_confidence(c)
        det_score = compute_effective_confidence(c)
        policy_score = min(final, max(det_score, geom * 0.99))
        meets = policy_score >= th
        crit = is_critical_field_type(ft)
        band = compute_confidence_band(policy_score, th)
        amb = bool(c.get("ambiguous_overlap"))
        auto_ok = compute_auto_usable(
            ft,
            band=band,
            geometry_conf=geom,
            score=policy_score,
            threshold=th,
            ambiguous_overlap=amb,
            critical=crit,
        )
        review_req = compute_review_required(
            critical=crit, band=band, auto_usable=auto_ok, ambiguous_overlap=amb
        )
        guidance = user_guidance_message(ft, policy_score, meets_threshold=meets, critical=crit, band=band)
        expl_parts = [
            f"Heuristic type {c.get('field_type_guess')}",
        ]
        if c.get("assist_explanation"):
            expl_parts.append(str(c.get("assist_explanation")))
        results.append(
            {
                "match_kind": "field_candidate",
                "candidate_id": c.get("candidate_id"),
                "page_number": c.get("page_number"),
                "bbox_normalized": c.get("bbox_normalized"),
                "bbox_pdf": c.get("bbox_pdf"),
                "nearby_text": (c.get("nearby_text_context") or c.get("line_text_snippet") or "")[:600],
                "confidence": round(final, 4),
                "confidence_score": round(policy_score, 4),
                "confidence_band": band,
                "effective_field_type": ft,
                "placement_threshold": round(th, 4),
                "meets_placement_threshold": meets,
                "auto_usable": auto_ok,
                "review_required": review_req,
                "guidance_message": guidance,
                "human_readable_explanation": "; ".join(expl_parts),
            }
        )

    results.sort(key=lambda r: float(r.get("confidence") or 0), reverse=True)
    return results[:25]
