"""Focused tests for backend.security.ai_airlock."""

from __future__ import annotations

from backend.security.ai_airlock import (
    BLOCK_REASON_PROTECTED_MODE_EXTERNAL_AI,
    AIAirlockResult,
    minimize_for_airlock,
    run_ai_airlock,
)


def test_legal_sensitive_content_blocked_no_payload_leak() -> None:
    raw = "We should discuss this with our attorney before filing."
    r = run_ai_airlock(raw)
    assert r.blocked is True
    assert r.block_reason == BLOCK_REASON_PROTECTED_MODE_EXTERNAL_AI
    assert r.redacted_text == ""
    assert r.minimized_text == ""
    assert r.redacted_length == 0
    assert r.minimized_length == 0
    assert r.original_length == len(raw)
    assert "blocked_before_transform" in r.transformation_summary
    assert "policy_reason_codes:" in "".join(r.transformation_summary)
    # Must not echo raw in safe outbound fields.
    assert raw not in r.redacted_text and raw not in r.minimized_text


def test_non_sensitive_passes_redaction_and_minimization() -> None:
    raw = "Hello, this is a routine status update with no legal terms."
    r = run_ai_airlock(raw)
    assert r.blocked is False
    assert r.block_reason is None
    assert r.redacted_text == raw
    assert r.minimized_text == raw.strip()
    assert r.original_length == len(raw)
    assert r.redacted_length == len(r.redacted_text)
    assert r.minimized_length == len(r.minimized_text)
    assert "redaction_applied" in r.transformation_summary
    assert "minimization_applied" in r.transformation_summary


def test_non_sensitive_email_redacted_in_outbound() -> None:
    raw = "Contact me at user@example.com for the schedule."
    r = run_ai_airlock(raw)
    assert r.blocked is False
    assert "[EMAIL_1]" in r.redacted_text
    assert "user@example.com" not in r.minimized_text
    assert "redaction_categories:email" in r.transformation_summary


def test_empty_input() -> None:
    r = run_ai_airlock("")
    assert r.blocked is False
    assert r.block_reason is None
    assert r.original_length == 0
    assert r.redacted_text == ""
    assert r.minimized_text == ""
    assert r.redacted_length == 0
    assert r.minimized_length == 0
    assert r.transformation_summary[0] == "privilege_policy_evaluated"


def test_whitespace_only_input_treated_as_empty_policy() -> None:
    r = run_ai_airlock("   \n\t  ")
    assert r.blocked is False
    assert r.minimized_text == ""


def test_oversized_input_minimized() -> None:
    chunk = "word "
    raw = chunk * 5000
    assert "attorney" not in raw.lower()
    cap = 200
    r = run_ai_airlock(raw, max_minimized_chars=cap)
    assert r.blocked is False
    assert len(r.minimized_text) <= cap
    assert "minimization_truncated" in r.transformation_summary
    assert r.minimized_length == len(r.minimized_text)
    assert r.original_length == len(raw)


def test_transformation_metadata_coherent_when_blocked() -> None:
    r = run_ai_airlock("privileged communication under work product doctrine")
    assert r.blocked is True
    assert r.policy_decision.requires_protected_mode is True
    assert r.minimized_length <= r.redacted_length
    assert tuple(r.transformation_summary) == r.transformation_summary


def test_transformation_metadata_coherent_when_allowed() -> None:
    r = run_ai_airlock("ok")
    assert r.blocked is False
    assert r.minimized_length <= r.redacted_length
    assert r.original_length >= r.redacted_length >= r.minimized_length


def test_minimize_for_airlock_deterministic() -> None:
    s = "a " * 3000
    m1 = minimize_for_airlock(s, max_chars=100)
    m2 = minimize_for_airlock(s, max_chars=100)
    assert m1 == m2
    assert len(m1) <= 100


def test_airlock_result_is_typed() -> None:
    r = run_ai_airlock("x")
    assert isinstance(r, AIAirlockResult)
