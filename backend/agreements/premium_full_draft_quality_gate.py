"""
Deterministic quality gates for LawDog Pro full-draft (OpenAI) outputs.
Used only as safety/rejection signals — one repair LLM pass may follow.
"""

from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

# Mirrors frontend premiumFullDraftQuality.ts — operative depth signals.
_SECTION_RES = [
    re.compile(r"\bterminat", re.I),
    re.compile(r"\bconfident", re.I),
    re.compile(r"\bindemn", re.I),
    re.compile(r"\b(?:governing|choice\s+of)\s+law|law\s+of\s+the", re.I),
    re.compile(r"\b(?:fees?|compensation|payment|invoic)", re.I),
    re.compile(r"\b(?:scope|deliverable|services)\b", re.I),
    re.compile(r"\b(?:dispute|arbitrat|mediat|jurisdiction|venue)\b", re.I),
    re.compile(r"\b(?:entire\s+agreement|counterpart|electronic\s+sign)", re.I),
    re.compile(r"\b(?:liabilit|limitation)\b", re.I),
    re.compile(r"\b(?:notices?|notice\s+address)\b", re.I),
]

_INTERNAL_NOTE_MARKERS = (
    "sparse-prompt premium expansion",
    "[claw_full_draft_expansion_v1]",
    "internal generation",
    "drafting notes:",
    "do not include this",
    "[internal",
    "qa trace",
    "gap-trace",
)

_GENERIC_TITLE_TOKENS = frozenset(
    {
        "agreement",
        "master agreement",
        "services agreement",
        "service agreement",
        "general agreement",
        "written agreement",
    }
)


def _norm_ws(s: str) -> str:
    t = unicodedata.normalize("NFKC", s or "")
    t = re.sub(r"\s+", " ", t).strip().lower()
    return t


def build_free_reference_blob(intake: str, context: Optional[Dict[str, Any]]) -> str:
    """Approximate free-path / starter text from intake + structured context (not a template)."""
    parts: List[str] = [(intake or "").strip()]
    if not context:
        return "\n\n".join(parts)
    for key in (
        "title",
        "purpose",
        "payment_terms",
        "termination_summary",
        "additional_terms",
        "jurisdiction",
        "agreement_family",
    ):
        v = context.get(key)
        if isinstance(v, str) and v.strip():
            parts.append(v.strip())
    parties = context.get("parties")
    if isinstance(parties, list):
        for p in parties[:6]:
            if isinstance(p, dict):
                n = str(p.get("name") or "").strip()
                r = str(p.get("role") or "").strip()
                if n:
                    parts.append(f"{n} ({r})".strip() if r else n)
    asks = context.get("material_asks")
    if isinstance(asks, list):
        for a in asks[:24]:
            if isinstance(a, str) and a.strip():
                parts.append(a.strip())
    return "\n\n".join(parts)


def _section_signal_hits(doc: str) -> int:
    hits = 0
    for rx in _SECTION_RES:
        if rx.search(doc):
            hits += 1
    return hits


def _similarity_ratio(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def _intake_echo_ratio(intake_norm: str, pro_norm: str) -> float:
    if len(intake_norm) < 80:
        return 0.0
    window = min(len(pro_norm), max(len(intake_norm) * 4, 4000))
    return _similarity_ratio(intake_norm[:3000], pro_norm[:window])


def _free_echo_ratio(free_norm: str, pro_norm: str) -> float:
    if len(free_norm) < 120:
        return 0.0
    window = min(len(pro_norm), max(len(free_norm) * 6, 8000))
    return _similarity_ratio(free_norm[:4000], pro_norm[:window])


def _false_schedule_a_placeholder(doc: str) -> bool:
    low = doc.lower()
    if "schedule a" not in low and "exhibit a" not in low:
        return False
    if re.search(r"(?is)schedule\s+a[\s:.\n]+.{80,}", doc):
        return False
    if re.search(
        r"as\s+(?:set\s+forth|specified|described)\s+in\s+schedule\s+a(?!\s+is\s+attached)",
        low,
    ):
        return True
    if re.search(r"schedule\s+a\s+(?:shall|will|is)\s+(?:be\s+)?(?:tbd|to\s+be\s+agreed|attached\s+later)\b", low):
        return True
    return False


def _contains_internal_notes(doc: str) -> bool:
    low = doc.lower()
    return any(m in low for m in _INTERNAL_NOTE_MARKERS)


def _generic_title(title: str, intake_norm: str) -> bool:
    t = (title or "").strip()
    if not t:
        return True
    tl = t.lower().strip(" .,:;\"'")
    if tl in _GENERIC_TITLE_TOKENS or (len(tl) <= 14 and tl == "agreement"):
        # Specific scenario cues in intake but not reflected in title
        cues = (
            "logo",
            "vesting",
            "founder",
            "estate",
            "sibling",
            "probate",
            "revision",
            "trademark",
            "design",
        )
        if any(c in intake_norm for c in cues):
            return True
    return False


def _irrelevant_non_solicit(doc_low: str, intake_low: str) -> bool:
    if re.search(r"\bnon[-\s]?solicit", doc_low) and not re.search(
        r"\b(?:non[-\s]?solicit|no[-\s]?hire|solicitation\s+of\s+(?:staff|employees?))\b",
        intake_low,
    ):
        return True
    return False


def _irrelevant_reverse_engineer(doc_low: str, intake_low: str) -> bool:
    if re.search(r"\breverse[-\s]?engineer", doc_low) and "reverse" not in intake_low and "decompil" not in intake_low:
        return True
    return False


def _reverse_engineering_relevant_for_intent(
    *,
    intake_low: str,
    scenario_category: str,
    context: Optional[Dict[str, Any]],
) -> bool:
    """Allow reverse-engineering style clauses for NDA + clearly technical prompts/contexts."""
    if re.search(r"\b(nda|non[-\s]?disclosure|confidentiality)\b", intake_low):
        return True
    if re.search(
        r"\b(software|saas|api|source code|codebase|decompile|reverse engineer|technical materials?|pitch deck with product architecture)\b",
        intake_low,
    ):
        return True
    if scenario_category in ("employment", "freelancer_service"):
        if re.search(r"\b(software|developer|engineering|technical|platform|app|web(?:site| app)?)\b", intake_low):
            return True
    ctx = context or {}
    fam = str(ctx.get("agreement_family") or "").lower()
    if re.search(r"\b(nda|non[-\s]?disclosure|software|saas|web|dev|technology|license)\b", fam):
        return True
    ic = ctx.get("intent_contract")
    if isinstance(ic, dict):
        ic_id = str(ic.get("intent_id") or "").lower()
        if ic_id in {"nda_confidentiality", "software_web_dev"}:
            return True
    return False


def _missing_material_asks(doc_low: str, asks: List[str]) -> List[str]:
    missing: List[str] = []
    for raw in asks:
        a = (raw or "").strip()
        if len(a) < 3:
            continue
        al = a.lower()
        if re.search(r"\d\s*/\s*\d", al):
            compact_ratio = re.sub(r"\s+", "", re.sub(r"[^\d/]", "", al))
            if compact_ratio and compact_ratio not in doc_low.replace(" ", ""):
                missing.append(a)
                continue
        # Numeric / ratio asks: require digits present when ask has digits
        if re.search(r"\d", al):
            nums = re.findall(r"\d[\d,./]*", al)
            if nums and not any(n.replace(",", "").replace(".", "") in doc_low.replace(",", "") for n in nums[:6] if len(n) <= 14):
                missing.append(a)
                continue
        # Phrase / keyword coverage (revision ↔ revisions)
        compact = re.sub(r"\s+", " ", al)
        if len(compact) <= 48 and compact in doc_low:
            continue
        roots = ("revision", "vesting", "logo", "estate", "probate", "sibling", "deliverable")
        if any(r in al and r not in doc_low for r in roots):
            missing.append(a)
            continue
        tokens = [w for w in re.split(r"\W+", al) if len(w) >= 4][:8]
        if not tokens:
            continue
        hit = sum(1 for w in tokens if w in doc_low)
        if hit < max(1, (len(tokens) + 1) // 3):
            missing.append(a)
    return missing[:16]


def evaluate_premium_full_draft_quality(
    *,
    intake: str,
    context: Optional[Dict[str, Any]],
    draft_title: str,
    draft_family: str,
    draft_document_text: str,
    scenario_category: str,
) -> Tuple[bool, List[str]]:
    """
    Returns (ok, rejection_reasons). Empty reasons => ok.
    """
    reasons: List[str] = []
    doc = (draft_document_text or "").strip()
    doc_low = doc.lower()
    intake_norm = _norm_ws(intake)
    free_blob = build_free_reference_blob(intake, context)
    free_norm = _norm_ws(free_blob)
    pro_norm = _norm_ws(doc)
    intake_low = intake.lower()

    if len(doc) < 1600:
        reasons.append("too_short_for_paid_agreement")

    hits = _section_signal_hits(doc)
    if hits < 5:
        reasons.append("starter_shell_or_insufficient_sections")

    if not re.search(r"\b(?:whereas|recital|1\.|article\s+1|section\s+1)\b", doc, re.I) and len(doc.split("\n\n")) < 6:
        if len(doc) < 5000:
            reasons.append("outline_like_structure")

    if _contains_internal_notes(doc):
        reasons.append("internal_generation_notes")

    if _false_schedule_a_placeholder(doc):
        reasons.append("false_schedule_a_placeholder")

    if _generic_title(draft_title, intake_norm):
        reasons.append("generic_title_for_clear_scenario")

    if len(free_norm) >= 120:
        fe = _free_echo_ratio(free_norm, pro_norm)
        if fe >= 0.84:
            reasons.append("substantially_similar_to_free_reference")

    ie = _intake_echo_ratio(intake_norm, pro_norm)
    if len(intake_norm) >= 120 and ie >= 0.9 and len(doc) < len(intake) * 1.5:
        reasons.append("mostly_intake_echo")

    if _irrelevant_non_solicit(doc_low, intake_low):
        reasons.append("irrelevant_non_solicit_boilerplate")

    if _irrelevant_reverse_engineer(doc_low, intake_low) and not _reverse_engineering_relevant_for_intent(
        intake_low=intake_low,
        scenario_category=scenario_category,
        context=context,
    ):
        reasons.append("irrelevant_reverse_engineering_boilerplate")

    asks: List[str] = []
    if context and isinstance(context.get("material_asks"), list):
        asks = [str(x).strip() for x in context["material_asks"] if str(x).strip()]
    miss_asks = _missing_material_asks(doc_low, asks)
    if asks and miss_asks:
        reasons.append("material_asks_not_addressed:" + "; ".join(miss_asks[:6]))

    if scenario_category in ("business_commercial", "freelancer_service", "custom_mixed"):
        if re.search(r"\b(?:soc\s*2|iso\s*27001|enterprise\s+vendor\s+boilerplate)\b", doc_low) and not re.search(
            r"\b(?:soc\s*2|iso\s*27001)\b",
            intake_low,
        ):
            reasons.append("irrelevant_enterprise_boilerplate")

    # Dedupe while preserving order
    seen = set()
    uniq: List[str] = []
    for r in reasons:
        if r not in seen:
            seen.add(r)
            uniq.append(r)
    return (len(uniq) == 0, uniq)


def premium_full_draft_repair_system_prompt() -> str:
    return (
        "You are LawDog Pro’s rewrite engine. The prior JSON full draft was rejected by automated quality checks "
        "or **category-intent schema checks** (wrong deal type / missing required pillars for this agreement class) "
        "as too generic, incomplete, or unsafe for a paid agreement.\n"
        "The prior draft was rejected because it was too generic or incomplete, or misrouted to the wrong agreement type. "
        "If the user JSON includes `deterministic_premium_intent_skeleton` or `premium_intent_key`, follow that spine **exactly** "
        "(logo/design vs founder equity vs loan) and do not substitute a generic commercial services or ‘review’ shell. "
        "Rewrite as a complete, tailored agreement for the user’s actual scenario. Do not use a fixed template. "
        "Do not include internal notes. Do not include irrelevant boilerplate. Address all material user asks in operative language.\n"
        "Output ONLY a single JSON object (no markdown, no code fences) with EXACT keys:\n"
        '{ "title": string, "agreement_family": string, "document_text": string, '
        '"key_terms_found": string array, "missing_material_info": string array }\n'
        "Rules:\n"
        "- `document_text` must be the full agreement body only: complete sentences, operative clauses, and "
        "signature blocks as appropriate. No meta-commentary, no QA labels, no 'Schedule A' stubs unless you "
        "actually include Schedule A content in the same document.\n"
        "- `title` must be specific to the deal (not merely 'Agreement').\n"
        "- `key_terms_found`: 6–18 short labels for what you actually included.\n"
        "- `missing_material_info`: only true material unknowns after your rewrite, else [].\n"
        "- Preserve facts from the user materials; do not invent party names, amounts, or dates not supplied.\n"
    )


def build_premium_full_draft_repair_user_payload(
    *,
    intake: str,
    free_reference_blob: str,
    rejected: Dict[str, Any],
    rejection_reasons: List[str],
    scenario_category: str,
    scenario_signals: List[str],
    context: Optional[Dict[str, Any]],
    deterministic_premium_intent_skeleton: Optional[Dict[str, Any]] = None,
    premium_intent_key: Optional[str] = None,
) -> Dict[str, Any]:
    asks: List[str] = []
    if context and isinstance(context.get("material_asks"), list):
        asks = [str(x).strip() for x in context["material_asks"] if str(x).strip()]
    doc_low = str(rejected.get("document_text") or "").lower()
    missing_asks = _missing_material_asks(doc_low, asks)
    out: Dict[str, Any] = {
        "repair_task": "full_draft_rewrite_after_rejection",
        "original_user_prompt": intake,
        "free_draft_reference_text": free_reference_blob[:24_000],
        "rejected_pro_draft": {
            "title": rejected.get("title"),
            "agreement_family": rejected.get("agreement_family"),
            "document_text": str(rejected.get("document_text") or "")[:120_000],
            "key_terms_found": rejected.get("key_terms_found"),
            "missing_material_info": rejected.get("missing_material_info"),
        },
        "rejection_reasons": rejection_reasons,
        "scenario_category": scenario_category,
        "scenario_category_signals": scenario_signals[:12],
        "missing_material_asks": missing_asks,
    }
    if premium_intent_key:
        out["premium_intent_key"] = premium_intent_key
    if deterministic_premium_intent_skeleton:
        out["deterministic_premium_intent_skeleton"] = deterministic_premium_intent_skeleton
    return out
