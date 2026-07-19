"""GTM Security Slice 3 — legacy signing production containment and token transport."""

from __future__ import annotations

import base64
import concurrent.futures
import os
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.recipient_access_token import mint_recipient_access_token
from backend.security.sensitive_mutation_authorization import (
    LEGACY_SIGNING_DEFERRED_DETAIL,
    is_explicit_legacy_signing_relaxed_environment,
)
from backend.services import document_service, receipt_service, signature_service
from backend.tests.conftest_auth_security import mint_anonymous_session
from backend.usage_economics import store as usage_economics_store_mod
from backend.utils.timeline_store import TimelineStore

pytestmark = pytest.mark.unit

_ORG_A = {"X-Claw-Org-Id": "slice3-org-a"}
_ORG_B = {"X-Claw-Org-Id": "slice3-org-b"}
_LOCAL_ORG = {"X-Claw-Org-Id": "local-org"}
_SIGNING_SECRET = "slice3-signing-token-secret"
_FIELD_MANIFEST = [
    {"field_id": "f1", "page_index": 0, "x": 1.0, "y": 2.0, "w": 3.0, "h": 4.0},
]

_RELAXED_ENVIRONMENTS = ("local", "dev", "test")
_FAIL_CLOSED_ENVIRONMENTS = (
    None,
    "",
    " ",
    "local ",
    " local",
    " local ",
    "LOCAL",
    "Dev",
    "TEST",
    "ci",
    "preview",
    "staging",
    "stage",
    "production",
    "prod",
    "arbitrary-unknown-value",
)


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _configure_storage(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    from backend.storage.artifact_repository import reset_artifact_repository_singleton

    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("CLAW_BLOB_ROOT", str(tmp_path / "blobs"))
    monkeypatch.setenv("CLAW_ARTIFACT_REGISTRY_DB_PATH", str(tmp_path / "registry.sqlite3"))
    monkeypatch.setenv("CLAW_DOCUMENTS_DIR", str(tmp_path / "documents"))
    monkeypatch.setenv("CLAW_RECEIPTS_DIR", str(tmp_path / "receipts"))
    monkeypatch.setenv("CLAW_SIGN_SESSIONS_DIR", str(tmp_path / "sessions"))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_STORAGE_BACKEND", "local")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _SIGNING_SECRET)
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")
    reset_artifact_repository_singleton()


def _configure_production_like(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_RATE_LIMIT_RPS", "1000")
    monkeypatch.setenv("CLAW_RATE_LIMIT_BURST", "1000")
    _configure_storage(monkeypatch, tmp_path)


def _set_environment(monkeypatch: pytest.MonkeyPatch, env_value: str | None) -> None:
    if env_value is None:
        monkeypatch.delenv("CLAW_ENVIRONMENT", raising=False)
    else:
        monkeypatch.setenv("CLAW_ENVIRONMENT", env_value)


def _seed_document_direct(
    *,
    owner_subject: str = "org:slice3-org-a",
    agreement_id: str | None = None,
) -> tuple[str, str]:
    raw = b"%PDF-1.4 slice3 document"
    if agreement_id:
        meta = document_service.finalize_document(
            raw,
            content_type="application/pdf",
            agreement_id=agreement_id,
        )
    else:
        meta = document_service.finalize_document(
            raw,
            content_type="application/pdf",
            owner_subject=owner_subject,
        )
    return meta["document_id"], meta["content_sha256"]


def _create_agreement(client: TestClient, org_headers: dict) -> str:
    res = client.post(
        "/api/agreements/draft",
        headers=org_headers,
        json={
            "title": "Slice3 contract",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Owner", "role": "owner", "id": "p-owner"},
                {"name": "Signer", "role": "signer", "id": "p-signer"},
            ],
            "purpose": "Testing signing mutations",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert res.status_code == 200, res.text
    return res.json()["id"]


def _finalize_owned_document(
    client: TestClient, *, org_headers: dict, agreement_id: str | None = None
) -> tuple[str, str]:
    raw = b"%PDF-1.4 slice3 document"
    if agreement_id:
        meta = document_service.finalize_document(
            raw,
            content_type="application/pdf",
            agreement_id=agreement_id,
        )
        return meta["document_id"], meta["content_sha256"]
    fin = client.post(
        "/v1/documents",
        headers=org_headers,
        json={"content_base64": base64.b64encode(raw).decode("ascii"), "content_type": "application/pdf"},
    )
    assert fin.status_code == 200, fin.text
    body = fin.json()
    return body["document_id"], body["content_sha256"]


def _patch_activation_document(document_id: str):
    return patch(
        "backend.security.sensitive_read_authorization._activation_document_id_for_agreement",
        return_value=document_id,
    )


def _mint_recipient_token(*, agreement_id: str, mode: str = "sign") -> str:
    return mint_recipient_access_token(
        secret=os.environ["CLAW_AGREEMENT_SIGNING_TOKEN_SECRET"].encode("utf-8"),
        agreement_id=agreement_id,
        locked_version_id="v1",
        mode=mode,
        role="signer",
        ttl_seconds=3600,
        recipient_party_id="p-signer",
    )


def _sign_prep_body(content_sha256: str) -> dict:
    return {
        "signer_ref": "slice3-signer",
        "intent": "agree_and_sign",
        "signed_at": "2026-07-18T00:00:00Z",
        "field_manifest": _FIELD_MANIFEST,
        "content_sha256": content_sha256,
    }


def _complete_body() -> dict:
    return {
        "signer_ref": "slice3-signer",
        "intent": "agree_and_sign",
        "signed_at": "2026-07-18T00:00:00Z",
        "field_manifest": _FIELD_MANIFEST,
        "protocol_version": "1.0.0",
    }


def _session_files(tmp_path) -> list[Path]:
    root = Path(os.environ["CLAW_SIGN_SESSIONS_DIR"])
    if not root.is_dir():
        return []
    return [p for p in root.rglob("*") if p.is_file()]


def _receipt_files(tmp_path) -> list[Path]:
    root = Path(os.environ["CLAW_RECEIPTS_DIR"])
    if not root.is_dir():
        return []
    return [p for p in root.rglob("*") if p.is_file()]


# --- sign-prep production containment ---


def test_sign_prep_denied_without_authority_before_side_effects(monkeypatch, tmp_path):
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    doc_id, sha = _finalize_owned_document(client, org_headers=_ORG_A)
    denied = client.post(f"/v1/documents/{doc_id}/sign-prep", json=_sign_prep_body(sha))
    assert denied.status_code == 401
    assert denied.json()["detail"]["code"] == "org_header_required"


def test_sign_prep_cross_tenant_denied(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id, sha = _finalize_owned_document(client, org_headers=_ORG_A, agreement_id=aid)
    with patch("backend.routers.vs01_documents_api.signature_service.prepare_sign_packet") as prep:
        res = client.post(
            f"/v1/documents/{doc_id}/sign-prep",
            headers=_ORG_B,
            json=_sign_prep_body(sha),
        )
    assert res.status_code == 404
    assert res.headers.get("cache-control") == "no-store"
    prep.assert_not_called()


@pytest.mark.parametrize("mode", ["review", "sign"])
def test_production_sign_prep_rejects_recipient_token(monkeypatch, tmp_path, mode):
    _configure_production_like(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id, sha = _finalize_owned_document(client, org_headers=_ORG_A, agreement_id=aid)
    token = _mint_recipient_token(agreement_id=aid, mode=mode)
    with (
        _patch_activation_document(doc_id),
        patch(
            "backend.services.signature_service.document_service.verify_content_sha256"
        ) as load_bytes,
        patch("backend.routers.vs01_documents_api.signature_service.prepare_sign_packet") as prep,
    ):
        res = client.post(
            f"/v1/documents/{doc_id}/sign-prep",
            headers={"X-Claw-Recipient-Access-Token": token},
            json=_sign_prep_body(sha),
        )
    assert res.status_code == 404
    load_bytes.assert_not_called()
    prep.assert_not_called()


def test_production_sign_prep_rejects_recipient_session_cookie(monkeypatch, tmp_path):
    _configure_production_like(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id, sha = _finalize_owned_document(client, org_headers=_ORG_A, agreement_id=aid)
    with (
        _patch_activation_document(doc_id),
        patch(
            "backend.security.sensitive_mutation_authorization.read_recipient_session_cookie",
            return_value="session-secret",
        ),
        patch(
            "backend.services.signature_service.document_service.verify_content_sha256"
        ) as load_bytes,
        patch("backend.routers.vs01_documents_api.signature_service.prepare_sign_packet") as prep,
    ):
        res = client.post(
            f"/v1/documents/{doc_id}/sign-prep",
            headers={"Cookie": "claw_recipient_session=session-secret"},
            json=_sign_prep_body(sha),
        )
    assert res.status_code == 404
    load_bytes.assert_not_called()
    prep.assert_not_called()


def test_production_sign_prep_accepts_verified_owner_only(monkeypatch, tmp_path):
    _configure_production_like(monkeypatch, tmp_path)
    client = TestClient(app)
    _, _, verified_headers = mint_anonymous_session(client)
    aid = _create_agreement(client, verified_headers)
    doc_id, sha = _finalize_owned_document(client, org_headers=verified_headers, agreement_id=aid)
    ok = client.post(
        f"/v1/documents/{doc_id}/sign-prep",
        headers=verified_headers,
        json=_sign_prep_body(sha),
    )
    assert ok.status_code == 200, ok.text
    assert ok.headers.get("cache-control") == "no-store, private"


@pytest.mark.parametrize("env_value", _FAIL_CLOSED_ENVIRONMENTS)
def test_fail_closed_environments_deny_legacy_org_sign_prep_before_bytes(
    monkeypatch, tmp_path, env_value
):
    _configure_storage(monkeypatch, tmp_path)
    raw = b"%PDF slice3 legacy org denial"
    meta = document_service.finalize_document(raw, content_type="application/pdf", owner_subject="org:local-org")
    doc_id = meta["document_id"]
    sha = meta["content_sha256"]
    _set_environment(monkeypatch, env_value)
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    with (
        patch(
            "backend.services.signature_service.document_service.verify_content_sha256"
        ) as load_bytes,
        patch("backend.routers.vs01_documents_api.signature_service.prepare_sign_packet") as prep,
    ):
        res = client.post(
            f"/v1/documents/{doc_id}/sign-prep",
            headers=_LOCAL_ORG,
            json=_sign_prep_body(sha),
        )
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "owner_identity_unverified"
    load_bytes.assert_not_called()
    prep.assert_not_called()


# --- relaxed-mode sign-prep (not production authority) ---


def test_relaxed_sign_prep_owner_allowed_private_cache(monkeypatch, tmp_path):
    """Relaxed local/dev/test only — org-header owner path, not production authority."""
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id, sha = _finalize_owned_document(client, org_headers=_ORG_A, agreement_id=aid)
    ok = client.post(
        f"/v1/documents/{doc_id}/sign-prep",
        headers=_ORG_A,
        json=_sign_prep_body(sha),
    )
    assert ok.status_code == 200, ok.text
    assert ok.headers.get("cache-control") == "no-store, private"


# --- production legacy sign-session containment ---


@pytest.mark.parametrize(
    "headers",
    [
        {},
        _ORG_A,
        {"X-Claw-Recipient-Access-Token": "unused"},
    ],
)
def test_production_sign_session_create_fails_closed(monkeypatch, tmp_path, headers):
    _configure_production_like(monkeypatch, tmp_path)
    client = TestClient(app)
    doc_id, sha = _seed_document_direct()
    before = _session_files(tmp_path)
    res = client.post(
        "/v1/sign-sessions",
        headers=headers,
        json={"document_id": doc_id, "content_sha256": sha},
    )
    assert res.status_code == 409
    assert res.json()["detail"] == LEGACY_SIGNING_DEFERRED_DETAIL
    assert _session_files(tmp_path) == before


def test_production_verified_owner_sign_session_create_still_deferred(monkeypatch, tmp_path):
    _configure_production_like(monkeypatch, tmp_path)
    client = TestClient(app)
    _, _, verified_headers = mint_anonymous_session(client)
    doc_id, sha = _finalize_owned_document(client, org_headers=verified_headers)
    res = client.post(
        "/v1/sign-sessions",
        headers=verified_headers,
        json={"document_id": doc_id, "content_sha256": sha},
    )
    assert res.status_code == 409
    assert res.json()["detail"] == LEGACY_SIGNING_DEFERRED_DETAIL


def _create_relaxed_session(
    monkeypatch: pytest.MonkeyPatch, tmp_path, client: TestClient, org_headers: dict
) -> tuple[str, str, str]:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    doc_id, sha = _finalize_owned_document(client, org_headers=org_headers)
    sess = client.post(
        "/v1/sign-sessions",
        headers=org_headers,
        json={"document_id": doc_id, "content_sha256": sha},
    )
    assert sess.status_code == 200, sess.text
    sid = sess.json()["session"]["session_id"]
    return doc_id, sha, sid


@pytest.mark.parametrize("env_value", _RELAXED_ENVIRONMENTS)
def test_strict_legacy_signing_environment_predicate_relaxes_exact_values(monkeypatch, env_value):
    _set_environment(monkeypatch, env_value)
    assert is_explicit_legacy_signing_relaxed_environment() is True


@pytest.mark.parametrize("env_value", _FAIL_CLOSED_ENVIRONMENTS)
def test_strict_legacy_signing_environment_predicate_fails_closed(monkeypatch, env_value):
    _set_environment(monkeypatch, env_value)
    assert is_explicit_legacy_signing_relaxed_environment() is False


@pytest.mark.parametrize("env_value", _RELAXED_ENVIRONMENTS)
def test_exact_relaxed_environment_values_allow_session_create(monkeypatch, tmp_path, env_value):
    _configure_storage(monkeypatch, tmp_path)
    _set_environment(monkeypatch, env_value)
    client = TestClient(app)
    doc_id, sha = _seed_document_direct()
    res = client.post(
        "/v1/sign-sessions",
        headers=_ORG_A,
        json={"document_id": doc_id, "content_sha256": sha},
    )
    assert res.status_code == 200, res.text


@pytest.mark.parametrize("env_value", _FAIL_CLOSED_ENVIRONMENTS)
def test_all_other_environment_values_fail_session_create_closed_without_files(
    monkeypatch, tmp_path, env_value
):
    _configure_storage(monkeypatch, tmp_path)
    _set_environment(monkeypatch, env_value)
    client = TestClient(app)
    doc_id, sha = _seed_document_direct()
    before = _session_files(tmp_path)
    with patch(
        "backend.routers.vs01_sign_api.signature_service.create_sign_session"
    ) as create_session:
        res = client.post(
            "/v1/sign-sessions",
            headers=_ORG_A,
            json={"document_id": doc_id, "content_sha256": sha},
        )
    assert res.status_code == 409
    assert res.json()["detail"] == LEGACY_SIGNING_DEFERRED_DETAIL
    create_session.assert_not_called()
    assert _session_files(tmp_path) == before


@pytest.mark.parametrize("env_value", _FAIL_CLOSED_ENVIRONMENTS)
def test_all_other_environment_values_fail_completion_closed_without_side_effects(
    monkeypatch, tmp_path, env_value
):
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    _, _, sid = _create_relaxed_session(monkeypatch, tmp_path, client, _ORG_A)
    _set_environment(monkeypatch, env_value)
    client = TestClient(app)

    session_before = signature_service.get_sign_session(sid)
    receipts_before = _receipt_files(tmp_path)
    claim_path = signature_service._completion_claim_path(sid)  # noqa: SLF001

    with (
        patch("backend.routers.vs01_sign_api.signature_service.get_sign_session") as load_session,
        patch(
            "backend.routers.vs01_sign_api.signature_service.claim_sign_session_for_completion"
        ) as claim,
        patch("backend.routers.vs01_sign_api.receipt_service.issue_and_persist_receipt") as issue,
        patch("backend.routers.vs01_sign_api.signature_service.prepare_sign_packet") as prep,
        patch("backend.routers.vs01_sign_api.signature_service.mark_sign_session_completed") as mark,
    ):
        res = client.post(f"/v1/sign-sessions/{sid}/complete", headers=_ORG_A, json=_complete_body())

    assert res.status_code == 409
    assert res.json()["detail"] == LEGACY_SIGNING_DEFERRED_DETAIL
    load_session.assert_not_called()
    claim.assert_not_called()
    issue.assert_not_called()
    prep.assert_not_called()
    mark.assert_not_called()
    assert not claim_path.exists()
    assert _receipt_files(tmp_path) == receipts_before
    assert signature_service.get_sign_session(sid) == session_before


@pytest.mark.parametrize("headers", [{}, _ORG_A])
def test_production_sign_session_complete_fails_for_all_identities(monkeypatch, tmp_path, headers):
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    doc_id, sha, sid = _create_relaxed_session(monkeypatch, tmp_path, client, _ORG_A)
    _configure_production_like(monkeypatch, tmp_path)
    client = TestClient(app)
    res = client.post(f"/v1/sign-sessions/{sid}/complete", headers=headers, json=_complete_body())
    assert res.status_code == 409
    assert res.json()["detail"] == LEGACY_SIGNING_DEFERRED_DETAIL


def test_production_verified_owner_complete_still_deferred(monkeypatch, tmp_path):
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    _, _, verified_headers = mint_anonymous_session(client)
    doc_id, sha, sid = _create_relaxed_session(monkeypatch, tmp_path, client, verified_headers)
    _configure_production_like(monkeypatch, tmp_path)
    client = TestClient(app)
    res = client.post(
        f"/v1/sign-sessions/{sid}/complete",
        headers=verified_headers,
        json=_complete_body(),
    )
    assert res.status_code == 409
    assert res.json()["detail"] == LEGACY_SIGNING_DEFERRED_DETAIL


# --- relaxed-mode legacy session lifecycle (not production authority) ---


def test_relaxed_sign_session_create_owner_allowed(monkeypatch, tmp_path):
    """Relaxed local/dev/test filesystem session — not production-authoritative."""
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    doc_id, sha = _finalize_owned_document(client, org_headers=_ORG_A)
    res = client.post(
        "/v1/sign-sessions",
        headers=_ORG_A,
        json={"document_id": doc_id, "content_sha256": sha},
    )
    assert res.status_code == 200, res.text
    assert res.headers.get("cache-control") == "no-store, private"


def test_relaxed_sign_session_create_denied_cross_tenant(monkeypatch, tmp_path):
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id, sha = _finalize_owned_document(client, org_headers=_ORG_A, agreement_id=aid)
    res = client.post(
        "/v1/sign-sessions",
        headers=_ORG_B,
        json={"document_id": doc_id, "content_sha256": sha},
    )
    assert res.status_code == 404


def test_relaxed_sign_session_complete_cross_tenant_denied(monkeypatch, tmp_path):
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    doc_id, sha, sid = _create_relaxed_session(monkeypatch, tmp_path, client, _ORG_A)
    denied = client.post(f"/v1/sign-sessions/{sid}/complete", headers=_ORG_B, json=_complete_body())
    assert denied.status_code == 404


def test_relaxed_complete_replay_cannot_mint_second_receipt(monkeypatch, tmp_path):
    """Relaxed-mode filesystem claim limits duplicate completion — not multi-instance authority."""
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    doc_id, sha, sid = _create_relaxed_session(monkeypatch, tmp_path, client, _ORG_A)
    first = client.post(f"/v1/sign-sessions/{sid}/complete", headers=_ORG_A, json=_complete_body())
    assert first.status_code == 200, first.text
    rid = first.json()["receipt_id"]
    second = client.post(f"/v1/sign-sessions/{sid}/complete", headers=_ORG_A, json=_complete_body())
    assert second.status_code == 409
    assert second.json()["detail"] == "session_not_pending"
    assert receipt_service.get_receipt(rid) is not None


def test_relaxed_concurrent_complete_at_most_one_receipt(monkeypatch, tmp_path):
    """Relaxed-mode single-process determinism only."""
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    doc_id, sha, sid = _create_relaxed_session(monkeypatch, tmp_path, client, _ORG_A)

    def _complete_once() -> int:
        c = TestClient(app)
        return c.post(f"/v1/sign-sessions/{sid}/complete", headers=_ORG_A, json=_complete_body()).status_code

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        statuses = list(pool.map(lambda _: _complete_once(), range(4)))

    assert statuses.count(200) == 1
    assert statuses.count(409) == 3


# --- header-only recipient token transport ---


def test_query_only_recipient_token_cannot_authorize_document_read(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    _configure_storage(monkeypatch, tmp_path)
    client = TestClient(app)
    aid = _create_agreement(client, _ORG_A)
    doc_id, _ = _finalize_owned_document(client, org_headers=_ORG_A, agreement_id=aid)
    token = _mint_recipient_token(agreement_id=aid, mode="review")
    with _patch_activation_document(doc_id):
        query_only = client.get(
            f"/v1/documents/{doc_id}/content?recipient_access_token={token}",
        )
        header_ok = client.get(
            f"/v1/documents/{doc_id}/content",
            headers={"X-Claw-Recipient-Access-Token": token},
        )
    assert query_only.status_code in (401, 404)
    assert header_ok.status_code == 200


# --- timeline containment ---


@pytest.mark.parametrize("env_value", _FAIL_CLOSED_ENVIRONMENTS)
def test_timeline_receipt_get_fails_closed_for_all_other_environments(
    monkeypatch, tmp_path, env_value
):
    _configure_storage(monkeypatch, tmp_path)
    _set_environment(monkeypatch, env_value)
    client = TestClient(app)
    with patch("backend.main.timeline_store.get_receipt") as private_receipt_load:
        res = client.get("/v1/timeline/receipts/rcpt_legacy_example")
    assert res.status_code == 404
    assert res.json() == {"error": "receipt_not_found"}
    assert res.headers.get("cache-control") == "no-store"
    private_receipt_load.assert_not_called()


def test_timeline_receipt_verify_returns_precise_public_payload_in_production(monkeypatch, tmp_path):
    _configure_production_like(monkeypatch, tmp_path)
    monkeypatch.setenv("CLAW_TIMELINE_DB_PATH", str(tmp_path / "timeline.sqlite3"))
    store = TimelineStore()
    store.create_receipt(
        receipt_id="rcpt_public_verify",
        timeline_id="tl_public_verify",
        protocol_version="claw-timeline/1",
        network="testnet",
        epoch_id="epoch-7",
        btc_txid="tx-public",
        commitment="ab" * 32,
        merkle_proof=["cd" * 32],
        zk_proof_refs=["zk:public"],
        issued_at="2026-07-18T00:00:00Z",
        receipt_hash_sha256="ef" * 32,
    )
    client = TestClient(app)
    res = client.get("/v1/timeline/receipts/rcpt_public_verify/verify")
    assert res.status_code == 200, res.text
    assert res.json() == store.get_receipt("rcpt_public_verify")
    assert res.json()["receipt_id"] == "rcpt_public_verify"
    assert res.json()["commitment"] == "ab" * 32
    assert res.json()["batch_proof_siblings"] == ["cd" * 32]
    assert res.json()["zk_proof_refs"] == ["zk:public"]
