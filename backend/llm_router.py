# backend/llm_router.py

from __future__ import annotations

import os
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from dotenv import load_dotenv
from openai import OpenAI

# Load repo-root .env deterministically (avoids "wrong working directory" issues).
# backend/llm_router.py -> backend/ -> repo root
_REPO_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(dotenv_path=_REPO_ROOT / ".env", override=False)

from backend.security.ai_airlock import run_ai_airlock


class ExternalAIBlockedError(RuntimeError):
    """
    Raised when the pre-outbound AI airlock blocks a request.
    ``args[0]`` is metadata-safe and must not echo user content.
    """

    def __init__(self, block_reason: Optional[str] = None) -> None:
        self.block_reason = block_reason
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


def _messages_after_user_airlock(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for msg in messages:
        if (msg.get("role") or "") != "user":
            out.append(msg)
            continue
        raw = _user_content_text_for_airlock(msg.get("content"))
        airlock_result = run_ai_airlock(raw)
        if airlock_result.blocked:
            raise ExternalAIBlockedError(airlock_result.block_reason)
        new_content = _user_content_with_minimized(msg.get("content"), airlock_result.minimized_text)
        out.append({**msg, "content": new_content})
    return out


def call_legal_llm(
    messages: List[Dict[str, Any]],
    model: Optional[str] = None,
    max_tokens: int = 2000,
    temperature: float = 0.0,
    *,
    usage_sink: Optional[List[Dict[str, Any]]] = None,
    **_: Any,
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
    """
    outbound_messages = _messages_after_user_airlock(messages)
    client = _get_client()
    resolved_model = model or DEFAULT_MODEL
    tokens_kwargs = build_chat_completion_tokens_kwargs(resolved_model, max_tokens)
    tokens_param = next(iter(tokens_kwargs.keys()))

    try:
        resp = client.chat.completions.create(
            model=resolved_model,
            messages=outbound_messages,
            temperature=temperature,
            **tokens_kwargs,
        )
    except Exception as exc:
        print(f"[premium-api-fail] model={resolved_model} tokens_param={tokens_param} error={type(exc).__name__}:{exc}")
        log.warning(
            "[premium-api-fail] model=%s tokens_param=%s error=%s:%s",
            resolved_model,
            tokens_param,
            type(exc).__name__,
            exc,
        )
        raise
    print(f"[premium-api-ok] model={resolved_model} tokens_param={tokens_param} status=ok")
    log.info("[premium-api-ok] model=%s tokens_param=%s status=ok", resolved_model, tokens_param)
    if usage_sink is not None:
        u = getattr(resp, "usage", None)
        if u is not None:
            usage_sink.append(
                {
                    "model": getattr(resp, "model", None) or resolved_model,
                    "prompt_tokens": getattr(u, "prompt_tokens", None),
                    "completion_tokens": getattr(u, "completion_tokens", None),
                    "total_tokens": getattr(u, "total_tokens", None),
                }
            )
    return (resp.choices[0].message.content or "").strip()


def embed_texts(
    texts: List[str],
    *,
    model: Optional[str] = None,
) -> List[List[float]]:
    """
    OpenAI embeddings for Agreement Memory / RAG (assistive only — never proof).
    Env: CLAW_OPENAI_EMBEDDING_MODEL (default text-embedding-3-small)
    """
    if not texts:
        return []
    minimized_inputs: List[str] = []
    for t in texts:
        airlock_result = run_ai_airlock(t)
        if airlock_result.blocked:
            raise ExternalAIBlockedError(airlock_result.block_reason)
        minimized_inputs.append(airlock_result.minimized_text)
    client = _get_client()
    m = model or os.getenv("CLAW_OPENAI_EMBEDDING_MODEL", "text-embedding-3-small").strip()
    resp = client.embeddings.create(model=m, input=minimized_inputs)
    return [list(d.embedding) for d in resp.data]