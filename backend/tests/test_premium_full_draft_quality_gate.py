"""Unit + lightweight API tests for OpenAI-first premium full-draft quality gate."""

from __future__ import annotations

import json
from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient

from backend.agreements.premium_full_draft_quality_gate import (
    build_free_reference_blob,
    evaluate_premium_full_draft_quality,
    premium_full_draft_repair_system_prompt,
)
from backend.main import app
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-api-v2"}


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _ctx(over: Dict[str, Any] | None = None) -> Dict[str, Any]:
    base: Dict[str, Any] = {
        "title": "Draft",
        "purpose": "Placeholder purpose for starter path.",
        "payment_terms": "TBD",
        "material_asks": [],
    }
    if over:
        base.update(over)
    return base


def _long_commercial_body(extra: str = "") -> str:
    parts: List[str] = [
        "WHEREAS the parties desire to set forth their understanding.\n",
        "1. PARTIES. The parties identified above.",
        "2. SCOPE. Services and deliverables as described in the intake.",
        "3. COMPENSATION. Fees, invoicing, and payment mechanics.",
        "4. CONFIDENTIALITY. Mutual confidentiality obligations.",
        "5. INTELLECTUAL PROPERTY. Ownership and license of deliverables.",
        "6. TERM AND TERMINATION. Notice, cure, and survival.",
        "7. LIABILITY AND INDEMNITY. Commercially reasonable limits.",
        "8. DISPUTE RESOLUTION. Negotiation then appropriate forum.",
        "9. NOTICES. Email and mail to designated contacts.",
        "10. MISCELLANEOUS. Entire agreement; counterparts; e-signatures.",
    ]
    return "\n\n".join(parts) + "\n\n" + ("Operative detail. " * 400) + extra


LOGO_INTAKE = "Need a logo contract for $1,500 with 2 revisions."
VEST_INTAKE = "Two founders 60/40 vesting for our startup, 4 year vest, 1 year cliff."
ESTATE_INTAKE = "My siblings need rules for dad's estate tonight — split personal property fairly."


class TestEvaluatePremiumFullDraftQuality:
    def test_rejects_internal_generation_notes(self):
        doc = _long_commercial_body("Sparse-prompt premium expansion (test).\n")
        ok, reasons = evaluate_premium_full_draft_quality(
            intake=LOGO_INTAKE,
            context=_ctx({"material_asks": ["$1,500", "2 revisions"]}),
            draft_title="Custom Logo Design Agreement",
            draft_family="services",
            draft_document_text=doc,
            scenario_category="freelancer_service",
        )
        assert ok is False
        assert any("internal_generation" in r for r in reasons)

    def test_rejects_false_schedule_a(self):
        doc = _long_commercial_body("\nFees as specified in Schedule A (not attached).\n")
        ok, reasons = evaluate_premium_full_draft_quality(
            intake=LOGO_INTAKE,
            context=_ctx({"material_asks": ["$1,500", "2 revisions"]}),
            draft_title="Logo Agreement",
            draft_family="services",
            draft_document_text=doc,
            scenario_category="freelancer_service",
        )
        assert ok is False
        assert any("false_schedule" in r for r in reasons)

    def test_rejects_generic_agreement_title_when_intake_specific(self):
        doc = _long_commercial_body()
        ok, reasons = evaluate_premium_full_draft_quality(
            intake=LOGO_INTAKE,
            context=_ctx({"material_asks": ["$1,500", "2 revisions"]}),
            draft_title="AGREEMENT",
            draft_family="services",
            draft_document_text=doc,
            scenario_category="freelancer_service",
        )
        assert ok is False
        assert any("generic_title" in r for r in reasons)

    def test_logo_prompt_good_passes_and_not_echo_of_free_only(self):
        intake = LOGO_INTAKE
        ctx = _ctx(
            {
                "title": "Starter",
                "purpose": "Logo for brand refresh.",
                "payment_terms": "1500 flat",
                "material_asks": ["$1,500 flat fee", "2 rounds of revisions"],
            }
        )
        free_blob = build_free_reference_blob(intake, ctx)
        doc = _long_commercial_body(
            "\nThe designer will deliver logo concepts with **$1,500** flat compensation. "
            "Client receives **two (2) revision rounds** after initial presentation.\n"
        )
        ok, reasons = evaluate_premium_full_draft_quality(
            intake=intake,
            context=ctx,
            draft_title="Logo Design Services Agreement",
            draft_family="Creative services",
            draft_document_text=doc,
            scenario_category="freelancer_service",
        )
        assert ok is True, reasons
        assert "1,500" in doc.lower() or "1500" in doc.lower()
        assert "revision" in doc.lower()
        # Pro should not be substantially the same string as the free reference blob alone
        assert len(doc) > len(free_blob) * 0.55

    def test_vesting_prompt_requires_ratios(self):
        ctx = _ctx({"material_asks": ["60/40 equity split between founders", "four-year vesting with one-year cliff"]})
        doc = _long_commercial_body()  # missing 60/40 and vesting language
        ok, reasons = evaluate_premium_full_draft_quality(
            intake=VEST_INTAKE,
            context=ctx,
            draft_title="Founder Vesting Agreement",
            draft_family="startup",
            draft_document_text=doc,
            scenario_category="business_commercial",
        )
        assert ok is False
        assert any("material_asks_not_addressed" in r for r in reasons)

    def test_estate_prompt_good_includes_sibling_estate_signals(self):
        intake = ESTATE_INTAKE
        ctx = _ctx({"material_asks": ["siblings", "personal property split", "estate"]})
        doc = _long_commercial_body(
            "\nThe siblings agree on allocation of Dad's personal property and household items. "
            "Estate administration tasks are divided fairly among the siblings.\n"
        )
        ok, reasons = evaluate_premium_full_draft_quality(
            intake=intake,
            context=ctx,
            draft_title="Family Estate Distribution Agreement",
            draft_family="family",
            draft_document_text=doc,
            scenario_category="family_personal",
        )
        assert ok is True, reasons
        assert "sibling" in doc.lower() and "estate" in doc.lower()

    def test_repair_system_prompt_contains_required_rewrite_line(self):
        p = premium_full_draft_repair_system_prompt()
        assert "too generic or incomplete" in p.lower()
        assert "do not use a fixed template" in p.lower()
        assert "operative language" in p.lower()

    def test_nda_allows_reverse_engineering_restriction(self):
        intake = "Need a simple NDA before sharing my pitch deck"
        doc = _long_commercial_body(
            "\nRecipient shall not reverse engineer, decompile, or disassemble confidential technical materials.\n"
        )
        ok, reasons = evaluate_premium_full_draft_quality(
            intake=intake,
            context=_ctx(
                {
                    "agreement_family": "nda",
                    "intent_contract": {"intent_id": "nda_confidentiality"},
                }
            ),
            draft_title="Mutual Non-Disclosure Agreement",
            draft_family="nda",
            draft_document_text=doc,
            scenario_category="custom_mixed",
        )
        assert ok is True, reasons
        assert not any("reverse_engineering" in r for r in reasons)

    def test_estate_still_rejects_irrelevant_reverse_engineering_boilerplate(self):
        doc = _long_commercial_body(
            "\nNo party may reverse engineer, decompile, or disassemble any confidential information.\n"
        )
        ok, reasons = evaluate_premium_full_draft_quality(
            intake=ESTATE_INTAKE,
            context=_ctx({"material_asks": ["siblings", "estate"]}),
            draft_title="Family Estate Administration Agreement",
            draft_family="family",
            draft_document_text=doc,
            scenario_category="family_personal",
        )
        assert ok is False
        assert any("irrelevant_reverse_engineering_boilerplate" in r for r in reasons)


def test_premium_full_draft_invokes_repair_on_quality_fail(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    good_body = _long_commercial_body(
        "\nFlat fee **$1,500** for logo work including **two revision rounds**.\n"
    )
    bad_json: Dict[str, Any] = {
        "title": "AGREEMENT",
        "agreement_family": "generic",
        "document_text": "Sparse-prompt premium expansion (NDA default pack):\n" + "x" * 1700,
        "key_terms_found": [],
        "missing_material_info": [],
    }
    good_json: Dict[str, Any] = {
        "title": "Logo Design Services Agreement",
        "agreement_family": "Creative services",
        "document_text": good_body,
        "key_terms_found": ["Fee", "Revisions", "IP"],
        "missing_material_info": [],
    }
    calls = {"n": 0}

    def fake_llm(*args, **kwargs):
        calls["n"] += 1
        msgs = kwargs.get("messages") or (args[0] if args else [])
        if calls["n"] == 1:
            return json.dumps(bad_json)
        assert isinstance(msgs, list) and len(msgs) >= 2
        sys = msgs[0].get("content", "")
        assert "rewrite" in sys.lower() or "rejected" in sys.lower()
        return json.dumps(good_json)

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-full-draft",
        headers=_ORG_H,
        json={
            "intake_text": LOGO_INTAKE,
            "context": {
                "title": "T",
                "jurisdiction": "California",
                "parties": [{"name": "Client Co", "role": "Client"}, {"name": "Designer LLC", "role": "Designer"}],
                "purpose": "Logo design engagement.",
                "payment_terms": "1500 USD flat",
                "material_asks": ["$1,500", "2 revisions"],
                "agreement_family": "services_agreement",
            },
        },
    )
    assert res.status_code == 200
    assert calls["n"] == 2
    body = res.json()
    assert body.get("title") == "Logo Design Services Agreement"
    assert "Sparse-prompt" not in body.get("document_text", "")
    assert "1500" in body.get("document_text", "").lower() or "1,500" in body.get("document_text", "")
