"""Leftover fused GET /content is never a successful paint when persist Review exists."""

from __future__ import annotations

import pytest

from backend.services.vs01_leftover_fused_content import (
    FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE,
    extract_plain_from_document_bytes,
    leftover_get_content_must_refuse,
    review_corpus_looks_like_leftover_fused_notices,
)

pytestmark = pytest.mark.unit

_ORG = "test-org-leftover-get-content"
_USER = "owner-leftover-get-content"
_ORG_H = {"X-Claw-Org-Id": _ORG, "X-Claw-Test-Auth-User-Id": _USER}
_ORIGIN_H = {
    **_ORG_H,
    "Origin": "https://believable-gentleness-staging.up.railway.app",
}

_PAD = "The parties agree to perform the stated obligations in good faith. " * 40


def _certified_review() -> str:
    return (
        "\n".join(
            [
                "SERVICES AGREEMENT",
                "",
                "This Agreement is between Alpha Workshop (Client) and Beta Counsel LLC (Service Provider).",
                "",
                "10. LIABILITY",
                "Each party's aggregate liability is limited to fees paid under this Agreement.",
                "",
                "11. GOVERNING LAW",
                "This Agreement is governed by the laws of the applicable jurisdiction.",
                "",
                "12. NOTICES",
                "If to Alpha Workshop:",
                "Attn: Owner One",
                "Email: owner@example.test",
                "",
                "If to Beta Counsel LLC:",
                "Attn: Signer Two",
                "Email: signer@example.test",
                "",
                "13. MISCELLANEOUS",
                "This Agreement constitutes the entire agreement of the parties.",
            ]
        )
        + "\n\n"
        + _PAD
    ).strip()


def _leftover_fused() -> str:
    return (
        "\n".join(
            [
                "SERVICES AGREEMENT",
                "",
                "This Agreement is between Alpha Workshop (Client) and Beta Counsel LLC (Service Provider).",
                "",
                "10. LIABILITY",
                "Each party's aggregate liability is limited to fees paid under this Agreement.",
                "",
                "12. NOTICES",
                "If to Alpha Workshop Beta Counsel LLC:",
                "Alpha Workshop Beta Counsel LLC",
                "Attn: ________, ________",
                "If to Beta Counsel LLC:",
                "Address:",
                "30 days, Upon full execution by the parties unless otherwise specified.",
                "",
                "13. MISCELLANEOUS",
                "This Agreement is the entire agreement This Agreement is between Alpha Workshop Beta Counsel LLC "
                "('Service Provider') and Service Provider ('Service Provider').",
            ]
        )
        + "\n\n"
        + _PAD
    ).strip()


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    try:
        from backend.usage_economics import store as usage_economics_store_mod
    except Exception:
        yield
        return
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _env(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    from backend.storage.artifact_repository import reset_artifact_repository_singleton

    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
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


def test_leftover_detector_is_generic_and_misses_certified_review():
    leftover = _leftover_fused()
    certified = _certified_review()
    glued = (
        "If to Alpha Workshop Beta Counsel LLC: Alpha Workshop Beta Counsel LLC Attn: ________\n"
        "If to Beta Counsel LLC:\nAddress:\n30 days, Upon full execution by the parties unless otherwise specified."
    )
    assert review_corpus_looks_like_leftover_fused_notices(leftover) is True
    assert review_corpus_looks_like_leftover_fused_notices(glued) is True
    assert review_corpus_looks_like_leftover_fused_notices(certified) is False
    pdf = b"%PDF-1.4\n1 0 obj\n((If to Alpha Workshop Beta Counsel LLC: Address: 30 days, Upon full execution))\n"
    assert review_corpus_looks_like_leftover_fused_notices(extract_plain_from_document_bytes(pdf)) is True


def test_refuse_only_when_leftover_and_persist_review_exists(monkeypatch):
    leftover = _leftover_fused().encode("utf-8")
    certified = _certified_review().encode("utf-8")
    assert leftover_get_content_must_refuse(leftover, {"agreement_id": ""}) is False
    assert leftover_get_content_must_refuse(certified, {"agreement_id": "missing"}) is False

    monkeypatch.setattr(
        "backend.services.vs01_leftover_fused_content.persist_review_exists_for_agreement",
        lambda _aid: True,
    )
    assert leftover_get_content_must_refuse(leftover, {"agreement_id": "ag_persist"}) is True
    assert leftover_get_content_must_refuse(certified, {"agreement_id": "ag_persist"}) is False
    monkeypatch.setattr(
        "backend.services.vs01_leftover_fused_content.persist_review_exists_for_agreement",
        lambda _aid: False,
    )
    assert leftover_get_content_must_refuse(leftover, {"agreement_id": "ag_empty"}) is False


def _create_agreement(client) -> str:
    from backend.tests.entitlement_test_support import ensure_headers_entitled

    headers = ensure_headers_entitled(dict(_ORG_H))
    create_res = client.post(
        "/api/agreements/draft",
        headers=headers,
        json={
            "title": "Services Agreement",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Alpha Workshop", "role": "client", "email": "owner@example.test"},
                {"name": "Beta Counsel LLC", "role": "service_provider", "email": "signer@example.test"},
            ],
            "purpose": "Consulting services",
            "payment_terms": "Net 30",
        },
    )
    assert create_res.status_code == 200, create_res.text
    return create_res.json()["id"]


def _persist_and_accept(client, aid: str, corpus: str) -> dict:
    from backend.services.accepted_review_snapshot import sha256_hex_text
    from backend.tests.entitlement_test_support import ensure_headers_entitled

    headers = ensure_headers_entitled(dict(_ORG_H))
    create = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=headers,
        json={
            "corpus_plain": corpus,
            "generation_session_id": "gen_leftover_content",
            "claimed_digest": sha256_hex_text(corpus),
        },
    )
    assert create.status_code == 200, create.text
    snap = create.json()["snapshot"]
    accept = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot/accept",
        headers=headers,
        json={
            "snapshot_id": snap["snapshot_id"],
            "expected_digest": snap["corpus_sha256"],
            "expected_accepted_snapshot_id": "",
            "accepting_session": "gen_leftover_content",
        },
    )
    assert accept.status_code == 200, accept.text
    return accept.json()["accepted"]


def _put_document(aid: str, doc_id: str, body: bytes) -> None:
    from backend.services import document_service

    document_service.finalize_document(
        body,
        content_type="application/pdf",
        agreement_id=aid,
        owner_org_id=_ORG,
        document_id=doc_id,
    )


def test_leftover_get_content_409_when_persist_review_exists(monkeypatch, tmp_path):
    pytest.importorskip("openai")
    pytest.importorskip("eth_abi")
    from fastapi.testclient import TestClient
    from backend.main import app

    _env(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    aid = _create_agreement(client)
    certified = _certified_review()
    leftover = _leftover_fused()
    _persist_and_accept(client, aid, certified)
    doc_id = "doc_leftoveraaaaaaaaaaaaaaaaaaaaaa"
    _put_document(aid, doc_id, leftover.encode("utf-8"))

    refused = client.get(f"/v1/documents/{doc_id}/content", headers=_ORIGIN_H)
    assert refused.status_code == 409, refused.text
    body = refused.json()
    assert body["error"] == "leftover_fused_content"
    assert body["code"] == FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE
    assert leftover.encode("utf-8") not in refused.content


def test_matching_certified_get_content_is_not_rewritten(monkeypatch, tmp_path):
    pytest.importorskip("openai")
    pytest.importorskip("eth_abi")
    from fastapi.testclient import TestClient
    from backend.main import app

    _env(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    aid = _create_agreement(client)
    certified = _certified_review()
    _persist_and_accept(client, aid, certified)
    doc_id = "doc_certifiedaaaaaaaaaaaaaaaaaaaa"
    raw = certified.encode("utf-8")
    _put_document(aid, doc_id, raw)

    got = client.get(f"/v1/documents/{doc_id}/content", headers=_ORIGIN_H)
    assert got.status_code == 200, got.text
    assert got.content == raw


def test_leftover_get_content_200_only_when_persist_review_missing(monkeypatch, tmp_path):
    pytest.importorskip("openai")
    pytest.importorskip("eth_abi")
    from fastapi.testclient import TestClient
    from backend.main import app

    _env(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    aid = _create_agreement(client)
    leftover = _leftover_fused().encode("utf-8")
    doc_id = "doc_npersistaaaaaaaaaaaaaaaaaaaaa"
    _put_document(aid, doc_id, leftover)

    got = client.get(f"/v1/documents/{doc_id}/content", headers=_ORIGIN_H)
    assert got.status_code == 200, got.text
    assert got.content == leftover
