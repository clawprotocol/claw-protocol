# backend/llm_router.py

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from openai import OpenAI

# Load repo-root .env deterministically (avoids "wrong working directory" issues).
# backend/llm_router.py -> backend/ -> repo root
_REPO_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(dotenv_path=_REPO_ROOT / ".env", override=False)

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
    client = _get_client()

    resp = client.chat.completions.create(
        model=model or DEFAULT_MODEL,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    return (resp.choices[0].message.content or "").strip()