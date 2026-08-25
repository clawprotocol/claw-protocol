"""test354: VS01 document content loads after agreement-vs01-seed without /v1 500."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services import document_service
from backend.tests.conftest_auth_security import make_authenticated_user_headers

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-vs01-content-test354", "X-Claw-Test-Auth-User-Id": "test-owner"}
_ORIGIN_H = {
    **_ORG_H,
    "Origin": "https://believable-gentleness-production-3ab6.up.railway.app",
}


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    from backend.usage_economics import store as usage_economics_store_mod

    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _env_common(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    from backend.storage.artifact_repository import reset_artifact_repository_singleton

    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_BLOB_ROOT", str(tmp_path / "blobs"))
    monkeypatch.setenv("CLAW_ARTIFACT_REGISTRY_DB_PATH", str(tmp_path / "registry.sqlite3"))
    monkeypatch.setenv("CLAW_DOCUMENTS_DIR", str(tmp_path / "documents"))
    monkeypatch.setenv("CLAW_STORAGE_BACKEND", "local")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "0")
    monkeypatch.delenv("CLAW_COMMERCIAL_MODE", raising=False)
    reset_artifact_repository_singleton()


def test_v1_document_content_missing_returns_404_not_500(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    res = client.get(
        "/v1/documents/doc_nonexistent0000000000000000/content",
        headers=_ORIGIN_H,
    )
    assert res.status_code == 404, res.text
    assert "internal_error" not in res.text
    assert res.headers.get("access-control-allow-origin")


def test_vs01_seed_then_content_returns_pdf_bytes(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    pytest.importorskip("fitz")
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "VS01 Content Test354",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Red Mesa Logistics LLC", "role": "client", "email": "owner@example.com"},
                {"name": "Harbor Peak Automation LLC", "role": "service_provider", "email": "cp@example.com"},
            ],
            "purpose": "Consulting services for automation implementation and support.",
            "payment_terms": "Net 30",
            "duration": "1 year",
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200, create_res.text
    agreement_id = create_res.json()["id"]

    seed = client.post(
        f"/api/agreements/{agreement_id}/vs01-signing-seed",
        headers=_ORG_H,
        json={},
    )
    assert seed.status_code == 200, seed.text
    body = seed.json()
    doc_id = body["document_id"]
    assert doc_id.startswith("doc_")

    content = client.get(f"/v1/documents/{doc_id}/content", headers=_ORIGIN_H)
    assert content.status_code == 200, content.text
    assert content.content.startswith(b"%PDF")
    assert content.headers.get("access-control-allow-origin")

    meta = document_service.get_document_meta(doc_id) or {}
    assert meta.get("agreement_id") == agreement_id
    assert meta.get("owner_org_id") == "test-org-vs01-content-test354"


def test_vs01_seed_content_ok_under_commercial_mode(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    """Resume finalize → esign bridge: seed must stamp owner_org_id; content requires owner headers."""
    from backend.storage.artifact_repository import reset_artifact_repository_singleton
    from backend.usage_economics import store as usage_economics_store_mod
    from backend.tests.entitlement_test_support import ensure_org_pro_entitlement

    pytest.importorskip("fitz")
    usage_economics_store_mod._store = None  # noqa: SLF001
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("CLAW_BLOB_ROOT", str(tmp_path / "blobs"))
    monkeypatch.setenv("CLAW_ARTIFACT_REGISTRY_DB_PATH", str(tmp_path / "registry.sqlite3"))
    monkeypatch.setenv("CLAW_DOCUMENTS_DIR", str(tmp_path / "documents"))
    monkeypatch.setenv("CLAW_STORAGE_BACKEND", "local")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_NODE_MODE", "api")
    reset_artifact_repository_singleton()

    user = "vs01-seed-commercial-owner"
    ensure_org_pro_entitlement(f"user-{user}", user_id=user)
    headers = make_authenticated_user_headers(user)
    client = TestClient(app, raise_server_exceptions=False)
    create_res = client.post(
        "/api/agreements/draft",
        headers={**headers, "Content-Type": "application/json"},
        json={
            "title": "VS01 Commercial Seed Content",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Red Mesa Logistics LLC", "role": "client", "email": "owner@example.com"},
                {"name": "Harbor Peak Automation LLC", "role": "service_provider", "email": "cp@example.com"},
            ],
            "purpose": "Consulting services for automation implementation and support.",
            "payment_terms": "Net 30",
            "duration": "1 year",
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200, create_res.text
    agreement_id = create_res.json()["id"]

    seed = client.post(
        f"/api/agreements/{agreement_id}/vs01-signing-seed",
        headers=headers,
        json={},
    )
    assert seed.status_code == 200, seed.text
    doc_id = seed.json()["document_id"]
    meta = document_service.get_document_meta(doc_id) or {}
    assert meta.get("owner_org_id") == f"user-{user}"

    anon = client.get(f"/v1/documents/{doc_id}/content")
    assert anon.status_code in (401, 403), anon.text

    content = client.get(f"/v1/documents/{doc_id}/content", headers=headers)
    assert content.status_code == 200, content.text
    assert content.content.startswith(b"%PDF")


def test_vs01_seed_persists_esign_handoff_readable_without_owner_session(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """After-pay /app/esign/doc_* must reload the painted deal when sessionStorage is gone."""
    pytest.importorskip("fitz")
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    painted = (
        "SERVICES AGREEMENT\n\nThis Agreement is entered into by Alex Rivera of Northline Studio "
        "and Jordan Kim of Harbor Marks LLC to design a logo and brand kit. Payment $2,400 due "
        "on signing. Term 30 days. Governing law: Texas."
    )
    assert len(painted) >= 200
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Services Agreement",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Alex Rivera of Northline Studio", "role": "client", "email": "alex.rivera.qa@example.com"},
                {"name": "Jordan Kim of Harbor Marks LLC", "role": "service_provider", "email": "jordan.kim.qa@example.com"},
            ],
            "purpose": "Consulting services for automation implementation and support.",
            "payment_terms": "Net 30",
            "duration": "1 year",
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200, create_res.text
    agreement_id = create_res.json()["id"]

    seed = client.post(
        f"/api/agreements/{agreement_id}/vs01-signing-seed",
        headers=_ORG_H,
        json={
            "signing_corpus_plain": painted,
            "esign_handoff": {
                "agreement_title": "Services Agreement",
                "agreement_corpus_text": painted,
                "creator_name": "Alex Rivera of Northline Studio",
                "creator_email": "alex.rivera.qa@example.com",
                "counterparties": [
                    {
                        "id": "cp1",
                        "name": "Jordan Kim of Harbor Marks LLC",
                        "email": "jordan.kim.qa@example.com",
                        "phone": "",
                    }
                ],
                "source": "paid_pro_sender_first",
                "sender_first_lawdog_handoff": True,
                "owner_is_preparing_packet": True,
                "agreement_bridge_mode": "prepare_signing_packet",
            },
        },
    )
    assert seed.status_code == 200, seed.text
    doc_id = seed.json()["document_id"]
    assert doc_id.startswith("doc_")

    meta = document_service.get_document_meta(doc_id) or {}
    stored = meta.get("esign_handoff_v1")
    assert isinstance(stored, dict)
    assert stored.get("agreement_corpus_text") == painted
    assert stored.get("agreement_id") == agreement_id
    assert stored.get("creator_email") == "alex.rivera.qa@example.com"

    anon = client.get(f"/v1/documents/{doc_id}/esign-handoff")
    assert anon.status_code == 200, anon.text
    body = anon.json()
    assert body.get("ok") is True
    assert body.get("document_id") == doc_id
    assert body["handoff"]["agreement_corpus_text"] == painted
    assert body["handoff"]["counterparties"][0]["email"] == "jordan.kim.qa@example.com"

    missing = client.get("/v1/documents/doc_nonexistent0000000000000000/esign-handoff")
    assert missing.status_code == 404

    # Authoring Sign document after sessionStorage death: document id is enough.
    content_anon = client.get(f"/v1/documents/{doc_id}/content")
    assert content_anon.status_code == 200, content_anon.text
    assert content_anon.content.startswith(b"%PDF")


def test_document_content_survives_malformed_meta(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    _env_common(monkeypatch, tmp_path)
    raw = b"%PDF-1.4 test354"
    meta = document_service.finalize_document(raw, content_type="application/pdf", agreement_id="ag_test354")
    doc_id = meta["document_id"]

    from backend.services import vs01_document_content as vdc

    original_meta = document_service.get_document_meta

    def _bad_meta(document_id: str):
        if document_id == doc_id:
            return {"content_type": 123, "created_at": object()}
        return original_meta(document_id)

    monkeypatch.setattr(document_service, "get_document_meta", _bad_meta)

    loaded, loaded_meta = vdc.load_document_content(doc_id)
    assert loaded == raw
    assert loaded_meta.get("content_type") == 123

    client = TestClient(app, raise_server_exceptions=False)
    res = client.get(f"/v1/documents/{doc_id}/content", headers=_ORIGIN_H)
    assert res.status_code == 200
    assert res.content == raw
