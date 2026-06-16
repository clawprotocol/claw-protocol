"""API-level VS01 signer completion: completion state vs email idempotency."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.agreement_draft_store import load_draft, save_draft

_ORG_ID = "test-org-vs01-complete"


def _org_headers() -> dict[str, str]:
    return {"X-Claw-Org-Id": _ORG_ID}


def _draft_with_vs01_packet(aid: str) -> dict:
    corpus = (
        "x" * 1600
        + "\nIN WITNESS WHEREOF, the Parties execute this Agreement.\n\n"
        "CLIENT:\nOwner LLC\nBy: __________________________\nDate: _____________________________\n\n"
        "SERVICE PROVIDER:\nCounterparty LLC\nBy: __________________________\nDate: _____________________________"
    )
    return {
        "v": 1,
        "document_id": "doc_vs01",
        "portable": {
            "v": 1,
            "seed": {
                "v": 1,
                "documentId": "doc_vs01",
                "agreementId": aid,
                "corpusPlain": corpus,
                "corpusHash": "testhash",
                "savedAt": "2026-06-15T00:00:00Z",
            },
            "fields": [
                {
                    "id": "owner_sig",
                    "counterpartyId": "p1",
                    "type": "signature",
                    "page": 9,
                    "x": 0.1,
                    "y": 0.1,
                    "width": 0.3,
                    "height": 0.05,
                    "assignedSignerRoleId": "role_owner",
                    "value": "",
                },
                {
                    "id": "cp_sig",
                    "counterpartyId": "p2",
                    "type": "signature",
                    "page": 9,
                    "x": 0.1,
                    "y": 0.2,
                    "width": 0.3,
                    "height": 0.05,
                    "assignedSignerRoleId": "role_cp",
                    "value": "",
                },
            ],
            "roles": [
                {"roleId": "role_owner", "partyIndex": 0, "requiresSignature": True, "signerEmail": "owner@example.test"},
                {"roleId": "role_cp", "partyIndex": 1, "requiresSignature": True, "signerEmail": "cp@example.test"},
            ],
            "pageCount": 10,
            "witnessPageIndex": 9,
            "initialsPolicy": {"enabled": False, "bodyPagesOnly": True},
            "fieldCount": 2,
        },
    }


@pytest.fixture()
def client(monkeypatch, tmp_path):
    from backend.usage_economics import store as usage_economics_store_mod

    usage_economics_store_mod._store = None  # noqa: SLF001
    from backend.services.vs01_signer_completion import reset_vs01_completion_email_locks_for_tests

    reset_vs01_completion_email_locks_for_tests()
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-vs01-complete-secret")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "0")
    return TestClient(app)


def _create_two_signer_agreement(client: TestClient) -> str:
    create_res = client.post(
        "/api/agreements/draft",
        headers=_org_headers(),
        json={
            "title": "VS01 completion test",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Owner LLC", "role": "owner"},
                {"name": "Owner Signer", "role": "signer", "email": "owner@example.test"},
                {"name": "Counterparty LLC", "role": "signer", "email": "cp@example.test"},
            ],
            "purpose": "Test",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]
    upd = client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_org_headers(),
        json={
            "field": "parties",
            "value": [
                {"name": "Owner LLC", "role": "owner", "id": "p-owner"},
                {"name": "Owner Signer", "role": "signer", "email": "owner@example.test", "id": "p1"},
                {"name": "Counterparty LLC", "role": "signer", "email": "cp@example.test", "id": "p2"},
            ],
        },
    )
    assert upd.status_code == 200
    draft = load_draft(aid)
    draft["vs01_signing_packet_v1"] = _draft_with_vs01_packet(aid)
    save_draft({**draft, "id": aid})
    return aid


def test_vs01_signer_complete_final_signer_persists_before_email(client: TestClient) -> None:
    aid = _create_two_signer_agreement(client)
    client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers=_org_headers(),
        json={"signer_role_id": "role_owner", "participant_id": "p1", "document_id": "doc_vs01"},
    )
    with patch(
        "backend.services.email.signing_completion_delivery.maybe_send_signing_completion_emails",
        return_value=None,
    ) as send_mock:
        res = client.post(
            f"/api/agreements/{aid}/vs01-signer-complete",
            headers=_org_headers(),
            json={"signer_role_id": "role_cp", "participant_id": "p2", "document_id": "doc_vs01"},
        )
    assert res.status_code == 200
    body = res.json()
    assert body["fully_executed"] is True
    assert body["completion_emails_sent"] is False
    send_mock.assert_called_once()

    draft = client.get(f"/api/agreements/{aid}", headers=_org_headers()).json()["draft"]
    assert draft.get("vs01_signing_packet_v1", {}).get("fully_executed_snapshot")


def test_vs01_signer_complete_duplicate_final_signer_is_idempotent(client: TestClient) -> None:
    aid = _create_two_signer_agreement(client)
    for role, pid in (("role_owner", "p1"), ("role_cp", "p2")):
        r = client.post(
            f"/api/agreements/{aid}/vs01-signer-complete",
            headers=_org_headers(),
            json={"signer_role_id": role, "participant_id": pid, "document_id": "doc_vs01"},
        )
        assert r.status_code == 200

    class _Ok:
        ok = True

    with patch(
        "backend.services.email.signing_completion_delivery.send_email_non_fatal",
        return_value=_Ok(),
    ), patch(
        "backend.services.email.signing_completion_delivery.email_configured",
        return_value=True,
    ), patch(
        "backend.services.email.signing_completion_delivery.app_public_origin",
        return_value="https://app.example.test",
    ):
        first = client.post(
            f"/api/agreements/{aid}/vs01-signer-complete",
            headers=_org_headers(),
            json={"signer_role_id": "role_cp", "participant_id": "p2", "document_id": "doc_vs01"},
        )
        second = client.post(
            f"/api/agreements/{aid}/vs01-signer-complete",
            headers=_org_headers(),
            json={"signer_role_id": "role_cp", "participant_id": "p2", "document_id": "doc_vs01"},
        )
    assert first.json()["already_signed"] is True
    assert second.json()["already_signed"] is True
    draft = client.get(f"/api/agreements/{aid}", headers=_org_headers()).json()["draft"]
    signed_events = [e for e in draft.get("audit_log", []) if e.get("event_type") == "signed"]
    assert len(signed_events) == 1
    email_events = [
        e for e in draft.get("audit_log", []) if e.get("event_type") == "signing_completion_emails_sent"
    ]
    assert len(email_events) <= 1


def test_vs01_signer_complete_email_failure_still_completed(client: TestClient) -> None:
    aid = _create_two_signer_agreement(client)
    client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers=_org_headers(),
        json={"signer_role_id": "role_owner", "participant_id": "p1", "document_id": "doc_vs01"},
    )
    with patch(
        "backend.services.email.signing_completion_delivery.maybe_send_signing_completion_emails",
        return_value=None,
    ):
        res = client.post(
            f"/api/agreements/{aid}/vs01-signer-complete",
            headers=_org_headers(),
            json={"signer_role_id": "role_cp", "participant_id": "p2", "document_id": "doc_vs01"},
        )
    assert res.json()["fully_executed"] is True
    verify = client.get(f"/api/agreements/public/{aid}/verify").json()
    assert verify["signature_status"]["fully_executed"] is True
    draft = client.get(f"/api/agreements/{aid}", headers=_org_headers()).json()["draft"]
    assert not any(
        e.get("event_type") == "signing_completion_emails_sent" for e in draft.get("audit_log", [])
    )


def test_vs01_signer_complete_retries_email_after_prior_failure(client: TestClient) -> None:
    aid = _create_two_signer_agreement(client)
    client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers=_org_headers(),
        json={"signer_role_id": "role_owner", "participant_id": "p1", "document_id": "doc_vs01"},
    )
    with patch(
        "backend.services.email.signing_completion_delivery.maybe_send_signing_completion_emails",
        return_value=None,
    ):
        first = client.post(
            f"/api/agreements/{aid}/vs01-signer-complete",
            headers=_org_headers(),
            json={"signer_role_id": "role_cp", "participant_id": "p2", "document_id": "doc_vs01"},
        )
    assert first.json()["fully_executed"] is True
    assert first.json()["completion_emails_sent"] is False

    class _Ok:
        ok = True

    with patch(
        "backend.services.email.signing_completion_delivery.send_email_non_fatal",
        return_value=_Ok(),
    ), patch(
        "backend.services.email.signing_completion_delivery.email_configured",
        return_value=True,
    ), patch(
        "backend.services.email.signing_completion_delivery.app_public_origin",
        return_value="https://app.example.test",
    ):
        retry = client.post(
            f"/api/agreements/{aid}/vs01-signer-complete",
            headers=_org_headers(),
            json={"signer_role_id": "role_cp", "participant_id": "p2", "document_id": "doc_vs01"},
        )
    assert retry.json()["already_signed"] is True
    assert retry.json()["completion_emails_sent"] is True
    draft = client.get(f"/api/agreements/{aid}", headers=_org_headers()).json()["draft"]
    assert draft.get("vs01_signing_packet_v1", {}).get("fully_executed_snapshot")
    email_events = [
        e for e in draft.get("audit_log", []) if e.get("event_type") == "signing_completion_emails_sent"
    ]
    assert len(email_events) == 1


def test_vs01_signer_complete_sends_email_for_owner_and_party_roles(client: TestClient) -> None:
    aid = _create_two_signer_agreement(client)
    draft = load_draft(aid)
    draft["parties"] = [
        {"id": "p1", "name": "Owner LLC", "role": "owner", "email": "owner@example.test"},
        {"id": "p2", "name": "Counterparty LLC", "role": "party", "email": "cp@example.test"},
    ]
    save_draft({**draft, "id": aid})

    client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers=_org_headers(),
        json={"signer_role_id": "role_owner", "participant_id": "p1", "document_id": "doc_vs01"},
    )

    class _Ok:
        ok = True

    captured: list[str] = []

    def _capture_send(*, to: str, **kwargs: object) -> _Ok:
        captured.append(to)
        return _Ok()

    with patch(
        "backend.services.email.signing_completion_delivery.fully_executed_snapshot_ready",
        return_value=True,
    ), patch(
        "backend.services.email.signing_completion_delivery.send_email_non_fatal",
        side_effect=_capture_send,
    ), patch(
        "backend.services.email.signing_completion_delivery.email_configured",
        return_value=True,
    ), patch(
        "backend.services.email.signing_completion_delivery.app_public_origin",
        return_value="https://app.example.test",
    ):
        res = client.post(
            f"/api/agreements/{aid}/vs01-signer-complete",
            headers=_org_headers(),
            json={"signer_role_id": "role_cp", "participant_id": "p2", "document_id": "doc_vs01"},
        )
    assert res.status_code == 200
    body = res.json()
    assert body["fully_executed"] is True
    assert body["completion_emails_sent"] is True
    assert sorted(captured) == ["cp@example.test", "owner@example.test"]
    draft_after = client.get(f"/api/agreements/{aid}", headers=_org_headers()).json()["draft"]
    email_events = [
        e for e in draft_after.get("audit_log", []) if e.get("event_type") == "signing_completion_emails_sent"
    ]
    assert len(email_events) == 1


def test_vs01_ensure_signed_snapshot_retries_completion_email(client: TestClient) -> None:
    aid = _create_two_signer_agreement(client)
    draft = load_draft(aid)
    draft["parties"] = [
        {"id": "p1", "name": "Owner LLC", "role": "owner", "email": "owner@example.test"},
        {"id": "p2", "name": "Counterparty LLC", "role": "party", "email": "cp@example.test"},
    ]
    save_draft({**draft, "id": aid})
    for role, pid in (("role_owner", "p1"), ("role_cp", "p2")):
        client.post(
            f"/api/agreements/{aid}/vs01-signer-complete",
            headers=_org_headers(),
            json={"signer_role_id": role, "participant_id": pid, "document_id": "doc_vs01"},
        )

    class _Ok:
        ok = True

    with patch(
        "backend.services.email.signing_completion_delivery.maybe_send_signing_completion_emails",
        return_value=None,
    ):
        retry_signer = client.post(
            f"/api/agreements/{aid}/vs01-signer-complete",
            headers=_org_headers(),
            json={"signer_role_id": "role_cp", "participant_id": "p2", "document_id": "doc_vs01"},
        )
    assert retry_signer.json()["completion_emails_sent"] is False

    draft_after_sign = load_draft(aid)
    snap_corpus = (
        draft_after_sign["vs01_signing_packet_v1"]["portable"]["seed"]["corpusPlain"]
        .replace("By: __________________________", "By: Owner LLC", 1)
        .replace("By: __________________________", "By: Counterparty LLC", 1)
        .replace("Date: _____________________________", "Date: June 7, 2026", 1)
        .replace("Date: _____________________________", "Date: June 8, 2026", 1)
    )
    stored = dict(draft_after_sign["vs01_signing_packet_v1"])
    stored["fully_executed_snapshot"] = {
        "v": 1,
        "corpus_plain": snap_corpus,
        "corpus_hash": "testhash",
        "saved_at": "2026-06-08T00:00:00Z",
        "signer_role_ids": ["role_owner", "role_cp"],
    }
    save_draft({**draft_after_sign, "id": aid, "vs01_signing_packet_v1": stored})

    with patch(
        "backend.services.email.signing_completion_delivery.send_email_non_fatal",
        return_value=_Ok(),
    ), patch(
        "backend.services.email.signing_completion_delivery.email_configured",
        return_value=True,
    ), patch(
        "backend.services.email.signing_completion_delivery.app_public_origin",
        return_value="https://app.example.test",
    ):
        ensured = client.post(
            f"/api/agreements/{aid}/vs01-ensure-signed-snapshot",
            headers=_org_headers(),
        )
    assert ensured.status_code == 200
    assert ensured.json()["completion_emails_sent"] is True


def test_vs01_signer_complete_concurrent_final_signer_one_email_set(client: TestClient) -> None:
    from concurrent.futures import ThreadPoolExecutor

    aid = _create_two_signer_agreement(client)
    client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers=_org_headers(),
        json={"signer_role_id": "role_owner", "participant_id": "p1", "document_id": "doc_vs01"},
    )

    send_calls: list[str] = []

    def _track_send(*, agreement_id: str, draft: dict, org_id: str | None = None):
        send_calls.append(agreement_id)
        return {
            "event_type": "signing_completion_emails_sent",
            "at": "2026-06-08T00:00:00Z",
            "value": {"sent_count": 2},
        }

    with patch(
        "backend.services.email.signing_completion_delivery.maybe_send_signing_completion_emails",
        side_effect=_track_send,
    ):
        payload = {
            "signer_role_id": "role_cp",
            "participant_id": "p2",
            "document_id": "doc_vs01",
        }
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [
                pool.submit(
                    client.post,
                    f"/api/agreements/{aid}/vs01-signer-complete",
                    headers=_org_headers(),
                    json=payload,
                )
                for _ in range(2)
            ]
            results = [f.result() for f in futures]

    assert all(r.status_code == 200 for r in results)
    assert all(r.json()["fully_executed"] is True for r in results)
    assert len(send_calls) <= 1
    draft = client.get(f"/api/agreements/{aid}", headers=_org_headers()).json()["draft"]
    signed_events = [e for e in draft.get("audit_log", []) if e.get("event_type") == "signed"]
    assert len(signed_events) == 1
    email_events = [
        e for e in draft.get("audit_log", []) if e.get("event_type") == "signing_completion_emails_sent"
    ]
    assert len(email_events) <= 1
