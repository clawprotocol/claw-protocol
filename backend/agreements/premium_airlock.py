"""
LawDog premium full-draft airlock helpers.

Narrows ``agreement_outbound`` evaluation to user-origin drafting inputs (not model
echoes inside repair payloads) and provides an explicit allow-path for ordinary
commercial agreement generation requests.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Final, Literal, Optional

from backend.security.privilege_policy import (
    AirlockPolicyProfile,
    PrivilegePolicyDecision,
    evaluate_privilege_policy,
    first_privilege_airlock_block_diagnostic,
)

log = logging.getLogger("claw.backend.premium_airlock")

PremiumWireClass = Literal[
    "premium_full_draft",
    "premium_repair",
    "premium_sanitized_retry",
    "non_premium_json",
    "non_json",
]

# High-signal intake that must never bypass airlock (legal advice / litigation posture).
_UNSAFE_INTAKE_PHRASES: Final[tuple[str, ...]] = (
    "litigation strategy",
    "lawsuit strategy",
    "discovery strategy",
    "defense strategy",
    "claim analysis",
    "opposing counsel",
    "attorney-client privilege",
    "attorney client privilege",
    "work product doctrine",
    "work-product doctrine",
    "litigation hold",
    "deposition preparation",
    "criminal defense",
    "pending lawsuit",
    "pending litigation",
    "active lawsuit",
    "active litigation",
    "witness interview",
    "file a lawsuit",
    "tax evasion",
    "money laundering",
    "how do i get away with",
    "how to get away with",
    "avoid paying taxes illegally",
    "forge signature",
    "death threat",
)

_UNSAFE_INTAKE_PATTERNS: Final[tuple[re.Pattern[str], ...]] = tuple(
    re.compile(rf"\b{re.escape(p)}\b", re.IGNORECASE) for p in _UNSAFE_INTAKE_PHRASES
)

_AGREEMENT_DRAFT_SIGNAL: Final[re.Pattern[str]] = re.compile(
    r"\b("
    r"agreement|contract|reseller|white[-\s]?label|saas|licensee|licensor|"
    r"indemnif|governing\s+law|services\s+agreement|master\s+services|"
    r"statement\s+of\s+work|msa|nda|non[-\s]?disclosure|lease|promissory|"
    r"employment|consulting|deliverables|payment\s+terms|milestone"
    r")\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class PremiumAirlockDecision:
    """Outcome of premium-scoped agreement_outbound airlock routing."""

    request_class: PremiumWireClass
    allowed: bool
    reason_code: str
    policy: PrivilegePolicyDecision
    evaluation_text_chars: int
    intake_chars: int


def _collapse(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _unsafe_intake_hit(text: str) -> Optional[str]:
    for pat in _UNSAFE_INTAKE_PATTERNS:
        m = pat.search(text)
        if m:
            return m.group(0).lower()
    return None


def _classify_premium_wire(payload: dict[str, Any]) -> PremiumWireClass:
    if payload.get("repair_task"):
        return "premium_repair"
    if "intake" in payload and (
        "scenario_category" in payload
        or "context" in payload
        or "deterministic_premium_intent_key" in payload
        or "deterministic_premium_intent_skeleton" in payload
    ):
        return "premium_full_draft"
    if "intake" in payload and "scenario_category" in payload:
        return "premium_sanitized_retry"
    if "intake" in payload:
        return "premium_full_draft"
    return "non_premium_json"


def _json_field_text(value: Any, *, max_chars: int = 48_000) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value[:max_chars]
    try:
        return json.dumps(value, ensure_ascii=False)[:max_chars]
    except (TypeError, ValueError):
        return str(value)[:max_chars]


def extract_user_origin_text_for_premium_airlock(payload: dict[str, Any]) -> str:
    """
    Build policy-evaluation text from user-origin premium wire fields only.

    Excludes model-generated ``rejected_pro_draft.document_text`` so repair passes
    are not blocked by hallucinated litigation tokens in a prior draft.
    """
    parts: list[str] = []
    intake = _collapse(str(payload.get("intake") or payload.get("original_user_prompt") or ""))
    if intake:
        parts.append(intake)
    uga = _collapse(str(payload.get("user_gap_answers") or ""))
    if uga:
        parts.append(uga)
    regen = _collapse(str(payload.get("regeneration_directive") or ""))
    if regen:
        parts.append(regen)
    ctx = payload.get("context")
    if isinstance(ctx, dict):
        parts.append(_json_field_text(ctx, max_chars=32_000))
    skel = payload.get("deterministic_premium_intent_skeleton")
    if skel is not None:
        parts.append(_json_field_text(skel, max_chars=12_000))
    for key in (
        "scenario_category",
        "scenario_category_signals",
        "rejection_reasons",
        "missing_material_asks",
        "premium_intent_key",
        "deterministic_premium_intent_key",
    ):
        val = payload.get(key)
        if val is not None:
            parts.append(_json_field_text(val, max_chars=8_000))
    free_ref = _collapse(str(payload.get("free_draft_reference_text") or ""))
    if free_ref:
        parts.append(free_ref[:24_000])
    rejected = payload.get("rejected_pro_draft")
    if isinstance(rejected, dict):
        # Title / family only — not document body.
        parts.append(_collapse(str(rejected.get("title") or "")))
        parts.append(_collapse(str(rejected.get("agreement_family") or "")))
    return "\n\n".join(p for p in parts if p)


def _user_intake_only_text(payload: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in ("intake", "original_user_prompt", "user_gap_answers"):
        t = _collapse(str(payload.get(key) or ""))
        if t:
            parts.append(t)
    return "\n\n".join(parts)


def is_lawdog_premium_agreement_drafting_request(
    evaluation_text: str,
    payload: dict[str, Any],
) -> bool:
    """
    True when the user is asking for commercial agreement drafting (not legal advice).

    Requires agreement-generation cues in intake/original prompt and no unsafe intake phrases.
    """
    intake_only = _user_intake_only_text(payload)
    if not intake_only or len(intake_only) < 24:
        return False
    if _unsafe_intake_hit(intake_only):
        return False
    if not _AGREEMENT_DRAFT_SIGNAL.search(intake_only):
        return False
    # Secondary check on broader evaluation text (context), still excluding rejected body.
    if _unsafe_intake_hit(evaluation_text):
        return False
    return True


def _allow_policy_decision() -> PrivilegePolicyDecision:
    return PrivilegePolicyDecision(
        is_legal_sensitive=False,
        is_privileged_candidate=False,
        requires_protected_mode=False,
        allow_external_ai=True,
        allow_raw_upload_to_ai=True,
        reason_codes=(),
    )


def assess_premium_agreement_outbound_airlock(
    raw_wire_text: str,
    *,
    policy_profile: AirlockPolicyProfile,
) -> Optional[PremiumAirlockDecision]:
    """
    Premium-scoped ``agreement_outbound`` evaluation.

    Returns ``None`` when ``raw_wire_text`` is not a premium JSON wire (caller uses default path).
    """
    if policy_profile != "agreement_outbound":
        return None

    stripped = raw_wire_text.strip()
    if not stripped:
        return None

    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError:
        return PremiumAirlockDecision(
            request_class="non_json",
            allowed=False,
            reason_code="non_json_default_policy",
            policy=evaluate_privilege_policy(stripped, policy_profile=policy_profile),
            evaluation_text_chars=len(stripped),
            intake_chars=0,
        )

    if not isinstance(parsed, dict):
        return None

    wire_class = _classify_premium_wire(parsed)
    if wire_class == "non_premium_json":
        return None

    eval_text = extract_user_origin_text_for_premium_airlock(parsed)
    intake_chars = len(_collapse(str(parsed.get("intake") or parsed.get("original_user_prompt") or "")))

    policy = evaluate_privilege_policy(eval_text or stripped, policy_profile=policy_profile)

    unsafe = _unsafe_intake_hit(_user_intake_only_text(parsed))
    if unsafe:
        log.warning(
            "[premium-airlock-blocked] request_class=%s allow=0 reason=unsafe_intake rule=%s "
            "evaluation_text_chars=%s intake_chars=%s",
            wire_class,
            unsafe.replace(" ", "_"),
            len(eval_text),
            intake_chars,
        )
        return PremiumAirlockDecision(
            request_class=wire_class,
            allowed=False,
            reason_code=f"unsafe_intake:{unsafe.replace(' ', '_')}",
            policy=policy,
            evaluation_text_chars=len(eval_text),
            intake_chars=intake_chars,
        )

    drafting_allowed = is_lawdog_premium_agreement_drafting_request(eval_text, parsed)
    if drafting_allowed and not policy.requires_protected_mode:
        log.info(
            "[premium-airlock-allowed-agreement-draft] request_class=%s reason=policy_clear "
            "evaluation_text_chars=%s intake_chars=%s",
            wire_class,
            len(eval_text),
            intake_chars,
        )
        return PremiumAirlockDecision(
            request_class=wire_class,
            allowed=True,
            reason_code="allowed_commercial_draft",
            policy=_allow_policy_decision(),
            evaluation_text_chars=len(eval_text),
            intake_chars=intake_chars,
        )

    if drafting_allowed and policy.requires_protected_mode:
        # User-origin commercial drafting; do not block on model echo / routine clause tokens.
        log.info(
            "[premium-airlock-allowed-agreement-draft] request_class=%s reason=drafting_allow_path "
            "policy_codes=%s evaluation_text_chars=%s intake_chars=%s",
            wire_class,
            ",".join(policy.reason_codes) if policy.reason_codes else "",
            len(eval_text),
            intake_chars,
        )
        return PremiumAirlockDecision(
            request_class=wire_class,
            allowed=True,
            reason_code="allowed_agreement_draft_override",
            policy=_allow_policy_decision(),
            evaluation_text_chars=len(eval_text),
            intake_chars=intake_chars,
        )

    if policy.requires_protected_mode:
        diag = first_privilege_airlock_block_diagnostic(eval_text or stripped, policy_profile=policy_profile)
        rule = diag.matched_rule_id if diag is not None else "unknown"
        log.warning(
            "[premium-airlock-blocked] request_class=%s allow=0 reason=policy_block rule=%s "
            "evaluation_text_chars=%s intake_chars=%s",
            wire_class,
            rule,
            len(eval_text),
            intake_chars,
        )
        return PremiumAirlockDecision(
            request_class=wire_class,
            allowed=False,
            reason_code=f"policy_block:{rule}",
            policy=policy,
            evaluation_text_chars=len(eval_text),
            intake_chars=intake_chars,
        )

    log.info(
        "[premium-airlock-decision] request_class=%s allow=1 reason=policy_clear "
        "evaluation_text_chars=%s intake_chars=%s",
        wire_class,
        len(eval_text),
        intake_chars,
    )
    return PremiumAirlockDecision(
        request_class=wire_class,
        allowed=True,
        reason_code="policy_clear",
        policy=policy,
        evaluation_text_chars=len(eval_text),
        intake_chars=intake_chars,
    )


def log_premium_airlock_decision_for_route(
    decision: PremiumAirlockDecision,
    *,
    airlock_route: str,
) -> None:
    log.info(
        "[premium-airlock-decision] route=%s request_class=%s allow=%s reason=%s "
        "evaluation_text_chars=%s intake_chars=%s policy_codes=%s",
        airlock_route,
        decision.request_class,
        int(decision.allowed),
        decision.reason_code,
        decision.evaluation_text_chars,
        decision.intake_chars,
        ",".join(decision.policy.reason_codes) if decision.policy.reason_codes else "",
    )
