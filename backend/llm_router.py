# backend/llm_router.py

from __future__ import annotations

import os
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from dotenv import load_dotenv
from openai import OpenAI

# Load repo-root .env deterministically (avoids "wrong working directory" issues).
# backend/llm_router.py -> backend/ -> repo root
_REPO_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(dotenv_path=_REPO_ROOT / ".env", override=False)

from backend.security.ai_airlock import run_ai_airlock
from backend.security.privilege_policy import AirlockPolicyProfile, first_privilege_airlock_block_diagnostic


class ExternalAIBlockedError(RuntimeError):
    """
    Raised when the pre-outbound AI airlock blocks a request.
    ``args[0]`` is metadata-safe and must not echo user content.
    """

    def __init__(
        self,
        block_reason: Optional[str] = None,
        *,
        policy_reason_codes: tuple[str, ...] = (),
    ) -> None:
        self.block_reason = block_reason
        self.policy_reason_codes = policy_reason_codes
        code = block_reason or "AIRLOCK_BLOCKED"
        super().__init__(f"external_ai_blocked:{code}")


OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
# When callers omit ``model``, align with BASIC / free tier default (see ``DEFAULT_BASIC_CHAT_MODEL``).
# Public OpenAI only accepts real model ids; set CLAW_LLM_MODEL / CLAW_LLM_MODEL_PREMIUM on Railway.
DEFAULT_MODEL: str = os.getenv("CLAW_LLM_MODEL", "gpt-4o-mini")

# Product tier → concrete chat model id (OpenAI). Env ``CLAW_LLM_MODEL_BASIC`` / ``CLAW_LLM_MODEL_PREMIUM`` override.
# Defaults: valid on api.openai.com. Override in deploy (e.g. gpt-4.1-mini) as needed.
DEFAULT_BASIC_CHAT_MODEL: str = "gpt-4o-mini"
DEFAULT_PREMIUM_CHAT_MODEL: str = "gpt-4o"
ENV_CLAW_LLM_MODEL_BASIC: str = "CLAW_LLM_MODEL_BASIC"
ENV_CLAW_LLM_MODEL_PREMIUM: str = "CLAW_LLM_MODEL_PREMIUM"

# Lazy init client so module import doesn't hard-fail during tests/tools that don't use LLM.
_client: Optional[OpenAI] = None
log = logging.getLogger("claw.backend.llm_router")


def uses_gpt5_chat_tokens_param(model: Optional[str]) -> bool:
    m = (model or "").strip().lower()
    return m.startswith("gpt-5")


def build_chat_completion_tokens_kwargs(model: Optional[str], max_tokens: int) -> Dict[str, int]:
    if uses_gpt5_chat_tokens_param(model):
        return {"max_completion_tokens": int(max_tokens)}
    return {"max_tokens": int(max_tokens)}


def resolve_llm_model_for_access_class(ai_model_class: Optional[str]) -> Optional[str]:
    """
    Map product ``ai_model_class`` to a concrete OpenAI chat model id.

    When this returns ``None``, callers pass ``model=None`` and :func:`call_legal_llm`
    uses ``DEFAULT_MODEL`` (``CLAW_LLM_MODEL``, default ``gpt-4o-mini``).

    - ``basic``: ``CLAW_LLM_MODEL_BASIC`` if set, else ``gpt-4o-mini`` (see ``DEFAULT_BASIC_CHAT_MODEL``).
    - ``premium``: ``CLAW_LLM_MODEL_PREMIUM`` if set, else ``gpt-4o`` (see ``DEFAULT_PREMIUM_CHAT_MODEL``;
      never silently falls back to the same id as ``basic`` when tier env overrides are unset).
    - ``None`` / empty / unknown: ``None`` → caller ``DEFAULT_MODEL``.

    Comparison is case-insensitive for ``basic`` / ``premium`` only.
    """
    if ai_model_class is None:
        return None
    key = str(ai_model_class).strip().lower()
    if not key:
        return None
    if key == "basic":
        m = os.getenv(ENV_CLAW_LLM_MODEL_BASIC, "").strip()
        return m or DEFAULT_BASIC_CHAT_MODEL
    if key == "premium":
        m = os.getenv(ENV_CLAW_LLM_MODEL_PREMIUM, "").strip()
        return m or DEFAULT_PREMIUM_CHAT_MODEL
    # Stronger / distinct pass (e.g. dissimilarity regen from client). Env optional; default = premium id.
    if key in ("premium_regen", "premium_strong", "premium_distinct"):
        m = os.getenv("CLAW_LLM_MODEL_PREMIUM_REGEN", "").strip()
        return m or os.getenv(ENV_CLAW_LLM_MODEL_PREMIUM, "").strip() or DEFAULT_PREMIUM_CHAT_MODEL
    return None


def _get_client() -> OpenAI:
    global _client
    if _client is not None:
        return _client
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not set; cannot call LLM")
    _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


def _user_content_text_for_airlock(content: Any) -> str:
    """Flatten user message content to a single string for airlock evaluation."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for item in content:
            if isinstance(item, dict):
                t = item.get("text")
                if isinstance(t, str):
                    parts.append(t)
            elif isinstance(item, str):
                parts.append(item)
        return "\n".join(parts)
    return ""


def _user_content_with_minimized(original: Any, minimized: str) -> Union[str, List[Dict[str, Any]]]:
    """Rebuild outbound user content using minimized text only (structure best-effort)."""
    if isinstance(original, str):
        return minimized
    if isinstance(original, list):
        return [{"type": "text", "text": minimized}]
    return minimized


def _messages_after_user_airlock(
    messages: List[Dict[str, Any]],
    *,
    airlock_profile: AirlockPolicyProfile = "default",
    airlock_log_context: Optional[str] = None,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    user_idx = 0
    for msg in messages:
        if (msg.get("role") or "") != "user":
            out.append(msg)
            continue
        raw = _user_content_text_for_airlock(msg.get("content"))
        airlock_result = run_ai_airlock(raw, policy_profile=airlock_profile)
        if airlock_result.blocked:
            codes = tuple(airlock_result.policy_decision.reason_codes)
            diag = first_privilege_airlock_block_diagnostic(raw, policy_profile=airlock_profile)
            diag_suffix = ""
            if diag is not None:
                diag_suffix = (
                    f" first_block_reason={diag.reason_code} first_block_category={diag.rule_category}"
                    f" first_block_rule_id={diag.matched_rule_id}"
                )
            route = airlock_log_context or "call_legal_llm"
            log.warning(
                "[claw-ai-airlock] user_message_blocked block_reason=%s policy_reason_codes=%s "
                "airlock_profile=%s airlock_route=%s user_message_index=%s user_content_chars=%s%s",
                airlock_result.block_reason,
                ",".join(codes) if codes else "",
                airlock_profile,
                route,
                user_idx,
                len(raw),
                diag_suffix,
            )
            raise ExternalAIBlockedError(
                airlock_result.block_reason,
                policy_reason_codes=codes,
            )
        new_content = _user_content_with_minimized(msg.get("content"), airlock_result.minimized_text)
        out.append({**msg, "content": new_content})
        user_idx += 1
    return out


def _cached_tokens_from_usage(usage: Any) -> Optional[int]:
    if usage is None:
        return None
    details = getattr(usage, "prompt_tokens_details", None) or getattr(usage, "input_tokens_details", None)
    if details is None and isinstance(usage, dict):
        details = usage.get("prompt_tokens_details") or usage.get("input_tokens_details")
        cached = usage.get("cached_tokens")
        if cached is not None and details is None:
            return cached
    if details is None:
        return getattr(usage, "cached_tokens", None)
    if isinstance(details, dict):
        return details.get("cached_tokens")
    return getattr(details, "cached_tokens", None)


def _privacy_safe_llm_telemetry(record: Dict[str, Any]) -> None:
    """Log per-call metadata only. Never log prompts, completions, emails, or agreement text."""
    log.info(
        "[claw-llm-telemetry] purpose=%s requested_model=%s returned_model=%s "
        "prompt_tokens=%s completion_tokens=%s total_tokens=%s cached_tokens=%s "
        "latency_ms=%s finish_reason=%s repair_status=%s validation_accepted=%s status=%s",
        record.get("call_purpose"),
        record.get("requested_model"),
        record.get("returned_model"),
        record.get("prompt_tokens"),
        record.get("completion_tokens"),
        record.get("total_tokens"),
        record.get("cached_tokens"),
        record.get("latency_ms"),
        record.get("finish_reason"),
        record.get("repair_status"),
        record.get("validation_accepted"),
        record.get("status"),
    )


def call_legal_llm(
    messages: List[Dict[str, Any]],
    model: Optional[str] = None,
    max_tokens: int = 2000,
    temperature: float = 0.0,
    *,
    usage_sink: Optional[List[Dict[str, Any]]] = None,
    airlock_profile: AirlockPolicyProfile = "default",
    airlock_log_context: Optional[str] = None,
    call_purpose: Optional[str] = None,
    repair_status: Optional[str] = None,
    validation_accepted: Optional[bool] = None,
    **kwargs: Any,
) -> str:
    """
    Thin wrapper around OpenAI chat completions so the rest
    of the code doesn't care about vendor details.

    Env:
      - OPENAI_API_KEY (required)
      - CLAW_LLM_MODEL (optional, default: gpt-4o-mini) — used when ``model`` is omitted
      - CLAW_LLM_MODEL_BASIC / CLAW_LLM_MODEL_PREMIUM — set by :func:`resolve_llm_model_for_access_class`
        for ``ai_model_class`` basic / premium (defaults ``gpt-4o-mini`` / ``gpt-4o`` if unset)
      - CLAW_ENVIRONMENT + CLAW_ALLOW_EXTERNAL_AI_LOCAL — in ``local``/``dev``/``test``/``staging`` only,
        ``CLAW_ALLOW_EXTERNAL_AI_LOCAL=1`` allows the pre-LLM airlock to continue (redact + minimize) when
        privilege heuristics would otherwise block; ``production``/``prod`` never honor this. See
        :mod:`backend.config.external_ai_policy`.
      - ``airlock_profile`` — ``default`` keeps strict litigation single-word matches; ``agreement_outbound``
        is for LawDog agreement JSON (drops false-positive singles like ``settlement`` / ``discovery`` while
        retaining hard litigation tokens such as ``plaintiff`` / ``subpoena``). Under ``agreement_outbound``,
        standalone ``attorney`` / ``lawyer`` tokens are also ignored so repair JSON may include routine fee clauses.
      - ``airlock_log_context`` — optional short route label for blocked-airlock logs (no user substance).
      - ``call_purpose`` — privacy-safe purpose label (structured_extraction, agreement_drafting,
        explicit_revision, conditional_repair). Never include user content.
      - ``repair_status`` — ``none`` / ``repair`` / ``retry`` / ``regen``.
      - ``validation_accepted`` — set when the caller already knows deterministic validation outcome.
    """
    kwargs.pop("trace_context", None)
    if kwargs:
        log.warning(
            "[claw-llm] call_legal_llm dropping unexpected kwargs keys=%s",
            sorted(kwargs.keys()),
        )
    profile: AirlockPolicyProfile = airlock_profile
    outbound_messages = _messages_after_user_airlock(
        messages,
        airlock_profile=profile,
        airlock_log_context=airlock_log_context,
    )
    client = _get_client()
    requested_model = model or DEFAULT_MODEL
    resolved_model = requested_model
    tokens_kwargs = build_chat_completion_tokens_kwargs(resolved_model, max_tokens)
    tokens_param = next(iter(tokens_kwargs.keys()))
    purpose = (call_purpose or airlock_log_context or "unspecified").strip() or "unspecified"
    repair = (repair_status or "none").strip() or "none"
    started = time.perf_counter()

    try:
        resp = client.chat.completions.create(
            model=resolved_model,
            messages=outbound_messages,
            temperature=temperature,
            **tokens_kwargs,
        )
    except Exception as exc:
        latency_ms = int((time.perf_counter() - started) * 1000)
        fail_record = {
            "call_purpose": purpose,
            "requested_model": requested_model,
            "returned_model": None,
            "prompt_tokens": None,
            "completion_tokens": None,
            "total_tokens": None,
            "cached_tokens": None,
            "latency_ms": latency_ms,
            "finish_reason": None,
            "repair_status": repair,
            "validation_accepted": validation_accepted,
            "status": "fail",
            "error_type": type(exc).__name__,
        }
        _privacy_safe_llm_telemetry(fail_record)
        if usage_sink is not None:
            usage_sink.append(fail_record)
        print(f"[premium-api-fail] model={resolved_model} tokens_param={tokens_param} error={type(exc).__name__}:{exc}")
        log.warning(
            "[premium-api-fail] model=%s tokens_param=%s error=%s:%s",
            resolved_model,
            tokens_param,
            type(exc).__name__,
            exc,
        )
        raise
    latency_ms = int((time.perf_counter() - started) * 1000)
    print(f"[premium-api-ok] model={resolved_model} tokens_param={tokens_param} status=ok")
    log.info("[premium-api-ok] model=%s tokens_param=%s status=ok", resolved_model, tokens_param)
    u = getattr(resp, "usage", None)
    choice0 = resp.choices[0] if getattr(resp, "choices", None) else None
    finish_reason = getattr(choice0, "finish_reason", None) if choice0 is not None else None
    returned_model = getattr(resp, "model", None) or resolved_model
    record = {
        "call_purpose": purpose,
        "requested_model": requested_model,
        "returned_model": returned_model,
        "model": returned_model,
        "prompt_tokens": getattr(u, "prompt_tokens", None) if u is not None else None,
        "completion_tokens": getattr(u, "completion_tokens", None) if u is not None else None,
        "total_tokens": getattr(u, "total_tokens", None) if u is not None else None,
        "cached_tokens": _cached_tokens_from_usage(u),
        "latency_ms": latency_ms,
        "finish_reason": finish_reason,
        "repair_status": repair,
        "validation_accepted": validation_accepted,
        "status": "ok",
        "temperature": temperature,
        "max_tokens": max_tokens,
        "tokens_param": tokens_param,
        "response_id": getattr(resp, "id", None) or "",
        "request_id": getattr(resp, "_request_id", None) or getattr(resp, "request_id", None) or "",
        "system_fingerprint": getattr(resp, "system_fingerprint", None) or "",
    }
    _privacy_safe_llm_telemetry(record)
    if usage_sink is not None:
        usage_sink.append(record)
    return (resp.choices[0].message.content or "").strip()


def embed_texts(
    texts: List[str],
    *,
    model: Optional[str] = None,
    airlock_log_context: Optional[str] = None,
) -> List[List[float]]:
    """
    OpenAI embeddings for Agreement Memory / RAG (assistive only — never proof).
    Env: CLAW_OPENAI_EMBEDDING_MODEL (default text-embedding-3-small)
    """
    if not texts:
        return []
    minimized_inputs: List[str] = []
    for user_message_index, t in enumerate(texts):
        airlock_result = run_ai_airlock(t)
        if airlock_result.blocked:
            codes = tuple(airlock_result.policy_decision.reason_codes)
            diag = first_privilege_airlock_block_diagnostic(t, policy_profile="default")
            diag_suffix = ""
            if diag is not None:
                diag_suffix = (
                    f" first_block_reason={diag.reason_code} first_block_category={diag.rule_category}"
                    f" first_block_rule_id={diag.matched_rule_id}"
                )
            route = airlock_log_context or "embed_texts"
            log.warning(
                "[claw-ai-airlock] embed_input_blocked block_reason=%s policy_reason_codes=%s "
                "airlock_profile=default airlock_route=%s user_message_index=%s user_content_chars=%s%s",
                airlock_result.block_reason,
                ",".join(codes) if codes else "",
                route,
                user_message_index,
                len(t),
                diag_suffix,
            )
            raise ExternalAIBlockedError(
                airlock_result.block_reason,
                policy_reason_codes=codes,
            )
        minimized_inputs.append(airlock_result.minimized_text)
    client = _get_client()
    m = model or os.getenv("CLAW_OPENAI_EMBEDDING_MODEL", "text-embedding-3-small").strip()
    resp = client.embeddings.create(model=m, input=minimized_inputs)
    return [list(d.embedding) for d in resp.data]