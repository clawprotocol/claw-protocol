"""Completed signed agreement PDF export (fully executed only)."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routers import agreements_v2_api as av2
from backend.services.agreement_pdf_story_capability import reset_agreement_pdf_story_capability_cache_for_tests
from backend.services.agreement_vs01_pdf_seed import AgreementVs01PdfBuild
from backend.services.completed_signed_pdf_export import build_completed_signed_pdf_bytes

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


def _fully_executed_draft_dict() -> dict:
    corpus = (
        "A" * 120
        + "\n\nIN WITNESS WHEREOF\n"
        "CLIENT:\nBy: Alice Example\nDate: June 1, 2026\n"
        "SERVICE PROVIDER:\nBy: Bob Example\nDate: June 1, 2026\n"
    )
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
                "corpus_plain": corpus,
                "captured_at": "2026-06-01T00:00:00Z",
            }
        },
    }


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


def test_build_completed_signed_pdf_bytes_ignores_dashboard_html_input(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from backend.routers.agreements_v2_api import AgreementDraft

    draft = AgreementDraft.model_validate(_fully_executed_draft_dict())
    calls: list[str] = []

    def capture_html(html: str, **_k):
        calls.append(html)
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
    assert "Alice Example" in calls[0]
    assert "Bob Example" in calls[0]
    assert "<pre" in calls[0]
    assert "dashboard-live-html" not in calls[0]


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
