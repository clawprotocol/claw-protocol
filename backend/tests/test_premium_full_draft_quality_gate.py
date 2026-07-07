"""Unit + lightweight API tests for OpenAI-first premium full-draft quality gate."""

from __future__ import annotations

import json
from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient

from backend.agreements.premium_full_draft_quality_gate import (
    build_free_reference_blob,
    evaluate_premium_full_draft_quality,
    premium_full_draft_multiparty_presence_reasons,
    premium_full_draft_repair_system_prompt,
    _operative_exclusive_and_nonexclusive_binding,
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

    def test_rejects_operative_exclusive_and_nonexclusive_grants(self):
        contra_intake = (
            "License my logo non-exclusive worldwide forever. "
            "Also they get exclusive rights in North America. It's fine."
        )
        doc = _long_commercial_body(
            "\nLicensor grants a non-exclusive license worldwide. "
            "Licensor also grants exclusive rights in North America in perpetuity.\n"
        )
        notes = ["exclusive vs non-exclusive scope — pick one grant"]
        assert _operative_exclusive_and_nonexclusive_binding(doc.lower())
        ok, reasons = evaluate_premium_full_draft_quality(
            intake=contra_intake,
            context=_ctx(),
            draft_title="Logo License Agreement",
            draft_family="licensing",
            draft_document_text=doc,
            scenario_category="freelancer_service",
            contradiction_notes=notes,
        )
        assert ok is False
        assert any("contradictory_exclusive_and_nonexclusive" in r for r in reasons)

    def test_allows_single_grant_when_exclusive_conflict_noted(self):
        contra_intake = (
            "License my logo non-exclusive worldwide forever. "
            "Also they get exclusive rights in North America."
        )
        doc = _long_commercial_body(
            "\nLicensor grants Licensee a non-exclusive worldwide license to use the logo. "
            "Any exclusive territorial carve-out is excluded unless confirmed in writing.\n"
        )
        assert not _operative_exclusive_and_nonexclusive_binding(doc.lower())
        ok, reasons = evaluate_premium_full_draft_quality(
            intake=contra_intake,
            context=_ctx(),
            draft_title="Logo License Agreement",
            draft_family="licensing",
            draft_document_text=doc,
            scenario_category="freelancer_service",
            contradiction_notes=["exclusive vs non-exclusive scope — pick one grant"],
        )
        assert not any("contradictory_exclusive_and_nonexclusive" in r for r in reasons)


# --- TEST535: multi-party recital / signature completeness (server-side hardening) ------------

TEST535_REDWOOD = "Redwood Biologics, Inc."
TEST535_SUMMIT = "Summit AI Consulting LLC"
TEST535_BLUE_HARBOR = "Blue Harbor Systems LLC"
TEST535_IRON_GATE = "Iron Gate Security LLC"
TEST535_PARTIES = [TEST535_REDWOOD, TEST535_SUMMIT, TEST535_BLUE_HARBOR, TEST535_IRON_GATE]


def _test535_context() -> Dict[str, Any]:
    return _ctx(
        {
            "title": "Professional Technology Services and AI Implementation Agreement",
            "parties": [
                {"name": TEST535_REDWOOD, "role": "Client"},
                {"name": TEST535_SUMMIT, "role": "Lead Provider"},
                {"name": TEST535_BLUE_HARBOR, "role": "Implementation Partner"},
                {"name": TEST535_IRON_GATE, "role": "Cybersecurity Auditor"},
            ],
        }
    )


def _four_party_body(recital_names: List[str], signature_names: List[str]) -> str:
    recital = (
        "This Professional Technology Services and AI Implementation Agreement is entered into by and among "
        + ", ".join(recital_names)
        + " (each a \"Party\").\n\n"
    )
    sig_blocks = "\n\n".join(
        f"{n}\nBy: _____________________________\nName:\nTitle:\nDate:" for n in signature_names
    )
    return recital + _long_commercial_body() + "\n\nIN WITNESS WHEREOF, the Parties execute this Agreement.\n\n" + sig_blocks


class TestMultiPartyPresenceGate:
    def test_flags_missing_client_in_recital(self):
        # Redwood (Client) dropped from recital; roles shifted (the exact TEST535 defect).
        doc = _four_party_body(
            recital_names=[TEST535_SUMMIT, TEST535_BLUE_HARBOR, TEST535_IRON_GATE],
            signature_names=TEST535_PARTIES,
        )
        reasons = premium_full_draft_multiparty_presence_reasons(doc, _test535_context())
        assert any("missing_intake_parties_in_recital" in r for r in reasons)
        assert any("Redwood" in r for r in reasons)

    def test_flags_missing_party_in_signature_block(self):
        doc = _four_party_body(
            recital_names=TEST535_PARTIES,
            signature_names=[TEST535_SUMMIT, TEST535_BLUE_HARBOR, TEST535_IRON_GATE],
        )
        reasons = premium_full_draft_multiparty_presence_reasons(doc, _test535_context())
        assert any("missing_intake_parties_in_signature_block" in r for r in reasons)
        assert any("Redwood" in r for r in reasons)

    def test_complete_four_party_doc_passes_presence_gate(self):
        doc = _four_party_body(recital_names=TEST535_PARTIES, signature_names=TEST535_PARTIES)
        assert premium_full_draft_multiparty_presence_reasons(doc, _test535_context()) == []

    def test_comma_suffix_variants_tolerated(self):
        # Recital/signature use "Redwood Biologics Inc." (no comma) — must still count as present.
        doc = _four_party_body(
            recital_names=["Redwood Biologics Inc.", TEST535_SUMMIT, TEST535_BLUE_HARBOR, TEST535_IRON_GATE],
            signature_names=["Redwood Biologics Inc.", TEST535_SUMMIT, TEST535_BLUE_HARBOR, TEST535_IRON_GATE],
        )
        assert premium_full_draft_multiparty_presence_reasons(doc, _test535_context()) == []

    def test_two_party_intake_not_subject_to_presence_gate(self):
        ctx = _ctx({"parties": [{"name": "Client Co", "role": "Client"}, {"name": "Vendor LLC", "role": "Vendor"}]})
        doc = _four_party_body(recital_names=["Client Co"], signature_names=["Client Co"])
        assert premium_full_draft_multiparty_presence_reasons(doc, ctx) == []

    def test_evaluate_rejects_when_party_dropped(self):
        doc = _four_party_body(
            recital_names=[TEST535_SUMMIT, TEST535_BLUE_HARBOR, TEST535_IRON_GATE],
            signature_names=[TEST535_SUMMIT, TEST535_BLUE_HARBOR, TEST535_IRON_GATE],
        )
        ok, reasons = evaluate_premium_full_draft_quality(
            intake="Four-party professional services and AI implementation agreement.",
            context=_test535_context(),
            draft_title="Professional Technology Services and AI Implementation Agreement",
            draft_family="services",
            draft_document_text=doc,
            scenario_category="business_commercial",
        )
        assert ok is False
        assert any("missing_intake_parties_in_recital" in r for r in reasons)
        assert any("missing_intake_parties_in_signature_block" in r for r in reasons)

    def test_repair_prompt_requires_all_named_parties(self):
        p = premium_full_draft_repair_system_prompt().lower()
        assert "all named parties required" in p
        assert "signature" in p and "recital" in p


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
