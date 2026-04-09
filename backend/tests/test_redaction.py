"""Tests for AI-bound text redaction (security.redaction)."""

from backend.security.redaction import RedactionResult, TextRedactor, redact_text


def test_empty_string() -> None:
    r = redact_text("")
    assert r == RedactionResult(redacted_text="", redaction_counts={}, redaction_categories=[])


def test_no_matches() -> None:
    text = "The parties agree to the terms set forth above without reservation."
    r = redact_text(text)
    assert r.redacted_text == text
    assert r.redaction_counts == {}
    assert r.redaction_categories == []


def test_contract_like_contact_details() -> None:
    text = (
        "Notice to billing@acmecorp.example and call (415) 555-0199. "
        "Send payment to 4400 Market Street, San Francisco, CA 94103."
    )
    r = redact_text(text)
    assert "billing@acmecorp.example" not in r.redacted_text
    assert "(415) 555-0199" not in r.redacted_text
    assert "4400 Market Street" not in r.redacted_text
    assert "[EMAIL_1]" in r.redacted_text
    assert "[PHONE_1]" in r.redacted_text
    assert "[ADDRESS_1]" in r.redacted_text
    assert "email" in r.redaction_counts
    assert "phone" in r.redaction_counts
    assert "address" in r.redaction_counts


def test_litigation_names_and_case_identifiers() -> None:
    text = (
        "In Case No. 1:24-cv-00042, Plaintiff Jane Doe moves for summary judgment. "
        "Defendant Robert Smith opposes. Related state matter 23-CV-8891."
    )
    r = redact_text(text)
    assert "Jane Doe" not in r.redacted_text
    assert "Robert Smith" not in r.redacted_text
    assert "1:24-cv-00042" not in r.redacted_text.lower()
    assert "23-CV-8891" not in r.redacted_text
    assert "[CASE_ID_" in r.redacted_text
    assert "[NAME_" in r.redacted_text


def test_ocr_messy_spacing() -> None:
    text = "Reach   us  at  support@example.org  or  212-555-0147  for help."
    r = redact_text(text)
    assert "support@example.org" not in r.redacted_text
    assert "212-555-0147" not in r.redacted_text
    assert "[EMAIL_1]" in r.redacted_text
    assert "[PHONE_1]" in r.redacted_text


def test_repeated_entities_stable_numbering() -> None:
    text = (
        "Email alice@example.com and again alice@example.com. "
        "Phone 310-555-0100 or 310-555-0100."
    )
    r = redact_text(text)
    assert r.redacted_text.count("[EMAIL_1]") == 2
    assert r.redacted_text.count("[PHONE_1]") == 2
    assert "[EMAIL_2]" not in r.redacted_text
    assert "[PHONE_2]" not in r.redacted_text
    assert r.redaction_counts.get("email") == 1
    assert r.redaction_counts.get("phone") == 1


def test_ssn_and_account_style_identifiers() -> None:
    text = (
        "SSN 078-05-1120 is sample. Account #: 4532012345678901. "
        "Routing reference 123456789012."
    )
    r = redact_text(text)
    assert "078-05-1120" not in r.redacted_text
    assert "4532012345678901" not in r.redacted_text
    assert "123456789012" not in r.redacted_text
    assert "[SSN_1]" in r.redacted_text
    assert "[ACCOUNT_" in r.redacted_text


def test_org_suffix_redaction() -> None:
    text = "Counterparty is Acme Industrial LLC under the agreement."
    r = redact_text(text)
    assert "Acme Industrial LLC" not in r.redacted_text
    assert "[ORG_1]" in r.redacted_text


def test_text_redactor_wrapper() -> None:
    tr = TextRedactor()
    r = tr.redact("contact: x@y.co")
    assert "[EMAIL_1]" in r.redacted_text


def test_redaction_categories_sorted() -> None:
    text = "a@b.co and 206-555-0182"
    r = redact_text(text)
    assert r.redaction_categories == sorted(r.redaction_categories)
    assert set(r.redaction_categories) == set(r.redaction_counts.keys())
