"""
Deterministic quality gates for LawDog Pro full-draft (OpenAI) outputs.
Used only as safety/rejection signals — one repair LLM pass may follow.
"""

from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

from backend.agreements.premium_simple_consulting_size_guard import (
    append_simple_consulting_repair_directives,
    evaluate_simple_consulting_document_length,
)

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


# --- Server-side "substantive full Pro corpus" floor -------------------------------------------
# A body that clears this floor is a real, signable full agreement. A body that does NOT clear it is
# a starter/degraded shell and MUST be surfaced as an explicit failure/retry — never returned as a
# `server_full_draft` or a short body mislabeled as a completed Pro draft. This floor is about the
# STRUCTURAL substance of the document (length, clause families, execution mechanism). It is separate
# from `evaluate_premium_full_draft_quality`, which also checks material-ask coverage / relevance and
# whose non-structural failures are advisory `needs_details` (a long body may still be authoritative).

PREMIUM_FULL_DRAFT_BASE_MIN_LEN = 1_600
"""Absolute minimum length for any accepted Pro corpus (mirrors the quality gate's too-short bar)."""

PREMIUM_FULL_DRAFT_COMPLEX_MIN_LEN = 6_000
"""Higher floor for complex / multi-party agreements (matches simple-consulting target-min discipline)."""

PREMIUM_FULL_DRAFT_FRONTEND_FREEZE_MIN_LEN = 10_000
"""
Frontend strong-length floor for complex / multi-party Pro corpora. Aligns with
``frontend/src/components/agreements/premiumAcceptancePolicy.ts`` ``SUBSTANTIVE_SERVER_DRAFT_MIN_LEN``.

This is NOT a universal reject floor. Simple two-party commercial services drafts are routinely
2.5k–8k chars; the frontend already freezes those via the concise / structurally-complete path.
Clamping every intake to 10k made the API return ``premium_generation_insufficient`` (empty body)
for usable Genesis Dog drafts and stranded create on Retry Pro draft.
"""

PREMIUM_FULL_DRAFT_MIN_CLAUSE_FAMILIES = 5
"""Distinct operative clause families a full Pro corpus must contain."""

_EXECUTION_MECHANISM_RE = re.compile(
    r"(?:in\s+witness\s+whereof|signature|electronic(?:ally)?\s+sign|e-?sign|counterpart|"
    r"executed\s+(?:as\s+of|by|this)|signed\s+by|\bby:\s|_{3,})",
    re.I,
)

_COMPLEX_PREMIUM_INTAKE_RE = re.compile(
    r"\b(?:three\s+parties|four\s+parties|five\s+parties|multi[-\s]?party|"
    r"joint\s+venture|merger|acquisition|reseller|white[-\s]?label|"
    r"indemnif|insurance|liability\s+cap|limitation\s+of\s+liability)\b",
    re.I,
)

_CLAUSE_FAMILY_INTAKE_RES = (
    re.compile(r"\bconfidential", re.I),
    re.compile(r"\b(?:intellectual\s+property|\bip\b|work\s+product|ownership)\b", re.I),
    re.compile(r"\b(?:liability|indemnif)\b", re.I),
    re.compile(r"\binsurance\b", re.I),
    re.compile(r"\bnotices?\b", re.I),
    re.compile(r"\b(?:governing\s+law|jurisdiction|venue)\b", re.I),
    re.compile(r"\b(?:arbitrat|mediat|dispute)\b", re.I),
    re.compile(r"\bterminat", re.I),
)


def _premium_intake_party_count(context: Optional[Dict[str, Any]]) -> int:
    parties = (context or {}).get("parties")
    if isinstance(parties, list):
        return sum(1 for p in parties if isinstance(p, dict) and str(p.get("name") or "").strip())
    return 0


def _premium_intake_clause_family_requests(intake: str) -> int:
    low = intake or ""
    return sum(1 for rx in _CLAUSE_FAMILY_INTAKE_RES if rx.search(low))


# --- Multi-party recital / signature completeness ---------------------------------------------
# When the intake declares N>=3 named parties, every declared party MUST appear both in the opening
# recital AND in the signature/execution block. This deterministically catches the TEST535-class
# defect where the model drops the Client (e.g. Redwood) from the opening party list or emits a
# signature block for only a subset of parties. A miss is surfaced as a rejection reason so the
# repair pass regenerates a complete, professional-grade multi-party corpus.

_RECITAL_BOUNDARY_RE = re.compile(
    r"(?im)^\s*(?:1\.|section\s+1\b|article\s+(?:1|i)\b|1\s+[A-Z])",
)
_EXECUTION_BOUNDARY_RE = re.compile(r"(?i)\bin\s+witness\s+whereof\b")


def _declared_intake_party_names(context: Optional[Dict[str, Any]]) -> List[str]:
    names: List[str] = []
    parties = (context or {}).get("parties")
    if isinstance(parties, list):
        for p in parties:
            if isinstance(p, dict):
                n = str(p.get("name") or "").strip()
                if len(n) >= 2 and n not in names:
                    names.append(n)
    return names


def _party_name_variants(name: str) -> List[str]:
    """Comparison variants — commas and entity-suffix punctuation are normalized away."""
    base = _norm_ws(name)
    variants = {base, base.replace(",", "")}
    # Strip a single trailing entity suffix to tolerate "Foo, Inc." vs "Foo".
    stripped = re.sub(
        r"[\s,]+(?:llc|l\.l\.c\.|inc\.?|incorporated|corp\.?|corporation|ltd\.?|limited|lp|l\.p\.|llp|pllc|co\.?|company)\.?$",
        "",
        base.replace(",", ""),
    ).strip()
    if len(stripped) >= 4:
        variants.add(stripped)
    return [v for v in variants if v]


def _doc_region_contains_party(region_norm: str, name: str) -> bool:
    return any(v in region_norm for v in _party_name_variants(name))


def premium_full_draft_multiparty_presence_reasons(
    document_text: str,
    context: Optional[Dict[str, Any]],
) -> List[str]:
    """
    Rejection reasons when a declared party (N>=3) is missing from the recital or signature block.
    Returns [] for <3 declared parties or when every party is present in both regions.
    """
    names = _declared_intake_party_names(context)
    if len(names) < 3:
        return []
    doc = (document_text or "").strip()
    if not doc:
        return []

    recital_match = _RECITAL_BOUNDARY_RE.search(doc)
    recital_region = doc[: recital_match.start()] if recital_match else doc[:2500]
    exec_match = _EXECUTION_BOUNDARY_RE.search(doc)
    signature_region = doc[exec_match.start() :] if exec_match else doc[-3500:]

    recital_norm = _norm_ws(recital_region)
    signature_norm = _norm_ws(signature_region)

    missing_recital = [n for n in names if not _doc_region_contains_party(recital_norm, n)]
    missing_signature = [n for n in names if not _doc_region_contains_party(signature_norm, n)]

    reasons: List[str] = []
    if missing_recital:
        reasons.append("missing_intake_parties_in_recital:" + "; ".join(missing_recital[:6]))
    if missing_signature:
        reasons.append("missing_intake_parties_in_signature_block:" + "; ".join(missing_signature[:6]))
    return reasons


def premium_full_draft_substance_min_len_for_context(
    intake: str,
    context: Optional[Dict[str, Any]],
) -> int:
    """
    Context-aware minimum length. Complex / multi-party intakes require a longer corpus.

    Complex / multi-party stays clamped to the frontend strong freeze floor (10k).
    Simple two-party commercial services use the base floor (1.6k) plus clause-family /
    execution checks — matching the frontend concise authoritative acceptance path.
    """
    party_count = _premium_intake_party_count(context)
    complex_signal = bool(_COMPLEX_PREMIUM_INTAKE_RE.search(intake or ""))
    family_requests = _premium_intake_clause_family_requests(intake or "")
    if party_count >= 3 or complex_signal or family_requests >= 4:
        return max(PREMIUM_FULL_DRAFT_COMPLEX_MIN_LEN, PREMIUM_FULL_DRAFT_FRONTEND_FREEZE_MIN_LEN)
    return PREMIUM_FULL_DRAFT_BASE_MIN_LEN


def premium_full_draft_body_meets_substance_floor(
    document_text: str,
    *,
    intake: str = "",
    context: Optional[Dict[str, Any]] = None,
) -> Tuple[bool, List[str]]:
    """
    (ok, reasons) for whether ``document_text`` is a substantive, signable full Pro corpus.

    Fails when the body is below the context-aware minimum length, lacks the required number of
    operative clause families, or has no execution/signature mechanism. Callers must NOT return a
    body that fails this floor as a completed Pro draft.
    """
    doc = (document_text or "").strip()
    reasons: List[str] = []
    min_len = premium_full_draft_substance_min_len_for_context(intake, context)
    if len(doc) < min_len:
        reasons.append(f"below_premium_substantive_min_len:{len(doc)}<{min_len}")
    hits = _section_signal_hits(doc)
    if hits < PREMIUM_FULL_DRAFT_MIN_CLAUSE_FAMILIES:
        reasons.append(f"insufficient_clause_families:{hits}<{PREMIUM_FULL_DRAFT_MIN_CLAUSE_FAMILIES}")
    if not _EXECUTION_MECHANISM_RE.search(doc):
        reasons.append("missing_execution_mechanism")
    return (len(reasons) == 0, reasons)


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


def _brief_has_exclusive_scope_conflict(contradiction_notes: Optional[List[str]]) -> bool:
    if not contradiction_notes:
        return False
    return any("exclusive vs non-exclusive" in (n or "").lower() for n in contradiction_notes)


def _operative_exclusive_and_nonexclusive_binding(doc_low: str) -> bool:
    """
    True when the document appears to grant both exclusive and non-exclusive rights operatively.
    Acknowledgment-only mentions of the conflict do not count.
    """
    has_non_exclusive = bool(
        re.search(
            r"\bnon[-\s]?exclusive\s+(?:license|right|grant)s?\b|"
            r"\b(?:grants?|licenses?|licensed)\b[^.\n]{0,180}\bnon[-\s]?exclusive\b",
            doc_low,
        )
    )
    has_exclusive_grant = bool(
        re.search(
            r"(?<![a-z-])\bexclusive\s+(?:license|right|grant)s?\b|"
            r"\b(?:grants?|licenses?|licensed)\b[^.\n]{0,180}(?<![a-z-])\bexclusive\b",
            doc_low,
        )
    )
    return has_non_exclusive and has_exclusive_grant


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
    contradiction_notes: Optional[List[str]] = None,
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

    exclusive_conflict_in_brief = _brief_has_exclusive_scope_conflict(contradiction_notes)
    exclusive_conflict_in_intake = bool(
        re.search(r"\bexclusive\b", intake_low) and re.search(r"\bnon-?exclusive\b", intake_low)
    )
    if (exclusive_conflict_in_brief or exclusive_conflict_in_intake) and _operative_exclusive_and_nonexclusive_binding(
        doc_low
    ):
        reasons.append("contradictory_exclusive_and_nonexclusive_operative_grants")

    _simple_ok, _simple_reasons = evaluate_simple_consulting_document_length(
        doc,
        intake=intake,
        context=context,
        scenario_category=scenario_category,
    )
    if not _simple_ok:
        reasons.extend(_simple_reasons)

    # Hard drift checks: do not let generic shells pass as "Pro" (wrong state, placeholder parties).
    if re.search(r"\boklahoma\b", intake_low) and "delaware" not in intake_low:
        if re.search(
            r"\b(laws? of the state of delaware|governed by the laws of (the state of )?delaware|"
            r"state of delaware|delaware law|delaware corporation|delaware general corporation law)\b",
            doc_low,
        ) and "oklahoma" not in doc_low:
            reasons.append("governing_law_drift:delaware_in_doc_intake_oklahoma")
    if re.search(r"\b(?:anthem|sarah|blanchard|collins)\b", intake_low) and re.search(
        r"cryptospaces|crypto\s*spaces", intake_low, re.I
    ):
        head = doc_low[:4000] if len(doc) > 4000 else doc_low
        if re.search(r"\b(service provider|the service provider|the client)\b", head) and (
            "anthem" not in doc_low and "sarah" not in doc_low
        ):
            reasons.append("placeholder_party_line_instead_of_named_intake")
    if re.search(r"cryptospaces\.?net|crypto\s*spaces", intake_low) and "cryptospaces" not in doc_low:
        reasons.append("missing_stated_brand_url")

    # Multi-party completeness: every declared party (N>=3) must appear in recital AND signatures.
    reasons.extend(premium_full_draft_multiparty_presence_reasons(doc, context))

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
        "If `generation_intelligence_brief` is present, follow its situation_line, tone_directive, and must_address; resolve "
        "contradiction_notes with one coherent path. Use specific key_terms_found labels tied to stated facts.\n"
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
        "- If intake flagged exclusive vs non-exclusive conflict: choose **one** binding grant in operative text; "
        "do not grant both exclusive and non-exclusive rights as binding law in the same document.\n"
        "- If `length_repair_directive` is present, follow it: shorten bloat while keeping required operative clauses.\n"
        "- **HOUSE STYLE — SECTION NUMBERING (document structure only):** Do not create subsection numbering unless at least "
        "two sibling subsections exist within the same section. Avoid orphan subsections. A single provision under a main heading "
        "should be body paragraph text—not a lone N.1 label. Use subsection numbering only when multiple sibling subsections exist "
        "(e.g. 7.1, 7.2). This applies to structure only; do not change substantive legal content.\n"
        "- **ALL NAMED PARTIES REQUIRED:** If the user materials declare N named parties (e.g. a Client plus multiple "
        "providers), the opening recital MUST introduce **every** named party with its exact legal name and correct role "
        "label, in the order given, and the signature/execution block MUST contain a signature slot for **every** named "
        "party. Never drop a party (especially the Client), never promote a provider to Client, and never invent a party "
        "that was not named in the user materials.\n"
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
    return append_simple_consulting_repair_directives(out, rejection_reasons)
