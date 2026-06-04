"""
Simple Paid Pro consulting engagements — target document size discipline.

Avoids turning a short fixed-fee consulting intake into 16k+ char enterprise-style bloat
while preserving required operative depth for paid Pro quality gates.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

SIMPLE_CONSULTING_PROFILE = "simple_consulting_fixed_fee"
SIMPLE_CONSULTING_TARGET_MIN_CHARS = 6_000
SIMPLE_CONSULTING_TARGET_MAX_CHARS = 10_000
SIMPLE_CONSULTING_HARD_MAX_CHARS = 12_000
SIMPLE_CONSULTING_MAX_NUMBERED_SECTIONS = 14

_COMPLEX_INTAKE_RE = re.compile(
    r"\b(?:"
    r"merger|acquisition|joint\s+venture|stock\s+option|equity\s+vesting|founder\s+split|"
    r"probate|estate\s+plan|trustee|loan\s+agreement|promissory\s+note|"
    r"arbitration\s+only|class\s+action|hipaa|pci|soc\s*2|iso\s*27001|"
    r"multi[-\s]?party|three\s+parties|four\s+parties"
    r")\b",
    re.I,
)

_FIXED_FEE_RE = re.compile(
    r"\b(?:"
    r"fixed\s+fee|flat\s+fee|total\s+fee|one[-\s]?time\s+fee|"
    r"\$\s*[\d,]+(?:\s*(?:flat|fixed|total))?"
    r")\b",
    re.I,
)

_CONSULTING_RE = re.compile(
    r"\b(?:consulting|consultant|professional\s+services|services\s+agreement|"
    r"implementation\s+services|advisory|retainer)\b",
    re.I,
)

_NUMBERED_HEADING_RE = re.compile(r"^\s*(\d+(?:\.\d+)*)\.\s+\S+", re.M)


def is_simple_paid_pro_consulting_engagement(
    intake: str,
    context: Optional[Dict[str, Any]],
    *,
    scenario_category: str = "",
) -> bool:
    text = (intake or "").strip()
    if not text or len(text) > 900:
        return False
    if _COMPLEX_INTAKE_RE.search(text):
        return False
    ctx = context or {}
    fam = str(ctx.get("agreement_family") or "").lower()
    scen = (scenario_category or "").strip().lower()
    if scen in ("employment", "family_personal", "property_roommate", "loan_payment", "settlement_dispute"):
        return False
    if re.search(r"\b(?:nda|non[-\s]?disclosure)\b", text, re.I) and not _CONSULTING_RE.search(text):
        return False
    has_fee = bool(_FIXED_FEE_RE.search(text))
    has_consulting = bool(_CONSULTING_RE.search(text)) or "consult" in fam or "service" in fam
    if scen in ("freelancer_service", "business_commercial") and has_fee:
        return True
    if has_fee and has_consulting and len(text) <= 600:
        return True
    parties = ctx.get("parties")
    if has_fee and isinstance(parties, list) and 2 <= len(parties) <= 3 and len(text) <= 500:
        return True
    return False


def count_numbered_top_level_sections(document_text: str) -> int:
    doc = (document_text or "").replace("\r\n", "\n")
    count = 0
    for m in _NUMBERED_HEADING_RE.finditer(doc):
        num = (m.group(1) or "").strip()
        if "." not in num:
            count += 1
    return count


def evaluate_simple_consulting_document_length(
    document_text: str,
    *,
    intake: str,
    context: Optional[Dict[str, Any]],
    scenario_category: str = "",
) -> Tuple[bool, List[str]]:
    """Returns (within_band, rejection_reasons) for simple consulting profile only."""
    if not is_simple_paid_pro_consulting_engagement(intake, context, scenario_category=scenario_category):
        return True, []
    doc = (document_text or "").strip()
    reasons: List[str] = []
    doc_len = len(doc)
    if doc_len > SIMPLE_CONSULTING_HARD_MAX_CHARS:
        reasons.append(
            f"simple_consulting_excessive_length:{doc_len}>{SIMPLE_CONSULTING_HARD_MAX_CHARS}"
        )
    sections = count_numbered_top_level_sections(doc)
    if sections > SIMPLE_CONSULTING_MAX_NUMBERED_SECTIONS:
        reasons.append(
            f"simple_consulting_section_bloat:sections={sections}>{SIMPLE_CONSULTING_MAX_NUMBERED_SECTIONS}"
        )
    return (len(reasons) == 0, reasons)


def simple_consulting_length_directive() -> str:
    return (
        "This is a **simple fixed-fee consulting / professional services** engagement with a short intake. "
        f"Target a complete signed-ready agreement of roughly {SIMPLE_CONSULTING_TARGET_MIN_CHARS:,}–"
        f"{SIMPLE_CONSULTING_TARGET_MAX_CHARS:,} characters (about 6–12 major sections). "
        "Include required operative clauses (scope, payment, IP, confidentiality, termination, governing law, notices, signatures) "
        "but **do not** pad with unrelated enterprise MSA, SOC2, arbitration treatises, or duplicate boilerplate. "
        f"Stay under {SIMPLE_CONSULTING_HARD_MAX_CHARS:,} characters unless the intake explicitly requires more complexity."
    )


def enrich_user_payload_for_simple_consulting(
    user_payload: Dict[str, Any],
    intake: str,
    context: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    scen = str(user_payload.get("scenario_category") or "")
    if not is_simple_paid_pro_consulting_engagement(intake, context, scenario_category=scen):
        return user_payload
    out = dict(user_payload)
    out["document_length_profile"] = SIMPLE_CONSULTING_PROFILE
    out["target_document_char_band"] = {
        "min": SIMPLE_CONSULTING_TARGET_MIN_CHARS,
        "max": SIMPLE_CONSULTING_TARGET_MAX_CHARS,
        "hard_max": SIMPLE_CONSULTING_HARD_MAX_CHARS,
        "max_numbered_sections": SIMPLE_CONSULTING_MAX_NUMBERED_SECTIONS,
    }
    out["length_discipline_directive"] = simple_consulting_length_directive()
    brief = out.get("generation_intelligence_brief")
    if isinstance(brief, dict):
        must = brief.get("must_address")
        if isinstance(must, list):
            must = list(must)
        else:
            must = []
        line = simple_consulting_length_directive()
        if line not in must:
            must.append(line)
        brief["must_address"] = must[:24]
        out["generation_intelligence_brief"] = brief
    return out


def append_simple_consulting_repair_directives(
    repair_payload: Dict[str, Any],
    rejection_reasons: List[str],
) -> Dict[str, Any]:
    if not any("simple_consulting" in (r or "") for r in rejection_reasons):
        return repair_payload
    out = dict(repair_payload)
    reasons = list(out.get("rejection_reasons") or [])
    out["length_repair_directive"] = (
        f"Shorten the agreement to roughly {SIMPLE_CONSULTING_TARGET_MIN_CHARS:,}–"
        f"{SIMPLE_CONSULTING_TARGET_MAX_CHARS:,} characters. Remove redundant or enterprise-only sections; "
        f"keep one clear scope, payment, IP, confidentiality, termination, governing law, notices, and signature block. "
        f"Hard ceiling {SIMPLE_CONSULTING_HARD_MAX_CHARS:,} characters."
    )
    out["rejection_reasons"] = reasons
    return out
