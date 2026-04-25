"""Structured section refinement — preset modes, conservative language, optional LLM."""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Tuple

from backend.advanced_work_product.grounding import SUPPORT_QUALITIES, default_metadata_for_section

_log = logging.getLogger(__name__)

REFINE_SYSTEM = """You revise ONE section of a professional CLAW work product draft.
Rules:
- Preserve intellectual honesty: do not state unsupported claims as settled facts.
- Prefer hedged language when evidence is thin: "Based on the selected materials...", "The available materials suggest...", "This point may require further review...", "The source set does not fully resolve...".
- Return JSON only: {"section_text": "...", "source_ids_used": [...], "support_quality": "high|medium|low|minimal", "unsupported_or_inferred": true/false, "conflict_or_gap_notes": "..." or null}"""

REFINE_MODE_INSTRUCTIONS: Dict[str, str] = {
    "more_concise": "Make the section more concise while keeping source-linked meaning. Remove redundancy; keep hedges where evidence is weak.",
    "expand_analysis": "Expand analysis with clearer structure; still ground claims in supplied excerpts only. Flag gaps explicitly.",
    "strengthen_structure": "Reorganize with clearer headings-in-prose (no markdown title): lead with takeaway, then supporting points. Stay within sources.",
    "competing_views": "Surface competing interpretations fairly; do not pick a winner without explicit source support. Name tensions.",
    "unanswered_questions": "Emphasize open questions and what would be needed to resolve them; conservative tone.",
}


def refine_section_content(
    *,
    mode: str,
    section_key: str,
    section_label: str,
    section_text: str,
    output_type: str,
    sources: List[Dict[str, Any]],
    ai_model_class: Optional[str],
) -> Tuple[str, Dict[str, Any], Optional[str], bool]:
    """Returns (new_text, metadata_fields, model, used_llm)."""
    mode_key = (mode or "").strip().lower()
    instr = REFINE_MODE_INSTRUCTIONS.get(mode_key)
    if not instr:
        return section_text, default_metadata_for_section(section_key, [], unsupported_or_inferred=True), None, False

    src_block = [json.dumps(s, ensure_ascii=False) for s in sources[:24]]
    user = "\n".join(
        [
            f"output_type={output_type}",
            f"section_key={section_key}",
            f"section_label={section_label}",
            f"refinement_mode={mode_key}",
            f"instruction={instr}",
            "CURRENT_SECTION:",
            section_text,
            "SOURCE_OBJECTS_JSON_LINES:",
            *src_block,
        ]
    )

    try:
        from backend.llm_router import call_legal_llm, resolve_llm_model_for_access_class

        model = resolve_llm_model_for_access_class(ai_model_class) or None
        raw = call_legal_llm(
            [
                {"role": "system", "content": REFINE_SYSTEM},
                {"role": "user", "content": user},
            ],
            model=model,
            max_tokens=2500,
            temperature=0.15,
            trace_context={"surface": "advanced_work_product_refine", "mode": mode_key},
        )
        text = raw.strip()
        if text.startswith("```"):
            parts = text.split("```")
            text = parts[1]
            if text.lower().startswith("json"):
                text = text[4:].lstrip()
            text = text.strip()
        data = json.loads(text)
        if not isinstance(data, dict):
            raise ValueError("not dict")
        new_body = str(data.get("section_text") or "").strip()
        if not new_body:
            raise ValueError("empty section")
        ids = data.get("source_ids_used")
        if not isinstance(ids, list):
            ids = []
        ids = [str(x) for x in ids if x][:20]
        sq = str(data.get("support_quality") or "low").lower()
        if sq not in SUPPORT_QUALITIES:
            sq = "low"
        uoi = bool(data.get("unsupported_or_inferred", True))
        gaps = data.get("conflict_or_gap_notes")
        gaps_s = str(gaps).strip() if gaps else None
        meta = {
            "source_ids_used": ids,
            "support_quality": sq,
            "unsupported_or_inferred": uoi,
            "conflict_or_gap_notes": gaps_s,
        }
        return new_body, meta, model, True
    except Exception as exc:
        _log.info("awp refine fallback: %s", exc)
    meta_fb = default_metadata_for_section(
        section_key,
        [],
        support_quality="minimal",
        unsupported_or_inferred=True,
        conflict_or_gap_notes="Refinement unavailable — edit manually or retry with model access.",
    )
    return section_text, meta_fb, None, False
