"""Phase 4C.2.2 — uploaded-PDF receipt is one immutable artifact issued at completion."""

from __future__ import annotations

import json
import zipfile
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO

from fastapi.testclient import TestClient

from backend.main import app
from backend.services.quick_pdf_envelope import OWNER_ROLE_ID, RECIPIENT_ROLE_ID
from backend.services.uploaded_final_pdf_receipt import (
    ARTIFACT_TYPE,
    DIGEST_FIELD,
    digest_for_receipt,
    load_artifact_bytes,
    receipt_contains_secrets,
    verify_receipt_bindings,
    verify_receipt_bytes,
)
from backend.tests.conftest_auth_security import make_authenticated_user_headers
from backend.tests.test_phase4c2_quick_pdf_envelope import PDF, _fields, _parties, _upload, client  # noqa: F401


def _bind(doc: dict) -> dict:
    return {
        "document_id": doc["document_id"],
        "content_sha256": doc["content_sha256"],
        "size_bytes": doc["size_bytes"],
        "content_type": doc["content_type"],
    }


def _prepare(client: TestClient, headers: dict) -> tuple[dict, dict, str, str]:
    doc = _upload(client, headers)
    bind = _bind(doc)
    created = client.post("/api/agreements/quick-pdf-envelope", headers=headers, json={**bind, **_parties()})
    assert created.status_code == 200, created.text
    env = created.json()["envelope"]
    saved = client.post(
        "/api/agreements/quick-pdf-envelope/fields",
        headers=headers,
        json={**bind, "page_count": 2, "fields": _fields(1)},
    )
    assert saved.status_code == 200, saved.text
    signed = client.post(
        "/api/agreements/quick-pdf-envelope/owner-complete",
        headers=headers,
        json={**bind, "signature_text": "Avery Owner", "consent": True, "packet_revision": "qpk_1"},
    )
    assert signed.status_code == 200, signed.text
    assert signed.json()["completion"]["fully_executed"] is False
    assert signed.json().get("receipt") in (None, {})
    prep = client.post("/api/agreements/quick-pdf-envelope/prepare", headers=headers, json=bind)
    assert prep.status_code == 200, prep.text
    from urllib.parse import parse_qs, urlparse

    token = (parse_qs(urlparse(prep.json()["recipient_open_path"]).query).get("t") or [""])[0]
    return doc, env, token, bind


def _recipient_complete(client: TestClient, env: dict, doc: dict, token: str) -> object:
    return client.post(
        f"/api/agreements/{env['agreement_id']}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": token},
        json={
            "signer_role_id": RECIPIENT_ROLE_ID,
            "participant_id": env["recipient_party_id"],
            "document_id": doc["document_id"],
            "display_name": "Riley Recipient",
        },
    )


def test_receipt_exists_immediately_after_recipient_complete(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c22-owner")
    doc, env, token, bind = _prepare(client, headers)
    pending = client.get(f"/api/agreements/quick-pdf-envelope/receipt?document_id={doc['document_id']}", headers=headers)
    assert pending.status_code == 200
    assert pending.json()["receipt"] is None
    complete = _recipient_complete(client, env, doc, token)
    assert complete.status_code == 200, complete.text
    issued = complete.json()["uploaded_final_pdf_receipt"]
    assert issued and issued["receipt_id"] and issued[DIGEST_FIELD]
    raw = load_artifact_bytes(issued["receipt_id"], env["agreement_id"])
    assert raw
    ok, err, parsed = verify_receipt_bytes(raw)
    assert ok, err
    assert parsed["receipt_id"] == issued["receipt_id"]
    got = client.get(f"/api/agreements/quick-pdf-envelope/receipt?document_id={doc['document_id']}", headers=headers)
    assert got.status_code == 200
    assert got.json()["receipt"]["receipt_id"] == issued["receipt_id"]
    assert got.json()["receipt"][DIGEST_FIELD] == issued[DIGEST_FIELD]


def test_replay_and_concurrent_completion_return_one_receipt(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c22-owner-b")
    doc, env, token, _bind = _prepare(client, headers)

    def once() -> dict:
        res = _recipient_complete(client, env, doc, token)
        assert res.status_code in (200, 403, 409), res.text
        if res.status_code == 200:
            return res.json().get("uploaded_final_pdf_receipt") or {}
        return {}

    with ThreadPoolExecutor(max_workers=2) as pool:
        first, second = list(pool.map(lambda _: once(), range(2)))
    receipts = [row for row in (first, second) if row.get("receipt_id")]
    assert receipts
    ids = {row["receipt_id"] for row in receipts}
    digests = {row[DIGEST_FIELD] for row in receipts}
    assert len(ids) == 1
    assert len(digests) == 1
    replay = once()
    if replay:
        assert replay["receipt_id"] == receipts[0]["receipt_id"]
        assert replay[DIGEST_FIELD] == receipts[0][DIGEST_FIELD]


def test_altered_bound_fields_break_verification(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c22-owner-c")
    doc, env, token, _bind = _prepare(client, headers)
    complete = _recipient_complete(client, env, doc, token)
    issued = complete.json()["uploaded_final_pdf_receipt"]
    raw = load_artifact_bytes(issued["receipt_id"], env["agreement_id"])
    assert raw
    _ok, _err, receipt = verify_receipt_bytes(raw)
    assert receipt
    from backend.routers.agreements_v2_api import _load_or_404

    draft = _load_or_404(env["agreement_id"])
    from backend.services.quick_pdf_envelope import envelope_from_draft

    live_env = envelope_from_draft(draft)
    assert live_env
    mutations = {
        "document_content_sha256": "0" * 64,
        "packet_revision": "qpk_tampered",
        "field_manifest_digest": "1" * 64,
        "required_signers": [{"role_id": "other", "participant_id": "x"}],
        "completion_events": [{"event_id": "evt_tamper", "signer_role_id": "qs_owner", "participant_id": "x", "signed_at": "1999-01-01T00:00:00Z"}],
    }
    for key, value in mutations.items():
        tampered = dict(receipt)
        tampered[key] = value
        tampered.pop(DIGEST_FIELD, None)
        tampered[DIGEST_FIELD] = digest_for_receipt(tampered)
        ok, reason = verify_receipt_bindings(tampered, live_env, draft)
        assert ok is False, key
        assert reason
        assert digest_for_receipt({k: v for k, v in receipt.items() if k != DIGEST_FIELD} | {key: value}) != receipt[DIGEST_FIELD]


def test_artifact_receipt_response_and_zip_are_byte_identical(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c22-owner-d")
    doc, env, token, _bind = _prepare(client, headers)
    issued = _recipient_complete(client, env, doc, token).json()["uploaded_final_pdf_receipt"]
    raw = load_artifact_bytes(issued["receipt_id"], env["agreement_id"])
    assert raw
    got = client.get(f"/api/agreements/quick-pdf-envelope/receipt?document_id={doc['document_id']}", headers=headers)
    assert got.status_code == 200, got.text
    body = got.json()["receipt"]
    assert json.loads(raw.decode("utf-8")) == body
    z = client.get(f"/api/agreements/quick-pdf-envelope/bundle?document_id={doc['document_id']}", headers=headers)
    assert z.status_code == 200
    with zipfile.ZipFile(BytesIO(z.content)) as archive:
        receipt_json = archive.read("receipt.json")
        assert receipt_json == raw
        assert archive.read("document.pdf") == PDF


def test_get_endpoints_do_not_write(client: TestClient, monkeypatch) -> None:
    headers = make_authenticated_user_headers("phase4c22-owner-e")
    doc, env, token, _bind = _prepare(client, headers)
    _recipient_complete(client, env, doc, token)
    writes: list[str] = []
    from backend.routers import agreements_v2_api as ag_api
    from backend.storage.artifact_repository import ArtifactRepository

    orig_save = ag_api._save_draft_sync
    orig_put = ArtifactRepository.put_artifact

    def save_guard(*args, **kwargs):
        writes.append("draft")
        raise AssertionError("GET wrote a draft")

    def put_guard(self, *args, **kwargs):
        writes.append("artifact")
        raise AssertionError("GET wrote an artifact")

    monkeypatch.setattr(ag_api, "_save_draft_sync", save_guard)
    monkeypatch.setattr(ArtifactRepository, "put_artifact", put_guard)
    for path in (
        f"/api/agreements/quick-pdf-envelope?document_id={doc['document_id']}",
        f"/api/agreements/quick-pdf-envelope/receipt?document_id={doc['document_id']}",
        f"/api/agreements/quick-pdf-envelope/bundle?document_id={doc['document_id']}",
    ):
        res = client.get(path, headers=headers)
        assert res.status_code == 200, res.text
    assert writes == []
    monkeypatch.setattr(ag_api, "_save_draft_sync", orig_save)
    monkeypatch.setattr(ArtifactRepository, "put_artifact", orig_put)


def test_missing_or_tampered_artifact_fails_closed(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c22-owner-f")
    doc, env, token, _bind = _prepare(client, headers)
    issued = _recipient_complete(client, env, doc, token).json()["uploaded_final_pdf_receipt"]
    from backend.services.uploaded_final_pdf_receipt import agreement_logical_ref
    from backend.storage.artifact_repository import get_artifact_repository

    repo = get_artifact_repository()
    raw = repo.get_bytes_by_logical_ref(artifact_type=ARTIFACT_TYPE, logical_ref=issued["receipt_id"])
    assert raw
    tampered = raw.replace(issued[DIGEST_FIELD].encode(), ("a" * 64).encode())
    repo.delete_logical_latest(artifact_type=ARTIFACT_TYPE, logical_ref=issued["receipt_id"])
    repo.delete_logical_latest(artifact_type=ARTIFACT_TYPE, logical_ref=agreement_logical_ref(env["agreement_id"]))
    missing = client.get(f"/api/agreements/quick-pdf-envelope/receipt?document_id={doc['document_id']}", headers=headers)
    assert missing.status_code == 409
    assert missing.json()["detail"]["code"] == "receipt_pending"
    repo.put_artifact(
        artifact_type=ARTIFACT_TYPE,
        logical_ref=issued["receipt_id"],
        data=tampered,
        content_type="application/json",
        visibility="private",
        agreement_id=env["agreement_id"],
    )
    repo.put_artifact(
        artifact_type=ARTIFACT_TYPE,
        logical_ref=agreement_logical_ref(env["agreement_id"]),
        data=tampered,
        content_type="application/json",
        visibility="private",
        agreement_id=env["agreement_id"],
    )
    bad = client.get(f"/api/agreements/quick-pdf-envelope/receipt?document_id={doc['document_id']}", headers=headers)
    assert bad.status_code == 409
    assert bad.json()["detail"]["code"] in {"receipt_unavailable", "receipt_digest_mismatch"}
    bundle = client.get(f"/api/agreements/quick-pdf-envelope/bundle?document_id={doc['document_id']}", headers=headers)
    assert bundle.status_code == 409


def test_incomplete_signer_set_has_no_receipt(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c22-owner-g")
    doc, _env, _token, bind = _prepare(client, headers)
    receipt = client.get(f"/api/agreements/quick-pdf-envelope/receipt?document_id={doc['document_id']}", headers=headers)
    assert receipt.status_code == 200
    assert receipt.json()["receipt"] is None
    assert receipt.json()["completion"]["fully_executed"] is False
    bundle = client.get(f"/api/agreements/quick-pdf-envelope/bundle?document_id={doc['document_id']}", headers=headers)
    assert bundle.status_code == 409
    assert client.get(f"/api/agreements/quick-pdf-envelope?document_id={doc['document_id']}", headers=headers).json()["receipt"] is None
    from backend.storage.artifact_repository import get_artifact_repository

    rows = [row for row in get_artifact_repository().list_recent(limit=200) if row.get("artifact_type") == ARTIFACT_TYPE]
    assert rows == []


def test_wrong_org_cannot_read_receipt_or_bundle(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c22-owner-h")
    doc, env, token, _bind = _prepare(client, headers)
    _recipient_complete(client, env, doc, token)
    other = make_authenticated_user_headers("phase4c22-other")
    assert client.get(f"/api/agreements/quick-pdf-envelope/receipt?document_id={doc['document_id']}", headers=other).status_code == 403
    assert client.get(f"/api/agreements/quick-pdf-envelope/bundle?document_id={doc['document_id']}", headers=other).status_code == 403


def test_receipt_evidence_has_no_secrets(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c22-owner-i")
    doc, env, token, _bind = _prepare(client, headers)
    issued = _recipient_complete(client, env, doc, token).json()["uploaded_final_pdf_receipt"]
    raw = load_artifact_bytes(issued["receipt_id"], env["agreement_id"])
    assert raw
    text = raw.decode("utf-8")
    assert "riley.recipient@lawdog.test" not in text
    assert "avery.owner@lawdog.test" not in text
    assert "Avery Owner" not in text
    assert token not in text
    assert "/app/esign/" not in text
    assert "data:image" not in text
    assert receipt_contains_secrets(issued) is False
    from backend.routers.agreements_v2_api import _load_or_404
    from backend.services.quick_pdf_envelope import envelope_from_draft

    stored_env = envelope_from_draft(_load_or_404(env["agreement_id"])) or {}
    assert stored_env.get("final_receipt") in (None, {})
    assert stored_env.get("final_receipt_id") == issued["receipt_id"]
    assert stored_env.get("final_receipt_digest") == issued[DIGEST_FIELD]
    assert stored_env.get("recipient_token") in (None, "")
    assert token not in json.dumps(stored_env)
