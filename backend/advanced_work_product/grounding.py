"""Source material assessment and normalization of per-section grounding metadata."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

SUPPORT_QUALITIES = ("high", "medium", "low", "minimal")


def substantive_excerpt_chars(sources: List[Dict[str, Any]]) -> int:
    n = 0
    for s in sources:
        ex = str(s.get("excerpt") or "").strip()
        if not ex:
            continue
        # Workspace stub lines are weak signal
        if ex.lower().startswith("workspace agreement:") and len(ex) < 120:
            n += max(0, len(ex) // 4)
        else:
            n += len(ex)
    return n


def count_agreement_sources(sources: List[Dict[str, Any]]) -> int:
    return sum(1 for s in sources if str(s.get("kind") or "") == "agreement")


def assess_source_material_strength(sources: List[Dict[str, Any]], *, use_workspace_context: bool) -> Dict[str, Any]:
    """
    Heuristic for UX / caveats — not a legal assessment.
    Returns tier: strong | moderate | thin | sparse
    """
    n_agreement = count_agreement_sources(sources)
    chars = substantive_excerpt_chars(sources)
    has_ctx_only = bool(use_workspace_context) and n_agreement == 0 and len(sources) <= 1

    if n_agreement == 0 and chars < 80 and not use_workspace_context:
        tier = "sparse"
    elif n_agreement == 0 and chars < 200:
        tier = "thin"
    elif chars < 400 or (n_agreement <= 1 and chars < 800):
        tier = "moderate"
    else:
        tier = "strong"

    if has_ctx_only:
        tier = "thin" if tier == "strong" else tier

    return {
        "tier": tier,
        "agreement_source_count": n_agreement,
        "substantive_excerpt_chars": chars,
        "recommendation":
            "Add agreements or longer excerpts for tighter grounding."
            if tier in ("sparse", "thin")
            else None,
    }


def default_metadata_for_section(
    section_key: str,
    source_ids: List[str],
    *,
    support_quality: str = "minimal",
    unsupported_or_inferred: bool = True,
    conflict_or_gap_notes: Optional[str] = None,
) -> Dict[str, Any]:
    sq = support_quality if support_quality in SUPPORT_QUALITIES else "minimal"
    return {
        "source_ids_used": list(dict.fromkeys(source_ids))[:20],
        "support_quality": sq,
        "unsupported_or_inferred": bool(unsupported_or_inferred),
        "conflict_or_gap_notes": conflict_or_gap_notes,
    }


def normalize_section_metadata(
    raw: Any,
    section_keys: List[str],
    section_grounding: Dict[str, List[str]],
    *,
    material_tier: str,
) -> Dict[str, Dict[str, Any]]:
    """Merge LLM output with sane defaults; never trust missing keys."""
    out: Dict[str, Dict[str, Any]] = {}
    if material_tier in ("sparse", "thin"):
        default_sq = "minimal"
    elif material_tier == "moderate":
        default_sq = "low"
    else:
        default_sq = "medium"

    raw_dict = raw if isinstance(raw, dict) else {}

    for sk in section_keys:
        ids = list(section_grounding.get(sk) or [])
        entry = raw_dict.get(sk)
        if not isinstance(entry, dict):
            entry = {}

        merged_ids = entry.get("source_ids_used")
        if not isinstance(merged_ids, list):
            merged_ids = ids
        merged_ids = [str(x) for x in merged_ids if x][:20]

        sq = str(entry.get("support_quality") or "").lower()
        if sq not in SUPPORT_QUALITIES:
            inferred_sq = default_sq
            if sk == "title":
                inferred_sq = "high" if merged_ids else "medium"
            sq = inferred_sq

        uoi = entry.get("unsupported_or_inferred")
        if uoi is None:
            uoi = True if material_tier in ("sparse", "thin") or not merged_ids else False
        uoi = bool(uoi)

        gaps = entry.get("conflict_or_gap_notes")
        if gaps is not None:
            gaps = str(gaps).strip() or None
        if material_tier in ("sparse", "thin") and not gaps:
            gaps = "Source set is limited; treat narrative as provisional."

        out[sk] = {
            "source_ids_used": merged_ids,
            "support_quality": sq,
            "unsupported_or_inferred": uoi,
            "conflict_or_gap_notes": gaps,
        }
    return out


def merge_metadata_patch(
    existing: Dict[str, Dict[str, Any]], patch: Dict[str, Dict[str, Any]]
) -> Dict[str, Dict[str, Any]]:
    merged = {k: dict(v) for k, v in existing.items()}
    for k, v in patch.items():
        if isinstance(v, dict):
            cur = dict(merged.get(k) or {})
            cur.update({kk: vv for kk, vv in v.items() if vv is not None})
            merged[k] = cur
    return merged
