"""
Contract tests for the server-side premium-full-draft reliability path.

Invariant under test:
    /api/agreements/premium-full-draft must reliably return a *substantive full Pro corpus*
    or an *explicit server failure/retry* — never a short/starter-style body mislabeled as a
    completed `server_full_draft`.

These tests lock the wire contract described in the reliability spec:
  1. success returns substantive document_text/server_full_document_text above the premium min length
  2. short/degraded model output is returned as failure/retry, not server_full_draft
  3. JSON parse failure WITH a substantive body may still preserve the substantive body
  4. JSON parse failure WITHOUT a substantive body cannot promote starter text
  5. a four-party Pro intake (confidentiality/IP/liability/insurance/notices/governing law)
     produces a full accepted corpus
"""

from __future__ import annotations

import json
from typing import Any, Dict

import pytest
from fastapi.testclient import TestClient

import backend.routers.agreements_v2_api as av2
from backend.agreements.premium_full_draft_quality_gate import (
    PREMIUM_FULL_DRAFT_COMPLEX_MIN_LEN,
    PREMIUM_FULL_DRAFT_FRONTEND_FREEZE_MIN_LEN,
    premium_full_draft_body_meets_substance_floor,
)
from backend.main import app
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-premium-reliability", "X-Claw-Test-Auth-User-Id": "test-owner"}


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


@pytest.fixture(autouse=True)
def _ensure_openai_key(monkeypatch):
    # The route reads the module-global OPENAI_API_KEY; force the model path on in tests.
    monkeypatch.setattr(av2, "OPENAI_API_KEY", "sk-test-premium-reliability")


FOUR_PARTY_INTAKE = (
    "Four-party master services and reseller agreement between Redwood Peak Ventures LLC (Client), "
    "Atlas Harbor Technologies Inc. (Vendor), Silverline Integration Partners LLC (Integrator), and "
    "Northwind Capital Advisors LLC (Guarantor). Include confidentiality, intellectual property and "
    "work product ownership, limitation of liability and indemnification, insurance requirements, "
    "notices, and governing law (Delaware). Total fees $124,750 across milestone payments."
)


def _four_party_context() -> Dict[str, Any]:
    return {
        "title": "Master Services, Reseller, and Guaranty Agreement",
        "jurisdiction": "Delaware",
        "parties": [
            {"name": "Redwood Peak Ventures LLC", "role": "Client"},
            {"name": "Atlas Harbor Technologies Inc.", "role": "Vendor"},
            {"name": "Silverline Integration Partners LLC", "role": "Integrator"},
            {"name": "Northwind Capital Advisors LLC", "role": "Guarantor"},
        ],
        "purpose": "Reseller and white-label services with a guaranty.",
        "payment_terms": "$124,750 across milestone payments",
        "agreement_family": "services_agreement",
        "material_asks": [
            "confidentiality",
            "intellectual property ownership",
            "limitation of liability",
            "insurance",
            "notices",
            "governing law Delaware",
        ],
    }


def _full_four_party_corpus() -> str:
    """A substantive, signable four-party corpus covering every required clause family."""
    sections = [
        "MASTER SERVICES, RESELLER, AND GUARANTY AGREEMENT",
        "This Agreement is entered into by Redwood Peak Ventures LLC (\"Client\"), "
        "Atlas Harbor Technologies Inc. (\"Vendor\"), Silverline Integration Partners LLC "
        "(\"Integrator\"), and Northwind Capital Advisors LLC (\"Guarantor\").",
        "1. SCOPE AND SERVICES. Vendor and Integrator shall deliver the white-label platform, "
        "onboarding, and support described in the statements of work.",
        "2. FEES AND PAYMENT. Client shall pay total fees of $124,750 across milestone payments, "
        "invoiced net thirty (30) days.",
        "3. CONFIDENTIALITY. Each party shall protect the other parties' non-public and "
        "confidential information and use it only to perform this Agreement.",
        "4. INTELLECTUAL PROPERTY AND WORK PRODUCT. Ownership of deliverables and work product "
        "vests in Client upon payment; each party retains its pre-existing materials.",
        "5. LIMITATION OF LIABILITY AND INDEMNIFICATION. Liability is limited except for gross "
        "negligence or willful misconduct; each party shall indemnify the others for third-party claims.",
        "6. INSURANCE. Vendor and Integrator shall maintain commercial general liability and "
        "professional liability insurance in commercially reasonable amounts.",
        "7. TERM AND TERMINATION. The initial term is eighteen (18) months; any party may terminate "
        "for cause on written notice and an opportunity to cure.",
        "8. DISPUTE RESOLUTION. The parties shall negotiate in good faith and then resolve disputes "
        "in the courts of the governing jurisdiction.",
        "9. GOVERNING LAW. This Agreement is governed by the laws of the State of Delaware.",
        "10. NOTICES. Notices shall be sent to each party's designated email and mailing address.",
        "11. GUARANTY. Guarantor guarantees Client's payment obligations under this Agreement.",
        "12. MISCELLANEOUS. This Agreement is the entire agreement; it may be executed in "
        "counterparts; electronic signatures are valid and binding.",
        "IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date by "
        "their duly authorized signatories.",
        "Client: Redwood Peak Ventures LLC   By: ____________  Name: ______  Title: ______  Date: ______",
        "Vendor: Atlas Harbor Technologies Inc.   By: ____________  Name: ______  Title: ______  Date: ______",
        "Integrator: Silverline Integration Partners LLC   By: ____________  Name: ______  Title: ______  Date: ______",
        "Guarantor: Northwind Capital Advisors LLC   By: ____________  Name: ______  Title: ______  Date: ______",
    ]
    body = "\n\n".join(sections)
    # Pad operative detail to comfortably clear the frontend-aligned substance floor
    # (PREMIUM_FULL_DRAFT_FRONTEND_FREEZE_MIN_LEN = 10_000).
    body += "\n\n" + ("Operative detail on performance, acceptance, and delivery standards. " * 200)
    return body


def _full_corpus_json() -> Dict[str, Any]:
    return {
        "title": "Master Services, Reseller, and Guaranty Agreement",
        "agreement_family": "SaaS / software services",
        "document_text": _full_four_party_corpus(),
        "key_terms_found": [
            "$124,750 milestone fees",
            "Confidentiality",
            "IP ownership",
            "Limitation of liability",
            "Insurance",
            "Notices",
            "Delaware governing law",
        ],
        "missing_material_info": [],
    }


def _mid_length_four_party_body() -> str:
    """
    A four-party body that CLEARS the legacy complex substance floor (6k) and passes the quality/intent
    gate, but is BELOW the frontend Source-of-Truth freeze floor (10k). This is the exact TEST562 shape:
    a parseable, structurally-complete-looking body the OLD backend would have shipped as `server_full`
    and the frontend then rejected as `mislabeled_server_full_draft_below_substantive_min`.
    """
    sections = [
        "MASTER SERVICES, RESELLER, AND GUARANTY AGREEMENT",
        "This Agreement is entered into by Redwood Peak Ventures LLC (\"Client\"), "
        "Atlas Harbor Technologies Inc. (\"Vendor\"), Silverline Integration Partners LLC "
        "(\"Integrator\"), and Northwind Capital Advisors LLC (\"Guarantor\").",
        "1. CONFIDENTIALITY. Each party shall protect the others' confidential information.",
        "2. INTELLECTUAL PROPERTY. Ownership of deliverables vests in Client upon payment.",
        "3. LIMITATION OF LIABILITY AND INDEMNIFICATION. Liability is limited; each party indemnifies the others.",
        "4. INSURANCE. Vendor and Integrator maintain commercially reasonable insurance.",
        "5. NOTICES. Notices are sent to each party's designated email and mailing address.",
        "6. GOVERNING LAW. This Agreement is governed by the laws of the State of Delaware.",
        "7. TERM AND TERMINATION. Either party may terminate for cause on written notice.",
        "IN WITNESS WHEREOF, the parties have executed this Agreement.",
        "Client: Redwood Peak Ventures LLC   By: ____  Name: __  Title: __",
        "Vendor: Atlas Harbor Technologies Inc.   By: ____  Name: __  Title: __",
        "Integrator: Silverline Integration Partners LLC   By: ____  Name: __  Title: __",
        "Guarantor: Northwind Capital Advisors LLC   By: ____  Name: __  Title: __",
    ]
    body = "\n\n".join(sections)
    body += "\n\n" + ("Operative detail on scope and delivery. " * 180)
    return body


def _mid_length_corpus_json() -> Dict[str, Any]:
    return {
        "title": "Master Services, Reseller, and Guaranty Agreement",
        "agreement_family": "services_agreement",
        "document_text": _mid_length_four_party_body(),
        "key_terms_found": [
            "Confidentiality",
            "IP ownership",
            "Limitation of liability",
            "Insurance",
            "Notices",
            "Delaware governing law",
        ],
        "missing_material_info": [],
    }


def _post(client: TestClient, *, intake: str, context: Dict[str, Any] | None) -> Any:
    payload: Dict[str, Any] = {"intake_text": intake}
    if context is not None:
        payload["context"] = context
    return client.post("/api/agreements/premium-full-draft", headers=_ORG_H, json=payload)


# --- guard: the fixtures themselves respect the substance floor -------------------------------


def test_fixture_full_corpus_clears_complex_substance_floor():
    ok, reasons = premium_full_draft_body_meets_substance_floor(
        _full_four_party_corpus(),
        intake=FOUR_PARTY_INTAKE,
        context=_four_party_context(),
    )
    assert ok, reasons
    assert len(_full_four_party_corpus()) >= PREMIUM_FULL_DRAFT_COMPLEX_MIN_LEN


# --- contract 1 --------------------------------------------------------------------------------


def test_success_returns_substantive_server_full_above_min_len(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))

    monkeypatch.setattr(av2, "call_legal_llm", lambda *a, **k: json.dumps(_full_corpus_json()))
    client = TestClient(app)
    res = _post(client, intake=FOUR_PARTY_INTAKE, context=_four_party_context())

    assert res.status_code == 200
    body = res.json()
    assert body.get("generation_ok") is True
    assert body.get("retryable") is False
    assert body.get("server_generation_failure_code") in (None, "")
    doc = (body.get("document_text") or "").strip()
    server_full = (body.get("server_full_document_text") or "").strip()
    assert len(doc) >= PREMIUM_FULL_DRAFT_COMPLEX_MIN_LEN
    assert len(server_full) >= PREMIUM_FULL_DRAFT_COMPLEX_MIN_LEN


# --- contract 2 --------------------------------------------------------------------------------


def test_short_model_output_returns_retry_not_server_full(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))

    # ~2353-char body for a complex four-party agreement: below the complex substance floor.
    short_doc = (
        "MASTER AGREEMENT\n\n"
        "1. SCOPE. The parties will work together on services.\n"
        "2. FEES. Client pays fees as discussed.\n"
        "3. CONFIDENTIALITY. Keep information private.\n"
    ) + ("Some operative filler that does not add real clauses. " * 40)
    assert 2_000 <= len(short_doc) <= 3_000  # matches the reported ~2353-char symptom band
    short_json = {
        "title": "Master Agreement",
        "agreement_family": "generic",
        "document_text": short_doc,
        "key_terms_found": [],
        "missing_material_info": [],
    }

    monkeypatch.setattr(av2, "call_legal_llm", lambda *a, **k: json.dumps(short_json))
    client = TestClient(app)
    res = _post(client, intake=FOUR_PARTY_INTAKE, context=_four_party_context())

    assert res.status_code == 503
    body = res.json()
    assert body.get("generation_outcome") == "degraded"
    assert body.get("server_generation_failure_code") == "premium_generation_insufficient"
    assert (body.get("document_text") or "").strip() == ""
    assert (body.get("server_full_document_text") or "").strip() == ""
    assert body.get("generation_ok") is False
    assert body.get("retryable") is True
    # Nothing from the short body leaks onto the wire as a full draft.
    assert short_doc[:40] not in json.dumps(body)


# --- contract 3 --------------------------------------------------------------------------------


def test_json_parse_failure_with_substantive_body_preserves_body(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))

    # Model returned prose instead of JSON, but the prose is a full, substantive corpus.
    prose_corpus = _full_four_party_corpus()
    assert "{" not in prose_corpus and "}" not in prose_corpus

    monkeypatch.setattr(av2, "call_legal_llm", lambda *a, **k: prose_corpus)
    client = TestClient(app)
    res = _post(client, intake=FOUR_PARTY_INTAKE, context=_four_party_context())

    assert res.status_code == 200
    body = res.json()
    assert body.get("generation_outcome") == "degraded"
    assert body.get("server_generation_failure_code") == "json_parse"
    assert body.get("generation_ok") is True
    assert body.get("retryable") is False
    doc = (body.get("document_text") or "").strip()
    server_full = (body.get("server_full_document_text") or "").strip()
    assert len(doc) >= PREMIUM_FULL_DRAFT_COMPLEX_MIN_LEN
    assert len(server_full) >= PREMIUM_FULL_DRAFT_COMPLEX_MIN_LEN
    reasons = body.get("schema_validation_reasons") or []
    assert any(str(x).startswith("preserved_substantive_body:") for x in reasons)


# --- contract 4 --------------------------------------------------------------------------------


def test_json_parse_failure_without_substantive_body_cannot_promote_starter(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))

    # Non-JSON, and far too short to be a full corpus.
    junk = "I'm sorry, I can't complete that request right now."

    monkeypatch.setattr(av2, "call_legal_llm", lambda *a, **k: junk)
    client = TestClient(app)
    res = _post(client, intake=FOUR_PARTY_INTAKE, context=_four_party_context())

    assert res.status_code == 503
    body = res.json()
    assert body.get("generation_outcome") == "degraded"
    assert body.get("server_generation_failure_code") == "json_parse"
    assert (body.get("document_text") or "").strip() == ""
    assert (body.get("server_full_document_text") or "").strip() == ""
    assert body.get("generation_ok") is False
    assert body.get("retryable") is True
    # Neither the junk text nor the intake is promoted into a body.
    assert junk not in json.dumps(body)
    assert "Redwood Peak Ventures" not in (body.get("document_text") or "")
    reasons = body.get("schema_validation_reasons") or []
    assert any(str(x).startswith("fallback_suppressed:") for x in reasons)


# --- contract 5 --------------------------------------------------------------------------------


def test_four_party_full_intake_produces_accepted_corpus(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))

    monkeypatch.setattr(av2, "call_legal_llm", lambda *a, **k: json.dumps(_full_corpus_json()))
    client = TestClient(app)
    res = _post(client, intake=FOUR_PARTY_INTAKE, context=_four_party_context())

    assert res.status_code == 200
    body = res.json()
    assert body.get("generation_ok") is True
    doc_low = (body.get("document_text") or "").lower()
    assert len(doc_low) >= PREMIUM_FULL_DRAFT_COMPLEX_MIN_LEN
    for family in (
        "confidential",
        "intellectual property",
        "liability",
        "insurance",
        "notices",
        "governing law",
    ):
        assert family in doc_low
    # All four parties are present in the accepted corpus.
    for party in (
        "redwood peak ventures",
        "atlas harbor technologies",
        "silverline integration partners",
        "northwind capital advisors",
    ):
        assert party in doc_low


# --- TEST562: frontend-freeze-floor alignment + server-side regeneration ----------------------


def test_mid_length_body_shape_matches_test562_symptom():
    """The mid-length fixture clears the legacy floor but is below the frontend freeze floor."""
    body = _mid_length_four_party_body()
    assert len(body) >= PREMIUM_FULL_DRAFT_COMPLEX_MIN_LEN
    assert len(body) < PREMIUM_FULL_DRAFT_FRONTEND_FREEZE_MIN_LEN
    # Under the aligned floor this body is NOT a returnable Pro corpus.
    ok, reasons = premium_full_draft_body_meets_substance_floor(
        body, intake=FOUR_PARTY_INTAKE, context=_four_party_context()
    )
    assert ok is False
    assert any("below_premium_substantive_min_len" in r for r in reasons)


def test_thin_primary_repaired_to_substantive_returns_full_server_full(monkeypatch, tmp_path):
    """A thin (6k–10k) primary must trigger server-side regeneration; the substantive repair is returned."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))

    calls = {"n": 0}

    def fake_llm(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return json.dumps(_mid_length_corpus_json())  # thin, below frontend freeze floor
        return json.dumps(_full_corpus_json())  # substantive repair

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = _post(client, intake=FOUR_PARTY_INTAKE, context=_four_party_context())

    assert res.status_code == 200
    assert calls["n"] == 2  # server-side regeneration happened before returning
    body = res.json()
    assert body.get("generation_ok") is True
    assert body.get("retryable") is False
    doc = (body.get("document_text") or "").strip()
    server_full = (body.get("server_full_document_text") or "").strip()
    # The authoritative body is the substantive repair, above the frontend freeze floor...
    assert len(doc) >= PREMIUM_FULL_DRAFT_FRONTEND_FREEZE_MIN_LEN
    # ...and server_full_document_text carries the SAME final body, never the thin primary.
    assert len(server_full) >= PREMIUM_FULL_DRAFT_FRONTEND_FREEZE_MIN_LEN
    assert server_full == doc


def test_persistently_thin_returns_retryable_not_thin_server_full(monkeypatch, tmp_path):
    """
    The core TEST562 regression: a body between the legacy floor and the frontend freeze floor must
    NEVER be returned as a successful server_full_draft. After the regeneration retry still yields a
    thin body, the backend surfaces an explicit retryable failure with an empty body.
    """
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))

    thin_body = _mid_length_four_party_body()
    monkeypatch.setattr(av2, "call_legal_llm", lambda *a, **k: json.dumps(_mid_length_corpus_json()))
    client = TestClient(app)
    res = _post(client, intake=FOUR_PARTY_INTAKE, context=_four_party_context())

    assert res.status_code == 503
    body = res.json()
    assert body.get("generation_outcome") == "degraded"
    assert body.get("server_generation_failure_code") == "premium_generation_insufficient"
    assert (body.get("document_text") or "").strip() == ""
    assert (body.get("server_full_document_text") or "").strip() == ""
    assert body.get("generation_ok") is False
    assert body.get("retryable") is True
    # No 6k–10k body leaks onto the wire as a full draft.
    assert thin_body[:60] not in json.dumps(body)


def test_json_parse_thin_regenerates_then_recovers_substantive(monkeypatch, tmp_path):
    """A non-JSON, non-substantive first turn triggers one clean regeneration before failing."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))

    calls = {"n": 0}

    def fake_llm(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return "I'm sorry, I can't complete that request right now."  # non-JSON, thin
        return json.dumps(_full_corpus_json())  # clean substantive regeneration

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = _post(client, intake=FOUR_PARTY_INTAKE, context=_four_party_context())

    assert res.status_code == 200
    assert calls["n"] == 2  # server-side regeneration recovered a parseable JSON body
    body = res.json()
    assert body.get("generation_ok") is True
    assert len((body.get("server_full_document_text") or "").strip()) >= PREMIUM_FULL_DRAFT_FRONTEND_FREEZE_MIN_LEN


def test_diagnostics_log_emits_required_fields_on_success(monkeypatch, tmp_path, caplog):
    """Diagnostics (requirement #4): raw model len, document_text len, server_full len, validation, reason."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))

    monkeypatch.setattr(av2, "call_legal_llm", lambda *a, **k: json.dumps(_full_corpus_json()))
    client = TestClient(app)
    with caplog.at_level("INFO"):
        res = _post(client, intake=FOUR_PARTY_INTAKE, context=_four_party_context())

    assert res.status_code == 200
    diag = [r.getMessage() for r in caplog.records if "[premium-full-draft-diagnostics]" in r.getMessage()]
    assert diag, "expected a [premium-full-draft-diagnostics] log line"
    line = diag[-1]
    for field in (
        "outcome=success",
        "raw_model_len=",
        "document_text_len=",
        "server_full_document_text_len=",
        "agreement_validation_passed=",
        "parse_reason=",
        "degraded_reason=",
    ):
        assert field in line


def test_diagnostics_log_emits_required_fields_on_degraded(monkeypatch, tmp_path, caplog):
    """Diagnostics must also be emitted on the degraded/retry path."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))

    monkeypatch.setattr(av2, "call_legal_llm", lambda *a, **k: json.dumps(_mid_length_corpus_json()))
    client = TestClient(app)
    with caplog.at_level("INFO"):
        res = _post(client, intake=FOUR_PARTY_INTAKE, context=_four_party_context())

    assert res.status_code == 503
    diag = [r.getMessage() for r in caplog.records if "[premium-full-draft-diagnostics]" in r.getMessage()]
    assert diag, "expected a [premium-full-draft-diagnostics] log line"
    assert any("outcome=degraded" in line for line in diag)
    assert any("degraded_reason=premium_generation_insufficient" in line for line in diag)
