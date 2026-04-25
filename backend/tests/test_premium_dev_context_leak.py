"""P0: dev / env echo leak detection for premium full draft."""

from backend.agreements.premium_dev_context_leak import (
    premium_document_text_has_dev_context_leak,
    sanitize_premium_intake_for_retry,
)


def test_detects_localhost() -> None:
    bad, hits = premium_document_text_has_dev_context_leak("See http://localhost:3000 for details")
    assert bad
    assert "localhost" in hits


def test_allows_mundane_agreement() -> None:
    t = "This Independent Contractor Agreement between Party A and Party B provides for payment in USD."
    bad, _ = premium_document_text_has_dev_context_leak(t)
    assert not bad


def test_sanitized_retry_drops_path_echo() -> None:
    s = "Discuss project at /Users/jane/Desktop/frontend and run npm run build"
    out = sanitize_premium_intake_for_retry(s)
    assert "Users" not in out
    assert "localhost" not in out.lower()
    bad, _ = premium_document_text_has_dev_context_leak(out)
    assert not bad
