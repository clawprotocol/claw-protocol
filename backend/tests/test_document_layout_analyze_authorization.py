"""P0 regression: document-layout analyze must authorize before byte load or pipeline."""

from __future__ import annotations

import base64
import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.recipient_access_token import mint_recipient_access_token
from backend.services import document_service
from backend.tests.conftest_auth_security import mint_anonymous_session
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORG_A = {"X-Claw-Org-Id": "layout-analyze-org-a"}
_ORG_B = {"X-Claw-Org-Id": "layout-analyze-org-b"}
_LOCAL_ORG = {"X-Claw-Org-Id": "local-org"}
_SIGNING_SECRET = "layout-analyze-signing-secret"
_MINIMAL_PDF = b"%PDF-1.4 layout analyze test"
_MOCK_ANALYSIS = {
    "analysis_id": "layout_test00000000000001",
    "page_count": 1,
    "field_candidates": [],
    "document_id_ref": None,
}


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _configure_storage(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    from backend.storage.artifact_repository import reset_artifact_repository_singleton

    layout_dir = tmp_path / "layout_analysis"
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("CLAW_BLOB_ROOT", str(tmp_path / "blobs"))
    monkeypatch.setenv("CLAW_ARTIFACT_REGISTRY_DB_PATH", str(tmp_path / "registry.sqlite3"))
    monkeypatch.setenv("CLAW_DOCUMENTS_DIR", str(tmp_path / "documents"))
    monkeypatch.setenv("CLAW_RECEIPTS_DIR", str(tmp_path / "receipts"))
    monkeypatch.setenv("CLAW_SIGN_SESSIONS_DIR", str(tmp_path / "sessions"))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_LAYOUT_ANALYSIS_DIR", str(layout_dir))
    monkeypatch.setenv("CLAW_STORAGE_BACKEND", "local")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _SIGNING_SECRET)
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")
    reset_artifact_repository_singleton()
    return layout_dir


def _configure_production_like(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    return _configure_storage(monkeypatch, tmp_path)


def _create_agreement(client: TestClient, org_headers: dict) -> str:
    res = client.post(
        "/api/agreements/draft",
        headers=org_headers,
        json={
            "title": "Layout analyze contract",
            "jurisdiction": "TX",
            "parties": [{"name": "Owner", "role": "owner", "id": "p-owner"}],
            "purpose": "Layout analyze authorization testing",
            "payment_terms": "Net 30",
        },
    )
    assert res.status_code == 200, res.text
    return res.json()["id"]


def _finalize_document(*, agreement_id: str) -> str:
    meta = document_service.finalize_document(
        _MINIMAL_PDF,
        content_type="application/pdf",
        agreement_id=agreement_id,
    )
    return meta["document_id"]


def _analyze_payload(document_id: str) -> dict:
    return {
        "document_id": document_id,
        "content_type": "application/pdf",
        "options": {"assistive_llm": False, "persist": True},
    }


def _layout_files(layout_dir) -> list:
    if not layout_dir.exists():
        return []
    return list(layout_dir.glob("**/*"))


@pytest.fixture()
def analyze_mocks():
    with patch(
        "backend.routers.document_layout_api.document_service.get_document_bytes",
        return_value=_MINIMAL_PDF,
    ) as get_bytes, patch(
        "backend.routers.document_layout_api.run_layout_analysis",
        return_value=dict(_MOCK_ANALYSIS),
    ) as run_pipeline:
        yield get_bytes, run_pipeline


def test_owner_cannot_analyze_cross_tenant_document(
    monkeypatch, tmp_path, analyze_mocks
) -> None:
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    layout_dir = _configure_storage(monkeypatch, tmp_path)
    get_bytes, run_pipeline = analyze_mocks
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document(agreement_id=aid)
    before = _layout_files(layout_dir)

    res = client.post("/v1/document-layout/analyze", headers=_ORG_B, json=_analyze_payload(doc_id))

    assert res.status_code == 404
    assert res.json()["detail"] == "not_found"
    get_bytes.assert_not_called()
    run_pipeline.assert_not_called()
    assert _layout_files(layout_dir) == before


def test_integration_alias_same_cross_tenant_denial(
    monkeypatch, tmp_path, analyze_mocks
) -> None:
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    layout_dir = _configure_storage(monkeypatch, tmp_path)
    get_bytes, run_pipeline = analyze_mocks
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document(agreement_id=aid)
    before = _layout_files(layout_dir)

    res = client.post("/v1/integration/documents/analyze", headers=_ORG_B, json=_analyze_payload(doc_id))

    assert res.status_code == 404
    assert res.json()["detail"] == "not_found"
    get_bytes.assert_not_called()
    run_pipeline.assert_not_called()
    assert _layout_files(layout_dir) == before


def test_unknown_and_cross_tenant_analyze_responses_match(
    monkeypatch, tmp_path, analyze_mocks
) -> None:
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    get_bytes, run_pipeline = analyze_mocks
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document(agreement_id=aid)

    unknown = client.post(
        "/v1/document-layout/analyze",
        headers=_ORG_B,
        json=_analyze_payload("doc_nonexistent0000000000000000"),
    )
    cross = client.post(
        "/v1/document-layout/analyze",
        headers=_ORG_B,
        json=_analyze_payload(doc_id),
    )

    assert unknown.status_code == 404
    assert cross.status_code == 404
    assert unknown.json()["detail"] == cross.json()["detail"] == "not_found"
    get_bytes.assert_not_called()
    run_pipeline.assert_not_called()


def test_missing_identity_cannot_analyze_document(monkeypatch, tmp_path, analyze_mocks) -> None:
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    get_bytes, run_pipeline = analyze_mocks
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document(agreement_id=aid)

    res = client.post("/v1/document-layout/analyze", json=_analyze_payload(doc_id))

    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "org_header_required"
    get_bytes.assert_not_called()
    run_pipeline.assert_not_called()


def test_production_forged_local_org_cannot_analyze(
    monkeypatch, tmp_path, analyze_mocks
) -> None:
    _configure_production_like(monkeypatch, tmp_path)
    get_bytes, run_pipeline = analyze_mocks
    client = TestClient(app)
    _, _, verified_headers = mint_anonymous_session(client)
    aid = _create_agreement(client, verified_headers)
    doc_id = _finalize_document(agreement_id=aid)

    res = client.post("/v1/document-layout/analyze", headers=_LOCAL_ORG, json=_analyze_payload(doc_id))

    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "owner_identity_unverified"
    get_bytes.assert_not_called()
    run_pipeline.assert_not_called()


def test_verified_owner_can_analyze_own_document(
    monkeypatch, tmp_path, analyze_mocks
) -> None:
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    get_bytes, run_pipeline = analyze_mocks
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document(agreement_id=aid)

    res = client.post("/v1/document-layout/analyze", headers=_ORG_A, json=_analyze_payload(doc_id))

    assert res.status_code == 200, res.text
    assert res.json()["ok"] is True
    get_bytes.assert_called_once_with(doc_id)
    run_pipeline.assert_called_once()


def test_recipient_token_rejected_for_layout_analyze(
    monkeypatch, tmp_path, analyze_mocks
) -> None:
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    get_bytes, run_pipeline = analyze_mocks
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id = _finalize_document(agreement_id=aid)
    token = mint_recipient_access_token(
        secret=os.environ["CLAW_AGREEMENT_SIGNING_TOKEN_SECRET"].encode("utf-8"),
        agreement_id=aid,
        locked_version_id="v1",
        mode="review",
        role="signer",
        ttl_seconds=3600,
        recipient_party_id="p-signer",
    )

    with patch(
        "backend.security.sensitive_read_authorization._activation_document_id_for_agreement",
        return_value=doc_id,
    ):
        res = client.post(
            "/v1/document-layout/analyze",
            headers={**_ORG_A, "X-Claw-Recipient-Access-Token": token},
            json=_analyze_payload(doc_id),
        )

    assert res.status_code == 404
    assert res.json()["detail"] == "not_found"
    get_bytes.assert_not_called()
    run_pipeline.assert_not_called()


def test_review_manifest_put_private_cache_headers(monkeypatch, tmp_path) -> None:
    layout_dir = _configure_storage(monkeypatch, tmp_path)
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "0")
    from backend.document_layout.store import save_layout_analysis

    analysis_id = "layout_abcd1234ef56"
    save_layout_analysis(
        analysis_id,
        {
            "analysis_id": analysis_id,
            "owner_subject": "org:layout-analyze-org-a",
            "field_candidates": [
                {
                    "candidate_id": "cand_1",
                    "page_number": 1,
                    "field_type_guess": "signature_line",
                    "confidence": 0.9,
                    "bbox_normalized": {"x": 0.1, "y": 0.8, "width": 0.4, "height": 0.02},
                    "bbox_pdf": {},
                }
            ],
        },
    )
    assert list(layout_dir.glob("**/*"))

    client = TestClient(app)
    res = client.put(
        f"/v1/document-layout/analysis/{analysis_id}/review-manifest",
        headers=_ORG_A,
        json={"actions": [{"action": "confirm", "candidate_id": "cand_1"}]},
    )
    assert res.status_code == 200, res.text
    assert res.headers.get("cache-control") == "no-store, private"
