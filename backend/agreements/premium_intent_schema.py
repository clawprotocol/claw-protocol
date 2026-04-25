"""
Deterministic LawDog Pro intent skeletons: schema is assembled in Python and injected
before the premium full-draft model call; `evaluate_premium_intent_schema` validates
category-native shape (rejects free-associated corporate shells).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

LOGO_DETERMINISTIC_IDS = frozenset({"logo_brand", "graphic_design"})
FOUNDER_DETERMINISTIC_IDS = frozenset({"founder_equity"})
LOAN_DETERMINISTIC_IDS = frozenset({"loan"})


class PremiumIntentKey(str, Enum):
    LOGO_DESIGN = "logo_design"
    FOUNDER_EQUITY = "founder_equity"
    LOAN = "loan"
    # graphic_design and web use lighter checks when needed
    GENERIC = "generic"


@dataclass(frozen=True)
class _IntentCheck:
    title_patterns: List[re.Pattern]
    body_groups: List[Tuple[str, re.Pattern]]
    min_body_groups: int
    title_forbid: List[re.Pattern]
    min_title_term_hits: int
    required_title_flex: List[str]


def _rx(pat: str) -> re.Pattern:
    return re.compile(pat, re.I | re.S)


_LOGO: _IntentCheck = _IntentCheck(
    title_patterns=[
        _rx(r"(logo|logotype|wordmark|brand(\s+identity)?|mascot|emblem)"),
        _rx(r"design.*(agreement|contract|services)|\b(services|agreement|contract)"),
    ],
    body_groups=[
        (
            "deliverables",
            _rx(
                r"\b(deliverable|milestone|final\s+files?|artwork|concepts?|source\s+files?|"
                r"brand\s+assets?|exportable|print[-\s]?ready)\b"
            ),
        ),
        (
            "revisions",
            _rx(
                r"\b(revision|rounds?|redraft|refinement|change\s+request|"
                r"proof|feedback\s+cycle|iteration)\b"
            ),
        ),
        (
            "ownership_or_license",
            _rx(
                r"\b(ownership|assign|assignment|licen[sc]e|licensor|"
                r"work[-\s]?for[-\s]?hire|i\.?p\.?|intellectual\s+property|"
                r"copyright)\b"
            ),
        ),
        (
            "payment",
            _rx(
                r"(\$|£|€|\b\d{1,3}(?:,\d{3})+\b|"
                r"\b(fee|fees?|compensation|invoic|flat\s+fee|"
                r"price|payment|amount)\b)"
            ),
        ),
        (
            "acceptance",
            _rx(
                r"\b(accept(ance|ed)?|approval|sign[-\s]?off|"
                r"rejection|reject)\b"
            ),
        ),
    ],
    min_body_groups=4,
    title_forbid=[
        _rx(
            r"^(?:commercial|vendor|enterprise)\s+review\s+agreement\s*$|"
            r"master\s+service\s+agreement\s*-\s*commercial\s*review|"
            r"^\s*services\s+agreement\s*-\s*review\s*only"
        ),
    ],
    min_title_term_hits=1,
    required_title_flex=[r"logo", r"logotype", r"design", r"brand", r"branding", r"mark"],
)


_FOUNDER: _IntentCheck = _IntentCheck(
    title_patterns=[_rx(r"(founder|vesting|equity|stock|grants?|shares|cap\s+table)")],
    body_groups=[
        (
            "vesting",
            _rx(
                r"\b(vest|vesting|cliff|schedule|repurchase|"
                r"unvested|accelerat|dilut|shares?|options?|equit(y|ies))\b"
            ),
        ),
        (
            "split_or_allocation",
            _rx(
                r"\b(\d{1,2}\s*\/\s*\d{1,2}|\bpercent|percentage|allocation|"
                r"split|ownership|cap\s*table|founder\s+shares?)\b"
            ),
        ),
        (
            "ip_assignment",
            _rx(
                r"\b(i\.?p\.?|intellectual\s+property|invention|"
                r"pre[-\s]?existing|assignment\s+of\s+inventions?|"
                r"proprietary|works?\s+made)\b"
            ),
        ),
        (
            "departure",
            _rx(
                r"\b(depart|leaver|separation|termination|forfeit|"
                r"resign|good\s+leaver|bad\s+leaver|"
                r"exercise|buy[-\s]?back|end\s+of\s+service)\b"
            ),
        ),
    ],
    min_body_groups=3,
    title_forbid=[],
    min_title_term_hits=1,
    required_title_flex=[r"founder", r"vest", r"equity", r"stock", r"founders?"],
)

_LOAN: _IntentCheck = _IntentCheck(
    title_patterns=[_rx(r"(loan|promissory|note|credit|i\.?o\.?u|borrow|lend)")],
    body_groups=[
        (
            "loan_core",
            _rx(
                r"\b(principal|lend(?:er|ing)?|borrow(?:er|ing)?|"
                r"repay|repayment|installment|interest|maturity|promissory|"
                r"in\s+default|schedule|amount\s+of|sum\s+of|iou)\b"
            ),
        ),
    ],
    min_body_groups=1,
    title_forbid=[],
    min_title_term_hits=0,
    required_title_flex=[],
)


def _loan_substance_detailed_ok(low: str) -> bool:
    """At least one credit-side and one obligation-side signal (keeps promissory notes passing)."""
    a = re.search(
        r"\b(principal|lend(?:er|ing|s)?|borrow(?:er|ing)?|maker|"
        r"face\s*amount|sum\s+of|promissory|creditor|debtor|iou)\b",
        low,
        re.I,
    )
    b = re.search(
        r"\b(repay|repayment|installment|interest|maturity|amorti|"
        r"default|demand|schedule|note)\b",
        low,
        re.I,
    )
    return bool(a and b)


def _flex_hit(title_l: str, flex: List[str]) -> int:
    if not title_l or not flex:
        return 99
    h = 0
    for pat in flex:
        if re.search(pat, title_l, re.I):
            h += 1
    return h


def resolve_premium_intent_key(
    intake: str,
    context: Optional[Dict[str, Any]],
) -> Optional[PremiumIntentKey]:
    det = None
    if context and context.get("deterministic_intent_id"):
        det = str(context["deterministic_intent_id"]).strip()
    low = (intake or "").strip().lower()
    if det in LOGO_DETERMINISTIC_IDS:
        return PremiumIntentKey.LOGO_DESIGN
    if det in FOUNDER_DETERMINISTIC_IDS:
        return PremiumIntentKey.FOUNDER_EQUITY
    if det in LOAN_DETERMINISTIC_IDS:
        return PremiumIntentKey.LOAN
    if not det and re.search(r"\b(logo|logotype|wordmark|brand mark)\b", low) and re.search(
        r"\b(design|deliver|revision|mascot)\b",
        low,
    ):
        return PremiumIntentKey.LOGO_DESIGN
    if not det and re.search(
        r"\b(founder|vesting|60\s*\/\s*40|40\s*\/\s*60|cliff|equity split)\b",
        low,
    ) and "estate" not in low:
        return PremiumIntentKey.FOUNDER_EQUITY
    if not det and re.search(
        r"\b(promissory|loan|lend(ing|er)?|borrow(ing|er)?|installment|principal|iou)\b",
        low,
    ):
        if re.search(r"\b(logo|vesting|founder|design|brand)\b", low):
            return None
        return PremiumIntentKey.LOAN
    return None


def build_premium_intent_skeleton(
    key: Optional[PremiumIntentKey],
    intake: str,
) -> Optional[Dict[str, Any]]:
    if key is None or key == PremiumIntentKey.GENERIC:
        return None
    if key == PremiumIntentKey.LOGO_DESIGN:
        return {
            "intent": "logo_design",
            "required_in_title": [
                "The title must name **logo, design, and/or brand** — not a commercial review, vendor MSA, or software QA engagement.",
            ],
            "required_sections": [
                {"id": "deliverables", "topic": "Deliverables, formats, and brand handoff (files, color, usage)."},
                {"id": "revisions", "topic": "Revision rounds, overage billing, and acceptance / approval."},
                {"id": "ownership", "topic": "Ownership, license, or work-for-hire of the final logo and concepts."},
                {"id": "payment", "topic": "Fees, invoicing, deposit/kill-fee if applicable, and late payment (neutral)."},
            ],
            "forbidden_misroutes": [
                "Do not frame this as a **commercial review agreement**, **vendor MSA**, or **enterprise services review** — it is a creative / logo design engagement.",
            ],
        }
    if key == PremiumIntentKey.FOUNDER_EQUITY:
        return {
            "intent": "founder_equity",
            "required_in_title": [
                "The title must reference **founder, vesting, and/or equity** (not a generic 'Agreement' or B2B services shell).",
            ],
            "required_sections": [
                {"id": "split", "topic": "Ownership split / grants (TBD in schedule is OK) and baseline cap logic."},
                {
                    "id": "vesting",
                    "topic": "Vesting schedule, cliff, acceleration only if user stated; otherwise neutral placeholders.",
                },
                {"id": "ip", "topic": "IP / inventions assignment and confidential information (founder-appropriate)."},
                {"id": "departure", "topic": "Departure, termination, and repurchase / leaver concepts in plain terms."},
            ],
            "forbidden_misroutes": [
                "Do not output a **generic 10-section B2B services agreement** with no vesting, equity, or founder mechanics — this is a founder / equity arrangement.",
            ],
        }
    if key == PremiumIntentKey.LOAN:
        return {
            "intent": "loan",
            "required_in_title": ["The title should read as a **loan, promissory note, or credit** agreement."],
            "required_sections": [
                {"id": "parties_sum", "topic": "Lender, borrower, principal, and (if any) interest mechanics."},
                {"id": "repayment", "topic": "Repayment schedule, default, and notices (neutral, fact-faithful)."},
            ],
            "forbidden_misroutes": [
                "Do not turn a simple **loan** into an unrelated B2B marketing or 'commercial review' agreement.",
            ],
        }
    return None


def evaluate_premium_intent_schema(
    key: Optional[PremiumIntentKey],
    draft_title: str,
    document_text: str,
) -> Tuple[bool, List[str]]:
    if key is None or key == PremiumIntentKey.GENERIC:
        return True, []
    title = (draft_title or "").strip()
    title_l = title.lower()
    doc = (document_text or "").strip()
    low = doc.lower()
    if key == PremiumIntentKey.LOGO_DESIGN:
        spec = _LOGO
    elif key == PremiumIntentKey.FOUNDER_EQUITY:
        spec = _FOUNDER
    elif key == PremiumIntentKey.LOAN:
        spec = _LOAN
    else:
        return True, []

    reasons: List[str] = []

    if key == PremiumIntentKey.LOAN and not _loan_substance_detailed_ok(low):
        return False, ["intent_schema:loan_missing_principal_repayment_fabric"]

    for frx in spec.title_forbid:
        if title and frx.search(title_l):
            reasons.append(f"intent_schema:misrouted_title:{frx.pattern[:48]}")

    if spec.required_title_flex and _flex_hit(title_l, spec.required_title_flex) < 1 and len(title) > 0:
        reasons.append("intent_schema:title_missing_intent_cue")

    if spec != _LOAN:
        hits = 0
        for pat in spec.title_patterns:
            if pat.search(title_l):
                hits += 1
        if title and hits < spec.min_title_term_hits and _flex_hit(title_l, spec.required_title_flex) < 1:
            reasons.append("intent_schema:title_not_intent_shaped")

    good_groups = 0
    for label, g_rx in spec.body_groups:
        if g_rx.search(low):
            good_groups += 1
    if good_groups < spec.min_body_groups:
        reasons.append(
            f"intent_schema:body_missing_required_pillars:{good_groups}<{spec.min_body_groups} "
            f"(logo needs deliverables/revisions/ownership|license/payment; "
            f"founder needs vesting+IP+departure mix; loan needs principal+repay+roles)"
        )
    if key == PremiumIntentKey.LOGO_DESIGN and re.search(
        r"\b(commercial|vendor|enterprise|master service)\b.*\b(review|qa|compliance)\b",
        title_l,
    ):
        if not re.search(r"\b(logo|design|brand|creative|deliverable|revision)\b", title_l):
            reasons.append("intent_schema:logo_routed_to_commercial_review_framing")

    ok = len(reasons) == 0
    return ok, reasons
