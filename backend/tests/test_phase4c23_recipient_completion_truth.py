"""Phase 4C.2.3 — shared recipient-completion truth and durable receipt binding."""

from __future__ import annotations

import json
import multiprocessing as mp
import os
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from backend.main import app
from backend.services.quick_pdf_envelope import RECIPIENT_ROLE_ID
from backend.services.uploaded_final_pdf_receipt import (
    DIGEST_FIELD,
    load_artifact_bytes,
    receipt_contains_secrets,
    verify_receipt_bytes,
)
from backend.services.vs01_completion_evidence import (
    CONSENT_ACTION,
    CONSENT_INTENT_STATEMENT,
    CONSENT_INTENT_VERSION,
    signature_artifact_digest,
    validate_assigned_fields,
)
from backend.services.vs01_completion_ledger import multi_worker_completion_ready
from backend.tests.conftest_auth_security import make_authenticated_user_headers
from backend.tests.test_phase4c2_quick_pdf_envelope import _fields, _parties, _upload, client  # noqa: F401
from backend.tests.test_phase4c22_quick_receipt_integrity import _prepare, _recipient_complete


def _consent() -> dict:
    return {
        "accepted": True,
        "intent_version": CONSENT_INTENT_VERSION,
        "intent_statement": CONSENT_INTENT_STATEMENT,
        "action": CONSENT_ACTION,
    }


def _complete_json(env: dict, doc: dict, signature: str = "Riley Recipient") -> dict:
    return {
        "signer_role_id": RECIPIENT_ROLE_ID,
        "participant_id": env["recipient_party_id"],
        "document_id": doc["document_id"],
        "display_name": "Riley Recipient",
        "signed_at": "1999-01-01T00:00:00Z",
        "packet_revision": env.get("packet_revision") or "qpk_1",
        "assigned_fields": [
            {"field_id": "fld_r", "field_type": "signature", "value": signature, "page_index": 1}
        ],
        "consent": _consent(),
    }


def test_forged_signed_at_is_ignored_and_receipt_binds_event_digests(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c23-forged")
    doc, env, token, _bind = _prepare(client, headers)
    res = _recipient_complete(client, env, doc, token, signature="Riley One")
    assert res.status_code == 200, res.text
    body = res.json()
    completion = body["completion"]
    assert completion["signed_at"]
    assert "1999-01-01" not in completion["signed_at"]
    issued = body["uploaded_final_pdf_receipt"]
    assert issued["receipt_id"] and issued[DIGEST_FIELD]
    assert body["receipt_status"] == "issued"
    raw = load_artifact_bytes(issued["receipt_id"], env["agreement_id"])
    assert raw
    ok, err, receipt = verify_receipt_bytes(raw)
    assert ok, err
    assert receipt_contains_secrets(receipt) is False
    dumped = json.dumps(receipt)
    assert "Riley One" not in dumped
    assert token not in dumped
    assert "riley.recipient@" not in dumped.lower()
    assert "/app/esign" not in dumped
    recip = next(row for row in receipt["signature_artifacts"] if row["signer_role_id"] == RECIPIENT_ROLE_ID)
    assert recip["artifact_hash"] == completion["signature_artifact_digest"]
    assert recip["consent_hash"] == completion["consent_artifact_digest"]
    event = next(row for row in receipt["completion_events"] if row["signer_role_id"] == RECIPIENT_ROLE_ID)
    assert event["signature_artifact_digest"] == completion["signature_artifact_digest"]
    assert event["consent_artifact_digest"] == completion["consent_artifact_digest"]
    assert event["signed_at"] == completion["signed_at"]
    assert "1999-01-01" not in event["signed_at"]


def test_missing_consent_signature_or_foreign_field_fails_closed(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c23-fail-closed")
    doc, env, token, _bind = _prepare(client, headers)
    base = _complete_json(env, doc)
    missing_consent = dict(base)
    missing_consent["consent"] = {"accepted": False, "intent_version": CONSENT_INTENT_VERSION, "intent_statement": CONSENT_INTENT_STATEMENT, "action": CONSENT_ACTION}
    res = client.post(
        f"/api/agreements/{env['agreement_id']}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": token},
        json=missing_consent,
    )
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "consent_required"

    missing_sig = dict(base)
    missing_sig["assigned_fields"] = [{"field_id": "fld_r", "field_type": "signature", "value": "", "page_index": 1}]
    res = client.post(
        f"/api/agreements/{env['agreement_id']}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": token},
        json=missing_sig,
    )
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "signature_required"

    foreign = dict(base)
    foreign["assigned_fields"] = [
        {"field_id": "fld_o", "field_type": "signature", "value": "Stolen", "page_index": 1}
    ]
    res = client.post(
        f"/api/agreements/{env['agreement_id']}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": token},
        json=foreign,
    )
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "foreign_field"


def test_changing_signature_changes_artifact_digest(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c23-digest")
    doc, env, token, _bind = _prepare(client, headers)
    first = _recipient_complete(client, env, doc, token, signature="Riley Alpha").json()["completion"]
    other = validate_assigned_fields(
        [{"field_id": "fld_r", "field_type": "signature", "value": "Riley Beta", "page_index": 1}],
        draft={"quick_pdf_envelope_v1": {"fields": _fields(1), "recipient_role_id": RECIPIENT_ROLE_ID}},
        signer_role_id=RECIPIENT_ROLE_ID,
        required=True,
    )
    assert signature_artifact_digest(other) != first["signature_artifact_digest"]


def test_exact_replay_is_idempotent_different_evidence_rejected(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c23-replay")
    doc, env, token, _bind = _prepare(client, headers)
    first = _recipient_complete(client, env, doc, token, signature="Riley Replay")
    assert first.status_code == 200, first.text
    replay = _recipient_complete(client, env, doc, token, signature="Riley Replay")
    assert replay.status_code == 200, replay.text
    assert replay.json()["already_signed"] is True
    assert replay.json()["completion"]["signature_artifact_digest"] == first.json()["completion"]["signature_artifact_digest"]
    assert replay.json()["uploaded_final_pdf_receipt"]["receipt_id"] == first.json()["uploaded_final_pdf_receipt"]["receipt_id"]
    changed = _recipient_complete(client, env, doc, token, signature="Riley Changed")
    assert changed.status_code == 409
    assert changed.json()["detail"]["code"] == "completion_evidence_mismatch"
    draft = client.get(f"/api/agreements/{env['agreement_id']}", headers=headers).json()["draft"]
    events = [e for e in draft.get("audit_log") or [] if e.get("event_type") == "signature_completed" and (e.get("value") or {}).get("signer_role_id") == RECIPIENT_ROLE_ID]
    assert len(events) == 1


def test_final_signer_response_supplies_stable_receipt_before_refresh(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c23-receipt-id")
    doc, env, token, _bind = _prepare(client, headers)
    res = _recipient_complete(client, env, doc, token)
    issued = res.json()["uploaded_final_pdf_receipt"]
    assert issued["receipt_id"].startswith("ufr_")
    assert len(issued[DIGEST_FIELD]) == 64
    got = client.get(f"/api/agreements/quick-pdf-envelope/receipt?document_id={doc['document_id']}", headers=headers)
    assert got.json()["receipt"]["receipt_id"] == issued["receipt_id"]
    assert got.json()["receipt"][DIGEST_FIELD] == issued[DIGEST_FIELD]


def test_two_independent_contexts_produce_one_durable_receipt(client: TestClient, monkeypatch) -> None:
    assert multi_worker_completion_ready() is True
    headers = make_authenticated_user_headers("phase4c23-race")
    doc, env, token, _bind = _prepare(client, headers)

    class _NullLock:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr(
        "backend.services.vs01_signer_completion.vs01_signer_complete_lock",
        lambda _aid: _NullLock(),
    )

    def once() -> dict:
        res = _recipient_complete(client, env, doc, token, signature="Riley Race")
        assert res.status_code in (200, 409), res.text
        if res.status_code == 200:
            return res.json().get("uploaded_final_pdf_receipt") or {}
        return {}

    with ThreadPoolExecutor(max_workers=2) as pool:
        rows = list(pool.map(lambda _: once(), range(2)))
    receipts = [row for row in rows if row.get("receipt_id")]
    assert receipts
    assert len({row["receipt_id"] for row in receipts}) == 1
    assert len({row[DIGEST_FIELD] for row in receipts}) == 1

    race_doc, race_env, race_token, _bind = _prepare(client, make_authenticated_user_headers("phase4c23-race-proc"))
    env_payload = {
        key: value
        for key, value in os.environ.items()
        if key.startswith("CLAW_") or key in {"CLAW_ENVIRONMENT"}
    }
    env_payload["CLAW_VS01_COMPLETION_LEDGER_PATH"] = os.path.join(
        os.environ["CLAW_DATA_DIR"], "vs01_completion_ledger.sqlite3"
    )
    ctx = mp.get_context("spawn")
    with ctx.Pool(2) as pool:
        results = pool.map(
            _subprocess_complete,
            [
                {
                    "env": env_payload,
                    "agreement_id": race_env["agreement_id"],
                    "token": race_token,
                    "body": _complete_json(race_env, race_doc, "Riley Process"),
                }
                for _ in range(2)
            ],
        )
    ok = [row for row in results if row.get("status") in (200, 409)]
    assert ok, results
    ids = {row["receipt_id"] for row in ok if row.get("receipt_id")}
    assert len(ids) == 1


def _subprocess_complete(payload: dict) -> dict:
    for key, value in payload["env"].items():
        if value:
            os.environ[key] = value
    from backend.services.vs01_completion_ledger import reset_vs01_completion_ledger_for_tests
    from backend.storage.artifact_repository import reset_artifact_repository_singleton

    reset_vs01_completion_ledger_for_tests()
    reset_artifact_repository_singleton()
    from fastapi.testclient import TestClient as SubClient

    from backend.main import app as sub_app

    res = SubClient(sub_app).post(
        f"/api/agreements/{payload['agreement_id']}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": payload["token"]},
        json=payload["body"],
    )
    body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
    receipt = body.get("uploaded_final_pdf_receipt") or {}
    return {
        "status": res.status_code,
        "receipt_id": receipt.get("receipt_id"),
        "digest": receipt.get("receipt_hash_sha256"),
    }


def test_execution_record_is_private_and_logs_have_no_secrets(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c23-private")
    doc, env, token, _bind = _prepare(client, headers)
    res = _recipient_complete(client, env, doc, token, signature="Secret Signature / Riley")
    owner_get = client.get(f"/api/agreements/{env['agreement_id']}", headers=headers)
    execution = owner_get.json()["draft"].get("vs01_signer_execution_v1") or {}
    records = execution.get("records") or []
    assert records
    assert any("Secret Signature" in json.dumps(row.get("assigned_fields") or []) for row in records)
    from backend.services.recipient_draft_projection import project_recipient_agreement_draft

    projected = project_recipient_agreement_draft(
        owner_get.json()["draft"],
        recipient_party_id=env["recipient_party_id"],
    )
    dumped = json.dumps(projected)
    assert "vs01_signer_execution_v1" not in dumped
    assert "Secret Signature" not in dumped
    issued = res.json()["uploaded_final_pdf_receipt"]
    raw = load_artifact_bytes(issued["receipt_id"], env["agreement_id"])
    assert raw
    assert b"Secret Signature" not in raw
    assert token.encode() not in raw
