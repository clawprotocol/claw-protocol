"""
Pre-LLM AI airlock: deterministic policy-first transform before external model calls.

No I/O, logging, or persistence. Outbound payloads must never echo raw input when blocked.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from backend.config.external_ai_policy import is_non_production_external_ai_bypass_active

from .privilege_policy import PrivilegePolicyDecision, evaluate_privilege_policy
from .redaction import RedactionResult, redact_text

# Conservative cap for outbound excerpt size; easy to tune or inject later.
_DEFAULT_MAX_MINIMIZED_CHARS: int = 4096

# Stable block reason for external-AI path when policy demands protected handling.
BLOCK_REASON_PROTECTED_MODE_EXTERNAL_AI: str = "PROTECTED_MODE_EXTERNAL_AI"


@dataclass(frozen=True)
class AIAirlockResult:
    """Structured outcome of airlock evaluation and transforms."""

    policy_decision: PrivilegePolicyDecision
    redacted_text: str
    minimized_text: str
    blocked: bool
    block_reason: str | None
    transformation_summary: tuple[str, ...] = field(default_factory=tuple)
    original_length: int = 0
    redacted_length: int = 0
    minimized_length: int = 0


def _external_ai_blocked(decision: PrivilegePolicyDecision) -> bool:
    """True when external AI must not receive workflow text (default-deny under protected mode)."""
    return decision.requires_protected_mode or not decision.allow_external_ai


def minimize_for_airlock(
    text: str,
    max_chars: int = _DEFAULT_MAX_MINIMIZED_CHARS,
) -> str:
    """
    Deterministic bounded excerpt: strip, then cap length with a mild word-boundary preference.
    """
    trimmed = text.strip()
    if not trimmed:
        return ""
    if len(trimmed) <= max_chars:
        return trimmed
    excerpt = trimmed[:max_chars]
    # Prefer breaking near the end on whitespace when a reasonable cut exists.
    search_start = max(0, max_chars - 120)
    cut = excerpt.rfind(" ", search_start)
    if cut > max_chars // 2:
        return excerpt[:cut].rstrip()
    return excerpt.rstrip()


def _append_redaction_summary(
    summary: list[str],
    redaction: RedactionResult,
) -> None:
    summary.append("redaction_applied")
    if redaction.redaction_categories:
        cats = ",".join(sorted(redaction.redaction_categories))
        summary.append(f"redaction_categories:{cats}")


def run_ai_airlock(
    text: str,
    *,
    max_minimized_chars: int = _DEFAULT_MAX_MINIMIZED_CHARS,
) -> AIAirlockResult:
    """
    Evaluate privilege policy, then redact and minimize when allowed for external AI.

    When blocked, safe outbound fields are empty; raw input is not copied into outputs.
    """
    original_length = len(text)
    policy = evaluate_privilege_policy(text)
    summary: list[str] = ["privilege_policy_evaluated"]

    if _external_ai_blocked(policy):
        if is_non_production_external_ai_bypass_active():
            # local/staging: allow through to redaction + minimization; never skip pre-OpenAI hardening
            summary.append("non_production_bypass:continuing_to_redact_minimize")
        else:
            summary.append("blocked_before_transform")
            if policy.reason_codes:
                codes = ",".join(policy.reason_codes)
                summary.append(f"policy_reason_codes:{codes}")
            return AIAirlockResult(
                policy_decision=policy,
                redacted_text="",
                minimized_text="",
                blocked=True,
                block_reason=BLOCK_REASON_PROTECTED_MODE_EXTERNAL_AI,
                transformation_summary=tuple(summary),
                original_length=original_length,
                redacted_length=0,
                minimized_length=0,
            )

    redaction = redact_text(text)
    redacted_text = redaction.redacted_text
    minimized_text = minimize_for_airlock(redacted_text, max_chars=max_minimized_chars)
    _append_redaction_summary(summary, redaction)
    summary.append("minimization_applied")
    redacted_stripped = redacted_text.strip()
    if minimized_text != redacted_stripped:
        summary.append("minimization_truncated")

    return AIAirlockResult(
        policy_decision=policy,
        redacted_text=redacted_text,
        minimized_text=minimized_text,
        blocked=False,
        block_reason=None,
        transformation_summary=tuple(summary),
        original_length=original_length,
        redacted_length=len(redacted_text),
        minimized_length=len(minimized_text),
    )
