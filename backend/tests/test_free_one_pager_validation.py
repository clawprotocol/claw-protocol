"""
Tests for free one-pager validation: hollow body detection.

Verifies that thin dumps with:
- Role-only party names (Client, Service_provider)
- Scraped question words as party names (Can, Need, Looking)
- Empty Payment/Law sections

are correctly detected as "hollow_body" and blocked from painting on the free page.
"""
import pytest
from backend.routers.agreements_v2_api import (
    _is_hollow_party_name,
    _has_hollow_section_content,
    _validate_free_one_pager,
)

pytestmark = pytest.mark.unit


class TestIsHollowPartyName:
    """Tests for _is_hollow_party_name helper."""

    def test_role_placeholders_are_hollow(self):
        assert _is_hollow_party_name("Client") is True
        assert _is_hollow_party_name("Service_provider") is True
        assert _is_hollow_party_name("Service Provider") is True
        assert _is_hollow_party_name("Contractor") is True
        assert _is_hollow_party_name("Vendor") is True
        assert _is_hollow_party_name("Party") is True
        assert _is_hollow_party_name("Party A") is True
        assert _is_hollow_party_name("Party B") is True
        assert _is_hollow_party_name("Employer") is True
        assert _is_hollow_party_name("Employee") is True

    def test_scraped_question_words_are_hollow(self):
        assert _is_hollow_party_name("Can") is True
        assert _is_hollow_party_name("Need") is True
        assert _is_hollow_party_name("Looking") is True
        assert _is_hollow_party_name("Please") is True
        assert _is_hollow_party_name("Someone") is True
        assert _is_hollow_party_name("Anyone") is True
        assert _is_hollow_party_name("Help") is True
        assert _is_hollow_party_name("Hi") is True
        assert _is_hollow_party_name("Hello") is True

    def test_very_short_words_are_hollow(self):
        assert _is_hollow_party_name("Jo") is True
        assert _is_hollow_party_name("Me") is True
        assert _is_hollow_party_name("A") is True
        assert _is_hollow_party_name("") is True
        assert _is_hollow_party_name(None) is True

    def test_real_names_are_not_hollow(self):
        assert _is_hollow_party_name("Maya Chen") is False
        assert _is_hollow_party_name("Diego Alvarez") is False
        assert _is_hollow_party_name("Harbor Marks LLC") is False
        assert _is_hollow_party_name("Northline Studio") is False
        assert _is_hollow_party_name("Acme Corp") is False
        assert _is_hollow_party_name("John Smith") is False
        assert _is_hollow_party_name("Apple Inc") is False
        assert _is_hollow_party_name("Google LLC") is False


class TestHasHollowSectionContent:
    """Tests for _has_hollow_section_content helper."""

    def test_detects_empty_payment_section(self):
        doc = """AGREEMENT

1. Scope
Some scope.

2. Payment Terms

3. Term
30 days.
"""
        assert _has_hollow_section_content(doc, "Payment Terms") is True

    def test_detects_placeholder_content(self):
        doc = """AGREEMENT

1. Scope
Some scope.

2. Payment Terms
To be agreed.

3. Term
30 days.
"""
        assert _has_hollow_section_content(doc, "Payment Terms") is True

    def test_detects_commercial_arrangement_placeholder(self):
        doc = """AGREEMENT

1. Scope
Commercial arrangement to be agreed between the parties.

2. Payment Terms
$500

3. Governing Law
Texas
"""
        assert _has_hollow_section_content(doc, "Scope") is True

    def test_passes_real_payment_content(self):
        doc = """AGREEMENT

1. Scope
Design a logo.

2. Payment Terms
$2,400 due on signing.

3. Term
30 days.
"""
        assert _has_hollow_section_content(doc, "Payment Terms") is False


# The exact hollow body from the dog dump: "Can someone watch my dog Saturday?"
DOG_DUMP_HOLLOW_BODY = """BUSINESS AGREEMENT

This Agreement ("Agreement") is entered into by and between:
Client ("Client") and Can ("Service_provider") (collectively, the "Parties").

1. Scope of Services / Purpose
Commercial arrangement to be agreed between the parties.

2. Payment Terms

3. Term and Effective Date
Term: As stated in the agreement.
Effective Date: Upon full execution by the parties unless otherwise specified.

4. Governing Law

5. Termination
Termination terms to be agreed by the Parties."""

DOG_DUMP_INTAKE = "Can someone watch my dog Saturday?"


# Valid Maya/Diego body for comparison
MAYA_DIEGO_VALID_BODY = """SERVICES AGREEMENT

This Agreement is entered into by and between Maya Chen of Northline Studio and Diego Alvarez of Harbor Marks LLC.

1. Scope of Services
Diego Alvarez of Harbor Marks LLC will design a logo and brand kit for Maya Chen of Northline Studio.

2. Payment Terms
$2,400 due on signing.

3. Term
Work runs 30 days starting August 22, 2026.

4. Governing Law
This Agreement is governed by the laws of the State of Texas."""

MAYA_DIEGO_INTAKE = "Maya Chen of Northline Studio hires Diego Alvarez of Harbor Marks LLC to design a logo and brand kit for $2,400 due on signing. Work runs 30 days starting August 22, 2026. Governing law is Texas."


class TestValidateFreeOnePager:
    """Tests for _validate_free_one_pager."""

    def test_dog_dump_returns_hollow_body(self):
        """The dog dump must fail validation with hollow_body status."""
        result = _validate_free_one_pager(DOG_DUMP_HOLLOW_BODY, DOG_DUMP_INTAKE)
        assert result == "hollow_body", f"Expected 'hollow_body', got '{result}'"

    def test_maya_diego_passes_validation(self):
        """Complete Maya/Diego dump must pass validation."""
        result = _validate_free_one_pager(MAYA_DIEGO_VALID_BODY, MAYA_DIEGO_INTAKE)
        assert result == "ok", f"Expected 'ok', got '{result}'"

    def test_role_only_parties_returns_hollow_body(self):
        """Bodies with only role placeholders as parties should fail."""
        body = """SERVICES AGREEMENT

This Agreement is entered into by and between Client and Service Provider.

1. Scope
Some scope description here.

2. Payment Terms

3. Governing Law
"""
        result = _validate_free_one_pager(body, "need contractor for work")
        assert result == "hollow_body"

    def test_scraped_first_word_party_returns_hollow_body(self):
        """Body with scraped first word as party name should fail."""
        body = """BUSINESS AGREEMENT

This Agreement is entered into by and between Need ("Client") and Someone ("Provider").

1. Scope
Arrangement to be agreed.

2. Payment Terms

3. Governing Law
"""
        result = _validate_free_one_pager(body, "Need someone to help with my project")
        assert result == "hollow_body"

    def test_empty_payment_and_law_returns_hollow_body(self):
        """Body with empty Payment and Law sections should fail."""
        body = """CONSULTING AGREEMENT

This Agreement is entered into by and between John Smith and Jane Doe.

1. Scope
Consulting services.

2. Payment Terms

3. Governing Law
"""
        result = _validate_free_one_pager(body, "John Smith hires Jane Doe for consulting")
        assert result == "hollow_body"

    def test_party_ab_returns_missing_parties(self):
        """Party A/B placeholders should return missing_parties (existing behavior)."""
        body = """AGREEMENT

This Agreement is entered into by and between Party A and Party B.

1. Scope
Some services.

2. Payment Terms
$500
"""
        result = _validate_free_one_pager(body, "need help with something")
        assert result == "missing_parties"

    def test_incomplete_sentences_detected(self):
        """Broken sentences should return incomplete_sentences (existing behavior)."""
        body = """AGREEMENT

This Agreement covers due. Work.

1. Payment Terms
$500
"""
        result = _validate_free_one_pager(body, "need help")
        assert result == "incomplete_sentences"

    def test_passes_body_with_real_content(self):
        """Body with real names, payment, and law should pass."""
        body = """CONSULTING AGREEMENT

This Agreement is entered into by and between Acme Corp and John Smith.

1. Scope
Software development consulting.

2. Payment Terms
$5,000 per month.

3. Term
12 months.

4. Governing Law
This Agreement is governed by the laws of California.
"""
        result = _validate_free_one_pager(body, "Acme Corp hires John Smith for $5,000/month consulting in California")
        assert result == "ok"

    def test_fence_dump_pattern_hollow(self):
        """Another thin dump pattern: "need someone to build a fence" """
        body = """SERVICES AGREEMENT

This Agreement is entered into by and between Client ("Client") and Contractor ("Service Provider").

1. Scope of Services / Purpose
Construction services as agreed.

2. Payment Terms

3. Term and Effective Date
Term: To be determined.

4. Governing Law
"""
        result = _validate_free_one_pager(body, "need someone to build a fence")
        assert result == "hollow_body"
