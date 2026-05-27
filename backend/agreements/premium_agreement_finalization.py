"""Conditional second-pass finalization for LawDog Pro agreements.

This module is intentionally not wired into the public API yet. It provides the
backend repair/finalization engine that can be called once the product flow is
ready to submit user clarification answers.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Callable, Dict, List, Literal, Mapping, Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.agreements.premium_agreement_validation import (
    AgreementValidationResult,
    validatePremiumAgreementDraft,
)
from backend.llm_router import call_legal_llm, resolve_llm_model_for_access_class

log = logging.getLogger(__name__)

FinalizationReason = Literal[
    "not_needed",
    "validation_failed",
    "clarifications_answered",
    "conflicts_or_ambiguities",
    "forced",
]


class PremiumFinalizationResult(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    finalized: bool
    reason: FinalizationReason
    document_text: str
    agreement_validation: AgreementValidationResult
    agreement_intelligence: Any = Field(default_factory=dict)
    model_call_count: int = 0
    repair_attempted: bool = False
    repair_succeeded: bool = False


LegalLlmFn = Callable[..., str]


def _as_dict(value: Any) -> Dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        dumped = value.model_dump()
        return dumped if isinstance(dumped, dict) else {}
    return {}


def _as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _text(value: Any) -> str:
    return str(value or "").strip()


def _non_empty_clarification_answers(clarification_answers: Any) -> bool:
    if clarification_answers is None:
        return False
    if isinstance(clarification_answers, Mapping):
        return any(_text(v) for v in clarification_answers.values())
    if isinstance(clarification_answers, list):
        for item in clarification_answers:
            if isinstance(item, Mapping):
                if _text(item.get("answer") or item.get("value") or item.get("response")):
                    return True
            elif _text(item):
                return True
    return bool(_text(clarification_answers))


def _has_resolution_required_intelligence(agreement_intelligence: Any) -> bool:
    intel = _as_dict(agreement_intelligence)
    for key in ("conflicts", "ambiguities"):
        for item in _as_list(intel.get(key)):
            if not isinstance(item, Mapping):
                continue
            severity = _text(item.get("severity")).lower()
            if severity in {"high", "medium", "material"}:
                return True
            if _text(item.get("description")) or _text(item.get("topic")):
                return True
    return False


def _validation_for(
    *,
    document_text: str,
    agreement_intelligence: Any,
    original_intake: str,
    agreement_validation: AgreementValidationResult | None = None,
) -> AgreementValidationResult:
    if agreement_validation is not None:
        return agreement_validation
    return validatePremiumAgreementDraft(
        authoritativeDraft=document_text,
        agreementIntelligence=agreement_intelligence,
        originalIntake=original_intake,
    )


def _finalization_reason(
    *,
    agreement_validation: AgreementValidationResult,
    agreement_intelligence: Any,
    clarification_answers: Any,
    force_finalize: bool,
) -> FinalizationReason:
    if force_finalize:
        return "forced"
    if not agreement_validation.passed:
        return "validation_failed"
    if _non_empty_clarification_answers(clarification_answers):
        return "clarifications_answered"
    if _has_resolution_required_intelligence(agreement_intelligence):
        return "conflicts_or_ambiguities"
    return "not_needed"


def _model_safe_validation(validation: AgreementValidationResult) -> Dict[str, Any]:
    data = validation.model_dump()
    data["failures"] = data.get("failures", [])[:12]
    data["warnings"] = data.get("warnings", [])[:12]
    return data


def build_premium_finalization_system_prompt() -> str:
    return """
You are LawDog Pro's second-pass agreement finalization engine.

Return ONLY a valid JSON object with this shape:
{
  "authoritative_draft": "signer-ready final agreement text",
  "agreement_intelligence": { ...updated agreement intelligence if useful... }
}

Rules:
- Preserve all explicit terms supplied in the original intake.
- Incorporate all user clarification answers.
- Fix every deterministic validation failure and relevant warning.
- Remove unresolved placeholders, TBDs, empty sections, and drafting artifacts.
- Remove duplicate or conflicting clauses; choose the clarified or intake-consistent term.
- Repair numbering, section references, and signature block structure.
- Assign named party roles consistently throughout the document.
- Preserve governing law.
- Preserve payment structure.
- Produce a complete signer-ready final agreement.
- Do not include commentary, markdown fences, explanations, or analysis.
""".strip()


def _build_finalization_user_payload(
    *,
    original_intake: str,
    first_draft: str,
    agreement_intelligence: Any,
    agreement_validation: AgreementValidationResult,
    clarification_answers: Any,
    reason: FinalizationReason,
) -> Dict[str, Any]:
    return {
        "finalization_reason": reason,
        "original_intake": original_intake[:80_000],
        "first_draft": first_draft[:200_000],
        "agreement_intelligence": _as_dict(agreement_intelligence),
        "agreement_validation": _model_safe_validation(agreement_validation),
        "clarification_answers": clarification_answers or {},
        "output_contract": {
            "authoritative_draft": "string; final signer-ready agreement only",
            "agreement_intelligence": "object; updated extracted terms/conflicts/ambiguities/questions if changed",
        },
    }


def _extract_json_object(text: str) -> Dict[str, Any]:
    raw = _text(text)
    if raw.startswith("```"):
        lines = raw.splitlines()
        if lines:
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        raw = "\n".join(lines).strip()
    if not raw.startswith("{") or not raw.endswith("}"):
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            raw = raw[start : end + 1]
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("premium_finalization_response_not_object")
    return parsed


def _document_from_finalization_payload(parsed: Dict[str, Any]) -> str:
    for key in ("authoritative_draft", "document_text", "final_agreement", "finalized_agreement"):
        value = _text(parsed.get(key))
        if value:
            return value[:200_000]
    return ""


def _log_finalization_summary(
    *,
    reason: FinalizationReason,
    model_call_count: int,
    initial_validation: AgreementValidationResult,
    final_validation: AgreementValidationResult,
    repair_succeeded: bool,
) -> None:
    log.info(
        "[premium-finalization] reason=%s model_call_count=%d initial_validation_passed=%s "
        "initial_failure_count=%d final_validation_passed=%s final_failure_count=%d repair_succeeded=%s",
        reason,
        model_call_count,
        initial_validation.passed,
        initial_validation.summary.failure_count,
        final_validation.passed,
        final_validation.summary.failure_count,
        repair_succeeded,
    )


def finalize_premium_agreement_if_needed(
    *,
    original_intake: str,
    first_draft: str,
    agreement_intelligence: Any,
    agreement_validation: AgreementValidationResult | None,
    clarification_answers: Any = None,
    force_finalize: bool = False,
    call_legal_llm_fn: LegalLlmFn | None = None,
    llm_model: str | None = None,
) -> PremiumFinalizationResult:
    """Run a second OpenAI pass only when validation, answers, or intelligence require it."""

    initial_validation = _validation_for(
        document_text=first_draft,
        agreement_intelligence=agreement_intelligence,
        original_intake=original_intake,
        agreement_validation=agreement_validation,
    )
    reason = _finalization_reason(
        agreement_validation=initial_validation,
        agreement_intelligence=agreement_intelligence,
        clarification_answers=clarification_answers,
        force_finalize=force_finalize,
    )

    if reason == "not_needed":
        _log_finalization_summary(
            reason=reason,
            model_call_count=0,
            initial_validation=initial_validation,
            final_validation=initial_validation,
            repair_succeeded=False,
        )
        return PremiumFinalizationResult(
            finalized=False,
            reason=reason,
            document_text=first_draft,
            agreement_validation=initial_validation,
            agreement_intelligence=agreement_intelligence,
            model_call_count=0,
            repair_attempted=False,
            repair_succeeded=False,
        )

    llm = call_legal_llm_fn or call_legal_llm
    model = llm_model or resolve_llm_model_for_access_class("premium")
    max_tokens = max(1800, int(os.environ.get("CLAW_PREMIUM_FINALIZATION_MAX_TOKENS", "7000")))
    model_call_count = 0
    final_doc = first_draft
    final_intelligence = agreement_intelligence

    try:
        model_call_count = 1
        llm_text = llm(
            messages=[
                {"role": "system", "content": build_premium_finalization_system_prompt()},
                {
                    "role": "user",
                    "content": json.dumps(
                        _build_finalization_user_payload(
                            original_intake=original_intake,
                            first_draft=first_draft,
                            agreement_intelligence=agreement_intelligence,
                            agreement_validation=initial_validation,
                            clarification_answers=clarification_answers,
                            reason=reason,
                        ),
                        ensure_ascii=False,
                    ),
                },
            ],
            model=model,
            max_tokens=max_tokens,
            temperature=0.1,
            airlock_profile="agreement_outbound",
        )
        parsed = _extract_json_object(llm_text)
        repaired_doc = _document_from_finalization_payload(parsed)
        if not repaired_doc:
            raise ValueError("premium_finalization_missing_authoritative_draft")
        final_doc = repaired_doc
        if isinstance(parsed.get("agreement_intelligence"), dict):
            final_intelligence = parsed["agreement_intelligence"]
    except Exception as exc:
        log.warning(
            "[premium-finalization] response_error reason=%s exc_type=%s model_call_count=%d",
            reason,
            type(exc).__name__,
            model_call_count,
        )

    final_validation = validatePremiumAgreementDraft(
        authoritativeDraft=final_doc,
        agreementIntelligence=final_intelligence,
        originalIntake=original_intake,
    )
    repair_succeeded = final_doc != first_draft and final_validation.passed
    _log_finalization_summary(
        reason=reason,
        model_call_count=model_call_count,
        initial_validation=initial_validation,
        final_validation=final_validation,
        repair_succeeded=repair_succeeded,
    )
    return PremiumFinalizationResult(
        finalized=repair_succeeded,
        reason=reason,
        document_text=final_doc,
        agreement_validation=final_validation,
        agreement_intelligence=final_intelligence,
        model_call_count=model_call_count,
        repair_attempted=True,
        repair_succeeded=repair_succeeded,
    )

