"""Offline SaaS stub must not emit Harbor consulting paper."""

from __future__ import annotations

import json

from backend.llm_acceptance_stub import stub_legal_llm_completion

SAAS = (
    "Draft a 12-month SaaS subscription agreement between Orion Harbor LLC (Provider) "
    "and Northwind Retail Inc. (Customer). Scope: hosted platform access and standard "
    "onboarding, hosted platform only, no professional services. Fee $48,000 annually, "
    "net 30. Governing law New York."
)
HARBOR = (
    "Draft a consulting services agreement between Harbor Peak Analytics LLC (Consultant) "
    "and Ironvale Manufacturing Inc. (Client). Scope is AI workflow implementation. "
    "Fixed fee $48,000."
)


def test_hosted_saas_stub_is_not_consulting_paper() -> None:
    raw = stub_legal_llm_completion(
        [{"role": "user", "content": SAAS}],
        call_purpose="agreement_drafting",
    )
    body = json.loads(raw)
    doc = str(body.get("document_text") or "")
    assert "SOFTWARE AS A SERVICE SUBSCRIPTION AGREEMENT" in doc
    assert "Orion Harbor LLC" in doc
    assert "Northwind Retail Inc." in doc
    assert "$48,000" in doc
    assert "New York" in doc
    assert "hosted platform" in doc.lower()
    assert "CONSULTING SERVICES AGREEMENT" not in doc
    assert "Harbor Peak Analytics LLC" not in doc
    assert "AI workflow implementation" not in doc
    assert "Consultant shall perform" not in doc


def test_harbor_stub_is_unchanged_consulting_paper() -> None:
    raw = stub_legal_llm_completion(
        [{"role": "user", "content": HARBOR}],
        call_purpose="agreement_drafting",
    )
    doc = json.loads(raw)["document_text"]
    assert "CONSULTING SERVICES AGREEMENT" in doc
    assert "Harbor Peak Analytics LLC" in doc
    assert "Orion Harbor LLC" not in doc


def test_saas_sparse_does_not_invent_named_parties() -> None:
    raw = stub_legal_llm_completion(
        [{"role": "user", "content": "Need a SaaS subscription agreement"}],
        call_purpose="agreement_drafting",
    )
    assert "Orion Harbor LLC" not in raw
    assert "Northwind Retail Inc." not in raw
    assert "missing_material_info" in raw
