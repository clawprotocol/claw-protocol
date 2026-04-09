"""Tests for deterministic privilege-oriented workflow classification."""

from backend.security.privilege_policy import (
    REASON_LEGAL_SENSITIVE_TERM,
    REASON_LITIGATION_SIGNAL,
    REASON_PRIVILEGE_CANDIDATE_TERM,
    REASON_WORK_PRODUCT_SIGNAL,
    PrivilegePolicyDecision,
    evaluate_privilege_policy,
)


def test_litigation_sensitive_text() -> None:
    text = (
        "The plaintiff filed a lawsuit; we need discovery responses "
        "before meeting opposing counsel."
    )
    d = evaluate_privilege_policy(text)
    assert d.is_legal_sensitive is True
    assert d.requires_protected_mode is True
    assert d.allow_external_ai is False
    assert d.allow_raw_upload_to_ai is False
    assert REASON_LITIGATION_SIGNAL in d.reason_codes


def test_commercial_non_legal_text() -> None:
    text = (
        "Q4 revenue targets, enterprise pricing, and channel partner "
        "discounts for the rollout."
    )
    d = evaluate_privilege_policy(text)
    assert d == PrivilegePolicyDecision(
        is_legal_sensitive=False,
        is_privileged_candidate=False,
        requires_protected_mode=False,
        allow_external_ai=True,
        allow_raw_upload_to_ai=True,
        reason_codes=(),
    )


def test_mixed_text_one_strong_litigation_signal() -> None:
    text = (
        "Ship the plaintiff-facing analytics tile by Friday; "
        "focus on conversion metrics and SKU velocity."
    )
    d = evaluate_privilege_policy(text)
    assert d.is_legal_sensitive is True
    assert REASON_LITIGATION_SIGNAL in d.reason_codes
    assert d.requires_protected_mode is True


def test_empty_and_whitespace() -> None:
    assert evaluate_privilege_policy("") == PrivilegePolicyDecision(
        is_legal_sensitive=False,
        is_privileged_candidate=False,
        requires_protected_mode=False,
        allow_external_ai=True,
        allow_raw_upload_to_ai=True,
        reason_codes=(),
    )
    assert evaluate_privilege_policy("   \n\t  ") == PrivilegePolicyDecision(
        is_legal_sensitive=False,
        is_privileged_candidate=False,
        requires_protected_mode=False,
        allow_external_ai=True,
        allow_raw_upload_to_ai=True,
        reason_codes=(),
    )


def test_casing_variation() -> None:
    d = evaluate_privilege_policy("ATTORNEY-CLIENT WORK PRODUCT draft")
    assert d.is_legal_sensitive is True
    assert REASON_LEGAL_SENSITIVE_TERM in d.reason_codes
    assert REASON_WORK_PRODUCT_SIGNAL in d.reason_codes
    assert d.is_privileged_candidate is True


def test_multiple_categories_sorted_reason_codes() -> None:
    text = (
        "Privileged notes on work product; coordinate litigation "
        "with outside counsel per the legal memo."
    )
    d = evaluate_privilege_policy(text)
    assert d.is_legal_sensitive is True
    assert d.is_privileged_candidate is True
    expected = sorted(
        {
            REASON_LEGAL_SENSITIVE_TERM,
            REASON_LITIGATION_SIGNAL,
            REASON_PRIVILEGE_CANDIDATE_TERM,
            REASON_WORK_PRODUCT_SIGNAL,
        }
    )
    assert list(d.reason_codes) == expected
