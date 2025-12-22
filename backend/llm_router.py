# backend/llm_router.py

import os
from typing import List, Dict, Any

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
DEFAULT_MODEL = os.getenv("CLAW_LLM_MODEL", "gpt-4o-mini")

_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None


def call_legal_llm(
    messages: List[Dict[str, Any]],
    model: str | None = None,
    max_tokens: int = 2000,
    temperature: float = 0.0,
) -> str:
    """
    Thin wrapper around OpenAI chat completions so the rest
    of the code doesn't care about vendor details.
    """
    if _client is None:
        raise RuntimeError("OPENAI_API_KEY not set; cannot call LLM")

    resp = _client.chat.completions.create(
        model=model or DEFAULT_MODEL,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    return resp.choices[0].message.content or ""
