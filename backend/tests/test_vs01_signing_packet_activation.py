import copy
import hashlib
import json
import multiprocessing
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.agreement_draft_store import (
    activate_vs01_signing_packet,
    load_draft,
    save_draft,
)
from backend.services.vs01_signing_packet_activation import (
    VS01_SIGNING_PACKET_ACTIVATION_FIELD,
    Vs01SigningPacketActivationError,
    _fingerprint_agreement_body,
    activation_owner_projection,
    build_canonical_signing_packet_activation,
    compute_packet_revision,
)
from backend.tests.conftest_usage_economics_helpers import register_test_agreement_owner
from backend.usage_economics import store as usage_economics_store_mod
from backend.utils.agreement_version_store import AgreementVersionStore

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "packet-activation-test-org"}
_ACCEPT_H = {**_ORG_H, "X-Claw-Review-First-Persist": "1"}
_CORPUS = "PAID PRO PACKET ACTIVATION AGREEMENT\n\n" + ("Operative accepted term. " * 90)
_DOCUMENT_ID = "doc_packet_activation_test"
_ACTIVATION_FIELD = VS01_SIGNING_PACKET_ACTIVATION_FIELD
_OPERATIONAL_FIELD = "vs01_signing_packet_v1"


@pytest.fixture(autouse=True)
def _isolated_store(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-signing-packet-activation-secret")
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _create_and_accept(client: TestClient, party_count: int = 2) -> tuple[str, dict, dict]:
    response = client.post(
        "/api/agreements/draft",
        headers=_ACCEPT_H,
        json={
            "title": "Packet Activation",
            "jurisdiction": "TX",
            "parties": [
                {
                    "name": f"Canonical Legal Entity {index + 1} LLC",
                    "role": "owner" if index == 0 else "signer",
                    "email": f"signer{index + 1}@example.test",
                }
                for index in range(party_count)
            ],
            "purpose": _CORPUS,
            "payment_terms": "Net 30",
        },
    )
    assert response.status_code == 200
    agreement_id = response.json()["id"]
    accepted = client.post(
        f"/api/agreements/{agreement_id}/accepted-corpus",
        headers=_ACCEPT_H,
        json={},
    )
    assert accepted.status_code == 200
    return agreement_id, response.json()["draft"], accepted.json()["accepted_version"]


def _frozen_candidate(agreement_id: str, draft: dict, accepted: dict) -> dict:
    parties = [
        {
            "agreementPartyId": party["id"],
            "legalEntityName": party["name"],
            "agreementRole": party["role"],
            "canonicalOrder": index,
        }
        for index, party in enumerate(draft["parties"])
    ]
    signers = [
        {
            "signerRecordId": f"signer:{party['id']}:0",
            "agreementPartyId": party["id"],
            "signerName": f"Display Signer {index + 1}",
            "signerTitle": "Authorized Signer",
            "signerEmail": f"signer{index + 1}@example.test",
            "signingOrder": index,
        }
        for index, party in enumerate(draft["parties"])
    ]
    party_order = [party["agreementPartyId"] for party in parties]
    execution_hash = hashlib.sha256(
        json.dumps(party_order, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()
    ).hexdigest()
    return {
        "version": 1,
        "agreementId": agreement_id,
        "acceptedVersionId": accepted["version_id"],
        "acceptedCorpusSha256": accepted["corpus_sha256"],
        "parties": parties,
        "signers": signers,
        "execution": {
            "partyOrder": party_order,
            "signerOrder": [signer["signerRecordId"] for signer in signers],
            "executionPartyHash": execution_hash,
        },
    }


def _stable_role_id(agreement_id: str, party_index: int, party_id: str) -> str:
    prefix = agreement_id.strip()[:12].replace("/", "_")
    safe_party = party_id.strip()[:32].replace("/", "_")
    return f"vs01r:{prefix}:i{party_index}:{safe_party}"


def _portable_candidate(agreement_id: str, draft: dict, accepted: dict, *, field_count: int = 1) -> dict:
    row = AgreementVersionStore().get_version_by_id(version_id=accepted["version_id"])
    corpus_plain = str(row.get("body_markdown") or draft.get("purpose") or _CORPUS)
    return {
        "v": 1,
        "seed": {
            "v": 1,
            "documentId": _DOCUMENT_ID,
            "agreementId": agreement_id,
            "corpusPlain": corpus_plain,
            "corpusHash": _fingerprint_agreement_body(corpus_plain),
            "savedAt": "2026-07-17T12:00:00Z",
        },
        "fields": [
            {
                "id": "f1",
                "type": "signature",
                "page": 0,
                "x": 0.1,
                "y": 0.1,
                "width": 0.2,
                "height": 0.05,
                "counterpartyId": draft["parties"][0]["id"],
            }
        ],
        "roles": [
            {
                "roleId": _stable_role_id(agreement_id, index, party["id"]),
                "signerRecordId": f"signer:{party['id']}:0",
                "partyIndex": index,
                "partyId": party["id"],
                "entityName": party["name"],
                "partyName": party["name"],
                "roleLabel": party["name"],
                "signerName": f"Display Signer {index + 1}",
                "signerTitle": "Authorized Signer",
                "signerEmail": f"signer{index + 1}@example.test",
                "requiresSignature": True,
                "vs01CounterpartyId": party["id"],
            }
            for index, party in enumerate(draft["parties"])
        ],
        "pageCount": 10,
        "witnessPageIndex": 9,
        "initialsPolicy": {"enabled": False, "bodyPagesOnly": True},
        "fieldCount": field_count,
    }


def _freeze(client: TestClient, agreement_id: str, candidate: dict):
    return client.post(
        f"/api/agreements/{agreement_id}/frozen-signing-authority",
        headers=_ORG_H,
        json={"snapshot": candidate},
    )


def _lock(client: TestClient, agreement_id: str, accepted: dict):
    from backend.routers import agreements_v2_api

    with patch.object(agreements_v2_api, "_signing_approval_gate_errors", lambda _draft: []):
        return client.put(
            f"/api/agreements/{agreement_id}/signing-lock",
            headers=_ORG_H,
            json={
                "accepted_version_id": accepted["version_id"],
                "corpus_sha256": accepted["corpus_sha256"],
                "locked_at": "2026-07-17T12:00:00Z",
                "locked_by": "owner",
            },
        )


def _activate(client: TestClient, agreement_id: str, portable: dict, document_id: str = _DOCUMENT_ID):
    return client.post(
        f"/api/agreements/{agreement_id}/signing-packet/activate",
        headers=_ORG_H,
        json={"document_id": document_id, "portable_packet": portable},
    )


def _prepare_authorities(client: TestClient, party_count: int = 2):
    agreement_id, draft, accepted = _create_and_accept(client, party_count)
    frozen = _frozen_candidate(agreement_id, draft, accepted)
    assert _freeze(client, agreement_id, frozen).status_code == 200
    assert _lock(client, agreement_id, accepted).status_code == 200
    portable = _portable_candidate(agreement_id, draft, accepted)
    return agreement_id, draft, accepted, portable


def _canonical_activation(agreement_id: str, portable: dict, *, activated_at: str = "2026-07-17T02:00:00Z") -> dict:
    from backend.services.agreement_signing_lock_store import read_signing_lock

    return build_canonical_signing_packet_activation(
        agreement_id=agreement_id,
        document_id=_DOCUMENT_ID,
        portable_packet=portable,
        draft=load_draft(agreement_id),
        activated_at=activated_at,
        signing_lock=read_signing_lock(agreement_id),
    )


def _stored_activation(agreement_id: str) -> dict:
    return load_draft(agreement_id)[_ACTIVATION_FIELD]


def _audit_event(document_id: str = _DOCUMENT_ID) -> dict:
    return {
        "event_type": "signing_packet_activated",
        "at": "2026-07-17T02:00:00Z",
        "field": _ACTIVATION_FIELD,
        "value": {"document_id": document_id},
    }


def _primitive_process_worker(start_event, result_queue, agreement_id: str, activation_record: dict, audit_event: dict):
    start_event.wait()
    try:
        stored = activate_vs01_signing_packet(
            agreement_id,
            activation_record=activation_record,
            audit_event=audit_event,
            updated_at="2026-07-17T02:00:00Z",
        )
        result_queue.put(("ok", stored))
    except Exception as exc:  # pragma: no cover - asserted in parent process
        result_queue.put(("error", str(exc)))


def test_valid_activation_persists_immutable_record_separate_from_operational_packet():
    client = TestClient(app)
    agreement_id, draft, accepted, portable = _prepare_authorities(client)
    response = _activate(client, agreement_id, portable)
    assert response.status_code == 200
    activation = response.json()["activation"]
    assert activation["packet_state"] == "active"
    assert activation["accepted_version_id"] == accepted["version_id"]
    assert activation["accepted_corpus_sha256"] == accepted["corpus_sha256"]
    assert activation["document_id"] == _DOCUMENT_ID
    assert "portable" not in activation
    assert len(activation["packet_revision"]) == 64
    stored = _stored_activation(agreement_id)
    assert stored["portable"]["seed"]["agreementId"] == agreement_id
    assert load_draft(agreement_id).get(_OPERATIONAL_FIELD) is None
    fetched = client.get(
        f"/api/agreements/{agreement_id}/signing-packet/activation",
        headers=_ORG_H,
    )
    assert fetched.status_code == 200
    assert fetched.json()["activation"] == activation
    assert "portable" not in fetched.json()["activation"]


def test_packet_revision_is_sha256_of_complete_binding_material():
    client = TestClient(app)
    agreement_id, _draft, _accepted, portable = _prepare_authorities(client)
    response = _activate(client, agreement_id, portable)
    assert response.status_code == 200
    stored = _stored_activation(agreement_id)
    assert stored["packet_revision"] == compute_packet_revision(stored)


def test_field_layout_assignment_changes_alter_revision_and_conflict():
    client = TestClient(app)
    agreement_id, draft, _accepted, portable = _prepare_authorities(client)
    first = _activate(client, agreement_id, portable)
    assert first.status_code == 200
    first_revision = first.json()["activation"]["packet_revision"]

    changed = copy.deepcopy(portable)
    changed["fields"][0]["x"] = 0.25
    changed["fields"][0]["width"] = 0.3
    changed["fieldCount"] = 2
    changed["initialsPolicy"] = {"enabled": True, "bodyPagesOnly": True}
    canonical = _canonical_activation(agreement_id, changed)
    assert canonical["packet_revision"] != first_revision

    conflict = _activate(client, agreement_id, changed)
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "signing_packet_activation_immutable"
    assert _stored_activation(agreement_id)["packet_revision"] == first_revision


def test_identical_retry_is_idempotent():
    client = TestClient(app)
    agreement_id, _draft, _accepted, portable = _prepare_authorities(client)
    first = _activate(client, agreement_id, portable)
    second = _activate(client, agreement_id, copy.deepcopy(portable))
    assert first.status_code == second.status_code == 200
    assert first.json()["activation"] == second.json()["activation"]
    audit_types = [
        event.get("event_type")
        for event in load_draft(agreement_id).get("audit_log") or []
        if isinstance(event, dict)
    ]
    assert audit_types.count("signing_packet_activated") == 1


def test_portable_signer_reordering_is_rejected():
    client = TestClient(app)
    agreement_id, _draft, _accepted, portable = _prepare_authorities(client)
    reordered = copy.deepcopy(portable)
    reordered["roles"] = list(reversed(reordered["roles"]))
    response = _activate(client, agreement_id, reordered)
    assert response.status_code == 409
    assert response.json()["detail"] == "execution_signer_order_mismatch"
    assert load_draft(agreement_id).get(_ACTIVATION_FIELD) is None


@pytest.mark.parametrize(
    ("mutate", "detail"),
    [
        (lambda portable, draft, accepted: portable["roles"][0].pop("signerRecordId", None), "portable_signer_reference_required"),
        (lambda portable, draft, accepted: portable["roles"][1].update(signerRecordId=portable["roles"][0]["signerRecordId"]), "duplicate_signer_record_id"),
        (lambda portable, draft, accepted: portable["roles"][1].update(signerRecordId="signer:unknown:0"), "unknown_signer_reference"),
        (lambda portable, draft, accepted: portable["seed"].update(agreementId="wrong-id"), "agreement_id_mismatch"),
        (lambda portable, draft, accepted: portable["seed"].update(corpusPlain=portable["seed"]["corpusPlain"] + "x"), "accepted_corpus_mismatch"),
        (lambda portable, draft, accepted: portable["roles"][0].update(entityName="Different Entity LLC"), "legal_party_order_mismatch"),
        (lambda portable, draft, accepted: portable["roles"][1].update(partyId="unknown-party"), "portable_signer_reference_mismatch"),
    ],
)
def test_invalid_portable_candidates_are_rejected(mutate, detail):
    client = TestClient(app)
    agreement_id, draft, accepted, portable = _prepare_authorities(client)
    mutate(portable, draft, accepted)
    response = _activate(client, agreement_id, portable)
    assert response.status_code in {400, 409}
    assert response.json()["detail"] == detail
    assert load_draft(agreement_id).get(_ACTIVATION_FIELD) is None


def test_missing_frozen_authority_is_rejected():
    client = TestClient(app)
    agreement_id, draft, accepted = _create_and_accept(client)
    assert _lock(client, agreement_id, accepted).status_code == 200
    portable = _portable_candidate(agreement_id, draft, accepted)
    response = _activate(client, agreement_id, portable)
    assert response.status_code == 404
    assert response.json()["detail"] == "frozen_signing_authority_not_found"


def test_stale_accepted_version_is_rejected(monkeypatch):
    client = TestClient(app)
    agreement_id, _draft, _accepted, portable = _prepare_authorities(client)
    real_get_accepted = AgreementVersionStore.get_accepted_version

    def stale_accepted(store_self, *, agreement_id: str):
        current = real_get_accepted(store_self, agreement_id=agreement_id)
        if not current:
            return None
        return {**current, "version_id": "av_stale_accepted_version"}

    monkeypatch.setattr(AgreementVersionStore, "get_accepted_version", stale_accepted)
    response = _activate(client, agreement_id, portable)
    assert response.status_code == 409
    assert response.json()["detail"] == "accepted_version_stale"


def test_missing_signing_lock_is_rejected():
    client = TestClient(app)
    agreement_id, draft, accepted = _create_and_accept(client)
    frozen = _frozen_candidate(agreement_id, draft, accepted)
    assert _freeze(client, agreement_id, frozen).status_code == 200
    portable = _portable_candidate(agreement_id, draft, accepted)
    response = _activate(client, agreement_id, portable)
    assert response.status_code == 409
    assert response.json()["detail"] == "signing_lock_required"


def test_signing_lock_version_mismatch_is_rejected():
    client = TestClient(app)
    agreement_id, draft, accepted, portable = _prepare_authorities(client)
    from backend.services.agreement_signing_lock_store import write_signing_lock

    write_signing_lock(
        agreement_id,
        {
            "locked_version_id": "av_stale_version",
            "content_sha256": accepted["corpus_sha256"],
            "accepted_corpus_sha256": accepted["corpus_sha256"],
            "locked_at": "2026-07-17T12:00:00Z",
            "locked_by": "owner",
        },
    )
    response = _activate(client, agreement_id, portable)
    assert response.status_code == 409
    assert response.json()["detail"] == "signing_lock_version_mismatch"


def test_generic_draft_save_cannot_establish_replace_or_erase_activation():
    client = TestClient(app)
    agreement_id, _draft, _accepted, portable = _prepare_authorities(client)

    direct_establish = load_draft(agreement_id)
    direct_establish[_ACTIVATION_FIELD] = {"v": 1, "portable": portable}
    with pytest.raises(ValueError, match="signing_packet_activation_endpoint_required"):
        save_draft(direct_establish)

    activated = _activate(client, agreement_id, portable)
    assert activated.status_code == 200
    stored = _stored_activation(agreement_id)
    projection = activation_owner_projection(stored)

    missing_field = load_draft(agreement_id)
    missing_field.pop(_ACTIVATION_FIELD)
    save_draft(missing_field)
    assert _stored_activation(agreement_id) == stored

    explicit_clear = load_draft(agreement_id)
    explicit_clear[_ACTIVATION_FIELD] = None
    save_draft(explicit_clear)
    assert _stored_activation(agreement_id) == stored

    replacement = load_draft(agreement_id)
    replacement[_ACTIVATION_FIELD] = {
        **stored,
        "portable": {**stored["portable"], "fieldCount": 99},
    }
    with pytest.raises(ValueError, match="signing_packet_activation_immutable"):
        save_draft(replacement)
    assert _stored_activation(agreement_id) == stored
    assert projection == activated.json()["activation"]


def test_operational_signer_completion_state_remains_mutable_after_activation():
    client = TestClient(app)
    agreement_id, _draft, _accepted, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200
    draft = load_draft(agreement_id)
    draft[_OPERATIONAL_FIELD] = {
        "v": 1,
        "packet_state": "signing",
        "signatures": [{"signerRecordId": "signer:test:0", "signedAt": "2026-07-17T13:00:00Z"}],
    }
    save_draft(draft)
    merged = load_draft(agreement_id)
    assert merged[_ACTIVATION_FIELD]["packet_state"] == "active"
    assert merged[_OPERATIONAL_FIELD]["signatures"][0]["signedAt"] == "2026-07-17T13:00:00Z"


def test_signing_links_sent_default_denies_activated_packets_without_delivery(monkeypatch, tmp_path):
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <notifications@lawdog.me>")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    client = TestClient(app)
    agreement_id, _draft, _accepted, portable = _prepare_authorities(client)
    activated = _activate(client, agreement_id, portable)
    assert activated.status_code == 200

    with patch("backend.services.email.resend_client.httpx.Client") as mock_client_cls:
        mock_response = type("Resp", (), {"status_code": 200, "text": '{"id":"msg_ok"}'})()
        mock_response.json = lambda: {"id": "msg_ok"}
        mock_client = type("Client", (), {})()
        mock_client.post = lambda *args, **kwargs: mock_response
        mock_client.__enter__ = lambda self: mock_client
        mock_client.__exit__ = lambda *args: False
        mock_client_cls.return_value = mock_client
        response = client.post(
            f"/api/agreements/{agreement_id}/signing-links-sent",
            headers=_ORG_H,
            json={
                "packet_revision": "client_rev",
                "document_id": _DOCUMENT_ID,
                "targets": [
                    {
                        "email": "signer1@example.test",
                        "display_name": "Signer 1",
                        "signing_url": "https://app.example.com/sign?vs01_recipient_sign=1",
                        "signer_role_id": "role_owner",
                        "is_owner": True,
                    }
                ],
            },
        )
    assert response.status_code == 409
    assert response.json()["detail"] == "signing_invite_delivery_deferred_until_3c1b"
    assert mock_client_cls.call_count == 0


def test_activation_get_requires_owner_workspace_not_recipient_or_anonymous():
    client = TestClient(app)
    agreement_id, draft, _accepted, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200

    anon = client.get(f"/api/agreements/{agreement_id}/signing-packet/activation")
    assert anon.status_code == 401
    assert anon.json()["detail"]["code"] == "org_header_required"

    mint = client.post(
        f"/api/agreements/{agreement_id}/recipient-access-token",
        headers=_ORG_H,
        json={
            "mode": "review",
            "role": "signer",
            "recipient_party_id": draft["parties"][1]["id"],
        },
    )
    assert mint.status_code == 200
    recipient = client.get(
        f"/api/agreements/{agreement_id}/signing-packet/activation",
        headers={"X-Claw-Recipient-Access-Token": mint.json()["token"]},
    )
    assert recipient.status_code == 401
    assert recipient.json()["detail"]["code"] == "org_header_required"


def test_activation_get_stays_owner_only_when_usage_economics_disabled(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "0")
    client = TestClient(app)
    agreement_id, draft, _accepted, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200

    anon = client.get(f"/api/agreements/{agreement_id}/signing-packet/activation")
    assert anon.status_code == 401
    assert anon.json()["detail"]["code"] == "org_header_required"

    mint = client.post(
        f"/api/agreements/{agreement_id}/recipient-access-token",
        headers=_ORG_H,
        json={
            "mode": "review",
            "role": "signer",
            "recipient_party_id": draft["parties"][1]["id"],
        },
    )
    assert mint.status_code == 200
    recipient = client.get(
        f"/api/agreements/{agreement_id}/signing-packet/activation",
        headers={"X-Claw-Recipient-Access-Token": mint.json()["token"]},
    )
    assert recipient.status_code == 401
    assert recipient.json()["detail"]["code"] == "org_header_required"

    allowed = client.get(
        f"/api/agreements/{agreement_id}/signing-packet/activation",
        headers=_ORG_H,
    )
    assert allowed.status_code == 200


def test_activation_get_stays_owner_only_when_usage_economics_enabled(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    client = TestClient(app)
    agreement_id, _draft, _accepted, portable = _prepare_authorities(client)
    register_test_agreement_owner(
        db_path=str(tmp_path / "usage.sqlite3"),
        agreement_id=agreement_id,
        org_id=_ORG_H["X-Claw-Org-Id"],
    )
    assert _activate(client, agreement_id, portable).status_code == 200

    wrong_org = {"X-Claw-Org-Id": "different-org"}
    denied = client.get(
        f"/api/agreements/{agreement_id}/signing-packet/activation",
        headers=wrong_org,
    )
    assert denied.status_code == 403

    allowed = client.get(
        f"/api/agreements/{agreement_id}/signing-packet/activation",
        headers=_ORG_H,
    )
    assert allowed.status_code == 200


def test_cleared_signing_lock_prevents_activation_without_stale_record():
    client = TestClient(app)
    agreement_id, _draft, _accepted, portable = _prepare_authorities(client)
    from backend.services.agreement_signing_lock_store import clear_signing_lock

    clear_signing_lock(agreement_id)
    response = _activate(client, agreement_id, portable)
    assert response.status_code == 409
    assert response.json()["detail"] == "signing_lock_required"
    assert load_draft(agreement_id).get(_ACTIVATION_FIELD) is None


def test_concurrent_signing_lock_clear_vs_activation_cannot_create_stale_activation():
    client = TestClient(app)
    agreement_id, _draft, _accepted, portable = _prepare_authorities(client)
    from backend.services.agreement_draft_store import activate_vs01_signing_packet_authoritative
    from backend.services.agreement_signing_lock_store import clear_signing_lock

    barrier = threading.Barrier(2)
    results: list[tuple[str, object]] = []

    def activate_worker():
        barrier.wait()
        try:
            stored = activate_vs01_signing_packet_authoritative(
                agreement_id,
                document_id=_DOCUMENT_ID,
                portable_packet=portable,
                activated_at="2026-07-17T02:00:00Z",
            )
            results.append(("activate", "ok", stored["packet_revision"]))
        except Exception as exc:
            results.append(("activate", "error", str(exc)))

    def clear_worker():
        barrier.wait()
        clear_signing_lock(agreement_id)
        results.append(("clear", "ok", None))

    threads = [threading.Thread(target=fn) for fn in (activate_worker, clear_worker)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    activate_outcomes = [item for item in results if item[0] == "activate"]
    assert len(activate_outcomes) == 1
    if activate_outcomes[0][1] == "ok":
        assert load_draft(agreement_id).get(_ACTIVATION_FIELD) is not None
    else:
        assert "signing_lock_required" in str(activate_outcomes[0][2])
        assert load_draft(agreement_id).get(_ACTIVATION_FIELD) is None


def test_concurrent_identical_activation_creates_one_revision():
    client = TestClient(app)
    agreement_id, _draft, _accepted, portable = _prepare_authorities(client)
    canonical = _canonical_activation(agreement_id, portable)
    audit_event = _audit_event()
    barrier = threading.Barrier(2)
    results: list = []

    def worker():
        barrier.wait()
        try:
            stored = activate_vs01_signing_packet(
                agreement_id,
                activation_record=canonical,
                audit_event=audit_event,
                updated_at="2026-07-17T02:00:00Z",
            )
            results.append(("ok", stored))
        except Exception as exc:
            results.append(("error", str(exc)))

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert len(results) == 2
    assert all(result[0] == "ok" for result in results)
    assert results[0][1] == results[1][1]
    audit_types = [
        event.get("event_type")
        for event in load_draft(agreement_id).get("audit_log") or []
        if isinstance(event, dict)
    ]
    assert audit_types.count("signing_packet_activated") == 1


def test_concurrent_conflicting_activation_preserves_first_revision():
    client = TestClient(app)
    agreement_id, _draft, _accepted, portable = _prepare_authorities(client)
    changed = copy.deepcopy(portable)
    changed["fieldCount"] = 3
    canonical_a = _canonical_activation(agreement_id, portable)
    canonical_b = _canonical_activation(agreement_id, changed)
    audit_event = _audit_event()
    barrier = threading.Barrier(2)
    results: list = []

    def worker(record):
        barrier.wait()
        try:
            stored = activate_vs01_signing_packet(
                agreement_id,
                activation_record=record,
                audit_event=audit_event,
                updated_at="2026-07-17T02:00:00Z",
            )
            results.append(("ok", stored))
        except Exception as exc:
            results.append(("error", str(exc)))

    threads = [
        threading.Thread(target=worker, args=(canonical_a,)),
        threading.Thread(target=worker, args=(canonical_b,)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    ok_results = [result for result in results if result[0] == "ok"]
    error_results = [result for result in results if result[0] == "error"]
    assert len(ok_results) == 1
    assert len(error_results) == 1
    assert "signing_packet_activation_immutable" in error_results[0][1]
    assert _stored_activation(agreement_id) == ok_results[0][1]


def test_atomic_primitive_cross_process_identical_create_returns_one_record():
    client = TestClient(app)
    agreement_id, _draft, _accepted, portable = _prepare_authorities(client)
    canonical = _canonical_activation(agreement_id, portable)
    audit_event = _audit_event()
    ctx = multiprocessing.get_context("fork")
    start_event = ctx.Event()
    result_queue = ctx.Queue()
    processes = [
        ctx.Process(
            target=_primitive_process_worker,
            args=(start_event, result_queue, agreement_id, canonical, audit_event),
        )
        for _ in range(2)
    ]
    for process in processes:
        process.start()
    start_event.set()
    for process in processes:
        process.join(timeout=30)
        assert process.exitcode == 0
    outcomes = [result_queue.get(timeout=5) for _ in range(2)]
    assert all(outcome[0] == "ok" for outcome in outcomes)
    assert outcomes[0][1] == outcomes[1][1]
    audit_types = [
        event.get("event_type")
        for event in load_draft(agreement_id).get("audit_log") or []
        if isinstance(event, dict)
    ]
    assert audit_types.count("signing_packet_activated") == 1
