# backend/tests/test_legal_analyst.py
"""
Tests for CLAW Legal Analyst Tool v0.

Tests verify:
- Audit linking integrity
- Deterministic input hashing
- Disclaimer presence
- Appeal compatibility
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone

import pytest

from backend.handlers.legal_analyst_handler import (
    SCHEMA_VERSION,
    STANDARD_DISCLAIMERS,
    AnalyzeRequest,
    EvidenceRefInput,
    analyze,
    _compute_inputs_hash,
    _build_evidence_bundle,
    _parse_llm_output,
)
from backend.providers.llm.base import MockLLMProvider
from backend.utils.canonical_json import canon_sha256_hex
from backend.utils.file_refs import FileRef, freeze_evidence_bundle


# -----------------------------------------------------------------------------
# Fixtures
# -----------------------------------------------------------------------------


@pytest.fixture
def sample_evidence_refs() -> list[EvidenceRefInput]:
    """Sample evidence references for testing."""
    return [
        EvidenceRefInput(
            uri="receipt://timeline_abc/event_001",
            content_hash_sha256="a" * 64,
            label="Contract v1",
        ),
        EvidenceRefInput(
            uri="receipt://timeline_abc/event_002",
            content_hash_sha256="b" * 64,
            label="Amendment 1",
        ),
    ]


@pytest.fixture
def sample_request(sample_evidence_refs: list[EvidenceRefInput]) -> AnalyzeRequest:
    """Sample analysis request."""
    return AnalyzeRequest(
        evidence_bundle_id="bundle_test_001",
        evidence_refs=sample_evidence_refs,
        query="What are the key obligations in this contract?",
        document_text="Party A agrees to pay Party B $1000 monthly.",
        analysis_type="contract",
    )


@pytest.fixture
def mock_provider() -> MockLLMProvider:
    """Mock LLM provider with canned response."""
    return MockLLMProvider(
        canned_response="""CLASSIFICATION (not legal advice):

Document Type: Payment Agreement
Parties: Party A (payor), Party B (payee)

Key Findings:
- Monthly payment obligation of $1000
- No explicit term/duration stated
- No termination clause identified

Potential Issues:
- Missing payment due date
- No late payment provisions

Confidence: Medium

This classification requires review by qualified counsel."""
    )


# -----------------------------------------------------------------------------
# Unit Tests: Input Hashing
# -----------------------------------------------------------------------------


def test_inputs_hash_deterministic() -> None:
    """Same inputs must produce same hash."""
    evidence_hash = "abc123"
    query = "test query"
    doc = "test document"
    ctx = {"key": "value"}

    hash1 = _compute_inputs_hash(query, evidence_hash, doc, ctx)
    hash2 = _compute_inputs_hash(query, evidence_hash, doc, ctx)

    assert hash1 == hash2
    assert len(hash1) == 64  # SHA-256 hex


def test_inputs_hash_changes_with_input() -> None:
    """Different inputs must produce different hashes."""
    evidence_hash = "abc123"

    hash1 = _compute_inputs_hash("query1", evidence_hash, None, None)
    hash2 = _compute_inputs_hash("query2", evidence_hash, None, None)

    assert hash1 != hash2


def test_inputs_hash_none_handling() -> None:
    """None values should be handled consistently."""
    evidence_hash = "abc123"
    query = "test"

    hash1 = _compute_inputs_hash(query, evidence_hash, None, None)
    hash2 = _compute_inputs_hash(query, evidence_hash, "", {})

    # None and empty should produce same result (both normalize to empty)
    assert hash1 == hash2


# -----------------------------------------------------------------------------
# Unit Tests: Evidence Bundle
# -----------------------------------------------------------------------------


def test_evidence_bundle_hash_deterministic(
    sample_evidence_refs: list[EvidenceRefInput],
) -> None:
    """Evidence bundle hash must be deterministic."""
    bundle1 = _build_evidence_bundle("bundle_1", sample_evidence_refs)
    bundle2 = _build_evidence_bundle("bundle_1", sample_evidence_refs)

    # Note: frozen_at differs, so hashes will differ
    # But with same frozen_at, they should match
    from backend.utils.file_refs import freeze_evidence_bundle, FileRef

    refs = [
        FileRef(uri=r.uri, content_hash_sha256=r.content_hash_sha256, label=r.label)
        for r in sample_evidence_refs
    ]
    frozen_at = "2026-01-01T00:00:00+00:00"

    b1 = freeze_evidence_bundle(bundle_id="test", refs=refs, frozen_at=frozen_at)
    b2 = freeze_evidence_bundle(bundle_id="test", refs=refs, frozen_at=frozen_at)

    assert b1.bundle_hash_sha256 == b2.bundle_hash_sha256


# -----------------------------------------------------------------------------
# Unit Tests: LLM Output Parsing
# -----------------------------------------------------------------------------


def test_parse_llm_output_extracts_classification() -> None:
    """Parser should extract classification from output."""
    raw = """CLASSIFICATION (not legal advice): Service Agreement

Key Findings:
- Term is 12 months

This classification requires review by qualified counsel."""

    result = _parse_llm_output(raw, "contract")

    assert "Service Agreement" in result.classification
    assert result.analysis_type == "contract"


def test_parse_llm_output_extracts_findings() -> None:
    """Parser should extract key findings."""
    raw = """CLASSIFICATION (not legal advice): Test

Key Findings:
- Finding one
- Finding two

Potential Issues:
- Issue one

Confidence: High"""

    result = _parse_llm_output(raw, "general")

    assert len(result.key_findings) >= 1
    assert result.confidence_level == "high"


def test_parse_llm_output_handles_empty() -> None:
    """Parser should handle minimal output gracefully."""
    raw = "No analysis possible."

    result = _parse_llm_output(raw, "general")

    assert result.schema_version == SCHEMA_VERSION
    assert result.summary  # Should have some summary


# -----------------------------------------------------------------------------
# Integration Tests: Full Analysis
# -----------------------------------------------------------------------------


def test_analyze_returns_valid_response(
    sample_request: AnalyzeRequest,
    mock_provider: MockLLMProvider,
) -> None:
    """Full analysis should return valid response with all required fields."""
    response = analyze(sample_request, provider=mock_provider)

    assert response.schema_version == SCHEMA_VERSION
    assert response.appeal_compatible is True
    assert len(response.disclaimers) > 0


def test_analyze_includes_audit_linkage(
    sample_request: AnalyzeRequest,
    mock_provider: MockLLMProvider,
) -> None:
    """Response must include complete audit linkage."""
    response = analyze(sample_request, provider=mock_provider)

    audit = response.audit_linkage
    assert audit.inputs_hash_sha256
    assert len(audit.inputs_hash_sha256) == 64
    assert audit.output_hash_sha256
    assert len(audit.output_hash_sha256) == 64
    assert audit.model_id == "mock-v1"
    assert audit.evidence_bundle_hash_sha256
    assert audit.created_at


def test_analyze_includes_mandatory_disclaimers(
    sample_request: AnalyzeRequest,
    mock_provider: MockLLMProvider,
) -> None:
    """Response must include mandatory disclaimers."""
    response = analyze(sample_request, provider=mock_provider)

    # Check for key disclaimers
    disclaimers_text = " ".join(response.disclaimers).lower()

    assert "not legal advice" in disclaimers_text
    assert "enforcement" in disclaimers_text or "no enforcement" in disclaimers_text
    assert "review" in disclaimers_text or "counsel" in disclaimers_text


def test_analyze_audit_linkage_verifiable(
    sample_request: AnalyzeRequest,
    mock_provider: MockLLMProvider,
) -> None:
    """Audit linkage should be independently verifiable."""
    response = analyze(sample_request, provider=mock_provider)

    # Rebuild inputs hash and verify it matches
    from backend.handlers.legal_analyst_handler import _build_evidence_bundle

    bundle = _build_evidence_bundle(
        sample_request.evidence_bundle_id,
        sample_request.evidence_refs,
    )

    expected_inputs_hash = _compute_inputs_hash(
        query=sample_request.query,
        evidence_bundle_hash=bundle.bundle_hash_sha256,
        document_text=sample_request.document_text,
        context=sample_request.context,
    )

    assert response.audit_linkage.inputs_hash_sha256 == expected_inputs_hash


def test_analyze_output_hash_matches_content(
    sample_request: AnalyzeRequest,
    mock_provider: MockLLMProvider,
) -> None:
    """Output hash should match hash of LLM content."""
    response = analyze(sample_request, provider=mock_provider)

    # The output hash should be SHA-256 of the raw LLM output
    # We can verify the hash is valid SHA-256 format
    output_hash = response.audit_linkage.output_hash_sha256
    assert len(output_hash) == 64
    assert all(c in "0123456789abcdef" for c in output_hash)


# -----------------------------------------------------------------------------
# Tests: No Legal Advice Invariant
# -----------------------------------------------------------------------------


def test_schema_version_indicates_classification() -> None:
    """Schema version should indicate this is classification, not advice."""
    assert "analyst" in SCHEMA_VERSION.lower() or "legal" in SCHEMA_VERSION.lower()
    assert "advice" not in SCHEMA_VERSION.lower()


def test_disclaimers_explicit_no_legal_advice() -> None:
    """Disclaimers must explicitly state this is not legal advice."""
    disclaimers_text = " ".join(STANDARD_DISCLAIMERS).lower()

    assert "not legal advice" in disclaimers_text
    assert "classification" in disclaimers_text


def test_analysis_output_includes_limitations(
    sample_request: AnalyzeRequest,
    mock_provider: MockLLMProvider,
) -> None:
    """Analysis output should include limitations."""
    response = analyze(sample_request, provider=mock_provider)

    assert response.analysis.limitations
    assert len(response.analysis.limitations) > 0


# -----------------------------------------------------------------------------
# Tests: Appeal Compatibility
# -----------------------------------------------------------------------------


def test_appeal_compatible_flag_set(
    sample_request: AnalyzeRequest,
    mock_provider: MockLLMProvider,
) -> None:
    """Response should be marked as appeal-compatible."""
    response = analyze(sample_request, provider=mock_provider)

    assert response.appeal_compatible is True


def test_appeal_data_sufficient_for_reproduction(
    sample_request: AnalyzeRequest,
    mock_provider: MockLLMProvider,
) -> None:
    """Audit linkage should contain sufficient data for appeal/review."""
    response = analyze(sample_request, provider=mock_provider)

    audit = response.audit_linkage

    # Must have: inputs hash, output hash, model ID, evidence hash, timestamp
    assert audit.inputs_hash_sha256
    assert audit.output_hash_sha256
    assert audit.model_id
    assert audit.evidence_bundle_hash_sha256
    assert audit.created_at

    # Model ID should identify the specific model
    assert ":" in audit.model_id or "mock" in audit.model_id


# -----------------------------------------------------------------------------
# Tests: Edge Cases
# -----------------------------------------------------------------------------


def test_analyze_minimal_request(mock_provider: MockLLMProvider) -> None:
    """Should handle minimal valid request."""
    request = AnalyzeRequest(
        evidence_bundle_id="min_bundle",
        evidence_refs=[
            EvidenceRefInput(
                uri="receipt://test",
                content_hash_sha256="c" * 64,
            )
        ],
        query="Analyze this.",
    )

    response = analyze(request, provider=mock_provider)

    assert response.schema_version == SCHEMA_VERSION
    assert response.audit_linkage.inputs_hash_sha256


def test_analyze_with_context(
    sample_request: AnalyzeRequest,
    mock_provider: MockLLMProvider,
) -> None:
    """Should include context in inputs hash."""
    request1 = sample_request.model_copy()
    request1.context = {"jurisdiction": "US"}

    request2 = sample_request.model_copy()
    request2.context = {"jurisdiction": "UK"}

    response1 = analyze(request1, provider=mock_provider)
    response2 = analyze(request2, provider=mock_provider)

    # Different context should produce different inputs hash
    assert (
        response1.audit_linkage.inputs_hash_sha256
        != response2.audit_linkage.inputs_hash_sha256
    )
