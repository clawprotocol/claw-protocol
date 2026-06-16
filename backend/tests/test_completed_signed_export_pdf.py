"""Completed signed agreement PDF export (fully executed only)."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routers import agreements_v2_api as av2
from backend.services.agreement_pdf_story_capability import reset_agreement_pdf_story_capability_cache_for_tests
from backend.services.agreement_vs01_pdf_seed import AgreementVs01PdfBuild
from backend.services.completed_signed_pdf_export import (
    build_completed_signed_pdf_bytes,
    completed_signed_corpus_to_export_html,
)

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _reset_capability_cache() -> None:
    reset_agreement_pdf_story_capability_cache_for_tests()
    yield
    reset_agreement_pdf_story_capability_cache_for_tests()


@pytest.fixture
def completed_pdf_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(
        "backend.routers.agreements_v2_api.assert_agreement_full_draft_read_allowed",
        lambda *a, **k: None,
    )
    app = FastAPI()
    app.include_router(av2.router)
    return TestClient(app)


def _sample_signed_corpus() -> str:
    return (
        "CONSULTING AND IMPLEMENTATION AGREEMENT\n\n"
        "This Agreement is entered into as of the Effective Date by and between the parties.\n\n"
        "1. Services and Engagement Structure\n"
        "Service Provider shall perform consulting services as described herein.\n\n"
        "5. Client Responsibilities and Project Cooperation\n"
        "Unless Client approves otherwise, milestones apply as stated.\n\n"
        "5.1 Client Ownership of Paid Deliverables\n"
        "Client owns paid deliverables upon payment in full.\n\n"
        "IN WITNESS WHEREOF, the parties execute this Agreement.\n\n"
        "CLIENT:\n"
        "Red Mesa Logistics LLC\n"
        "By: Alice Example\n"
        "Name: Alice Example\n"
        "Title: CEO\n"
        "Date: June 16, 2026\n\n"
        "SERVICE PROVIDER:\n"
        "Harbor Peak Automation LLC\n"
        "By: Bob Example\n"
        "Name: Bob Example\n"
        "Title: COO\n"
        "Date: June 16, 2026"
    )


def _fully_executed_draft_dict() -> dict:
    return {
        "id": "ag-signed-1",
        "title": "Services Agreement",
        "created_at": "2026-06-01T00:00:00Z",
        "updated_at": "2026-06-01T00:00:00Z",
        "parties": [
            {"name": "Alice", "email": "a@example.com", "role": "client"},
            {"name": "Bob", "email": "b@example.com", "role": "service_provider"},
        ],
        "audit_log": [
            {
                "event_type": "signed",
                "at": "2026-06-01T00:00:00Z",
                "value": {"fully_executed": True},
            }
        ],
        "vs01_signing_packet_v1": {
            "fully_executed_snapshot": {
                "corpus_plain": _sample_signed_corpus(),
                "captured_at": "2026-06-01T00:00:00Z",
            }
        },
    }


def test_completed_signed_export_html_bolds_headings_and_normal_body() -> None:
    html_out = completed_signed_corpus_to_export_html(_sample_signed_corpus())
    assert '<h1 class="completed-signed-doc-title">CONSULTING AND IMPLEMENTATION AGREEMENT</h1>' in html_out
    assert (
        '<h2 class="completed-signed-section-heading">1. Services and Engagement Structure</h2>' in html_out
    )
    assert (
        '<h2 class="completed-signed-section-heading">5. Client Responsibilities and Project Cooperation</h2>'
        in html_out
    )
    assert (
        '<h3 class="completed-signed-subsection-heading">5.1 Client Ownership of Paid Deliverables</h3>' in html_out
    )
    assert '<p class="completed-signed-body">Service Provider shall perform consulting services' in html_out
    assert "<pre" not in html_out
    assert "completed-signed-section-heading" in html_out
    assert html_out.count("completed-signed-body") >= 2


def test_completed_signed_export_html_styles_by_signature_values() -> None:
    html_out = completed_signed_corpus_to_export_html(_sample_signed_corpus())
    assert 'class="completed-signed-signature-script">Alice Example</span>' in html_out
    assert 'class="completed-signed-signature-script">Bob Example</span>' in html_out
    assert 'class="completed-signed-signature-party">CLIENT:</p>' in html_out
    assert 'class="completed-signed-signature-party">SERVICE PROVIDER:</p>' in html_out
    assert "Name: Alice Example" in html_out
    assert 'Name: <span class="completed-signed-signature-script">' not in html_out


def test_completed_signed_export_pdf_403_when_not_fully_executed(
    completed_pdf_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from backend.routers.agreements_v2_api import AgreementDraft

    draft = AgreementDraft.model_validate(
        {
            "id": "ag-draft",
            "title": "Draft",
            "created_at": "2026-06-01T00:00:00Z",
            "updated_at": "2026-06-01T00:00:00Z",
            "parties": [],
            "audit_log": [],
        }
    )
    monkeypatch.setattr("backend.routers.agreements_v2_api._load_or_404", lambda _aid: draft)
    monkeypatch.setattr("backend.routers.agreements_v2_api._agreement_draft_fully_executed", lambda _d: False)
    r = completed_pdf_client.post("/api/agreements/ag-draft/completed-signed-export-pdf")
    assert r.status_code == 403


def test_completed_signed_export_pdf_200_when_fully_executed(
    completed_pdf_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from backend.routers.agreements_v2_api import AgreementDraft

    draft = AgreementDraft.model_validate(_fully_executed_draft_dict())
    monkeypatch.setattr("backend.routers.agreements_v2_api._load_or_404", lambda _aid: draft)
    monkeypatch.setattr("backend.routers.agreements_v2_api._agreement_draft_fully_executed", lambda _d: True)
    monkeypatch.setattr(
        "backend.services.completed_signed_pdf_export.assess_agreement_pdf_story_capability",
        lambda: {"available": True, "engine": "pymupdf-story"},
    )
    monkeypatch.setattr(
        "backend.services.completed_signed_pdf_export.agreement_rendered_html_to_pdf_bytes",
        lambda *_a, **_k: AgreementVs01PdfBuild(
            pdf_bytes=b"%PDF-1.4" + b"\n" * 120,
            render_mode="story_html",
        ),
    )
    r = completed_pdf_client.post("/api/agreements/ag-signed-1/completed-signed-export-pdf")
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert "signed.pdf" in (r.headers.get("content-disposition") or "")
    assert r.content.startswith(b"%PDF")


def test_owner_post_and_public_get_return_identical_canonical_pdf(
    completed_pdf_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from backend.routers.agreements_v2_api import AgreementDraft

    draft = AgreementDraft.model_validate(_fully_executed_draft_dict())
    monkeypatch.setattr("backend.routers.agreements_v2_api._load_or_404", lambda _aid: draft)
    monkeypatch.setattr("backend.routers.agreements_v2_api._agreement_draft_fully_executed", lambda _d: True)
    monkeypatch.setattr("backend.routers.agreements_v2_api.public_agreement_verify_enabled", lambda: True)
    monkeypatch.setattr("backend.routers.agreements_v2_api.load_draft", lambda _aid: draft.model_dump())

    fixed = b"%PDF-1.4-canonical-signed-export-bytes"
    monkeypatch.setattr(
        "backend.services.completed_signed_pdf_export.build_completed_signed_pdf_bytes",
        lambda **_k: (fixed, "services-agreement-signed.pdf"),
    )

    owner = completed_pdf_client.post("/api/agreements/ag-signed-1/completed-signed-export-pdf")
    public = completed_pdf_client.get("/api/agreements/public/ag-signed-1/completed-signed-export-pdf")
    assert owner.status_code == 200
    assert public.status_code == 200
    assert owner.content == public.content == fixed


def test_build_completed_signed_pdf_bytes_uses_canonical_html_renderer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from backend.routers.agreements_v2_api import AgreementDraft

    draft = AgreementDraft.model_validate(_fully_executed_draft_dict())
    calls: list[tuple[str, dict]] = []

    def capture_html(html: str, **kwargs):
        calls.append((html, kwargs))
        return AgreementVs01PdfBuild(pdf_bytes=b"%PDF-1.4" + b"x" * 120, render_mode="story_html")

    monkeypatch.setattr(
        "backend.services.completed_signed_pdf_export.assess_agreement_pdf_story_capability",
        lambda: {"available": True, "engine": "pymupdf-story"},
    )
    monkeypatch.setattr(
        "backend.services.completed_signed_pdf_export.agreement_rendered_html_to_pdf_bytes",
        capture_html,
    )

    build_completed_signed_pdf_bytes(agreement_id="ag-signed-1", draft=draft)
    assert len(calls) == 1
    html_arg, kwargs = calls[0]
    assert "Alice Example" in html_arg
    assert "Bob Example" in html_arg
    assert "completed-signed-section-heading" in html_arg
    assert "completed-signed-signature-script" in html_arg
    assert "<pre" not in html_arg
    assert kwargs.get("story_css_profile") == "completed_signed"
    assert "dashboard-live-html" not in html_arg


def test_public_completed_signed_export_pdf_403_when_not_fully_executed(
    completed_pdf_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from backend.routers.agreements_v2_api import AgreementDraft

    draft = AgreementDraft.model_validate(
        {
            "id": "ag-x",
            "title": "x",
            "created_at": "2026-06-01T00:00:00Z",
            "updated_at": "2026-06-01T00:00:00Z",
            "parties": [],
            "audit_log": [],
        }
    )
    monkeypatch.setattr("backend.routers.agreements_v2_api.public_agreement_verify_enabled", lambda: True)
    monkeypatch.setattr("backend.routers.agreements_v2_api.load_draft", lambda _aid: draft.model_dump())
    monkeypatch.setattr("backend.routers.agreements_v2_api._agreement_draft_fully_executed", lambda _d: False)
    r = completed_pdf_client.get("/api/agreements/public/ag-x/completed-signed-export-pdf")
    assert r.status_code == 403
