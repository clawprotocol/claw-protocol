# backend/providers/llm/base.py
"""
Base LLM provider interface for CLAW protocol.

Invariants:
- All LLM outputs are non-deterministic and MUST be audit-linked
- Provider must return model_id for audit envelope
- No implicit authority: outputs are classifications, not legal advice
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class LLMResponse:
    """
    Immutable response from an LLM provider.

    Attributes:
        content: The raw text response
        model_id: Identifier of the model used (for audit linking)
        usage: Token usage statistics (optional)
        created_at: ISO timestamp of response creation
        raw_response: Original provider response (for debugging, not for hashing)
    """

    content: str
    model_id: str
    created_at: str
    usage: Optional[Dict[str, int]] = None
    raw_response: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dict (excludes raw_response for determinism)."""
        d: Dict[str, Any] = {
            "content": self.content,
            "model_id": self.model_id,
            "created_at": self.created_at,
        }
        if self.usage is not None:
            d["usage"] = self.usage
        return d


class BaseLLMProvider(ABC):
    """
    Abstract base class for LLM providers.

    Subclasses must implement:
    - complete(): Single completion
    - model_id: Property returning the model identifier
    """

    @property
    @abstractmethod
    def model_id(self) -> str:
        """Return the model identifier for audit linking."""
        ...

    @abstractmethod
    def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """
        Generate a completion.

        Args:
            system_prompt: System-level instructions
            user_prompt: User input/query
            temperature: Sampling temperature (0.0 = deterministic-ish)
            max_tokens: Maximum tokens in response

        Returns:
            LLMResponse with content and audit metadata
        """
        ...

    def complete_with_messages(
        self,
        *,
        messages: List[Dict[str, str]],
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """
        Generate a completion from a message list.

        Default implementation extracts system/user from messages.
        Override for providers with native message support.
        """
        system_prompt = ""
        user_prompt = ""

        for msg in messages:
            role = msg.get("role", "")
            content = msg.get("content", "")
            if role == "system":
                system_prompt = content
            elif role == "user":
                user_prompt = content

        return self.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )


class MockLLMProvider(BaseLLMProvider):
    """
    Mock provider for testing. Returns canned responses.
    """

    def __init__(self, canned_response: str = "mock_response"):
        self._canned_response = canned_response

    @property
    def model_id(self) -> str:
        return "mock-v1"

    def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        return LLMResponse(
            content=self._canned_response,
            model_id=self.model_id,
            created_at=datetime.now(timezone.utc).isoformat(),
            usage={"prompt_tokens": 10, "completion_tokens": 5},
        )
