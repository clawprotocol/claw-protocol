# backend/providers/llm/openai_provider.py
"""
OpenAI LLM provider for CLAW protocol.

Requires OPENAI_API_KEY environment variable.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.providers.llm.base import BaseLLMProvider, LLMResponse


class OpenAIProvider(BaseLLMProvider):
    """
    OpenAI API provider.

    Uses the openai library if available, otherwise raises ImportError.
    """

    def __init__(
        self,
        *,
        model: str = "gpt-4o",
        api_key: Optional[str] = None,
    ):
        self._model = model
        self._api_key = api_key or os.getenv("OPENAI_API_KEY")

        if not self._api_key:
            raise ValueError("OPENAI_API_KEY not set")

        # Lazy import to avoid hard dependency
        try:
            import openai

            self._client = openai.OpenAI(api_key=self._api_key)
        except ImportError:
            raise ImportError("openai package not installed. Run: pip install openai")

    @property
    def model_id(self) -> str:
        return f"openai:{self._model}"

    def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        return self.complete_with_messages(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    def complete_with_messages(
        self,
        *,
        messages: List[Dict[str, str]],
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        response = self._client.chat.completions.create(
            model=self._model,
            messages=messages,  # type: ignore
            temperature=temperature,
            max_tokens=max_tokens,
        )

        content = response.choices[0].message.content or ""
        usage = None
        if response.usage:
            usage = {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens,
            }

        return LLMResponse(
            content=content,
            model_id=self.model_id,
            created_at=datetime.now(timezone.utc).isoformat(),
            usage=usage,
            raw_response=response.model_dump() if hasattr(response, "model_dump") else None,
        )


def get_openai_provider(
    *,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
) -> OpenAIProvider:
    """
    Factory function for OpenAI provider.

    Uses environment variables for defaults:
    - OPENAI_API_KEY: API key
    - CLAW_LLM_MODEL: Model name (default: gpt-4o)
    """
    model = model or os.getenv("CLAW_LLM_MODEL", "gpt-4o")
    return OpenAIProvider(model=model, api_key=api_key)
