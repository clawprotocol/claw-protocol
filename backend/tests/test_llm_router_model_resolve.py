"""Resolve product tier (basic / premium) to concrete OpenAI model ids from env."""

import pytest

from backend.llm_router import (
    build_chat_completion_tokens_kwargs,
    resolve_llm_model_for_access_class,
    uses_gpt5_chat_tokens_param,
)


def test_premium_uses_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_LLM_MODEL_PREMIUM", "gpt-5.4-mini")
    assert resolve_llm_model_for_access_class("premium") == "gpt-5.4-mini"


def test_premium_default_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLAW_LLM_MODEL_PREMIUM", raising=False)
    assert resolve_llm_model_for_access_class("premium") == "gpt-5.4-mini"


def test_basic_uses_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_LLM_MODEL_BASIC", "gpt-custom-basic")
    assert resolve_llm_model_for_access_class("basic") == "gpt-custom-basic"


def test_basic_default_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLAW_LLM_MODEL_BASIC", raising=False)
    assert resolve_llm_model_for_access_class("basic") == "gpt-5.4-nano"


def test_premium_class_case_insensitive(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_LLM_MODEL_PREMIUM", "gpt-4o")
    assert resolve_llm_model_for_access_class("PrEmIuM") == "gpt-4o"


def test_whitespace_only_env_falls_back_to_default_premium(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_LLM_MODEL_PREMIUM", "   ")
    assert resolve_llm_model_for_access_class("premium") == "gpt-5.4-mini"


def test_basic_and_premium_defaults_differ(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLAW_LLM_MODEL_BASIC", raising=False)
    monkeypatch.delenv("CLAW_LLM_MODEL_PREMIUM", raising=False)
    assert resolve_llm_model_for_access_class("basic") != resolve_llm_model_for_access_class("premium")


def test_premium_regen_uses_env_then_premium_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_LLM_MODEL_PREMIUM_REGEN", "gpt-5.4-xy")
    monkeypatch.delenv("CLAW_LLM_MODEL_PREMIUM", raising=False)
    assert resolve_llm_model_for_access_class("premium_regen") == "gpt-5.4-xy"


def test_premium_regen_falls_back_to_premium_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLAW_LLM_MODEL_PREMIUM_REGEN", raising=False)
    monkeypatch.setenv("CLAW_LLM_MODEL_PREMIUM", "gpt-5.4-p")
    assert resolve_llm_model_for_access_class("premium_strong") == "gpt-5.4-p"


def test_gpt5_uses_max_completion_tokens() -> None:
    assert uses_gpt5_chat_tokens_param("gpt-5.4-mini")
    assert build_chat_completion_tokens_kwargs("gpt-5.4-mini", 1200) == {"max_completion_tokens": 1200}


def test_legacy_models_use_max_tokens() -> None:
    assert not uses_gpt5_chat_tokens_param("gpt-4o-mini")
    assert build_chat_completion_tokens_kwargs("gpt-4o-mini", 800) == {"max_tokens": 800}
