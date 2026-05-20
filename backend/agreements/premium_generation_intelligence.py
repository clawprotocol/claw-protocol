"""
Deterministic pre-model brief for LawDog Pro full-draft generation.
Improves situation-awareness without changing API shape or UI.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple


def _norm(raw: str) -> str:
    return re.sub(r"\s+", " ", (raw or "").strip())


def _detect_contradiction_notes(low: str) -> List[str]:
    notes: List[str] = []
    if re.search(r"\bexclusive\b", low) and re.search(r"\bnon-?exclusive\b", low):
        notes.append("exclusive vs non-exclusive scope — pick one grant and note the other path in missing_material_info if needed")
    if re.search(r"\bno\s+refunds?\b|\bnon-?refundable\b", low) and re.search(
        r"\b(full|any|unlimited)\s+refunds?\b|\brefund\s+anytime\b|\bmoney\s+back\b", low
    ):
        notes.append("mixed refund policy — choose one policy in operative text")
    if re.search(
        r"\b(0|zero)\s+days?\s+notice\b|\bterminate\s+anytime\b|\bimmediate(?:ly)?\s+terminat", low
    ) and re.search(r"\b(30|60|90)\s+days?\s+(?:written\s+)?notice\b", low):
        notes.append("conflicting termination notice — harmonize to one notice period")
    if re.search(r"\bemployee\b|\bw-?2\b", low) and re.search(r"\b1099\b|\bindependent\s+contractor\b", low):
        notes.append("employee vs contractor signals — align classification with the stated relationship")
    states = set(
        m.group(0).lower().replace("  ", " ")
        for m in re.finditer(
            r"\b(?:delaware|california|texas|new\s+york|florida|nevada|oklahoma|arizona|washington)\b",
            low,
        )
    )
    if len(states) >= 2:
        notes.append("multiple US states referenced for law/venue — use one unless intake clearly splits tiers")
    return notes[:3]


_CREATOR_SITUATION = re.compile(
    r"\b("
    r"influencer|ugc|creators?|tiktoks?|instagram|youtube|reels?|short-?form|"
    r"sponsorship|brand\s+deal|whitelisting|paid\s+post|affiliate|newsletter|"
    r"podcast|talent\s+manager|appearance\s+release|talent\s+release|"
    r"paid\s+ads?"
    r")\b",
    re.I,
)

_SETTLEMENT_SITUATION = re.compile(
    r"\b(?:settlement|mutual\s+release|release\s+of\s+claims|clean\s+release)\b"
    r"|\brelease\b(?!\s+(?:for\s+)?(?:event|photography|appearance|talent|likeness|model|conference))",
    re.I,
)

_CRYPTO_SITUATION = re.compile(
    r"\b(nft|dao|usdc|airdrop|web3|blockchain|crypto|saft|defi|centralized\s+exchange)\b",
    re.I,
)

_FOUNDER_BREAKUP_SITUATION = re.compile(
    r"\b(?:co[-\s]?founder|cofounder)\b.{0,100}\b(?:splitting|split|breakup|breaking|ghost|scared|copycat|customer\s+list|code)\b|"
    r"\b(?:splitting|split)\s+badly\b.{0,60}\b(?:co[-\s]?founder|cofounder|founder)\b|"
    r"\bsplitting\s+badly\b.{0,60}\b(?:co[-\s]?founder|cofounder|founder)\b",
    re.I,
)

_LICENSING_IP_SITUATION = re.compile(
    r"\b(?:license\s+my\s+logo|logo\s+license|licen[cs]e\s+.{0,50}\b(?:logo|logotype|brand\s+mark)\b|"
    r"\b(?:non[-\s]?exclusive|exclusive)\s+.{0,40}\b(?:worldwide|north\s+america|logo|mark)\b|"
    r"\bexclusive\s+rights?\s+in\s+(?:north\s+america|[a-z]{2,})\b)",
    re.I,
)


def _situation_line(low: str) -> str:
    if _FOUNDER_BREAKUP_SITUATION.search(low):
        return (
            "Founder / co-founder separation: confidentiality, customer and IP restrictions, "
            "return of materials, and calm dispute resolution — confirm amounts and remedies with advisors."
        )
    if _LICENSING_IP_SITUATION.search(low):
        return (
            "Licensing / IP grant: define exclusive vs non-exclusive scope, territory, term, "
            "reservation of rights, and payment — resolve conflicting grant language in one coherent path."
        )
    if _CREATOR_SITUATION.search(low):
        return (
            "Paid creator/brand collaboration: deliverables, usage rights window, approval, payment trigger, "
            "and disclosure duties if ads are involved."
        )
    if re.search(r"\b(saas|subscription|software\s+as\s+a\s+service|api\s+access|api\s+integration|platform\s+terms)\b", low):
        return (
            "B2B software/subscription: access scope, fees, data use, support, limitation of liability, "
            "and termination for the described product."
        )
    if _SETTLEMENT_SITUATION.search(low):
        return (
            "Settlement/release: mutual release framing, payment schedule placeholders, and no admission "
            "language unless intake states otherwise."
        )
    if _CRYPTO_SITUATION.search(low):
        return (
            "Crypto/Web3 commercial arrangement — keep token, securities, custody, and compliance assumptions explicit."
        )
    if re.search(r"\b(consulting|retainer|statement\s+of\s+work|\bsow\b|freelance|1099)\b", low):
        return (
            "Professional services: scoped deliverables, acceptance, change control, payment milestones, "
            "and IP on delivery."
        )
    if re.search(r"\b(mutual\s+)?(?:nda|non[-\s]?disclosure)\b", low):
        return "Confidentiality deal: mutual or one-way duties, term, permitted disclosures, and return of materials."
    return "Commercial agreement shaped to the parties and economics described in the intake."


def _tone_directive(low: str) -> str:
    if re.search(
        r"\b(ex-|ghosting|scared|betrayal|lawsuit\s+lol|sue\s+them|ruin\s+thanksgiving|angry)\b", low
    ):
        return (
            "Calm, neutral, professional tone — no threats, no fear-based remedies, no overconfident guarantees. "
            "Do not escalate emotional language from the intake into aggressive clauses."
        )
    return "Calm, plain-English commercial tone — confident but not threatening or overly legalese."


def _must_address(low: str) -> List[str]:
    out: List[str] = []
    checks: Tuple[str, str] = (
        (r"\b(deliverables?|milestones?|tiktoks?|reels?|posts?|content|scope|services)\b", "scope_and_deliverables"),
        (
            r"\$|\$\s*\d[\d,]*(?:\.\d+)?\s*k\b|\$\s*\d{1,3}(?:,\d{3})+(?:\.\d{2})?\b|"
            r"\b\d+\s*k\s+(?:flat|fixed|fee)\b|\b(?:fees?|payments?|paid|compensation|invoices?|net\s*\d|retainers?|commissions?)\b",
            "economics_and_payment",
        ),
        (r"\b(ip|ownership|license|work\s+product|assign)\b", "ip_or_usage_rights"),
        (r"\b(confidential|nda|non-?disclos)\b", "confidentiality_if_raised"),
        (r"\b(terminat|notice\s+period|term\s+length)\b", "term_and_termination"),
        (r"\b(governing\s+law|delaware|texas|california|venue|jurisdiction)\b", "governing_law_venue"),
        (r"\b(ftc|disclosure|affiliate|referral\s+code)\b", "marketing_or_referral_compliance"),
    )
    for pat, label in checks:
        if re.search(pat, low) and label not in out:
            out.append(label)
    return out[:8]


def build_premium_generation_intelligence_brief(
    intake: str,
    *,
    scenario_category: str = "",
    scenario_signals: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Compact routing object injected into premium full-draft user JSON.
    """
    text = _norm(intake)
    low = text.lower()
    contradiction_notes = _detect_contradiction_notes(low)
    brief: Dict[str, Any] = {
        "situation_line": _situation_line(low),
        "tone_directive": _tone_directive(low),
        "contradiction_notes": contradiction_notes,
        "must_address": _must_address(low),
        "scenario_category": (scenario_category or "").strip() or "custom_mixed",
        "scenario_signals": list(scenario_signals or [])[:12],
    }
    if contradiction_notes:
        brief["drafting_rule"] = (
            "Resolve contradictions by choosing one coherent commercial path; list unresolved forks "
            "in missing_material_info — never encode both sides as operative law."
        )
    return brief
