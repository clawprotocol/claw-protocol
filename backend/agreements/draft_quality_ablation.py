"""
Eval-only ablation switches for premium-full-draft (shadow / offline).

All flags default OFF. Do not enable in production without an explicit eval batch.
See evals/draft-quality/scripts/ablation_matrix.json.
"""

from __future__ import annotations

import os
from typing import Optional


def _flag(name: str) -> bool:
    return (os.environ.get(name) or "").strip().lower() in {"1", "true", "yes", "on"}


def skip_global_repair() -> bool:
    """H1: skip quality/substance-triggered full-document repair LLM."""
    return _flag("CLAW_DRAFT_ABLATION_SKIP_REPAIR")


def prose_only_json() -> bool:
    """Legacy H2 alias — prefer H2a/H2b split flags."""
    return _flag("CLAW_DRAFT_ABLATION_PROSE_ONLY") or h2a_no_intel_field()


def h2a_no_intel_field() -> bool:
    """H2a: omit agreement_intelligence from schema; keep drafting instructions + single draft field."""
    return _flag("CLAW_DRAFT_ABLATION_H2A_NO_INTEL_FIELD")


def h2b_post_intel() -> bool:
    """H2b: separate post-final intelligence extraction (eval path; not production-wired)."""
    return _flag("CLAW_DRAFT_ABLATION_H2B_POST_INTEL")


def short_system_prompt() -> bool:
    """H3: use shortened drafting system prompt."""
    return _flag("CLAW_DRAFT_ABLATION_SHORT_PROMPT")


def output_shape() -> str:
    """H6: dual_json | unstructured | single_field | section_ids."""
    return (os.environ.get("CLAW_DRAFT_ABLATION_OUTPUT_SHAPE") or "dual_json").strip().lower()


def ablation_max_tokens_override() -> Optional[int]:
    """H7 optional override."""
    raw = (os.environ.get("CLAW_DRAFT_ABLATION_MAX_TOKENS") or "").strip()
    if not raw:
        return None
    try:
        return max(500, int(raw))
    except ValueError:
        return None


def ablation_temperature_override() -> Optional[float]:
    raw = (os.environ.get("CLAW_DRAFT_ABLATION_TEMPERATURE") or "").strip()
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


SHORT_PROSE_SYSTEM_PROMPT = """You are a commercial contracts drafter for LawDog Pro.
Return ONE JSON object only with keys:
  title (string),
  agreement_family (string),
  authoritative_draft (string: full agreement prose),
  missing_material_info (array of strings).
Do not invent material facts. Prefer [TBD] placeholders for unknowns.
Include signature blocks matching stated party count.
"""


PROSE_ONLY_SYSTEM_PROMPT = """You are a commercial contracts drafter for LawDog Pro.
Primary duty: write excellent counterpart-ready agreement prose in authoritative_draft.
Return ONE JSON object only:
{
  "title": "...",
  "agreement_family": "...",
  "authoritative_draft": "<full agreement>",
  "key_terms_found": [],
  "missing_material_info": []
}
Do NOT include agreement_intelligence. Focus token budget on the draft body.
Do not invent parties, fees, SLAs, data scopes, or governing law.
"""

# H2a: remove intelligence field only; retain fuller drafting instruction tone vs PROSE_ONLY.
H2A_NO_INTEL_SYSTEM_PROMPT = """You are a careful agreements drafter for real people and small businesses. Draft a complete, counterpart-ready agreement.
Premium means better fit, clearer structure, and smarter protections for the stated situation — not longer generic boilerplate.
Return ONE JSON object only with keys:
  title, agreement_family, authoritative_draft, key_terms_found, missing_material_info.
Do NOT include agreement_intelligence (or any nested intelligence object).
Hard safety: do not invent material facts; use conspicuous [TBD] placeholders for unknowns;
include signature blocks for each stated party; never invent parties, fees, SLAs, PHI/PCI scope, or governing law when unset.
When payment/fees/economics are stated, give a clear numbered compensation section.
Include where fit: scope, IP/work product, confidentiality, termination, notices, e-sign/counterparts.
"""


UNSTRUCTURED_SYSTEM_PROMPT = """You are a commercial contracts drafter for LawDog Pro.
Output the full agreement as plain text only (no JSON). Do not invent material facts.
Use [TBD] for missing non-blocking details. Include signature blocks for all parties.
"""
