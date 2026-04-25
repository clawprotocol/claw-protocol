"""Generation pipeline — assistive JSON sections, grounding metadata, explicit caveats."""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Tuple

from backend.advanced_work_product.grounding import (
    assess_source_material_strength,
    normalize_section_metadata,
)
from backend.advanced_work_product.templates import (
    TEMPLATES,
    empty_sections,
    template_for,
)

_log = logging.getLogger(__name__)

DISCLAIMER = (
    "Assistive work product only — not a cryptographic proof, signed record, receipt, or legal determination. "
    "Review with qualified professionals. CLAW does not treat this output as part of verifier manifests."
)

SYSTEM_PROMPT = """You are a drafting assistant inside CLAW (professional agreements workspace).
Produce structured professional writing.

Grounding and certainty:
- Ground claims ONLY in the SOURCE EXCERPTS when substantive text is present. If excerpts are thin, short, or missing, say so.
- Never present unsupported or inferred points as settled facts. When inferring, mark reasoning explicitly.
- If sources conflict, describe the tension — do not resolve it as objective truth.
- Prefer conservative phrasing such as: "Based on the selected materials...", "The available materials suggest...",
  "This point may require further review...", "The source set does not fully resolve...".

Output valid JSON only with keys:
- sections (object: section_key -> markdown-capable plain text string)
- section_grounding (object: section_key -> array of source id strings that most directly support that section)
- section_metadata (object: section_key -> object with:
    - source_ids_used: array of source id strings (subset of grounding; may match section_grounding)
    - support_quality: one of "high", "medium", "low", "minimal"
    - unsupported_or_inferred: boolean — true if the section relies on inference, thin material, or workspace context only
    - conflict_or_gap_notes: string or null — conflicts between sources, missing evidence, or limitations
  )
- caveats: string — overall limitations for the drafter (1-4 sentences).

Section keys must match EXACTLY the list provided in the user message."""


def _build_user_message(
    *,
    output_type: str,
    section_keys: List[str],
    audience: Optional[str],
    objective: Optional[str],
    user_instructions: Optional[str],
    sources: List[Dict[str, Any]],
    use_workspace_context: bool,
    material_assessment: Dict[str, Any],
) -> str:
    lines = [
        f"output_type={output_type}",
        f"sections_required={json.dumps(section_keys)}",
        f"use_workspace_context={use_workspace_context}",
        f"material_assessment={json.dumps(material_assessment)}",
    ]
    if audience:
        lines.append(f"audience={audience}")
    if objective:
        lines.append(f"objective={objective}")
    if user_instructions:
        lines.append(f"user_instructions={user_instructions}")
    lines.append("SOURCES (id, kind, label, excerpt):")
    for s in sources:
        sid = str(s.get("id") or "")
        excerpt = str(s.get("excerpt") or "").strip()
        if len(excerpt) > 12000:
            excerpt = excerpt[:12000] + "\n… [truncated]"
        lines.append(
            json.dumps(
                {
                    "id": sid,
                    "kind": s.get("kind"),
                    "label": s.get("label"),
                    "excerpt": excerpt or None,
                },
                ensure_ascii=False,
            )
        )
    if not sources:
        lines.append("(no structured sources — flag minimal support_quality and unsupported_or_inferred throughout)")
    return "\n".join(lines)


def _parse_llm_json(raw: str) -> Optional[Dict[str, Any]]:
    text = raw.strip()
    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 2:
            inner = parts[1]
            if inner.lower().startswith("json"):
                inner = inner[4:].lstrip()
            text = inner.strip()
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    return None


def _skeleton_fallback(
    *,
    output_type: str,
    sources: List[Dict[str, Any]],
    use_workspace_context: bool,
    material_tier: str,
) -> Tuple[Dict[str, str], Dict[str, List[str]], Dict[str, Dict[str, Any]], str]:
    sections = empty_sections(output_type)
    grounding: Dict[str, List[str]] = {k: [] for k in sections}
    src_ids = [str(s.get("id") or "") for s in sources if s.get("id")]
    caveats: List[str] = [
        "Draft scaffold only — run **Generate** with substantive source excerpts and API model access for filled prose.",
        DISCLAIMER,
    ]
    if not sources and not use_workspace_context:
        caveats.append("No sources attached; add agreements, uploads, or excerpts before relying on this draft.")
    elif not sources and use_workspace_context:
        caveats.append("Workspace context was requested but no structured excerpts were supplied—content is intentionally thin.")

    meta = normalize_section_metadata(
        None,
        list(sections.keys()),
        {k: list({x for x in src_ids if x})[:5] for k in sections},
        material_tier=material_tier,
    )

    for k in sections:
        if k == "title":
            sections[k] = TEMPLATES[output_type]["label"]
        else:
            sections[k] = (
                f"_{TEMPLATES[output_type]['label']} · section “{k}” — "
                "add source excerpts and generate, or draft manually._"
            )
        grounding[k] = list({x for x in src_ids if x})[:5]
    return sections, grounding, meta, " ".join(caveats)


def generate_document_body(
    *,
    output_type: str,
    audience: Optional[str],
    objective: Optional[str],
    user_instructions: Optional[str],
    sources: List[Dict[str, Any]],
    use_workspace_context: bool,
    ai_model_class: Optional[str],
) -> Tuple[Dict[str, str], Dict[str, List[str]], Dict[str, Dict[str, Any]], str, Optional[str], bool]:
    """
    Returns (sections, section_grounding, section_metadata, caveats, model_used, used_llm).
    """
    tmpl = template_for(output_type)
    section_keys = [s["key"] for s in tmpl["sections"]]
    used_llm = False
    model_used: Optional[str] = None

    strength = assess_source_material_strength(sources, use_workspace_context=use_workspace_context)
    material_tier = str(strength.get("tier") or "moderate")

    try:
        from backend.llm_router import call_legal_llm, resolve_llm_model_for_access_class

        user_msg = _build_user_message(
            output_type=output_type,
            section_keys=section_keys,
            audience=audience,
            objective=objective,
            user_instructions=user_instructions,
            sources=sources,
            use_workspace_context=use_workspace_context,
            material_assessment=strength,
        )
        model = resolve_llm_model_for_access_class(ai_model_class) or None
        raw = call_legal_llm(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            model=model,
            max_tokens=4096,
            temperature=0.2,
            trace_context={"surface": "advanced_work_product", "output_type": output_type},
        )
        model_used = model
        used_llm = True
        parsed = _parse_llm_json(raw)
        if parsed:
            sec = parsed.get("sections")
            gro = parsed.get("section_grounding")
            smeta = parsed.get("section_metadata")
            cav = parsed.get("caveats")
            if isinstance(sec, dict):
                sections_out: Dict[str, str] = {}
                for sk in section_keys:
                    val = sec.get(sk)
                    sections_out[sk] = str(val).strip() if val is not None else ""
                grounding_out: Dict[str, List[str]] = {}
                if isinstance(gro, dict):
                    for sk in section_keys:
                        g = gro.get(sk)
                        if isinstance(g, list):
                            grounding_out[sk] = [str(x) for x in g if x]
                        else:
                            grounding_out[sk] = []
                else:
                    grounding_out = {k: [] for k in section_keys}

                meta_out = normalize_section_metadata(
                    smeta, section_keys, grounding_out, material_tier=material_tier
                )

                caveats = str(cav).strip() if cav else ""
                tier_note = ""
                if material_tier in ("sparse", "thin"):
                    tier_note = (
                        f" Source material strength: **{material_tier}** — treat output as incomplete until you attach richer excerpts."
                    )
                merged_caveats = f"{caveats}{tier_note} — {DISCLAIMER}" if caveats else f"{tier_note.strip()} {DISCLAIMER}".strip()
                return sections_out, grounding_out, meta_out, merged_caveats, model_used, used_llm
    except Exception as exc:
        _log.info("awp llm fallback: %s", exc)

    sec2, gro2, meta2, cav2 = _skeleton_fallback(
        output_type=output_type,
        sources=sources,
        use_workspace_context=use_workspace_context,
        material_tier=material_tier,
    )
    return sec2, gro2, meta2, cav2, model_used, used_llm
