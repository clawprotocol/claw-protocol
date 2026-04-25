"""
Assistive LLM: re-label and rank existing candidates only. Never invent geometry.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

from backend.security.safe_logging import exception_summary

_log = logging.getLogger(__name__)

_ALLOWED_TYPES = frozenset(
    {
        "signature_line",
        "date_line",
        "printed_name_line",
        "initials_line",
        "address_line",
        "amount_blank",
        "freeform_blank_line",
        "checkbox_like",
        "body_text",
        "boilerplate",
        "unknown_line",
        "response_request_region",
    }
)


def _extract_json_array(text: str) -> Optional[list]:
    text = text.strip()
    m = re.search(r"\[[\s\S]*\]", text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def assist_classify_candidates(
    candidates: List[Dict[str, Any]],
    *,
    max_items: int = 48,
) -> List[Dict[str, Any]]:
    """
    Returns the same candidate dicts with optional llm_assist overlay:
    field_type_assist, assist_confidence, assist_explanation
    """
    try:
        from backend.llm_router import OPENAI_API_KEY, call_legal_llm
    except ImportError:
        return candidates

    if not OPENAI_API_KEY or os.getenv("CLAW_LAYOUT_LLM_ASSIST", "1").strip() in ("0", "false", "no"):
        return candidates
    if not candidates:
        return candidates

    subset = candidates[:max_items]
    brief = [
        {
            "candidate_id": c["candidate_id"],
            "page_number": c["page_number"],
            "heuristic_type": c.get("field_type_guess"),
            "label_text": (c.get("label_text") or "")[:200],
            "line_text_snippet": (c.get("line_text_snippet") or "")[:280],
            "nearby_text_context": (c.get("nearby_text_context") or "")[:320],
        }
        for c in subset
    ]
    system = (
        "You classify document layout LINE candidates. You MUST only output a JSON array. "
        "Each element: {\"candidate_id\": string, \"field_type\": string, \"confidence\": number 0-1, "
        "\"explanation\": string}. "
        "field_type must be one of: signature_line, date_line, printed_name_line, initials_line, address_line, "
        "amount_blank, freeform_blank_line, checkbox_like, body_text, boilerplate, unknown_line, "
        "response_request_region. "
        "Do NOT include coordinates, pages, or new ids. Never invent candidate_ids — only use those given."
    )
    user = json.dumps({"candidates": brief}, ensure_ascii=False)
    try:
        raw = call_legal_llm(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=2500,
            temperature=0,
            trace_context={"task": "document_layout_assist"},
        )
    except Exception as exc:
        _log.warning("layout LLM assist skipped exc_type=%s", exception_summary(exc))
        return candidates

    rows = _extract_json_array(raw)
    if not isinstance(rows, list):
        _log.warning("layout LLM assist: unparseable response")
        return candidates

    by_id = {c["candidate_id"]: c for c in candidates}
    for row in rows:
        if not isinstance(row, dict):
            continue
        cid = str(row.get("candidate_id") or "")
        if cid not in by_id:
            continue
        ft = str(row.get("field_type") or "").strip()
        if ft not in _ALLOWED_TYPES:
            ft = "unknown_line"
        try:
            cf = float(row.get("confidence"))
        except (TypeError, ValueError):
            cf = 0.5
        cf = max(0.0, min(1.0, cf))
        expl = str(row.get("explanation") or "")[:500]
        base = by_id[cid]
        base["field_type_assist"] = ft
        base["assist_confidence"] = round(cf, 4)
        base["assist_explanation"] = expl
        base["source_method"] = "assisted_reasoning"
        # Prefer assist type only when model is reasonably confident
        if cf >= 0.55:
            base["field_type_guess"] = ft

    return candidates
