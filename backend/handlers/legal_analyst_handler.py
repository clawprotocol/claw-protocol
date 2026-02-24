# backend/handlers/legal_analyst_handler.py
"""
CLAW Legal Analyst Tool v0.

Invariants:
- Non-deterministic analysis MUST be audit-linked and appeal-compatible
- No legal advice, no enforcement, no implicit authority
- All analyst outputs must be tied to frozen evidence references
- Hashes and receipts matter more than UX polish

This handler provides legal analysis classification (NOT legal advice).
All outputs include disclaimers and audit linkage.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ConfigDict

from backend.providers.llm.base import BaseLLMProvider, MockLLMProvider
from backend.utils.canonical_json import canon_sha256_hex
from backend.utils.file_refs import (
    FileRef,
    FrozenEvidenceBundle,
    freeze_evidence_bundle,
)

router = APIRouter(prefix="/v1/analyst", tags=["analyst"])


# -----------------------------------------------------------------------------
# Constants
# -----------------------------------------------------------------------------

SCHEMA_VERSION = "claw.legal_analyst.v0"

# CLAW protocol: no legal advice, no enforcement, no implicit authority
STANDARD_DISCLAIMERS = [
    "This is NOT legal advice.",
    "This analysis is a classification for evidentiary and audit purposes only.",
    "The analyst has no enforcement authority and makes no legal determinations.",
    "User-provided data may be incomplete or inaccurate.",
    "Outputs should be reviewed by qualified legal counsel before any reliance.",
    "This output is appeal-compatible: the inputs and model are audit-linked.",
]

SYSTEM_PROMPT = """You are a legal classification assistant for the CLAW protocol.

CRITICAL CONSTRAINTS:
1. You do NOT provide legal advice.
2. You do NOT make legal determinations or enforcement decisions.
3. You classify and summarize facts for evidentiary purposes only.
4. All your outputs are audit-linked and appeal-compatible.
5. You MUST acknowledge uncertainty and limitations.

Your role is to:
- Identify relevant legal concepts that MAY apply
- Classify document types and parties
- Extract key dates, obligations, and conditions
- Flag potential issues for human review
- Maintain neutrality and objectivity

Always prefix inputs/analysis with: "CLASSIFICATION (not legal advice):"
Always suffix with: "This classification requires review by qualified counsel."
"""


# -----------------------------------------------------------------------------
# Request/Response Models
# -----------------------------------------------------------------------------


class EvidenceRefInput(BaseModel):
    """Reference to frozen evidence."""

    uri: str = Field(..., description="URI of the evidence (e.g., receipt://, file://)")
    content_hash_sha256: str = Field(..., description="SHA-256 hash of the content")
    label: Optional[str] = Field(None, description="Human-readable label")


class AnalyzeRequest(BaseModel):
    """Request for legal analysis."""

    # Evidence bundle (required for audit linking)
    evidence_bundle_id: str = Field(..., description="ID of the frozen evidence bundle")
    evidence_refs: List[EvidenceRefInput] = Field(
        ..., min_length=1, description="References to frozen evidence"
    )

    # Query
    query: str = Field(..., min_length=1, max_length=10000, description="Analysis query")

    # Optional context
    document_text: Optional[str] = Field(
        None, max_length=100000, description="Document text to analyze"
    )
    context: Optional[Dict[str, Any]] = Field(None, description="Additional context")

    # Analysis parameters
    analysis_type: str = Field(
        "general",
        description="Type of analysis: general, contract, liability, compliance",
    )


class AnalysisOutput(BaseModel):
    """Structured analysis output."""

    schema_version: str = SCHEMA_VERSION
    analysis_type: str
    classification: str
    summary: str
    key_findings: List[str]
    potential_issues: List[str]
    recommended_review_areas: List[str]
    confidence_level: str  # "low", "medium", "high"
    limitations: List[str]


class AuditLinkage(BaseModel):
    """Audit linkage for non-deterministic output."""

    model_config = ConfigDict(protected_namespaces=())

    inputs_hash_sha256: str
    output_hash_sha256: str
    model_id: str
    evidence_bundle_hash_sha256: str
    created_at: str


class AnalyzeResponse(BaseModel):
    """Response from legal analysis."""

    schema_version: str = SCHEMA_VERSION
    analysis: AnalysisOutput
    audit_linkage: AuditLinkage
    disclaimers: List[str] = STANDARD_DISCLAIMERS
    appeal_compatible: bool = True
    raw_llm_output: Optional[str] = Field(
        None, description="Raw LLM output for audit (if debug enabled)"
    )


# -----------------------------------------------------------------------------
# Provider Factory
# -----------------------------------------------------------------------------


def _get_llm_provider() -> BaseLLMProvider:
    """
    Get the configured LLM provider.

    Uses CLAW_LLM_PROVIDER env var:
    - "mock" (default for testing): MockLLMProvider
    - "openai": OpenAIProvider
    """
    provider_name = os.getenv("CLAW_LLM_PROVIDER", "mock").lower()

    if provider_name == "openai":
        from backend.providers.llm.openai_provider import get_openai_provider

        return get_openai_provider()

    # Default: mock provider for testing/development
    return MockLLMProvider(canned_response=_mock_analysis_response())


def _mock_analysis_response() -> str:
    """Canned response for mock provider."""
    return """CLASSIFICATION (not legal advice):

Document Type: General Agreement
Parties Identified: Party A, Party B
Key Dates: None explicitly stated
Obligations: Mutual obligations pending detailed review

Key Findings:
- Document appears to be a preliminary agreement
- Terms require further specification
- No clear dispute resolution mechanism identified

Potential Issues:
- Ambiguous termination clauses
- Missing governing law provision

Confidence: Medium - based on limited context provided

This classification requires review by qualified counsel."""


# -----------------------------------------------------------------------------
# Core Logic
# -----------------------------------------------------------------------------


def _build_evidence_bundle(
    bundle_id: str,
    refs: List[EvidenceRefInput],
) -> FrozenEvidenceBundle:
    """Build frozen evidence bundle from input refs."""
    file_refs = [
        FileRef(
            uri=r.uri,
            content_hash_sha256=r.content_hash_sha256,
            label=r.label,
        )
        for r in refs
    ]
    file_refs.sort(key=lambda r: (r.uri, r.content_hash_sha256, r.label or ""))

    det_payload = {
        "bundle_id": bundle_id,
        "refs": [
            {
                "uri": r.uri,
                "content_hash_sha256": r.content_hash_sha256,
                "label": r.label or "",
            }
            for r in file_refs
        ],
    }
    det_hash = canon_sha256_hex(det_payload)

    bundle = freeze_evidence_bundle(bundle_id=bundle_id, refs=file_refs)
    object.__setattr__(bundle, "bundle_hash_sha256", det_hash)
    return bundle


def _compute_inputs_hash(
    query: str,
    evidence_bundle_hash: str,
    document_text: Optional[str],
    context: Optional[Dict[str, Any]],
) -> str:
    """
    Compute deterministic hash of the analysis inputs for audit linking.

    IMPORTANT:
    - Normalize optionals to stable defaults for hashing.
    - document_text: None -> ""
    - context: None -> {}
    """
    inputs_obj = {
        "query": query,
        "evidence_bundle_hash_sha256": evidence_bundle_hash,
        "document_text": document_text or "",
        "context": context or {},
    }
    return canon_sha256_hex(inputs_obj)


def _build_user_prompt(
    query: str,
    document_text: Optional[str],
    context: Optional[Dict[str, Any]],
    analysis_type: str,
) -> str:
    """Build user prompt for LLM."""
    parts = [f"Analysis Type: {analysis_type}", f"Query: {query}"]

    if document_text is not None and document_text != "":
        # Truncate if too long (ASSUMPTION: 50k char limit for v0)
        max_len = 50000
        if len(document_text) > max_len:
            document_text = document_text[:max_len] + "\n[TRUNCATED]"
        parts.append(f"\nDocument Text:\n{document_text}")

    if context is not None:
        import json

        parts.append(f"\nAdditional Context:\n{json.dumps(context, indent=2)}")

    return "\n\n".join(parts)


def _parse_llm_output(raw_output: str, analysis_type: str) -> AnalysisOutput:
    """
    Parse LLM output into structured analysis.

    ASSUMPTION: v0 uses simple text parsing. Future versions may use
    structured output formats (JSON mode, function calling).
    """
    lines = raw_output.strip().split("\n")

    classification = "General Classification"
    summary = ""
    key_findings: List[str] = []
    potential_issues: List[str] = []
    review_areas: List[str] = []
    confidence = "medium"
    limitations: List[str] = ["Analysis based on provided text only"]

    current_section = "summary"
    summary_lines: List[str] = []

    for line in lines:
        line_lower = line.lower().strip()

        if "classification" in line_lower and ":" in line:
            classification = line.split(":", 1)[-1].strip()
        elif "key finding" in line_lower:
            current_section = "findings"
        elif current_section == "findings" and line.strip().startswith("-"):
            finding = line.lstrip("- ").strip()
            if finding:
                key_findings.append(finding)
        elif "potential issue" in line_lower:
            current_section = "issues"
        elif current_section == "issues" and line.strip().startswith("-"):
            issue = line.lstrip("- ").strip()
            if issue:
                potential_issues.append(issue)
        elif "confidence" in line_lower:
            if "low" in line_lower:
                confidence = "low"
            elif "high" in line_lower:
                confidence = "high"
            else:
                confidence = "medium"
        else:
            if current_section == "summary":
                summary_lines.append(line)

    summary = " ".join(summary_lines).strip()
    if not summary:
        summary = raw_output[:500]  # Fallback

    if not review_areas:
        review_areas = [
            "Verify all party identities and authorities",
            "Confirm date accuracy and timeline",
            "Review with qualified legal counsel",
        ]

    return AnalysisOutput(
        schema_version=SCHEMA_VERSION,
        analysis_type=analysis_type,
        classification=classification,
        summary=summary,
        key_findings=key_findings or ["No specific findings extracted"],
        potential_issues=potential_issues or ["No specific issues flagged"],
        recommended_review_areas=review_areas,
        confidence_level=confidence,
        limitations=limitations,
    )


def analyze(
    request: AnalyzeRequest,
    provider: Optional[BaseLLMProvider] = None,
) -> AnalyzeResponse:
    """
    Perform legal analysis with full audit linking.

    Steps:
    1. Build frozen evidence bundle
    2. Compute deterministic input hash (verifiable)
    3. Call LLM for analysis (non-deterministic)
    4. Compute deterministic output hash
    5. Create audit linkage
    6. Return structured response with disclaimers
    """
    provider = provider or _get_llm_provider()

    # 1. Evidence bundle
    evidence_bundle = _build_evidence_bundle(
        bundle_id=request.evidence_bundle_id,
        refs=request.evidence_refs,
    )

    # 2. Inputs hash (must match verifier recomputation)
    inputs_hash = _compute_inputs_hash(
        query=request.query,
        evidence_bundle_hash=evidence_bundle.bundle_hash_sha256,
        document_text=request.document_text,
        context=request.context,
    )

    # 3. Build prompt + call LLM
    user_prompt = _build_user_prompt(
        query=request.query,
        document_text=request.document_text,
        context=request.context,
        analysis_type=request.analysis_type,
    )

    llm_response = provider.complete(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.0,  # minimize variance (still non-deterministic in principle)
        max_tokens=4096,
    )

    # 4. Output hash (deterministic over raw text)
    output_hash = canon_sha256_hex({"raw_llm_output": llm_response.content})

    # 5. Parse to structured output
    analysis = _parse_llm_output(llm_response.content, request.analysis_type)

    # 6. Audit linkage envelope
    audit_linkage = AuditLinkage(
        inputs_hash_sha256=inputs_hash,
        output_hash_sha256=output_hash,
        model_id=llm_response.model_id,
        evidence_bundle_hash_sha256=evidence_bundle.bundle_hash_sha256,
        created_at=llm_response.created_at,
    )

    debug_enabled = os.getenv("CLAW_DEBUG", "0").lower() in ("1", "true", "yes")

    return AnalyzeResponse(
        schema_version=SCHEMA_VERSION,
        analysis=analysis,
        audit_linkage=audit_linkage,
        disclaimers=STANDARD_DISCLAIMERS,
        appeal_compatible=True,
        raw_llm_output=llm_response.content if debug_enabled else None,
    )


# -----------------------------------------------------------------------------
# API Routes
# -----------------------------------------------------------------------------


@router.post("/analyze", response_model=AnalyzeResponse)
async def api_analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    """
    Perform legal analysis on provided evidence.

    - Requires frozen evidence references for audit linking
    - Returns structured analysis with audit trail
    - Includes mandatory disclaimers (NOT legal advice)
    - Is appeal-compatible (inputs and model are recorded)

    Note: This is a CLASSIFICATION tool, not a legal advice service.
    """
    try:
        return analyze(request)
    except Exception:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "analysis_failed",
                "message": "Analysis could not be completed. Please retry or contact support.",
                "disclaimer": "This is not legal advice.",
            },
        )


@router.get("/health")
async def analyst_health() -> Dict[str, Any]:
    """Health check for analyst service."""
    provider_name = os.getenv("CLAW_LLM_PROVIDER", "mock")
    return {
        "ok": True,
        "schema_version": SCHEMA_VERSION,
        "provider": provider_name,
        "disclaimers": STANDARD_DISCLAIMERS[:2],
    }