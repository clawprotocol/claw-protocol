"""Deterministic premium agreement draft validation.

This module is a structural quality firewall for LawDog Pro. It does not provide
legal advice or legal enforceability analysis; it only detects obvious drafting
defects, malformed AI artifacts, minimum agreement-formation gaps, and
signer-readiness problems using deterministic checks.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from backend.agreements.review_plain_section_continuity import extract_supplied_governing_law


Severity = Literal["low", "medium", "high"]


class AgreementValidationFailure(BaseModel):
    code: str
    message: str
    severity: Severity = "high"
    section: Optional[str] = None


class AgreementValidationWarning(BaseModel):
    code: str
    message: str
    severity: Severity = "medium"
    section: Optional[str] = None


class MinimumContractElements(BaseModel):
    identifiable_parties: bool = False
    agreement_purpose_or_scope: bool = False
    exchange_of_value_or_consideration: bool = False
    obligations_or_performance: bool = False
    execution_or_acceptance_mechanism: bool = False


class AgreementValidationSummary(BaseModel):
    failure_count: int = 0
    warning_count: int = 0
    checked_at: str = ""


class AgreementValidationResult(BaseModel):
    passed: bool
    failures: List[AgreementValidationFailure] = Field(default_factory=list)
    warnings: List[AgreementValidationWarning] = Field(default_factory=list)
    minimum_contract_elements: MinimumContractElements = Field(default_factory=MinimumContractElements)
    summary: AgreementValidationSummary = Field(default_factory=AgreementValidationSummary)


STATE_NAMES = (
    "Alabama",
    "Alaska",
    "Arizona",
    "Arkansas",
    "California",
    "Colorado",
    "Connecticut",
    "Delaware",
    "Florida",
    "Georgia",
    "Illinois",
    "Massachusetts",
    "Nevada",
    "New Jersey",
    "New York",
    "Oklahoma",
    "Tennessee",
    "Texas",
    "Utah",
    "Virginia",
    "Washington",
)

SECTION_HEADING_RE = re.compile(
    r"^\s*(?:(?:section|article)\s+)?(?:\d+(?:\.\d+)*[\.)]?\s+)?([A-Z][A-Za-z0-9 &/,\-]{2,80})\s*$"
)


def _text(v: Any) -> str:
    return str(v or "").strip()


def _low(v: Any) -> str:
    return _text(v).lower()


def _model_or_dict_get(obj: Any, key: str, default: Any = None) -> Any:
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _intelligence_terms(agreement_intelligence: Any) -> Any:
    return _model_or_dict_get(agreement_intelligence, "extracted_terms", {}) or {}


def _party_names(agreement_intelligence: Any) -> List[str]:
    terms = _intelligence_terms(agreement_intelligence)
    parties = _list(_model_or_dict_get(terms, "parties", []))
    names: List[str] = []
    for p in parties:
        name = _text(_model_or_dict_get(p, "name", ""))
        if len(name) >= 2 and name.lower() not in {"client", "provider", "service provider", "party"}:
            names.append(name)
    roles = _list(_model_or_dict_get(terms, "party_roles", []))
    for r in roles:
        name = _text(_model_or_dict_get(r, "party_name", ""))
        if len(name) >= 2 and name.lower() not in {"client", "provider", "service provider", "party"}:
            names.append(name)
    return list(dict.fromkeys(names))


def _governing_law_from_intelligence_or_intake(agreement_intelligence: Any, original_intake: str) -> str:
    terms = _intelligence_terms(agreement_intelligence)
    gov = _text(_model_or_dict_get(terms, "governing_law", ""))
    if gov:
        return gov
    return extract_supplied_governing_law(original_intake or "")


def _has_named_parties(draft: str, original_intake: str, agreement_intelligence: Any) -> bool:
    names = _party_names(agreement_intelligence)
    if len(names) >= 2:
        hits = sum(1 for n in names if re.search(re.escape(n), draft, re.I))
        if hits >= 2:
            return True
    if re.search(r"\bbetween\s+[A-Z][A-Za-z0-9 &'.,-]{2,80}\s+and\s+[A-Z][A-Za-z0-9 &'.,-]{2,80}", draft):
        return True
    return bool(
        re.search(r"\b(Client|Customer)\b", draft)
        and re.search(r"\b(Service Provider|Provider|Contractor|Vendor)\b", draft)
        and re.search(r"\b(Client|Customer|Provider|Contractor|Vendor)\b", original_intake, re.I)
    )


def _minimum_elements(draft: str, original_intake: str, agreement_intelligence: Any) -> MinimumContractElements:
    blob = f"{draft}\n{original_intake}"
    return MinimumContractElements(
        identifiable_parties=_has_named_parties(draft, original_intake, agreement_intelligence),
        agreement_purpose_or_scope=bool(
            re.search(
                r"\b(scope|services?|goods?|deliverables?|collaboration|consulting|license|automation|support|work)\b",
                blob,
                re.I,
            )
        ),
        exchange_of_value_or_consideration=bool(
            re.search(
                r"\$[\d,]+|\b(payment|fee|fees|compensation|consideration|invoice|retainer|milestone|in exchange for)\b",
                blob,
                re.I,
            )
        ),
        obligations_or_performance=bool(
            re.search(r"\b(shall|will|must|agrees? to|provide|deliver|perform|pay|support|maintain)\b", draft, re.I)
        ),
        execution_or_acceptance_mechanism=bool(
            re.search(r"\b(signature|signed|execution|execute|electronic signatures?|counterparts?|accepted by|acceptance)\b", draft, re.I)
        ),
    )


def _heading_lines(draft: str) -> List[tuple[int, str]]:
    out: List[tuple[int, str]] = []
    for i, line in enumerate(draft.replace("\r\n", "\n").split("\n")):
        s = line.strip()
        if not s or len(s) > 110:
            continue
        if SECTION_HEADING_RE.match(s) and not s.endswith("."):
            out.append((i, s))
    return out


def _empty_required_sections(draft: str) -> List[str]:
    lines = draft.replace("\r\n", "\n").split("\n")
    headings = _heading_lines(draft)
    bad: List[str] = []
    watched = re.compile(r"\b(confidentiality|termination|payment|fees?|scope|ownership|notices?|governing law)\b", re.I)
    heading_indices = {i for i, _ in headings}
    for i, heading in headings:
        if not watched.search(heading):
            continue
        body_tokens = 0
        for j in range(i + 1, min(len(lines), i + 5)):
            if j in heading_indices:
                break
            body_tokens += len(re.findall(r"\b\w+\b", lines[j]))
        if body_tokens < 4:
            bad.append(heading)
    return bad


def _placeholder_failures(draft: str) -> List[AgreementValidationFailure]:
    checks = [
        ("placeholder_tbd", r"\b(TBD|to be agreed|to be determined|insert\s+(?:here|date|amount|name))\b"),
        ("fallback_applicable_party", r"\bapplicable Party\b"),
        ("duplicated_total_fee_phrase", r"\btotal fee of total fee\b"),
        ("unresolved_bracket_placeholder", r"\[[A-Z _-]{3,}\]|\[[^\]]*(?:insert|tbd|name|amount|date)[^\]]*\]"),
    ]
    failures: List[AgreementValidationFailure] = []
    for code, pat in checks:
        if re.search(pat, draft, re.I):
            failures.append(
                AgreementValidationFailure(
                    code=code,
                    message=f"Draft contains unresolved placeholder or fallback artifact: {code}.",
                )
            )
    return failures


def _governing_law_failure(draft: str, original_intake: str, agreement_intelligence: Any) -> Optional[AgreementValidationFailure]:
    gov = _governing_law_from_intelligence_or_intake(agreement_intelligence, original_intake)
    if not gov:
        return None
    law_window = re.search(r"(.{0,80}(?:governing law|governed by|laws of).{0,120})", draft, re.I | re.S)
    if re.search(r"\bgoverning law\b.{0,80}\b(to be agreed|TBD|to be determined)\b", draft, re.I | re.S):
        return AgreementValidationFailure(
            code="governing_law_placeholder",
            message="Intake or intelligence supplies governing law, but draft leaves governing law unresolved.",
        )
    if not re.search(re.escape(gov), draft, re.I):
        return AgreementValidationFailure(
            code="governing_law_missing_or_mismatch",
            message="Draft does not reflect the governing law supplied by intake or agreement intelligence.",
        )
    if law_window:
        states = [s for s in STATE_NAMES if re.search(re.escape(s), law_window.group(1), re.I)]
        if states and not any(s.lower() == gov.lower() for s in states):
            return AgreementValidationFailure(
                code="governing_law_mismatch",
                message="Draft governing law appears to contradict the supplied governing law.",
            )
    return None


def _fee_structure_findings(draft: str, original_intake: str) -> tuple[List[AgreementValidationFailure], List[AgreementValidationWarning]]:
    failures: List[AgreementValidationFailure] = []
    warnings: List[AgreementValidationWarning] = []
    net_days = sorted(set(re.findall(r"\bNet\s+(\d{1,3})\b", draft, re.I)))
    if len(net_days) > 1:
        failures.append(
            AgreementValidationFailure(
                code="conflicting_payment_timing",
                message="Draft contains conflicting Net payment timing values.",
            )
        )
    intake_fixed_fee = bool(re.search(r"\b(total|fixed|flat)\s+(?:fee|amount)|\$[\d,]+", original_intake, re.I))
    draft_monthly = bool(re.search(r"\bmonthly invoice|per month|/month|monthly fee\b", draft, re.I))
    intake_monthly = bool(re.search(r"\bmonthly|per month|/month|support\b", original_intake, re.I))
    if intake_fixed_fee and draft_monthly and not intake_monthly:
        warnings.append(
            AgreementValidationWarning(
                code="possible_unrelated_monthly_fee_language",
                message="Draft includes monthly fee language not clearly requested in the intake.",
            )
        )
    amounts = sorted(set(re.findall(r"\$[\d,]+(?:\.\d{2})?", draft)))
    intake_amounts = sorted(set(re.findall(r"\$[\d,]+(?:\.\d{2})?", original_intake)))
    if len(amounts) >= 3 and intake_amounts and not set(amounts).intersection(intake_amounts):
        warnings.append(
            AgreementValidationWarning(
                code="payment_amounts_not_traceable_to_intake",
                message="Draft payment amounts may not trace to intake amounts.",
            )
        )
    return failures, warnings


def _broken_numbering_or_references(draft: str) -> List[AgreementValidationWarning]:
    warnings: List[AgreementValidationWarning] = []
    top_numbers = [int(x) for x in re.findall(r"^\s*(\d+)[\.)]\s+[A-Za-z]", draft, re.M)]
    if top_numbers:
        expected = list(range(top_numbers[0], top_numbers[0] + len(top_numbers)))
        if top_numbers != expected:
            warnings.append(
                AgreementValidationWarning(
                    code="non_sequential_numbering",
                    message="Draft section numbering appears non-sequential.",
                )
            )
    refs = set(re.findall(r"\bSection\s+(\d+(?:\.\d+)*)\b", draft, re.I))
    defined = set(re.findall(r"^\s*(\d+(?:\.\d+)*)[\.)]\s+", draft, re.M))
    missing = sorted(r for r in refs if r not in defined)
    if missing:
        warnings.append(
            AgreementValidationWarning(
                code="possibly_missing_section_reference",
                message=f"Draft references section(s) not clearly present: {', '.join(missing[:5])}.",
            )
        )
    return warnings


def _repeated_artifact_warnings(draft: str) -> List[AgreementValidationWarning]:
    normalized_lines: Dict[str, int] = {}
    for line in draft.splitlines():
        s = re.sub(r"^[\s*\-\d\.\)\(a-z]+", "", line.strip())
        s = re.sub(r"\s+", " ", s).strip().lower()
        if len(s) < 40:
            continue
        normalized_lines[s] = normalized_lines.get(s, 0) + 1
    repeated = [s for s, count in normalized_lines.items() if count >= 3]
    if repeated:
        return [
            AgreementValidationWarning(
                code="repeated_artifact_text",
                message="Draft repeats identical or near-identical operative text multiple times.",
            )
        ]
    return []


def _requested_concept_failures(draft: str, original_intake: str) -> List[AgreementValidationFailure]:
    checks = [
        ("requested_confidentiality_missing", r"\bconfidential|non[- ]?disclosure|nda\b", r"\bconfidential"),
        ("requested_notices_missing", r"\bnotices?|email notices?\b", r"\bnotices?\b|\bemail\b"),
        ("requested_ownership_missing", r"\bownership|owns?|pre-existing|background IP|retained materials?\b", r"\bownership|owns?|pre-existing|background\b"),
        ("requested_termination_missing", r"\bterminat|notice period|30[- ]day notice\b", r"\bterminat|notice\b"),
        ("requested_e_sign_missing", r"\belectronic signatures?|e-?sign|counterparts?\b", r"\belectronic signatures?|electronically|counterparts?|signatures?\b"),
        (
            "requested_third_party_dependency_disclaimer_missing",
            r"\bthird[- ]party|uptime|AI platform|dependency\b",
            r"\bthird[- ]party|uptime|AI platform|dependency|does not guarantee\b",
        ),
    ]
    failures: List[AgreementValidationFailure] = []
    for code, intake_pat, draft_pat in checks:
        if re.search(intake_pat, original_intake, re.I) and not re.search(draft_pat, draft, re.I):
            failures.append(
                AgreementValidationFailure(
                    code=code,
                    message=f"Draft appears to omit a concept explicitly requested in the intake: {code}.",
                )
            )
    return failures


def _quality_warnings(draft: str) -> List[AgreementValidationWarning]:
    warnings: List[AgreementValidationWarning] = []
    if not re.search(r"\bacceptance criteria|accepted when|approval\b", draft, re.I):
        warnings.append(
            AgreementValidationWarning(
                code="undefined_acceptance_criteria",
                message="Acceptance criteria are not clearly defined; this may be acceptable for simple deals.",
                severity="low",
            )
        )
    if len(draft) < 900:
        warnings.append(
            AgreementValidationWarning(
                code="concise_agreement_sparse_detail",
                message="Agreement is concise; operational detail may be sparse but can still be signer-ready.",
                severity="low",
            )
        )
    return warnings


def validatePremiumAgreementDraft(
    *,
    authoritativeDraft: str,
    agreementIntelligence: Any,
    originalIntake: str,
) -> AgreementValidationResult:
    draft = _text(authoritativeDraft)
    intake = _text(originalIntake)
    failures: List[AgreementValidationFailure] = []
    warnings: List[AgreementValidationWarning] = []

    minimum = _minimum_elements(draft, intake, agreementIntelligence)
    if not draft:
        failures.append(AgreementValidationFailure(code="empty_authoritative_draft", message="Authoritative draft is empty."))

    minimum_map = minimum.model_dump()
    for key, ok in minimum_map.items():
        if not ok:
            failures.append(
                AgreementValidationFailure(
                    code=f"missing_minimum_contract_element:{key}",
                    message=f"Draft does not clearly contain minimum structural element: {key}.",
                )
            )

    for heading in _empty_required_sections(draft):
        failures.append(
            AgreementValidationFailure(
                code="empty_required_section",
                message="Draft contains a required section heading with no meaningful body.",
                section=heading,
            )
        )

    failures.extend(_placeholder_failures(draft))

    gov_fail = _governing_law_failure(draft, intake, agreementIntelligence)
    if gov_fail is not None:
        failures.append(gov_fail)

    fee_failures, fee_warnings = _fee_structure_findings(draft, intake)
    failures.extend(fee_failures)
    warnings.extend(fee_warnings)
    warnings.extend(_broken_numbering_or_references(draft))
    warnings.extend(_repeated_artifact_warnings(draft))
    failures.extend(_requested_concept_failures(draft, intake))
    warnings.extend(_quality_warnings(draft))

    seen_failures = set()
    unique_failures: List[AgreementValidationFailure] = []
    for f in failures:
        key = (f.code, f.section)
        if key not in seen_failures:
            seen_failures.add(key)
            unique_failures.append(f)

    seen_warnings = set()
    unique_warnings: List[AgreementValidationWarning] = []
    for w in warnings:
        key = (w.code, w.section)
        if key not in seen_warnings:
            seen_warnings.add(key)
            unique_warnings.append(w)

    summary = AgreementValidationSummary(
        failure_count=len(unique_failures),
        warning_count=len(unique_warnings),
        checked_at=datetime.now(timezone.utc).isoformat(),
    )
    return AgreementValidationResult(
        passed=len(unique_failures) == 0,
        failures=unique_failures,
        warnings=unique_warnings,
        minimum_contract_elements=minimum,
        summary=summary,
    )


def validate_premium_agreement_draft(
    *,
    authoritative_draft: str,
    agreement_intelligence: Any,
    original_intake: str,
) -> AgreementValidationResult:
    return validatePremiumAgreementDraft(
        authoritativeDraft=authoritative_draft,
        agreementIntelligence=agreement_intelligence,
        originalIntake=original_intake,
    )

