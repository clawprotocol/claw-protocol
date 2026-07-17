import copy
import hashlib
import json
import multiprocessing
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.agreement_draft_store import (
    create_frozen_signing_authority,
    load_draft,
    save_draft,
)
from backend.services.frozen_signing_authority import (
    FrozenSigningAuthorityError,
    build_canonical_frozen_signing_authority,
)
from backend.usage_economics import store as usage_economics_store_mod
from backend.utils.agreement_version_store import AgreementVersionStore

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "frozen-authority-test-org"}
_ACCEPT_H = {**_ORG_H, "X-Claw-Review-First-Persist": "1"}
_CORPUS = "PAID PRO FROZEN AUTHORITY AGREEMENT\n\n" + ("Operative accepted term. " * 90)


@pytest.fixture(autouse=True)
def _isolated_store(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _create_and_accept(client: TestClient, party_count: int = 2) -> tuple[str, dict, dict]:
    response = client.post(
        "/api/agreements/draft",
        headers=_ACCEPT_H,
        json={
            "title": "Frozen Authority",
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


def _candidate(agreement_id: str, draft: dict, accepted: dict) -> dict:
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


def _freeze(client: TestClient, agreement_id: str, candidate: dict):
    return client.post(
        f"/api/agreements/{agreement_id}/frozen-signing-authority",
        headers=_ORG_H,
        json={"snapshot": candidate},
    )


def _primitive_process_worker(
    start_event,
    result_queue,
    agreement_id: str,
    frozen_record: dict,
    audit_event: dict,
) -> None:
    start_event.wait()
    try:
        stored = create_frozen_signing_authority(
            agreement_id,
            frozen_record=frozen_record,
            audit_event=audit_event,
            updated_at="2026-07-17T02:00:00Z",
        )
        result_queue.put(("ok", stored))
    except Exception as exc:  # pragma: no cover - asserted in parent process
        result_queue.put(("error", str(exc)))


@pytest.mark.parametrize("party_count", [2, 3, 4])
def test_first_valid_write_is_durable_and_preserves_party_signer_separation(party_count):
    client = TestClient(app)
    agreement_id, draft, accepted = _create_and_accept(client, party_count)
    candidate = _candidate(agreement_id, draft, accepted)
    response = _freeze(client, agreement_id, candidate)
    assert response.status_code == 200
    stored = response.json()["snapshot"]
    assert stored["acceptedVersionId"].startswith("av_")
    assert stored["acceptedCorpusSha256"] == accepted["corpus_sha256"]
    assert [p["legalEntityName"] for p in stored["parties"]] == [
        p["name"] for p in draft["parties"]
    ]
    assert [s["signerName"] for s in stored["signers"]] != [
        p["legalEntityName"] for p in stored["parties"]
    ]
    assert stored["execution"]["partyOrder"] == [p["id"] for p in draft["parties"]]
    fetched = client.get(
        f"/api/agreements/{agreement_id}/frozen-signing-authority", headers=_ORG_H
    )
    assert fetched.status_code == 200
    assert fetched.json()["snapshot"] == stored


def test_identical_retry_is_idempotent_and_every_different_retry_is_rejected():
    client = TestClient(app)
    agreement_id, draft, accepted = _create_and_accept(client)
    candidate = _candidate(agreement_id, draft, accepted)
    first = _freeze(client, agreement_id, candidate)
    second = _freeze(client, agreement_id, copy.deepcopy(candidate))
    assert first.status_code == second.status_code == 200
    assert first.json()["snapshot"] == second.json()["snapshot"]

    changed = copy.deepcopy(candidate)
    changed["signers"][0]["signerTitle"] = "Different Authority"
    conflict = _freeze(client, agreement_id, changed)
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "frozen_signing_authority_immutable"
    assert load_draft(agreement_id)["frozen_signing_authority_v1"] == first.json()["snapshot"]


@pytest.mark.parametrize(
    ("mutate", "detail"),
    [
        (lambda c: c.update(agreementId="not-the-url-id"), "agreement_id_mismatch"),
        (lambda c: c.update(acceptedVersionId="session-created-id"), "accepted_version_required"),
        (lambda c: c.update(acceptedCorpusSha256="0" * 64), "accepted_corpus_mismatch"),
        (
            lambda c: c["parties"][0].update(legalEntityName=c["signers"][0]["signerName"]),
            "legal_party_order_mismatch",
        ),
        (
            lambda c: c["parties"].reverse(),
            "legal_party_order_mismatch",
        ),
        (
            lambda c: c["signers"][1].update(agreementPartyId="unknown-party"),
            "unknown_party_id",
        ),
        (
            lambda c: c["execution"].update(partyOrder=list(reversed(c["execution"]["partyOrder"]))),
            "execution_party_order_mismatch",
        ),
        (
            lambda c: c["execution"].update(executionPartyHash="0" * 64),
            "execution_party_hash_mismatch",
        ),
    ],
)
def test_candidate_mismatches_are_rejected_without_creating_authority(mutate, detail):
    client = TestClient(app)
    agreement_id, draft, accepted = _create_and_accept(client)
    candidate = _candidate(agreement_id, draft, accepted)
    mutate(candidate)
    response = _freeze(client, agreement_id, candidate)
    assert response.status_code in {400, 409}
    assert response.json()["detail"] == detail
    assert load_draft(agreement_id).get("frozen_signing_authority_v1") is None


def test_cross_agreement_version_and_legacy_unversioned_agreement_are_rejected():
    client = TestClient(app)
    agreement_a, draft_a, accepted_a = _create_and_accept(client)
    agreement_b, draft_b, _accepted_b = _create_and_accept(client)
    cross = _candidate(agreement_b, draft_b, accepted_a)
    response = _freeze(client, agreement_b, cross)
    assert response.status_code == 409
    assert response.json()["detail"] == "accepted_version_agreement_mismatch"

    legacy = client.post(
        "/api/agreements/draft",
        headers=_ACCEPT_H,
        json={
            "title": "Legacy",
            "jurisdiction": "TX",
            "parties": draft_a["parties"],
            "purpose": _CORPUS,
            "payment_terms": "Net 30",
        },
    )
    legacy_id = legacy.json()["id"]
    candidate = _candidate(legacy_id, legacy.json()["draft"], accepted_a)
    candidate["acceptedVersionId"] = ""
    response = _freeze(client, legacy_id, candidate)
    assert response.status_code == 409
    assert response.json()["detail"] == "accepted_version_required"


def test_multiple_signers_for_one_party_preserve_deterministic_execution_order():
    client = TestClient(app)
    agreement_id, draft, accepted = _create_and_accept(client)
    candidate = _candidate(agreement_id, draft, accepted)
    second_for_owner = {
        **candidate["signers"][0],
        "signerRecordId": f"signer:{draft['parties'][0]['id']}:1",
        "signerName": "Second Owner Signer",
        "signerEmail": "second-owner@example.test",
        "signingOrder": 1,
    }
    candidate["signers"][1]["signingOrder"] = 2
    candidate["signers"].insert(1, second_for_owner)
    candidate["execution"]["signerOrder"] = [
        signer["signerRecordId"] for signer in candidate["signers"]
    ]

    response = _freeze(client, agreement_id, candidate)
    assert response.status_code == 200
    stored = response.json()["snapshot"]
    assert len(stored["signers"]) == 3
    assert [signer["signingOrder"] for signer in stored["signers"]] == [0, 1, 2]
    assert stored["signers"][0]["agreementPartyId"] == stored["signers"][1]["agreementPartyId"]


def test_draft_storage_preserves_and_protects_frozen_authority():
    client = TestClient(app)
    agreement_id, draft, accepted = _create_and_accept(client)
    candidate = _candidate(agreement_id, draft, accepted)

    direct_establish = load_draft(agreement_id)
    direct_establish["frozen_signing_authority_v1"] = candidate
    with pytest.raises(ValueError, match="frozen_signing_authority_endpoint_required"):
        save_draft(direct_establish)

    generic_endpoint = client.post(
        f"/api/agreements/{agreement_id}/update-field",
        headers=_ORG_H,
        json={"field": "frozen_signing_authority_v1", "value": candidate},
    )
    assert generic_endpoint.status_code == 400
    assert load_draft(agreement_id).get("frozen_signing_authority_v1") is None

    frozen_response = _freeze(client, agreement_id, candidate)
    assert frozen_response.status_code == 200
    frozen = frozen_response.json()["snapshot"]

    ordinary_update = client.post(
        f"/api/agreements/{agreement_id}/update-field",
        headers=_ORG_H,
        json={"field": "title", "value": "Updated without authority loss"},
    )
    assert ordinary_update.status_code == 200
    assert load_draft(agreement_id)["frozen_signing_authority_v1"] == frozen

    missing_field = load_draft(agreement_id)
    missing_field.pop("frozen_signing_authority_v1")
    save_draft(missing_field)
    assert load_draft(agreement_id)["frozen_signing_authority_v1"] == frozen

    explicit_clear = load_draft(agreement_id)
    explicit_clear["frozen_signing_authority_v1"] = None
    save_draft(explicit_clear)
    assert load_draft(agreement_id)["frozen_signing_authority_v1"] == frozen

    replacement = load_draft(agreement_id)
    replacement["frozen_signing_authority_v1"] = {
        **frozen,
        "signers": [{**frozen["signers"][0], "signerTitle": "Illicit replacement"}],
    }
    with pytest.raises(ValueError, match="frozen_signing_authority_immutable"):
        save_draft(replacement)
    assert load_draft(agreement_id)["frozen_signing_authority_v1"] == frozen

    serialized = client.get(f"/api/agreements/{agreement_id}", headers=_ORG_H)
    assert serialized.status_code == 200
    assert serialized.json()["draft"]["frozen_signing_authority_v1"] == frozen


def test_atomic_primitive_cross_process_identical_create_returns_one_record():
    client = TestClient(app)
    agreement_id, draft, accepted = _create_and_accept(client)
    candidate = _candidate(agreement_id, draft, accepted)
    canonical = build_canonical_frozen_signing_authority(
        agreement_id=agreement_id,
        candidate=candidate,
        frozen_at="2026-07-17T02:00:00Z",
    )
    audit_event = {
        "event_type": "frozen_signing_authority_persisted",
        "at": "2026-07-17T02:00:00Z",
        "field": "frozen_signing_authority_v1",
        "value": {"accepted_version_id": accepted["version_id"]},
    }
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
    results = [result_queue.get(timeout=10) for _ in processes]
    for process in processes:
        process.join(timeout=10)
        assert process.exitcode == 0

    assert [status for status, _ in results] == ["ok", "ok"]
    assert results[0][1] == results[1][1]
    stored = load_draft(agreement_id)
    assert stored["frozen_signing_authority_v1"] == results[0][1]
    assert sum(
        event.get("event_type") == "frozen_signing_authority_persisted"
        for event in stored["audit_log"]
    ) == 1


def test_atomic_primitive_cross_process_different_writes_have_one_winner():
    client = TestClient(app)
    agreement_id, draft, accepted = _create_and_accept(client)
    candidate = _candidate(agreement_id, draft, accepted)
    first = build_canonical_frozen_signing_authority(
        agreement_id=agreement_id,
        candidate=candidate,
        frozen_at="2026-07-17T02:15:00Z",
    )
    second = copy.deepcopy(first)
    second["signers"][0]["signerTitle"] = "Cross-process alternate title"
    audit_event = {
        "event_type": "frozen_signing_authority_persisted",
        "at": "2026-07-17T02:15:00Z",
        "field": "frozen_signing_authority_v1",
        "value": {"accepted_version_id": accepted["version_id"]},
    }
    ctx = multiprocessing.get_context("fork")
    start_event = ctx.Event()
    result_queue = ctx.Queue()
    processes = [
        ctx.Process(
            target=_primitive_process_worker,
            args=(start_event, result_queue, agreement_id, record, audit_event),
        )
        for record in (first, second)
    ]
    for process in processes:
        process.start()
    start_event.set()
    results = [result_queue.get(timeout=10) for _ in processes]
    for process in processes:
        process.join(timeout=10)
        assert process.exitcode == 0

    assert sorted(status for status, _ in results) == ["error", "ok"]
    assert next(value for status, value in results if status == "error") == (
        "frozen_signing_authority_immutable"
    )
    winner = next(value for status, value in results if status == "ok")
    stored = load_draft(agreement_id)
    assert stored["frozen_signing_authority_v1"] == winner
    assert sum(
        event.get("event_type") == "frozen_signing_authority_persisted"
        for event in stored["audit_log"]
    ) == 1


def test_atomic_primitive_directly_rejects_materially_different_retry():
    client = TestClient(app)
    agreement_id, draft, accepted = _create_and_accept(client)
    candidate = _candidate(agreement_id, draft, accepted)
    canonical = build_canonical_frozen_signing_authority(
        agreement_id=agreement_id,
        candidate=candidate,
        frozen_at="2026-07-17T02:30:00Z",
    )
    audit_event = {
        "event_type": "frozen_signing_authority_persisted",
        "at": "2026-07-17T02:30:00Z",
        "field": "frozen_signing_authority_v1",
        "value": {"accepted_version_id": accepted["version_id"]},
    }
    first = create_frozen_signing_authority(
        agreement_id,
        frozen_record=canonical,
        audit_event=audit_event,
        updated_at="2026-07-17T02:30:00Z",
    )
    identical = create_frozen_signing_authority(
        agreement_id,
        frozen_record={**canonical, "frozenAt": "later-at-ignored-for-idempotency"},
        audit_event=audit_event,
        updated_at="2026-07-17T02:31:00Z",
    )
    assert identical == first
    changed = copy.deepcopy(canonical)
    changed["signers"][0]["signerTitle"] = "Different direct retry"
    with pytest.raises(ValueError, match="frozen_signing_authority_immutable"):
        create_frozen_signing_authority(
            agreement_id,
            frozen_record=changed,
            audit_event=audit_event,
            updated_at="2026-07-17T02:32:00Z",
        )
    assert load_draft(agreement_id)["frozen_signing_authority_v1"] == first


def test_concurrent_identical_endpoint_writes_return_same_record_and_one_audit_event():
    client = TestClient(app)
    agreement_id, draft, accepted = _create_and_accept(client)
    candidate = _candidate(agreement_id, draft, accepted)
    barrier = threading.Barrier(2)

    def write():
        barrier.wait()
        with TestClient(app) as concurrent_client:
            response = _freeze(concurrent_client, agreement_id, candidate)
            return response.status_code, response.json()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _index: write(), range(2)))
    assert [status for status, _ in results] == [200, 200]
    assert results[0][1]["snapshot"] == results[1][1]["snapshot"]
    assert results[0][1]["snapshot"]["frozenAt"] == results[1][1]["snapshot"]["frozenAt"]
    stored = load_draft(agreement_id)
    assert sum(
        event.get("event_type") == "frozen_signing_authority_persisted"
        for event in stored["audit_log"]
    ) == 1


def test_concurrent_different_endpoint_writes_have_one_winner_and_cannot_overwrite():
    client = TestClient(app)
    agreement_id, draft, accepted = _create_and_accept(client)
    first = _candidate(agreement_id, draft, accepted)
    second = copy.deepcopy(first)
    second["signers"][0]["signerTitle"] = "Concurrent alternate title"
    barrier = threading.Barrier(2)

    def write(candidate):
        barrier.wait()
        with TestClient(app) as concurrent_client:
            response = _freeze(concurrent_client, agreement_id, candidate)
            return response.status_code, response.json()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(write, (first, second)))
    assert sorted(status for status, _ in results) == [200, 409]
    winner = next(payload["snapshot"] for status, payload in results if status == 200)
    loser = next(payload for status, payload in results if status == 409)
    assert loser["detail"] == "frozen_signing_authority_immutable"
    stored = load_draft(agreement_id)
    assert stored["frozen_signing_authority_v1"] == winner
    assert sum(
        event.get("event_type") == "frozen_signing_authority_persisted"
        for event in stored["audit_log"]
    ) == 1


def test_concurrent_generic_update_and_atomic_create_preserve_both_latest_fields():
    client = TestClient(app)
    agreement_id, draft, accepted = _create_and_accept(client)
    candidate = _candidate(agreement_id, draft, accepted)
    canonical = build_canonical_frozen_signing_authority(
        agreement_id=agreement_id,
        candidate=candidate,
        frozen_at="2026-07-17T03:00:00Z",
    )
    stale_update = load_draft(agreement_id)
    stale_update["title"] = "Concurrent latest title"
    barrier = threading.Barrier(2)

    def update():
        barrier.wait()
        save_draft(stale_update)

    def freeze():
        barrier.wait()
        create_frozen_signing_authority(
            agreement_id,
            frozen_record=canonical,
            audit_event={
                "event_type": "frozen_signing_authority_persisted",
                "at": "2026-07-17T03:00:00Z",
                "field": "frozen_signing_authority_v1",
                "value": {"accepted_version_id": accepted["version_id"]},
            },
            updated_at="2026-07-17T03:00:00Z",
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(update), executor.submit(freeze)]
        for future in futures:
            future.result()
    stored = load_draft(agreement_id)
    assert stored["title"] == "Concurrent latest title"
    assert stored["frozen_signing_authority_v1"] == canonical
    assert sum(
        event.get("event_type") == "frozen_signing_authority_persisted"
        for event in stored["audit_log"]
    ) == 1


def test_unaccepted_and_stale_versions_are_rejected_by_authority_service():
    accepted_row = {
        "agreement_id": "ag_real",
        "version_id": "av_candidate",
        "authority_state": "draft",
        "body_sha256": "a" * 64,
        "parties": [],
    }

    class FakeStore:
        def get_version_by_id(self, *, version_id):
            assert version_id == "av_candidate"
            return accepted_row

        def get_accepted_version(self, *, agreement_id):
            return {"version_id": "av_other"}

    with pytest.raises(FrozenSigningAuthorityError, match="real_agreement_id_required"):
        build_canonical_frozen_signing_authority(
            agreement_id="",
            candidate={"version": 1},
            frozen_at="2026-07-17T00:00:00Z",
            version_store=FakeStore(),  # type: ignore[arg-type]
        )
    with pytest.raises(FrozenSigningAuthorityError, match="accepted_version_not_final"):
        build_canonical_frozen_signing_authority(
            agreement_id="ag_real",
            candidate={
                "version": 1,
                "agreementId": "ag_real",
                "acceptedVersionId": "av_candidate",
            },
            frozen_at="2026-07-17T00:00:00Z",
            version_store=FakeStore(),  # type: ignore[arg-type]
        )
    accepted_row["authority_state"] = "accepted"
    with pytest.raises(FrozenSigningAuthorityError, match="accepted_version_stale"):
        build_canonical_frozen_signing_authority(
            agreement_id="ag_real",
            candidate={
                "version": 1,
                "agreementId": "ag_real",
                "acceptedVersionId": "av_candidate",
                "acceptedCorpusSha256": "a" * 64,
            },
            frozen_at="2026-07-17T00:00:00Z",
            version_store=FakeStore(),  # type: ignore[arg-type]
        )


def test_backend_persistence_failure_creates_no_authority(monkeypatch):
    from backend.services import agreement_draft_store

    client = TestClient(app, raise_server_exceptions=False)
    agreement_id, draft, accepted = _create_and_accept(client)
    candidate = _candidate(agreement_id, draft, accepted)

    def fail_save(*_args, **_kwargs):
        raise RuntimeError("injected frozen persistence failure")

    monkeypatch.setattr(agreement_draft_store, "create_frozen_signing_authority", fail_save)
    response = _freeze(client, agreement_id, candidate)
    assert response.status_code == 500
    assert load_draft(agreement_id).get("frozen_signing_authority_v1") is None
