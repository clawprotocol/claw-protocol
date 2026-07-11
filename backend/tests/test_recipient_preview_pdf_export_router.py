"""Recipient preview PDF export: fail-safe (no silent low-quality PDF)."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routers import agreements_v2_api as av2
from backend.services.agreement_pdf_story_capability import reset_agreement_pdf_story_capability_cache_for_tests
from backend.services.agreement_vs01_pdf_seed import AgreementVs01PdfBuild

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _reset_capability_cache() -> None:
    reset_agreement_pdf_story_capability_cache_for_tests()
    yield
    reset_agreement_pdf_story_capability_cache_for_tests()


@pytest.fixture
def pdf_export_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(
        "backend.routers.agreements_v2_api.assert_agreement_full_draft_read_allowed",
        lambda *a, **k: None,
    )

    def _stub_load(agreement_id: str):
        from backend.routers.agreements_v2_api import AgreementDraft

        return AgreementDraft(
            id=agreement_id,
            title="PDF export fixture",
            jurisdiction="TX",
            parties=[{"name": "Owner", "role": "owner", "id": "p1"}],
            purpose="Services",
            payment_terms="Net 30",
            duration=None,
            due_date=None,
            effective_date=None,
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
            versions=[],
            audit_log=[],
        )

    monkeypatch.setattr("backend.routers.agreements_v2_api._load_or_404", _stub_load)
    app = FastAPI()
    app.include_router(av2.router)
    return TestClient(app)


def test_recipient_preview_export_pdf_503_when_capability_unavailable(
    pdf_export_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "backend.routers.agreements_v2_api.assess_agreement_pdf_story_capability",
        lambda: {"available": False, "engine": "fallback", "reason": "unit_forced_unavailable"},
    )
    called: list[str] = []

    def boom(*_a, **_k):
        called.append("render")
        raise AssertionError("render must not run when capability is false")

    monkeypatch.setattr("backend.routers.agreements_v2_api.agreement_rendered_html_to_pdf_bytes", boom)
    r = pdf_export_client.post(
        "/api/agreements/ag-pdf-1/recipient-preview-export-pdf",
        json={"export_kind": "original", "html": "<p>Hello</p>"},
    )
    assert r.status_code == 503
    assert called == []
    detail = r.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("code") == "recipient_pdf_export_unavailable"
    assert "text" in (detail.get("message") or "").lower()


def test_recipient_preview_export_pdf_503_when_render_mode_not_story(
    pdf_export_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "backend.routers.agreements_v2_api.assess_agreement_pdf_story_capability",
        lambda: {"available": True, "engine": "pymupdf-story"},
    )
    monkeypatch.setattr(
        "backend.routers.agreements_v2_api.agreement_rendered_html_to_pdf_bytes",
        lambda *_a, **_k: AgreementVs01PdfBuild(
            pdf_bytes=b"%PDF-1.4" + b"\n" * 120,
            render_mode="plaintext_after_story_error",
        ),
    )
    r = pdf_export_client.post(
        "/api/agreements/ag-pdf-2/recipient-preview-export-pdf",
        json={"export_kind": "proposed", "html": "<p>x</p>"},
    )
    assert r.status_code == 503
    detail = r.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("code") == "recipient_pdf_export_unavailable"


def test_recipient_preview_export_pdf_200_only_for_story_render_modes(
    pdf_export_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "backend.routers.agreements_v2_api.assess_agreement_pdf_story_capability",
        lambda: {"available": True, "engine": "pymupdf-story"},
    )
    monkeypatch.setattr(
        "backend.routers.agreements_v2_api.agreement_rendered_html_to_pdf_bytes",
        lambda *_a, **_k: AgreementVs01PdfBuild(
            pdf_bytes=b"%PDF-1.4" + b"\n" * 120,
            render_mode="story_html",
        ),
    )
    r = pdf_export_client.post(
        "/api/agreements/ag-pdf-3/recipient-preview-export-pdf",
        json={"export_kind": "redline", "html": "<article><p>z</p></article>"},
    )
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf")
    cd = r.headers.get("content-disposition") or ""
    assert "lawdog-redline-preview.pdf" in cd
    assert r.content.startswith(b"%PDF")
