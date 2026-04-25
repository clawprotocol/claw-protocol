"""Tests for in-memory recipient LLM usage limits."""

import pytest

from backend.llm_usage_guard import (
    RECIPIENT_SESSION_MAX,
    _recipient_store,
    recipient_try_acquire_llm_slot,
    validate_instruction_size,
    validate_negotiate_text,
)


def setup_function() -> None:
    _recipient_store.clear()


def test_recipient_session_cap(monkeypatch: pytest.MonkeyPatch) -> None:
    # Burst limit is stricter than session cap when calls land in one window; relax for this test.
    import backend.llm_usage_guard as g

    monkeypatch.setattr(g, "BURST_MAX", RECIPIENT_SESSION_MAX)
    aid = "agr_1"
    fp = "finger1"
    last_rem = 0
    for _ in range(RECIPIENT_SESSION_MAX):
        ok, rem = recipient_try_acquire_llm_slot(aid, fp)
        assert ok
        last_rem = rem
    assert last_rem == 0
    ok, rem = recipient_try_acquire_llm_slot(aid, fp)
    assert not ok
    assert rem == 0


def test_instruction_size_recipient() -> None:
    ok, _ = validate_instruction_size("x" * 100, "recipient")
    assert ok
    ok, msg = validate_instruction_size("x" * 1_000_000, "recipient")
    assert not ok
    assert "large" in msg.lower()


def test_negotiate_text_owner_allows_longer() -> None:
    ok, _ = validate_negotiate_text("y" * 7000, "owner")
    assert ok
    ok2, _ = validate_negotiate_text("y" * 7000, "recipient")
    assert not ok2
