"""Offline replay: invented payment timing must become a visible clarification."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.agreements.premium_full_draft_quality_gate import (
    UNCONFIRMED_PAYMENT_TIMING_QUESTION,
    apply_unconfirmed_payment_timing_guard,
    build_premium_full_draft_repair_user_payload,
)
from backend.main import app
from backend.tests.entitlement_test_support import ensure_org_pro_entitlement


HARBOR_INTAKE = (
    "Draft a consulting services agreement between Harbor Peak Analytics LLC (Consultant) "
    "and Ironvale Manufacturing Inc. (Client). Scope is AI workflow implementation. "
    "Fixed fee $48,000. Term twelve months starting October 1, 2026. Governing law Delaware. "
    "Consultant owns pre-existing tools; Client owns deliverables after payment. "
    "Consultant signer Maya Chen, maya.chen@harborpeak.test. "
    "Client signer Jordan Hale, jordan.hale@ironvale.test."
)

SAVED = (
    Path(__file__).resolve().parents[2]
    / "evals/commercial-readiness/results/quality-eval-live/20260913T231438Z-12993"
    / "consulting-premium-result.json"
)


def _saved() -> dict:
    return json.loads(SAVED.read_text())


def test_saved_live_response_invented_timing_without_asking() -> None:
    raw = _saved()
    body = raw["authoritative_draft"]
    assert "installment" in body.lower()
    assert "thirty" in body.lower()
    assert raw.get("missing_material_info") == []
    assert (raw.get("agreement_intelligence") or {}).get("missing_material_terms") == []
    assert (raw.get("agreement_intelligence") or {}).get("recommended_questions") == []


def test_missing_payment_timing_becomes_clarification_and_is_not_agreed() -> None:
    raw = _saved()
    cleaned, missing = apply_unconfirmed_payment_timing_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="",
        document_text=raw["authoritative_draft"],
        missing_material_info=list(raw.get("missing_material_info") or []),
    )
    assert UNCONFIRMED_PAYMENT_TIMING_QUESTION in missing
    assert "installment" not in cleaned.lower()
    assert "after receipt of invoice" not in cleaned.lower()
    assert "$48,000" in cleaned
    assert "Harbor Peak Analytics LLC" in cleaned
    assert "cured within thirty" in cleaned.lower()


def test_supplied_timing_is_retained_and_not_reasked() -> None:
    raw = _saved()
    gap = "Invoice the $48,000 fee in one installment on October 1, 2026. Payment is due net 30."
    kept, missing = apply_unconfirmed_payment_timing_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers=gap,
        document_text=raw["authoritative_draft"],
        missing_material_info=[],
    )
    assert UNCONFIRMED_PAYMENT_TIMING_QUESTION not in missing
    assert "installment" in kept.lower()
    assert "thirty" in kept.lower()


def test_automatic_repair_output_still_surfaces_unconfirmed_timing() -> None:
    raw = _saved()
    repaired = raw.get("server_repair_document_text") or raw["authoritative_draft"]
    cleaned, missing = apply_unconfirmed_payment_timing_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="",
        document_text=repaired,
        missing_material_info=[],
    )
    assert UNCONFIRMED_PAYMENT_TIMING_QUESTION in missing
    assert "installment" not in cleaned.lower()
    assert "after receipt of invoice" not in cleaned.lower()


def test_acceptance_stub_net_thirty_is_not_treated_as_agreed() -> None:
    stub = (
        "3. FEES AND PAYMENT. Client shall pay a fixed fee of $48,000 for the services. "
        "Invoices are due net thirty (30) days. The fee is not a subscription and is not an estimate.\n"
        "4. TERM AND DURATION. The initial term is twelve months.\n"
    )
    cleaned, missing = apply_unconfirmed_payment_timing_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="",
        document_text=stub,
        missing_material_info=[],
    )
    assert UNCONFIRMED_PAYMENT_TIMING_QUESTION in missing
    assert "net thirty" not in cleaned.lower()
    assert "$48,000" in cleaned
    assert "not a subscription" in cleaned


def test_repair_payload_forwards_confirmed_gap_answers() -> None:
    gap = "Invoice the $48,000 fee in one installment on October 1, 2026. Payment is due net 30."
    payload = build_premium_full_draft_repair_user_payload(
        intake=HARBOR_INTAKE,
        free_reference_blob="",
        rejected={
            "title": "Consulting Services Agreement",
            "agreement_family": "consulting",
            "document_text": _saved()["authoritative_draft"],
            "key_terms_found": [],
            "missing_material_info": [],
        },
        rejection_reasons=["incomplete_substance"],
        scenario_category="freelancer_service",
        scenario_signals=[],
        context=None,
        user_gap_answers=gap,
    )
    assert payload["user_gap_answers"] == gap


def test_production_handler_replays_saved_response_without_inventing_timing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("OPENAI_API_KEY", "sk-offline-replay-not-live")
    import backend.economics.store as eco_store
    import backend.routers.agreements_v2_api as av2

    eco_store.reset_economics_store_for_tests()
    ensure_org_pro_entitlement("test-org-api-v2", user_id="test-owner")
    monkeypatch.setattr(av2, "OPENAI_API_KEY", "sk-offline-replay-not-live")

    raw = _saved()

    def fake_llm(*_args, **kwargs):
        return json.dumps(
            {
                "title": raw["title"],
                "agreement_family": raw["agreement_family"],
                "authoritative_draft": raw["authoritative_draft"],
                "document_text": raw["authoritative_draft"],
                "key_terms_found": raw.get("key_terms_found") or [],
                "missing_material_info": [],
                "agreement_intelligence": raw.get("agreement_intelligence") or {},
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    headers = {
        "X-Claw-Org-Id": "test-org-api-v2",
        "X-Claw-Test-Auth-User-Id": "test-owner",
        "Content-Type": "application/json",
    }
    first = client.post(
        "/api/agreements/premium-full-draft",
        headers=headers,
        json={"intake_text": HARBOR_INTAKE, "user_gap_answers": ""},
    )
    assert first.status_code == 200, first.text
    body = first.json()
    doc = str(body.get("document_text") or body.get("authoritative_draft") or "")
    missing = body.get("missing_material_info") or []
    assert UNCONFIRMED_PAYMENT_TIMING_QUESTION in missing
    assert body.get("generation_outcome") == "needs_details"
    assert "installment" not in doc.lower()
    assert "after receipt of invoice" not in doc.lower()
    assert "$48,000" in doc
    assert "cured within thirty" in doc.lower()

    confirmed = client.post(
        "/api/agreements/premium-full-draft",
        headers=headers,
        json={
            "intake_text": HARBOR_INTAKE,
            "user_gap_answers": "Invoice once on October 1, 2026. Payment due net 30.",
        },
    )
    assert confirmed.status_code == 200, confirmed.text
    confirmed_body = confirmed.json()
    confirmed_doc = str(confirmed_body.get("document_text") or "")
    confirmed_missing = confirmed_body.get("missing_material_info") or []
    assert UNCONFIRMED_PAYMENT_TIMING_QUESTION not in confirmed_missing
    assert "installment" in confirmed_doc.lower()
