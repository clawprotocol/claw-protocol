"""Phase 3C2B: session-bound recipient packet projection."""

from __future__ import annotations

import json
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.agreement_draft_store import (
    _agreement_path,
    _decode_draft_payload,
    _write_draft_file_unlocked,
    agreement_file_lock,
    load_draft,
)
from backend.services.recipient_bootstrap_session_store import count_sessions_for_agreement
from backend.services.vs01_signing_invite_delivery import VS01_SIGNING_INVITE_DELIVERY_FIELD
from backend.services.vs01_signing_packet_activation import VS01_SIGNING_PACKET_ACTIVATION_FIELD
from backend.tests.test_vs01_recipient_bootstrap_exchange import (
    _ORIGIN,
    _exchange,
    _mutate_draft,
    _setup_delivered,
    _status,
)
from backend.tests.test_vs01_signing_invite_delivery import (
    _enable_delivery_gates,
    _mock_provider,
)
from backend.tests.test_vs01_signing_packet_activation import (
    _DOCUMENT_ID,
    _ORG_H,
    _activate,
    _prepare_authorities,
    _stable_role_id,
)
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_FORBIDDEN_RESPONSE_KEYS = frozenset(
    {
        "session_id",
        "token_hash",
        "delivery_identity",
        "token_jti",
        "token_fp",
        "frozen_authority_material_hash",
        "consumed_token_jti",
        "recipient_session_id",
        "bootstrap_exchanged_at",
        "signer_email",
        "review_email",
        "roles",
        "portable",
        "recipients",
    }
)


@pytest.fixture(autouse=True)
def _isolated_store(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-session-packet-secret")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_RECIPIENT_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.delenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", raising=False)
    monkeypatch.delenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", raising=False)
    usage_economics_store_mod._store = None  # noqa: SLF001
    from backend.services.recipient_bootstrap_session_store import (
        reset_recipient_bootstrap_session_store_for_tests,
    )

    reset_recipient_bootstrap_session_store_for_tests()
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001
    reset_recipient_bootstrap_session_store_for_tests()


def _packet(client: TestClient):
    return client.get("/api/recipient/session/packet")


def _authenticated_client(monkeypatch) -> tuple[TestClient, str, str]:
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    exchange = _exchange(client, token)
    assert exchange.status_code == 200
    return client, agreement_id, token


def test_authenticated_session_returns_recipient_safe_projection(monkeypatch):
    client, agreement_id, _ = _authenticated_client(monkeypatch)
    res = _packet(client)
    assert res.status_code == 200
    assert res.headers.get("cache-control") == "no-store, private"
    body = res.json()
    assert body["ok"] is True
    assert body["v"] == 1
    assert body["readiness"] == "ready_for_review"
    assert body["accepted_version_id"].startswith("av_")
    assert body["accepted_corpus_sha256"]
    assert body["packet_revision"]
    assert body["signer_record_id"].startswith("signer:")
    assert body["signer_role_id"]
    assert body["party_id"]
    assert body["corpus_plain"].strip()
    assert body["corpus_hash"]
    assert isinstance(body["fields"], list)
    assert len(body["fields"]) >= 1
    assert all("assignedSignerRoleId" not in f for f in body["fields"])
    assert all("value" not in f for f in body["fields"])
    assert all("counterpartyId" not in f for f in body["fields"])
    dumped = json.dumps(body)
    assert "session_secret" not in dumped
    assert "@" not in body.get("signer_display_name", "")
    for key in _FORBIDDEN_RESPONSE_KEYS:
        assert key not in body


def test_no_cookie_rejected():
    client = TestClient(app)
    res = _packet(client)
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "bootstrap_invalid_or_expired"


def test_malformed_cookie_rejected(monkeypatch):
    client, _, _ = _authenticated_client(monkeypatch)
    client.cookies.set("claw_recipient_session", "not-a-valid-session")
    res = _packet(client)
    assert res.status_code == 403


def test_expired_session_rejected(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200

    from backend.services.recipient_bootstrap_session_store import (
        find_session_in_draft_by_token_hash,
        session_token_hash,
    )

    cookie = client.cookies.get("claw_recipient_session")
    assert cookie
    with agreement_file_lock(agreement_id):
        path = _agreement_path(agreement_id)
        draft = _decode_draft_payload(path.read_text(encoding="utf-8"))
        session = find_session_in_draft_by_token_hash(draft, session_token_hash(cookie))
        assert isinstance(session, dict)
        session["expires_at"] = "2000-01-01T00:00:00Z"
        _write_draft_file_unlocked(path, draft)

    assert _packet(client).status_code == 403


def test_revoked_session_rejected(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200

    from backend.services.recipient_bootstrap_session_store import (
        find_session_in_draft_by_token_hash,
        session_token_hash,
    )

    cookie = client.cookies.get("claw_recipient_session")
    assert cookie
    with agreement_file_lock(agreement_id):
        path = _agreement_path(agreement_id)
        draft = _decode_draft_payload(path.read_text(encoding="utf-8"))
        session = find_session_in_draft_by_token_hash(draft, session_token_hash(cookie))
        assert isinstance(session, dict)
        session["revoked_at"] = "2026-07-17T12:00:00Z"
        _write_draft_file_unlocked(path, draft)

    assert _packet(client).status_code == 403


def test_stale_accepted_version_rejected(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    _mutate_draft(
        agreement_id,
        lambda draft: draft[VS01_SIGNING_PACKET_ACTIVATION_FIELD].update(
            {"accepted_version_id": "av_stale_version"}
        ),
    )
    assert _packet(client).status_code == 403
    assert _status(client).json()["authenticated"] is False


def test_stale_accepted_corpus_hash_rejected(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    _mutate_draft(
        agreement_id,
        lambda draft: draft[VS01_SIGNING_PACKET_ACTIVATION_FIELD].update(
            {"accepted_corpus_sha256": "0" * 64}
        ),
    )
    assert _packet(client).status_code == 403


def test_signing_lock_mismatch_rejected(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    from backend.services.agreement_signing_lock_store import write_signing_lock

    write_signing_lock(
        agreement_id,
        {
            "locked_version_id": "av_wrong",
            "content_sha256": "0" * 64,
            "accepted_corpus_sha256": "0" * 64,
            "locked_at": "2026-07-17T12:00:00Z",
            "locked_by": "owner",
        },
    )
    assert _packet(client).status_code == 403


def test_frozen_authority_mismatch_rejected(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    _mutate_draft(
        agreement_id,
        lambda draft: draft.setdefault("frozen_signing_authority_v1", {}).update(
            {"acceptedVersionId": "av_wrong"}
        ),
    )
    assert _packet(client).status_code == 403


def test_activation_packet_revision_mismatch_rejected(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    _mutate_draft(
        agreement_id,
        lambda draft: draft[VS01_SIGNING_PACKET_ACTIVATION_FIELD].update(
            {"packet_revision": "deadbeef" * 8}
        ),
    )
    assert _packet(client).status_code == 403


def test_delivery_session_binding_mismatch_rejected(monkeypatch):
    client, agreement_id, token, delivery_identity = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    _mutate_draft(
        agreement_id,
        lambda draft: draft[VS01_SIGNING_INVITE_DELIVERY_FIELD]["recipients"][delivery_identity].update(
            {"recipient_session_id": "wrong-session-id"}
        ),
    )
    assert _packet(client).status_code == 403


def test_signer_party_mismatch_rejected(monkeypatch):
    client, agreement_id, token, delivery_identity = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    _mutate_draft(
        agreement_id,
        lambda draft: draft[VS01_SIGNING_INVITE_DELIVERY_FIELD]["recipients"][delivery_identity].update(
            {"party_id": "party_wrong"}
        ),
    )
    assert _packet(client).status_code == 403


def test_only_authenticated_signer_fields_returned(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    draft = load_draft(agreement_id)
    party_ids = [party["id"] for party in draft["parties"]]
    role_ids = [_stable_role_id(agreement_id, index, party_id) for index, party_id in enumerate(party_ids)]
    _mutate_draft(
        agreement_id,
        lambda current: current[VS01_SIGNING_PACKET_ACTIVATION_FIELD]["portable"].update(
            {
                "fields": [
                    {
                        "id": "owner_sig",
                        "type": "signature",
                        "page": 0,
                        "x": 0.1,
                        "y": 0.1,
                        "width": 0.2,
                        "height": 0.05,
                        "counterpartyId": party_ids[0],
                        "assignedSignerRoleId": role_ids[0],
                    },
                    {
                        "id": "cp_sig",
                        "type": "signature",
                        "page": 0,
                        "x": 0.1,
                        "y": 0.2,
                        "width": 0.2,
                        "height": 0.05,
                        "counterpartyId": party_ids[1],
                        "assignedSignerRoleId": role_ids[1],
                    },
                ]
            }
        ),
    )
    assert _exchange(client, token).status_code == 200
    body = _packet(client).json()
    assert {field["id"] for field in body["fields"]} == {"owner_sig"}


def test_unassigned_fields_fail_closed(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    _mutate_draft(
        agreement_id,
        lambda draft: draft[VS01_SIGNING_PACKET_ACTIVATION_FIELD]["portable"]["fields"][0].pop(
            "assignedSignerRoleId",
            None,
        ),
    )
    assert _exchange(client, token).status_code == 200
    assert _packet(client).status_code == 403


def test_duplicate_field_ids_fail_closed(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    draft = load_draft(agreement_id)
    party_id = draft["parties"][0]["id"]
    role_id = _stable_role_id(agreement_id, 0, party_id)
    duplicate = {
        "id": "dup",
        "type": "signature",
        "page": 0,
        "x": 0.1,
        "y": 0.1,
        "width": 0.2,
        "height": 0.05,
        "counterpartyId": party_id,
        "assignedSignerRoleId": role_id,
    }
    _mutate_draft(
        agreement_id,
        lambda current: current[VS01_SIGNING_PACKET_ACTIVATION_FIELD]["portable"].update(
            {"fields": [duplicate, dict(duplicate)]}
        ),
    )
    assert _exchange(client, token).status_code == 200
    assert _packet(client).status_code == 403


def test_unknown_assigned_role_fails_closed(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    _mutate_draft(
        agreement_id,
        lambda draft: draft[VS01_SIGNING_PACKET_ACTIVATION_FIELD]["portable"]["fields"][0].update(
            {"assignedSignerRoleId": "role_unknown"}
        ),
    )
    assert _exchange(client, token).status_code == 200
    assert _packet(client).status_code == 403


def test_public_endpoint_denies_authority_bound_activation(monkeypatch):
    client = TestClient(app)
    _enable_delivery_gates(monkeypatch)
    agreement_id, _, _, portable = _prepare_authorities(client)
    activate = _activate(client, agreement_id, portable)
    assert activate.status_code == 200
    activation = activate.json()["activation"]
    res = client.get(
        f"/api/agreements/public/{agreement_id}/vs01-signing-packet",
        params={
            "document_id": _DOCUMENT_ID,
            "packet_revision": activation["packet_revision"],
            "participant_id": portable["roles"][1]["partyId"],
            "recipient_email": portable["roles"][1]["signerEmail"],
        },
    )
    assert res.status_code == 404
    assert res.json()["detail"]["code"] == "session_required"


def test_concurrent_packet_read_during_authority_change_one_fails(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    barrier = threading.Barrier(2)
    results: list[int] = []

    def _read_or_mutate(index: int) -> None:
        barrier.wait()
        if index == 0:
            with agreement_file_lock(agreement_id):
                path = _agreement_path(agreement_id)
                draft = _decode_draft_payload(path.read_text(encoding="utf-8"))
                draft[VS01_SIGNING_PACKET_ACTIVATION_FIELD]["accepted_corpus_sha256"] = "f" * 64
                _write_draft_file_unlocked(path, draft)
        else:
            results.append(_packet(client).status_code)

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(_read_or_mutate, range(2)))
    assert 403 in results
