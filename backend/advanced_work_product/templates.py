"""Structured section templates for Advanced Work Product — not proof artifacts."""
from __future__ import annotations

from typing import Any, Dict, List, TypedDict


class OutputTemplate(TypedDict):
    id: str
    label: str
    description: str
    sections: List[Dict[str, str]]  # key, label


OUTPUT_TYPES: List[str] = [
    "feature_brief",
    "research_memo",
    "white_paper",
    "issue_analysis",
    "executive_summary",
    "argument_outline",
    "comparison_memo",
    "chronology_summary",
]

LIMITED_OUTPUT_TYPES: frozenset[str] = frozenset({"executive_summary", "issue_analysis"})

TEMPLATES: Dict[str, OutputTemplate] = {
    "feature_brief": {
        "id": "feature_brief",
        "label": "Feature brief",
        "description": "Product-facing brief: problem, approach, differentiation.",
        "sections": [
            {"key": "title", "label": "Title"},
            {"key": "executive_overview", "label": "Executive overview"},
            {"key": "core_problem", "label": "Core problem"},
            {"key": "proposed_approach", "label": "Proposed approach"},
            {"key": "key_differentiators", "label": "Key differentiators"},
            {"key": "risks_considerations", "label": "Risks / considerations"},
            {"key": "next_steps", "label": "Next steps"},
        ],
    },
    "research_memo": {
        "id": "research_memo",
        "label": "Research memo",
        "description": "Legal-adjacent research structure with sourced findings.",
        "sections": [
            {"key": "issue_presented", "label": "Issue presented"},
            {"key": "facts_materials_reviewed", "label": "Relevant facts / materials reviewed"},
            {"key": "key_findings", "label": "Key findings"},
            {"key": "unresolved_questions", "label": "Unresolved questions"},
            {"key": "supporting_source_list", "label": "Supporting source list"},
        ],
    },
    "white_paper": {
        "id": "white_paper",
        "label": "White paper",
        "description": "Long-form narrative with thesis and implications.",
        "sections": [
            {"key": "title", "label": "Title"},
            {"key": "abstract", "label": "Abstract"},
            {"key": "background", "label": "Background"},
            {"key": "framework_thesis", "label": "Framework / thesis"},
            {"key": "detailed_analysis", "label": "Detailed analysis"},
            {"key": "implications", "label": "Implications"},
            {"key": "conclusion", "label": "Conclusion"},
        ],
    },
    "issue_analysis": {
        "id": "issue_analysis",
        "label": "Issue analysis",
        "description": "Structured issue framing with tensions and open questions.",
        "sections": [
            {"key": "issue", "label": "Issue"},
            {"key": "source_backed_context", "label": "Source-backed context"},
            {"key": "competing_considerations", "label": "Competing considerations"},
            {"key": "likely_pressure_points", "label": "Likely pressure points"},
            {"key": "open_questions", "label": "Open questions"},
        ],
    },
    "executive_summary": {
        "id": "executive_summary",
        "label": "Executive summary",
        "description": "Tight readout for decision-makers.",
        "sections": [
            {"key": "what_matters", "label": "What matters"},
            {"key": "why_it_matters", "label": "Why it matters"},
            {"key": "immediate_takeaways", "label": "Immediate takeaways"},
            {"key": "recommended_review_areas", "label": "Recommended next areas to review"},
        ],
    },
    "argument_outline": {
        "id": "argument_outline",
        "label": "Argument outline",
        "description": "Thesis, supports, counters, and conclusion.",
        "sections": [
            {"key": "thesis", "label": "Thesis"},
            {"key": "supporting_points", "label": "Supporting points"},
            {"key": "source_anchors", "label": "Source anchors"},
            {"key": "counterpoints_vulnerabilities", "label": "Counterpoints / vulnerabilities"},
            {"key": "conclusion", "label": "Conclusion"},
        ],
    },
    "comparison_memo": {
        "id": "comparison_memo",
        "label": "Comparison memo",
        "description": "Side-by-side evaluation of options or positions.",
        "sections": [
            {"key": "purpose_scope", "label": "Purpose & scope"},
            {"key": "options_compared", "label": "Options compared"},
            {"key": "criteria", "label": "Evaluation criteria"},
            {"key": "analysis", "label": "Analysis"},
            {"key": "tradeoffs", "label": "Tradeoffs"},
            {"key": "recommendation", "label": "Provisional recommendation"},
        ],
    },
    "chronology_summary": {
        "id": "chronology_summary",
        "label": "Chronology summary",
        "description": "Time-ordered narrative from materials.",
        "sections": [
            {"key": "overview", "label": "Overview"},
            {"key": "timeline", "label": "Timeline (source-backed)"},
            {"key": "gaps_conflicts", "label": "Gaps & conflicting accounts"},
            {"key": "notes_on_certainty", "label": "Notes on certainty"},
        ],
    },
}


def template_for(output_type: str) -> OutputTemplate:
    key = (output_type or "").strip().lower().replace("-", "_")
    if key not in TEMPLATES:
        raise ValueError(f"unknown output_type: {output_type}")
    return TEMPLATES[key]


def empty_sections(output_type: str) -> Dict[str, str]:
    t = template_for(output_type)
    return {s["key"]: "" for s in t["sections"]}


def allowed_types_for_tier(tier: str) -> List[str]:
    t = (tier or "none").strip().lower()
    if t == "none":
        return []
    if t == "limited":
        return sorted(LIMITED_OUTPUT_TYPES & frozenset(OUTPUT_TYPES))
    return list(OUTPUT_TYPES)
