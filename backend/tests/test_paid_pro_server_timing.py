"""Premium-full-draft server timing header — perf trace only, no body changes."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict

import pytest
from fastapi.testclient import TestClient

from backend.agreements.paid_pro_server_timing import (
    PAID_PRO_PERF_TRACE_REQUEST_HEADER,
    PAID_PRO_SERVER_TIMING_RESPONSE_HEADER,
    paid_pro_perf_trace_requested,
)
from backend.main import app
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-api-v2"}
_PERF_H = {PAID_PRO_PERF_TRACE_REQUEST_HEADER: "1"}

LOGO_INTAKE = (
    "Client Co hires Designer LLC for logo design in California. "
    "Flat fee $1,500 including two revision rounds. IP vests in Client upon payment."
)


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _long_commercial_body(extra: str = "") -> str:
    base = (
        "1. Scope. Designer shall deliver logo concepts, revisions, and final files.\n"
        "2. Payment. Client pays a $1,500 flat fee; invoicing and compensation as stated.\n"
        "3. Intellectual Property. Work product and ownership vest in Client upon payment.\n"
        "4. Confidentiality. Each party protects the other's non-public information.\n"
        "5. Term and Termination. Either party may terminate on written notice.\n"
        "6. Limitation of Liability. Liability is limited except for gross negligence.\n"
        "7. Dispute Resolution. Good-faith negotiation, then the selected venue/jurisdiction.\n"
        "8. Governing Law. This agreement is governed by the law of the stated state.\n"
        "9. Notices. Notices are sent to the designated email and mailing addresses.\n"
        "10. Miscellaneous. Entire agreement; counterparts; electronic signatures are valid.\n"
        "\nIN WITNESS WHEREOF, the parties execute this Agreement by their authorized signatures.\n"
        "Signature: ______________________  Name: ______  Title: ______  Date: ______\n"
        + extra
    )
    # Clear the frontend-aligned substance floor (PREMIUM_FULL_DRAFT_FRONTEND_FREEZE_MIN_LEN = 10_000)
    # so the accepted-response path (200) is exercised rather than the retry path (503).
    while len(base) < 11_000:
        base += "\nAdditional operative clause for acceptance and delivery standards.\n"
    return base


def _wire_json() -> Dict[str, Any]:
    body = _long_commercial_body("\nFlat fee **$1,500** for logo work including **two revision rounds**.\n")
    return {
        "title": "Logo Design Services Agreement",
        "agreement_family": "Creative services",
        "document_text": body,
        "key_terms_found": ["Fee", "Revisions", "IP"],
        "missing_material_info": [],
    }


def _post_premium_full_draft(client: TestClient, *, perf_trace: bool) -> Any:
    headers = {**_ORG_H, **(_PERF_H if perf_trace else {})}
    return client.post(
        "/api/agreements/premium-full-draft",
        headers=headers,
        json={
            "intake_text": LOGO_INTAKE,
            "agreement_generation_id": "c1f75f50-c35f-47a9-a62b-22b17e3c6f20",
            "intake_fingerprint": "fp-test245-backend",
            "context": {
                "title": "Logo Design Services Agreement",
                "jurisdiction": "California",
                "parties": [
                    {"name": "Client Co", "role": "Client"},
                    {"name": "Designer LLC", "role": "Designer"},
                ],
                "purpose": "Logo design engagement.",
                "payment_terms": "1500 USD flat",
                "material_asks": ["$1,500", "2 revisions"],
                "agreement_family": "services_agreement",
            },
        },
    )


def test_paid_pro_perf_trace_requested_header() -> None:
    class _Req:
        headers = {"x-claw-paid-pro-perf-trace": "1"}

    assert paid_pro_perf_trace_requested(_Req()) is True


def test_premium_full_draft_server_timing_header_only_with_perf_trace(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    import backend.routers.agreements_v2_api as av2

    monkeypatch.setattr(av2, "call_legal_llm", lambda *a, **k: json.dumps(_wire_json()))

    client = TestClient(app)
    without = _post_premium_full_draft(client, perf_trace=False)
    assert without.status_code == 200
    assert without.headers.get(PAID_PRO_SERVER_TIMING_RESPONSE_HEADER) is None

    with_trace = _post_premium_full_draft(client, perf_trace=True)
    assert with_trace.status_code == 200
    raw_timing = with_trace.headers.get(PAID_PRO_SERVER_TIMING_RESPONSE_HEADER)
    assert raw_timing
    timing = json.loads(raw_timing)
    names = [s["name"] for s in timing.get("spans", [])]
    assert "backend_request_total" in names
    assert "backend_request_received" in names
    assert "backend_context_assembly" in names
    assert "backend_prompt_assembly" in names
    assert "backend_llm_api_call_start" in names
    assert "backend_llm_primary" in names
    assert "backend_parse_normalize" in names
    assert "backend_post_processing" in names
    assert "backend_quality_grade" in names
    assert "backend_validation" in names
    assert "backend_response_packaging" in names
    assert timing.get("dominantSpan", {}).get("name") in names
    assert timing.get("traceId") == "c1f75f50-c35f-47a9-a62b-22b17e3c6f20"
    llm_primary = next(s for s in timing["spans"] if s["name"] == "backend_llm_primary")
    assert llm_primary["durationMs"] >= 0


def test_premium_full_draft_timing_does_not_mutate_response_body(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    import backend.routers.agreements_v2_api as av2

    monkeypatch.setattr(av2, "call_legal_llm", lambda *a, **k: json.dumps(_wire_json()))

    client = TestClient(app)
    plain = _post_premium_full_draft(client, perf_trace=False).json()
    traced = _post_premium_full_draft(client, perf_trace=True).json()

    for key in ("document_text", "server_full_document_text", "authoritative_draft", "title", "generation_outcome"):
        assert plain.get(key) == traced.get(key), key

    doc_hash = hashlib.sha256((plain.get("document_text") or "").encode()).hexdigest()
    traced_doc_hash = hashlib.sha256((traced.get("document_text") or "").encode()).hexdigest()
    assert doc_hash == traced_doc_hash


def test_cors_exposes_paid_pro_server_timing_header(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    import backend.routers.agreements_v2_api as av2

    monkeypatch.setattr(av2, "call_legal_llm", lambda *a, **k: json.dumps(_wire_json()))

    client = TestClient(app)
    headers = {**_ORG_H, **_PERF_H, "Origin": "http://localhost:5173"}
    res = client.post(
        "/api/agreements/premium-full-draft",
        headers=headers,
        json={
            "intake_text": LOGO_INTAKE,
            "context": {
                "title": "Logo Design Services Agreement",
                "jurisdiction": "California",
                "parties": [
                    {"name": "Client Co", "role": "Client"},
                    {"name": "Designer LLC", "role": "Designer"},
                ],
                "purpose": "Logo design engagement.",
                "payment_terms": "1500 USD flat",
                "agreement_family": "services_agreement",
            },
        },
    )
    assert res.status_code == 200
    expose = (res.headers.get("access-control-expose-headers") or "").lower()
    assert PAID_PRO_SERVER_TIMING_RESPONSE_HEADER.lower() in expose


def test_repair_path_records_llm_repair_or_regen_span(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    import backend.routers.agreements_v2_api as av2

    bad_json: Dict[str, Any] = {
        "title": "AGREEMENT",
        "agreement_family": "generic",
        "document_text": "Sparse-prompt premium expansion (NDA default pack):\n" + "x" * 1700,
        "key_terms_found": [],
        "missing_material_info": [],
    }
    good_json = _wire_json()
    calls = {"n": 0}

    def fake_llm(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return json.dumps(bad_json)
        return json.dumps(good_json)

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = _post_premium_full_draft(client, perf_trace=True)
    assert res.status_code == 200
    assert calls["n"] == 2
    timing = json.loads(res.headers[PAID_PRO_SERVER_TIMING_RESPONSE_HEADER])
    names = [s["name"] for s in timing.get("spans", [])]
    assert "backend_llm_repair_or_regen" in names
    assert "backend_llm_repair" in names
