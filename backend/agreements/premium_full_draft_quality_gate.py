"""
Deterministic quality gates for LawDog Pro full-draft (OpenAI) outputs.
Used only as safety/rejection signals — one repair LLM pass may follow.
"""

from __future__ import annotations

import json
import re
import unicodedata
from difflib import SequenceMatcher
from dataclasses import dataclass
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

This is the generation *target*, not a universal reject floor. Simple two-party commercial
services drafts are routinely 2.5k–8k chars; the frontend already freezes those via the concise
/ structurally-complete path. Clamping every intake to 10k made the API return
``premium_generation_insufficient`` (empty body) for usable Genesis Dog drafts and stranded
create on Retry Pro draft.
"""

PREMIUM_FULL_DRAFT_MULTIPARTY_NEAR_COMPLETE_MIN_LEN = 8_500
"""
BE accept floor for structurally complete N≥3 / complex drafts.

Staging rejected a 9119-char four-party corpus as ``premium_generation_insufficient`` solely
because it sat ~9% under the 10k frontend freeze target. A near-complete multiparty draft
that already has clause families + an execution mechanism must not be emptied. Hollow / junk
still fail via those structural checks and this floor (well above the ~6–8k thin-shell band).
"""

PREMIUM_FULL_DRAFT_DEFAULT_MAX_TOKENS = 8_000
"""Default ``max_tokens`` for simple two-party premium-full-draft (env may raise)."""

PREMIUM_FULL_DRAFT_MULTIPARTY_MAX_TOKENS = 14_000
"""
N≥3 / complex stop budget. Staging 3-party Create hit ``finish_reason=length`` at exactly
8000 completion tokens and the route emptied the body (``output_truncated``, document_text_len=0).
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


_OCCUPATIONAL_OR_JOB_TITLE_PARTY_RE = re.compile(
    r"^(?:(?:a|an|the)\s+)?(?:freelance|independent)?\s*"
    r"(?:product\s+|ui\s+|ux\s+|graphic\s+|web\s+|software\s+|mobile\s+)?"
    r"(?:designer|developer|engineer|consultant|contractor|freelancer|"
    r"attorney|lawyer|accountant|ceo|cto|cfo|coo|founder|president|"
    r"manager|director|officer|analyst|specialist|architect)$",
    re.I,
)
_METADATA_LABEL_PARTY_RE = re.compile(
    r"^(?:role|attn|attention|email|by|name|title|address|contact)$",
    re.I,
)
_ENTITY_SUFFIX_PARTY_RE = re.compile(
    r"\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.)\b",
    re.I,
)


_PRONOUN_OR_PLACEHOLDER_PARTY_RE = re.compile(
    r"^(?:me|i|you|we|they|party\s*[a-z0-9]+)$",
    re.I,
)
_GENERIC_STARTUP_PHRASE_PARTY_RE = re.compile(
    r"^(?:an?\s+)?(?:small\s+)?(?:startup|company|business|firm)$",
    re.I,
)
_NON_PARTY_PROSE_FRAGMENT_RE = re.compile(
    r"^(?:mobile\s+app|final\s+designs?|new\s+mobile\s+app(?:\s+ui)?)$",
    re.I,
)


def _is_non_commercial_party_name(name: str) -> bool:
    t = " ".join(str(name or "").split()).strip()
    if not t:
        return True
    if _METADATA_LABEL_PARTY_RE.match(t):
        return True
    if _PRONOUN_OR_PLACEHOLDER_PARTY_RE.match(t):
        return True
    if _GENERIC_STARTUP_PHRASE_PARTY_RE.match(t):
        return True
    if _NON_PARTY_PROSE_FRAGMENT_RE.match(t):
        return True
    if _ENTITY_SUFFIX_PARTY_RE.search(t):
        return False
    if _OCCUPATIONAL_OR_JOB_TITLE_PARTY_RE.match(t):
        return True
    words = t.split()
    if len(words) >= 2 and _METADATA_LABEL_PARTY_RE.match(words[-1] or ""):
        return True
    return False


def _premium_intake_party_count(context: Optional[Dict[str, Any]]) -> int:
    parties = (context or {}).get("parties")
    if isinstance(parties, list):
        return sum(
            1
            for p in parties
            if isinstance(p, dict)
            and str(p.get("name") or "").strip()
            and not _is_non_commercial_party_name(str(p.get("name") or ""))
        )
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


def premium_full_draft_is_complex_or_multiparty(
    intake: str,
    context: Optional[Dict[str, Any]],
) -> bool:
    """True when the intake is N≥3, explicitly multi-party/complex, or requests 4+ clause families."""
    party_count = _premium_intake_party_count(context)
    complex_signal = bool(_COMPLEX_PREMIUM_INTAKE_RE.search(intake or ""))
    family_requests = _premium_intake_clause_family_requests(intake or "")
    return party_count >= 3 or complex_signal or family_requests >= 4


def premium_full_draft_max_tokens_for_context(
    intake: str,
    context: Optional[Dict[str, Any]],
    *,
    env_max: int,
) -> int:
    """
    Generation stop budget. Simple two-party keeps the env/default 8k cap.
    N≥3 / complex is raised so a full commercial corpus is not cut off at 8000 tokens.
    """
    base = max(2_000, int(env_max))
    if premium_full_draft_is_complex_or_multiparty(intake, context):
        return max(base, PREMIUM_FULL_DRAFT_MULTIPARTY_MAX_TOKENS)
    return base


def premium_full_draft_substance_min_len_for_context(
    intake: str,
    context: Optional[Dict[str, Any]],
) -> int:
    """
    Context-aware minimum length. Complex / multi-party intakes require a longer corpus.

    Complex / multi-party uses the near-complete floor (8.5k), not a hard 10k reject.
    Simple two-party commercial services use the base floor (1.6k) plus clause-family /
    execution checks — matching the frontend concise authoritative acceptance path.
    """
    if premium_full_draft_is_complex_or_multiparty(intake, context):
        return max(
            PREMIUM_FULL_DRAFT_COMPLEX_MIN_LEN,
            PREMIUM_FULL_DRAFT_MULTIPARTY_NEAR_COMPLETE_MIN_LEN,
        )
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


_JSON_DRAFT_KEY_RE = re.compile(
    r'"(?:authoritative_draft|document_text)"\s*:\s*"',
    re.I,
)
_JSON_STRING_ESCAPES = {
    "n": "\n",
    "r": "\r",
    "t": "\t",
    '"': '"',
    "\\": "\\",
    "/": "/",
}


def _strip_optional_json_fences(raw: str) -> str:
    text = (raw or "").strip()
    if not text.startswith("```"):
        return text
    lines = text.splitlines()
    if lines:
        lines = lines[1:]
    if lines and lines[-1].strip().startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _unescape_truncated_json_string(chunk: str) -> str:
    """Decode a JSON string body that may be missing its closing quote."""
    out: List[str] = []
    i = 0
    n = len(chunk)
    while i < n:
        ch = chunk[i]
        if ch == "\\" and i + 1 < n:
            nxt = chunk[i + 1]
            if nxt in _JSON_STRING_ESCAPES:
                out.append(_JSON_STRING_ESCAPES[nxt])
                i += 2
                continue
            if nxt == "u" and i + 5 < n:
                try:
                    out.append(chr(int(chunk[i + 2 : i + 6], 16)))
                    i += 6
                    continue
                except ValueError:
                    pass
            out.append(nxt)
            i += 2
            continue
        if ch == '"':
            break
        out.append(ch)
        i += 1
    return "".join(out).strip()


def salvage_premium_full_draft_document_text(raw: str) -> str:
    """
    Recover ``authoritative_draft`` / ``document_text`` from a complete *or truncated* model
    payload. ``finish_reason=length`` used to empty the wire body even when the cut-off JSON
    already held a near-complete commercial corpus.
    """
    text = _strip_optional_json_fences(raw)
    if not text:
        return ""
    candidate = text
    if not candidate.startswith("{") or not candidate.endswith("}"):
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start >= 0 and end > start:
            candidate = candidate[start : end + 1]
    try:
        parsed = json.loads(candidate)
        if isinstance(parsed, dict):
            doc = str(parsed.get("authoritative_draft") or parsed.get("document_text") or "").strip()
            if doc:
                return doc
    except (json.JSONDecodeError, TypeError, ValueError):
        pass
    for match in _JSON_DRAFT_KEY_RE.finditer(text):
        doc = _unescape_truncated_json_string(text[match.end() :])
        if doc:
            return doc
    if text.lstrip().startswith("{"):
        return ""
    if re.search(r"(?i)\b(?:in\s+witness\s+whereof|this\s+agreement\s+is\s+entered)\b", text):
        return text.strip()
    return ""


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
    hard_simple = [r for r in _simple_reasons if not str(r).startswith("simple_consulting_section_bloat:")]
    if hard_simple:
        reasons.extend(hard_simple)

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


UNCONFIRMED_PAYMENT_TIMING_QUESTION = (
    "How should the fixed fee be invoiced, and when is payment due?"
)
UNCONFIRMED_INVOICE_CADENCE_QUESTION = "How should the fixed fee be invoiced?"
UNCONFIRMED_PAYMENT_DUE_QUESTION = "When is payment due?"

_FEE_AMOUNT_RE = re.compile(
    r"\$\s?\d|\bfixed\s+fee\b|\bfee\s+of\b|\b\d[\d,]+\s*(?:usd|dollars)\b",
    re.I,
)
_UNRESOLVED_PAYMENT_RE = re.compile(
    r"\b(?:tbd|to be (?:agreed|confirmed|determined)|unknown|undecided|not sure|later)\b",
    re.I,
)
_WORD_DAYS = {
    "seven": 7,
    "ten": 10,
    "fourteen": 14,
    "fifteen": 15,
    "thirty": 30,
    "forty-five": 45,
    "sixty": 60,
    "ninety": 90,
}
_DAY_TOKEN = r"(?:\d{1,3}|" + "|".join(re.escape(k) for k in _WORD_DAYS) + r")"
_NET_DEADLINE_RE = re.compile(rf"\bnet\s*[- ]?({_DAY_TOKEN})\b", re.I)
_DUE_WITHIN_RE = re.compile(
    rf"\b(?:due|payable|paid)\s+(?:within|in)\s+({_DAY_TOKEN})\s*(?:\(\s*\d+\s*\))?\s*days\b",
    re.I,
)
_AFTER_INVOICE_RE = re.compile(
    rf"\bwithin\s+({_DAY_TOKEN})\s*(?:\(\s*\d+\s*\))?\s*days\s+after\s+receipt\s+of\s+invoice\b",
    re.I,
)
_CADENCE_MONTHLY_RE = re.compile(r"\binvoice(?:d|s)?\s+monthly\b|\bmonthly\s+invoic", re.I)
_CADENCE_WEEKLY_RE = re.compile(r"\binvoice(?:d|s)?\s+weekly\b|\bweekly\s+invoic", re.I)
_CADENCE_ONCE_RE = re.compile(
    r"\b(?:invoice(?:d)?\s+(?:once|in\s+one\s+installment)|one\s+installment|lump[\s-]?sum|"
    r"single\s+invoice)\b",
    re.I,
)
_CADENCE_ON_DATE_RE = re.compile(
    r"\b(?:invoice(?:d)?\s+(?:once\s+)?on|one\s+installment\s+on)\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})\b",
    re.I,
)
_CADENCE_UPON_RE = re.compile(
    r"\b(?:invoice(?:d)?\s+)?upon\s+(signing|execution|completion)\b",
    re.I,
)
_CADENCE_INSTALLMENTS_RE = re.compile(r"\bone\s+or\s+more\s+installments\b|\binstallments\s+during\b", re.I)
_PAYMENT_SECTION_HEADING_RE = re.compile(
    r"(?m)^(\d+)\.\s+(?:Fees?(?:\s+and\s+Payment)?|Payment|Compensation|Invoicing)\b\.?",
    re.I,
)
_NEXT_TOP_LEVEL_SECTION_RE = re.compile(r"(?m)^\d+\.(?!\d)\s+\S")
_TIMING_ONLY_SENTENCE_RE = re.compile(
    r"^\s*(?:unless the parties otherwise agree(?: in writing)?,?\s*)?"
    r"(?:consultant (?:may|will) invoice the fixed fee[^.]*|"
    r"invoices?\s+are\s+(?:due|payable)\b[^.]*|"
    r"(?:client will )?pay undisputed amounts within[^.]*|"
    r"payment is due\b[^.]*|"
    r"due\s+net\b[^.]*)\.?\s*$",
    re.I,
)
_UNCONFIRMED_TIMING_PHRASE_RES = [
    re.compile(r"\s*,?\s*net\s*[- ]?(?:\d{1,3}|thirty|sixty|fifteen|ninety|ten|seven|fourteen|forty-five)\b", re.I),
    re.compile(
        rf"\s*,?\s*(?:and\s+)?"
        rf"(?:client will )?pay undisputed amounts within\s+{_DAY_TOKEN}\s*"
        rf"(?:\(\s*\d+\s*\))?\s*days after receipt of invoice",
        re.I,
    ),
    re.compile(
        rf"\s*,?\s*(?:invoices?\s+are\s+)?(?:due|payable)\s+"
        rf"(?:within|in|net)\s+{_DAY_TOKEN}\s*(?:\(\s*\d+\s*\))?\s*days"
        rf"(?:\s+after\s+receipt\s+of\s+invoice)?",
        re.I,
    ),
    re.compile(
        rf"\s*,?\s*within\s+{_DAY_TOKEN}\s*(?:\(\s*\d+\s*\))?\s*days\s+after\s+receipt\s+of\s+invoice",
        re.I,
    ),
    re.compile(r"\s*,?\s*in\s+one\s+or\s+more\s+installments(?:\s+during\s+the\s+term)?", re.I),
    re.compile(
        r"\s*(?:unless the parties otherwise agree(?: in writing)?,?\s*)?"
        r"consultant may invoice the fixed fee[^.]*\.?",
        re.I,
    ),
    re.compile(
        r"\s*(?:consultant will\s+)?invoice(?:d|s)?\s+the\s+fixed\s+fee\s+"
        r"(?:monthly|weekly|once\b[^.]*|in\s+one\s+installment[^.]*|upon\s+\w+)[^.]*\.?",
        re.I,
    ),
    re.compile(r"\s*,?\s*(?:invoiced?\s+)?(?:weekly|monthly)\b", re.I),
]


def _day_value(token: str) -> Optional[int]:
    raw = (token or "").strip().lower().replace(" ", "")
    if raw.isdigit():
        return int(raw)
    return _WORD_DAYS.get(raw)


def _clause_is_unresolved(text: str) -> bool:
    for sent in re.split(r"(?<=[.!?])\s+", text or ""):
        if _UNRESOLVED_PAYMENT_RE.search(sent) and re.search(
            r"\b(?:payment|invoice|due|net|timing)\b", sent, re.I
        ):
            return True
    return False


def extract_payment_deadline_days(text: str) -> Optional[int]:
    if _clause_is_unresolved(text):
        return None
    return _deadline_in_text(text)


def _deadline_in_text(text: str) -> Optional[int]:
    for cre in (_NET_DEADLINE_RE, _AFTER_INVOICE_RE, _DUE_WITHIN_RE):
        hit = cre.search(text or "")
        if hit:
            days = _day_value(hit.group(1))
            if days is not None:
                return days
    return None


def extract_payment_cadence(text: str) -> Optional[str]:
    facts = extract_payment_facts("", text)
    if facts.cadence_conflict:
        return None
    return facts.cadence


def _cadences_in_text(text: str) -> List[str]:
    blob = text or ""
    found: List[str] = []
    if _CADENCE_ONCE_RE.search(blob) or _CADENCE_ON_DATE_RE.search(blob):
        found.append("once")
    if _CADENCE_MONTHLY_RE.search(blob) or (
        re.search(r"\b(?:invoice|invoic)", blob, re.I) and re.search(r"\bmonthly\b", blob, re.I)
    ):
        found.append("monthly")
    if _CADENCE_WEEKLY_RE.search(blob) or (
        re.search(r"\b(?:invoice|invoic)", blob, re.I) and re.search(r"\bweekly\b", blob, re.I)
    ):
        found.append("weekly")
    upon = _CADENCE_UPON_RE.search(blob)
    if upon:
        found.append(f"upon_{upon.group(1).lower()}")
    if _CADENCE_INSTALLMENTS_RE.search(blob):
        found.append("installments")
    # Preserve first-seen order while dropping duplicates.
    out: List[str] = []
    for item in found:
        if item not in out:
            out.append(item)
    return out


def _statements(text: str) -> List[str]:
    parts: List[str] = []
    for block in re.split(r"[\n;]+", text or ""):
        for sent in re.split(r"(?<=[.!?])\s+", block):
            piece = sent.strip()
            if piece:
                parts.append(piece)
    return parts


@dataclass
class PaymentFacts:
    cadence: Optional[str] = None
    invoice_date: Optional[str] = None
    invoice_trigger: Optional[str] = None
    deadline_days: Optional[int] = None
    cadence_conflict: bool = False


def _facts_from_statement(sent: str) -> PaymentFacts:
    if _clause_is_unresolved(sent):
        return PaymentFacts()
    cadences = [c for c in _cadences_in_text(sent) if c != "installments"]
    date_hit = _CADENCE_ON_DATE_RE.search(sent)
    upon = _CADENCE_UPON_RE.search(sent)
    conflict = len(cadences) > 1
    cadence = None if conflict or not cadences else cadences[0]
    return PaymentFacts(
        cadence=cadence,
        invoice_date=date_hit.group(1).strip() if date_hit and cadence == "once" else None,
        invoice_trigger=upon.group(1).lower() if upon and cadence and cadence.startswith("upon_") else None,
        deadline_days=_deadline_in_text(sent),
        cadence_conflict=conflict,
    )


def extract_payment_facts(intake: str, user_gap_answers: str = "") -> PaymentFacts:
    """Latest confirmed payment answers overlay earlier TBD or conflicting cadence."""
    facts = PaymentFacts()
    for source, answers_overlay in ((intake or "", False), (user_gap_answers or "", True)):
        for sent in _statements(source):
            if _clause_is_unresolved(sent):
                if answers_overlay:
                    facts = PaymentFacts()
                continue
            overlay = _facts_from_statement(sent)
            if overlay.cadence_conflict:
                facts.cadence = None
                facts.invoice_date = None
                facts.invoice_trigger = None
                facts.cadence_conflict = True
            elif overlay.cadence:
                facts.cadence = overlay.cadence
                facts.cadence_conflict = False
                facts.invoice_date = overlay.invoice_date if overlay.cadence == "once" else None
                facts.invoice_trigger = overlay.invoice_trigger
            if overlay.deadline_days is not None:
                facts.deadline_days = overlay.deadline_days
    if facts.cadence == "installments":
        facts.cadence = None
    return facts


def materials_have_fee_amount(intake: str, user_gap_answers: str = "") -> bool:
    return bool(_FEE_AMOUNT_RE.search(f"{intake}\n{user_gap_answers}"))


def materials_supply_payment_timing(intake: str, user_gap_answers: str = "") -> bool:
    """True only when both invoicing cadence and a payment deadline are explicit facts."""
    facts = extract_payment_facts(intake, user_gap_answers)
    return (
        not facts.cadence_conflict
        and facts.cadence not in {None, "installments"}
        and facts.deadline_days is not None
    )


def unconfirmed_payment_questions_present(missing: Optional[List[str]]) -> bool:
    asked = set(missing or [])
    return bool(
        asked
        & {
            UNCONFIRMED_PAYMENT_TIMING_QUESTION,
            UNCONFIRMED_INVOICE_CADENCE_QUESTION,
            UNCONFIRMED_PAYMENT_DUE_QUESTION,
        }
    )


def _payment_section_span(doc: str) -> Optional[Tuple[int, int]]:
    heading = _PAYMENT_SECTION_HEADING_RE.search(doc)
    if not heading:
        return None
    rest = doc[heading.end() :]
    nxt = _NEXT_TOP_LEVEL_SECTION_RE.search(rest)
    end = heading.end() + (nxt.start() if nxt else len(rest))
    return heading.start(), end


def _split_payment_heading(section: str) -> Tuple[str, str, str]:
    match = _PAYMENT_SECTION_HEADING_RE.match(section)
    if not match:
        return "", section, ""
    heading = match.group(0).rstrip()
    after = section[match.end() :]
    sep = ""
    if after.startswith("\r\n"):
        sep = "\r\n"
        after = after[2:]
    elif after.startswith("\n"):
        sep = "\n"
        after = after[1:]
    elif after[:1] in " \t":
        sep = after[:1]
        after = after[1:]
    return heading, sep or "\n", after


def _strip_unconfirmed_timing_phrases(body: str) -> str:
    out = body
    for cre in _UNCONFIRMED_TIMING_PHRASE_RES:
        out = cre.sub("", out)
    kept: List[str] = []
    for sentence in re.split(r"(?<=[.])\s+", out):
        piece = sentence.strip()
        if not piece:
            continue
        if _TIMING_ONLY_SENTENCE_RE.match(piece):
            continue
        kept.append(piece)
    cleaned = " ".join(kept)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\s+,", ",", cleaned)
    cleaned = re.sub(r",\s*\.", ".", cleaned)
    cleaned = re.sub(r"\.\s*\.", ".", cleaned)
    cleaned = cleaned.strip(" ,")
    if cleaned and _FEE_AMOUNT_RE.search(cleaned) and not cleaned.endswith("."):
        cleaned += "."
    return cleaned


def _apply_supplied_payment_facts(
    body: str,
    *,
    facts: PaymentFacts,
) -> str:
    text = (body or "").rstrip()
    additions: List[str] = []
    cadence = None if facts.cadence_conflict else facts.cadence
    if cadence == "monthly" and not _CADENCE_MONTHLY_RE.search(text):
        additions.append("Consultant will invoice the fixed fee monthly.")
    elif cadence == "weekly" and not _CADENCE_WEEKLY_RE.search(text):
        additions.append("Consultant will invoice the fixed fee weekly.")
    elif cadence == "once":
        if facts.invoice_date and facts.invoice_date not in text:
            additions.append(f"Consultant will invoice the fixed fee once on {facts.invoice_date}.")
        elif not _CADENCE_ONCE_RE.search(text):
            additions.append("Consultant will invoice the fixed fee in one installment.")
    elif cadence and cadence.startswith("upon_") and cadence.split("_", 1)[1] not in text.lower():
        additions.append(f"Consultant will invoice the fixed fee upon {cadence.split('_', 1)[1]}.")
    if facts.deadline_days is not None and _deadline_in_text(text) != facts.deadline_days:
        additions.append(f"Payment is due net {facts.deadline_days}.")
    if not additions:
        return text
    if text and not text.endswith("."):
        text += "."
    return f"{text} {' '.join(additions)}".strip()


def payment_section_text(doc: str) -> str:
    span = _payment_section_span(doc)
    if not span:
        return ""
    return doc[span[0] : span[1]]


def _rewrite_payment_section(
    doc: str,
    *,
    facts: PaymentFacts,
    strip_timing: bool,
    apply_supplied: bool,
) -> str:
    span = _payment_section_span(doc)
    if not span:
        return doc
    start, end = span
    heading, sep, body = _split_payment_heading(doc[start:end])
    working = _strip_unconfirmed_timing_phrases(body) if strip_timing else body.strip()
    if apply_supplied:
        working = _apply_supplied_payment_facts(working, facts=facts)
    rebuilt = heading
    if working:
        rebuilt = f"{heading}{sep}{working}"
    trailing = "\n" if doc[end : end + 1] == "\n" or doc[start:end].endswith("\n") else ""
    return f"{doc[:start]}{rebuilt}{trailing}{doc[end:]}"


def apply_unconfirmed_payment_timing_guard(
    *,
    intake: str,
    user_gap_answers: str,
    document_text: str,
    missing_material_info: Optional[List[str]] = None,
) -> Tuple[str, List[str]]:
    """Keep supplied payment facts, ask only what is still missing, and refuse invented terms.

    Deterministic post-pass. Does not reject the draft or trigger another LLM repair.
    """
    missing = [str(x).strip() for x in (missing_material_info or []) if str(x).strip()]
    payment_qs = {
        UNCONFIRMED_PAYMENT_TIMING_QUESTION,
        UNCONFIRMED_INVOICE_CADENCE_QUESTION,
        UNCONFIRMED_PAYMENT_DUE_QUESTION,
    }
    missing = [m for m in missing if m not in payment_qs]
    doc = document_text or ""
    if not materials_have_fee_amount(intake, user_gap_answers):
        return doc, missing
    facts = extract_payment_facts(intake, user_gap_answers)
    supplied_cadence = None if facts.cadence_conflict else facts.cadence
    supplied_deadline = facts.deadline_days
    payment_span = _payment_section_span(doc)
    draft_slice = doc[payment_span[0] : payment_span[1]] if payment_span else ""
    draft_facts = extract_payment_facts("", draft_slice)
    draft_cadence = None if draft_facts.cadence_conflict else draft_facts.cadence
    draft_deadline = draft_facts.deadline_days
    date_ok = bool(
        not facts.invoice_date
        or (facts.invoice_date and facts.invoice_date in draft_slice)
    )
    cadence_ok = bool(supplied_cadence and draft_cadence and supplied_cadence == draft_cadence and date_ok)
    deadline_ok = bool(
        supplied_deadline is not None and draft_deadline is not None and supplied_deadline == draft_deadline
    )
    both_supplied = bool(supplied_cadence and supplied_deadline is not None)
    if both_supplied and cadence_ok and deadline_ok and not facts.cadence_conflict:
        return doc, missing
    strip_timing = True
    apply_supplied = bool((supplied_cadence or supplied_deadline is not None) and not facts.cadence_conflict)
    if facts.cadence_conflict:
        apply_supplied = supplied_deadline is not None
    elif not supplied_cadence and supplied_deadline is None:
        apply_supplied = False
    doc = _rewrite_payment_section(
        doc,
        facts=facts,
        strip_timing=strip_timing,
        apply_supplied=apply_supplied,
    )
    if facts.cadence_conflict or (not supplied_cadence and supplied_deadline is None):
        if facts.cadence_conflict:
            missing.append(UNCONFIRMED_INVOICE_CADENCE_QUESTION)
            if supplied_deadline is None:
                missing.append(UNCONFIRMED_PAYMENT_DUE_QUESTION)
        else:
            missing.append(UNCONFIRMED_PAYMENT_TIMING_QUESTION)
    else:
        if not supplied_cadence:
            missing.append(UNCONFIRMED_INVOICE_CADENCE_QUESTION)
        if supplied_deadline is None:
            missing.append(UNCONFIRMED_PAYMENT_DUE_QUESTION)
    return doc, missing


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
    user_gap_answers: str = "",
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
    uga = (user_gap_answers or "").strip()
    if uga:
        out["user_gap_answers"] = uga
    if premium_intent_key:
        out["premium_intent_key"] = premium_intent_key
    if deterministic_premium_intent_skeleton:
        out["deterministic_premium_intent_skeleton"] = deterministic_premium_intent_skeleton
    return append_simple_consulting_repair_directives(out, rejection_reasons)
