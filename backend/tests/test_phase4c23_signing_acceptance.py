"""Phase 4C.2.3 signing acceptance — reproduce then lock the commercial contract."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from backend.services.quick_pdf_envelope import OWNER_ROLE_ID, RECIPIENT_ROLE_ID
from backend.tests.conftest_auth_security import make_authenticated_user_headers
from backend.tests.test_phase4c2_quick_pdf_envelope import client  # noqa: F401
from backend.tests.test_phase4c22_quick_receipt_integrity import _prepare, _recipient_complete
from backend.tests.test_phase4c23_recipient_completion_truth import _complete_json, _consent


def _audit_signature_events(draft: dict, *, role: str) -> list[dict]:
    return [
        e
        for e in (draft.get("audit_log") or [])
        if e.get("event_type") == "signature_completed"
        and (e.get("value") or {}).get("signer_role_id") == role
    ]


def test_repro_altered_page_index_must_not_complete(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c23-accept-page")
    doc, env, token, _bind = _prepare(client, headers)
    body = _complete_json(env, doc, "Riley Page")
    body["assigned_fields"][0]["page_index"] = 999
    res = client.post(
        f"/api/agreements/{env['agreement_id']}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": token},
        json=body,
    )
    assert res.status_code == 400, res.text
    assert res.json()["detail"]["code"] == "field_page_mismatch"
    draft = client.get(f"/api/agreements/{env['agreement_id']}", headers=headers).json()["draft"]
    assert _audit_signature_events(draft, role=RECIPIENT_ROLE_ID) == []
    assert (draft.get("vs01_signer_execution_v1") or {}).get("records") in (None, [])
    receipt = client.get(
        f"/api/agreements/quick-pdf-envelope/receipt?document_id={doc['document_id']}",
        headers=headers,
    )
    assert receipt.json().get("receipt") in (None, {})
    assert receipt.json()["completion"]["fully_executed"] is False


def test_repro_completed_signer_validate_then_bootstrap(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c23-accept-refresh")
    doc, env, token, _bind = _prepare(client, headers)
    done = _recipient_complete(client, env, doc, token, signature="Riley Refresh")
    assert done.status_code == 200, done.text
    validated = client.get(
        "/api/agreements/access/validate",
        params={"token": token, "agreement_id": env["agreement_id"]},
    )
    assert validated.status_code == 200, validated.text
    body = validated.json()
    assert body.get("ok") is True
    assert body.get("signer_already_completed") is True
    assert body.get("completion_status") in {"completed", "already_signed", "fully_executed"}
    packet = client.get(
        f"/api/agreements/public/{env['agreement_id']}/vs01-signing-packet",
        params={"document_id": doc["document_id"], "t": token, "participant_id": env["recipient_party_id"]},
    )
    assert packet.status_code == 200, packet.text
    assert packet.json().get("signer_already_completed") is True


def test_repro_owner_cannot_complete_recipient_without_ceremony(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c23-accept-owner")
    doc, env, token, _bind = _prepare(client, headers)
    res = client.post(
        f"/api/agreements/{env['agreement_id']}/vs01-signer-complete",
        headers=headers,
        json={
            "signer_role_id": RECIPIENT_ROLE_ID,
            "participant_id": env["recipient_party_id"],
            "document_id": doc["document_id"],
        },
    )
    assert res.status_code == 403, res.text
    assert res.json()["detail"]["code"] == "owner_cannot_complete_other_signer"
    draft = client.get(f"/api/agreements/{env['agreement_id']}", headers=headers).json()["draft"]
    assert _audit_signature_events(draft, role=RECIPIENT_ROLE_ID) == []
    assert (draft.get("vs01_signer_execution_v1") or {}).get("records") in (None, [])
    # Signed-in owner still carrying the recipient token keeps recipient authority.
    with_token = dict(headers)
    with_token["X-Claw-Recipient-Access-Token"] = token
    ok = client.post(
        f"/api/agreements/{env['agreement_id']}/vs01-signer-complete",
        headers=with_token,
        json=_complete_json(env, doc, "Riley Token Wins"),
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["auth_mode"] == "recipient"
    assert ok.json()["completion"]["signer_role_id"] == RECIPIENT_ROLE_ID


def test_altered_field_type_is_rejected(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c23-accept-type")
    doc, env, token, _bind = _prepare(client, headers)
    body = _complete_json(env, doc, "Riley Type")
    body["assigned_fields"][0]["field_type"] = "initials"
    res = client.post(
        f"/api/agreements/{env['agreement_id']}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": token},
        json=body,
    )
    assert res.status_code == 400, res.text
    assert res.json()["detail"]["code"] == "field_type_mismatch"


def test_replay_identity_mismatch_is_not_exact_replay(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c23-accept-identity")
    doc, env, token, _bind = _prepare(client, headers)
    first = _recipient_complete(client, env, doc, token, signature="Riley Identity")
    assert first.status_code == 200, first.text
    body = _complete_json(env, doc, "Riley Identity")
    body["packet_revision"] = "qpk_forged"
    replay = client.post(
        f"/api/agreements/{env['agreement_id']}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": token},
        json=body,
    )
    assert replay.status_code == 409, replay.text
    assert replay.json()["detail"]["code"] in {"completion_evidence_mismatch", "packet_revision_mismatch"}


def test_owner_ceremony_still_signs_owner_role_only(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c23-accept-owner-ceremony")
    doc, env, token, bind = _prepare(client, headers)
    owner_via_complete = client.post(
        f"/api/agreements/{env['agreement_id']}/vs01-signer-complete",
        headers=headers,
        json={
            "signer_role_id": OWNER_ROLE_ID,
            "participant_id": env["owner_party_id"],
            "document_id": doc["document_id"],
        },
    )
    assert owner_via_complete.status_code == 400, owner_via_complete.text
    assert owner_via_complete.json()["detail"]["code"] in {
        "signature_required",
        "consent_required",
        "locked_field_authority_missing",
    }
    receipt = client.get(
        f"/api/agreements/quick-pdf-envelope/receipt?document_id={doc['document_id']}",
        headers=headers,
    )
    assert receipt.status_code == 200
    assert receipt.json()["completion"]["fully_executed"] is False
    assert receipt.json().get("receipt") in (None, {})


def test_retry_after_rejected_fields_then_one_receipt(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c23-accept-retry")
    doc, env, token, _bind = _prepare(client, headers)
    bad = _complete_json(env, doc, "Riley Retry")
    bad["assigned_fields"][0]["page_index"] = 999
    rejected = client.post(
        f"/api/agreements/{env['agreement_id']}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": token},
        json=bad,
    )
    assert rejected.status_code == 400, rejected.text
    draft = client.get(f"/api/agreements/{env['agreement_id']}", headers=headers).json()["draft"]
    assert _audit_signature_events(draft, role=RECIPIENT_ROLE_ID) == []
    ok = _recipient_complete(client, env, doc, token, signature="Riley Retry")
    assert ok.status_code == 200, ok.text
    assert ok.json()["completion"]["status"] in {"completed", "fully_executed"}
    assert ok.json()["completion"]["agreement_id"] == env["agreement_id"]
    assert ok.json()["completion"]["document_id"] == doc["document_id"]
    assert ok.json()["completion"]["signer_role_id"] == RECIPIENT_ROLE_ID
    assert ok.json()["completion"]["participant_id"] == env["recipient_party_id"]
    issued = ok.json()["uploaded_final_pdf_receipt"]
    assert issued["receipt_id"]
    first = client.get(
        f"/api/agreements/quick-pdf-envelope/receipt?document_id={doc['document_id']}",
        headers=headers,
    )
    second = client.get(
        f"/api/agreements/quick-pdf-envelope/receipt?document_id={doc['document_id']}",
        headers=headers,
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["receipt"]["receipt_id"] == issued["receipt_id"]
    assert second.json()["receipt"]["receipt_id"] == issued["receipt_id"]
    assert first.json()["receipt"]["receipt_hash_sha256"] == second.json()["receipt"]["receipt_hash_sha256"]
    mutate = client.post(
        f"/api/agreements/quick-pdf-envelope/receipt?document_id={doc['document_id']}",
        headers=headers,
        json={"receipt_id": "forged"},
    )
    assert mutate.status_code in {404, 405, 422}
    replay = _recipient_complete(client, env, doc, token, signature="Riley Retry")
    assert replay.status_code == 200, replay.text
    assert replay.json()["uploaded_final_pdf_receipt"]["receipt_id"] == issued["receipt_id"]


def test_unknown_field_and_replaced_invitation_fail_closed(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c23-accept-unknown")
    doc, env, token, bind = _prepare(client, headers)
    unknown = _complete_json(env, doc, "Riley Unknown")
    unknown["assigned_fields"][0]["field_id"] = "fld_not_locked"
    res = client.post(
        f"/api/agreements/{env['agreement_id']}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": token},
        json=unknown,
    )
    assert res.status_code == 400, res.text
    assert res.json()["detail"]["code"] == "field_not_in_packet"
    replacement = client.post(
        "/api/agreements/quick-pdf-envelope/reissue",
        headers=headers,
        json=bind,
    )
    assert replacement.status_code == 200, replacement.text
    from urllib.parse import parse_qs, urlparse

    replaced = (parse_qs(urlparse(replacement.json()["recipient_open_path"]).query).get("t") or [""])[0]
    assert replaced and replaced != token
    stale_before = client.get(
        "/api/agreements/access/validate",
        params={"token": token, "agreement_id": env["agreement_id"]},
    )
    assert stale_before.status_code == 403, stale_before.text
    assert stale_before.json()["detail"]["code"] == "invite_superseded"
    done = _recipient_complete(client, env, doc, replaced, signature="Riley Replaced")
    assert done.status_code == 200, done.text
    stale_after = client.get(
        "/api/agreements/access/validate",
        params={"token": token, "agreement_id": env["agreement_id"]},
    )
    assert stale_after.status_code == 403, stale_after.text
    assert stale_after.json()["detail"]["code"] in {"invite_superseded", "signing_complete"}
    fresh = client.get(
        "/api/agreements/access/validate",
        params={"token": replaced, "agreement_id": env["agreement_id"]},
    )
    assert fresh.status_code == 200, fresh.text
    assert fresh.json().get("signer_already_completed") is True


def test_commercial_completion_requires_openable_ledger(client: TestClient, monkeypatch) -> None:
    headers = make_authenticated_user_headers("phase4c23-accept-ledger")
    doc, env, token, _bind = _prepare(client, headers)
    from backend.services import vs01_completion_ledger as ledger

    real_path = ledger.ledger_path
    monkeypatch.setattr(ledger, "ledger_path", lambda: None)
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    blocked = _recipient_complete(client, env, doc, token, signature="Riley Ledger")
    assert blocked.status_code == 503, blocked.text
    assert blocked.json()["detail"]["code"] == "completion_ledger_unconfigured"
    draft = client.get(f"/api/agreements/{env['agreement_id']}", headers=headers).json()["draft"]
    assert _audit_signature_events(draft, role=RECIPIENT_ROLE_ID) == []
    monkeypatch.setattr(ledger, "ledger_path", real_path)
    ok = _recipient_complete(client, env, doc, token, signature="Riley Ledger")
    assert ok.status_code == 200, ok.text
    assert ok.json()["receipt_status"] == "issued"


def _prepare_drafted_ceremony(client: TestClient, headers: dict) -> tuple[str, str, str]:
    from backend.tests.entitlement_test_support import ensure_headers_entitled

    ensure_headers_entitled(headers)
    created = client.post(
        "/api/agreements/draft",
        headers=headers,
        json={
            "title": "Phase 4C.2.3 drafted ceremony",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Owner LLC", "role": "owner"},
                {"name": "Acme Growth LLC", "role": "signer"},
            ],
            "purpose": "Acceptance",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert created.status_code == 200, created.text
    aid = created.json()["id"]
    upd = client.post(
        f"/api/agreements/{aid}/update-field",
        headers=headers,
        json={
            "field": "parties",
            "value": [
                {"name": "Owner LLC", "role": "owner", "id": "p-owner"},
                {"name": "Acme Growth LLC", "role": "signer", "id": "p-acme"},
            ],
        },
    )
    assert upd.status_code == 200, upd.text
    mint_rev = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=headers,
        json={"mode": "review", "role": "signer", "recipient_party_id": "p-acme"},
    )
    assert mint_rev.status_code == 200, mint_rev.text
    review_hdr = {"X-Claw-Recipient-Access-Token": mint_rev.json()["token"]}
    approved = client.post(
        f"/api/agreements/{aid}/recipient-approve",
        headers=review_hdr,
        json={"participant_id": "p-acme", "participant_display_name": "Acme"},
    )
    assert approved.status_code == 200, approved.text
    lock = client.put(
        f"/api/agreements/{aid}/signing-lock",
        headers=headers,
        json={"locked_version_id": "lv-phase4c23", "locked_at": "2026-09-12T12:00:00Z", "locked_by": "owner"},
    )
    assert lock.status_code == 200, lock.text
    minted = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=headers,
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p-acme"},
    )
    assert minted.status_code == 200, minted.text
    return aid, minted.json()["token"], "lv-phase4c23"


def test_drafted_recipient_ceremony_rejects_owner_impersonation(client: TestClient) -> None:
    headers = make_authenticated_user_headers("phase4c23-accept-drafted")
    aid, token, lv = _prepare_drafted_ceremony(client, headers)
    impersonate = client.post(
        f"/api/agreements/{aid}/signing-ceremony/complete",
        headers=headers,
        json={
            "participant_id": "p-acme",
            "typed_name": "Acme Growth LLC",
            "locked_version_id": lv,
            "consent": _consent(),
        },
    )
    assert impersonate.status_code == 403, impersonate.text
    draft = client.get(f"/api/agreements/{aid}", headers=headers).json()["draft"]
    assert [e for e in draft.get("audit_log") or [] if e.get("event_type") == "signature_completed"] == []
    start = client.post(
        f"/api/agreements/{aid}/signing-ceremony/start",
        headers={"X-Claw-Recipient-Access-Token": token},
        json={"participant_id": "p-acme"},
    )
    assert start.status_code == 200, start.text
    done = client.post(
        f"/api/agreements/{aid}/signing-ceremony/complete",
        headers={"X-Claw-Recipient-Access-Token": token},
        json={
            "participant_id": "p-acme",
            "typed_name": "Acme Growth LLC",
            "locked_version_id": lv,
            "consent": _consent(),
        },
    )
    assert done.status_code == 200, done.text
    body = done.json()
    assert body["ok"] is True
    assert body["agreement_id"] == aid
    assert body["participant_id"] == "p-acme"
    assert body["status"] in {"completed", "fully_executed"}
    validated = client.get(
        "/api/agreements/access/validate",
        params={"token": token, "agreement_id": aid},
    )
    assert validated.status_code == 200, validated.text
    assert validated.json().get("signer_already_completed") is True
