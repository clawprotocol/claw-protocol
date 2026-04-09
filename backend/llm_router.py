# backend/llm_router.py

from __future__ import annotations

import os
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
DEFAULT_MODEL: str = os.getenv("CLAW_LLM_MODEL", "gpt-4o-mini")

# Lazy init client so module import doesn't hard-fail during tests/tools that don't use LLM.
_client: Optional[OpenAI] = None


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
) -> str:
    """
    Thin wrapper around OpenAI chat completions so the rest
    of the code doesn't care about vendor details.

    Env:
      - OPENAI_API_KEY (required)
      - CLAW_LLM_MODEL (optional, default: gpt-4o-mini)
    """
    outbound_messages = _messages_after_user_airlock(messages)
    client = _get_client()

    resp = client.chat.completions.create(
        model=model or DEFAULT_MODEL,
        messages=outbound_messages,
        max_tokens=max_tokens,
        temperature=temperature,
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