"""Phase 3C3: backend-authoritative completed agreement artifact."""

from __future__ import annotations

import hashlib
import json
import multiprocessing
import threading
import uuid
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
    save_draft,
)
from backend.services.recipient_bootstrap_session_store import (
    RECIPIENT_BOOTSTRAP_SESSIONS_FIELD,
    count_active_sessions_for_agreement,
    get_sessions_field,
)
from backend.services.vs01_recipient_bootstrap_exchange import _lookup_active_session
from backend.services.recipient_session_signing_mutations import VS01_RECIPIENT_SIGNER_STATE_FIELD
from backend.services.vs01_completed_agreement_artifact import (
    VS01_COMPLETED_AGREEMENT_ARTIFACT_FIELD,
    completed_artifact_material_hash,
    completed_artifact_ready,
    count_fully_executed_signed_audit_events,
    read_completed_artifact_from_draft,
    revalidate_completed_artifact,
)
from backend.services.vs01_signer_completion import (
    completed_vs01_signer_role_ids,
    fully_executed_signed_already_recorded,
)
from backend.services.vs01_signing_invite_delivery import VS01_SIGNING_INVITE_DELIVERY_FIELD
from backend.services.vs01_signing_packet_activation import VS01_SIGNING_PACKET_ACTIVATION_FIELD
from backend.tests.negotiation_review_test_helpers import (
    assert_slice3b_provider_isolation,
    reset_real_provider_attempt_count,
)
from backend.tests.test_vs01_recipient_bootstrap_exchange import (
    _ORIGIN,
    _exchange,
    _mutate_draft,
    _setup_delivered,
)
from backend.tests.conftest_usage_economics_helpers import register_test_agreement_owner
from backend.tests.test_vs01_signing_invite_delivery import (
    _deliver,
    _enable_delivery_gates,
    _mock_provider,
    _token_from_signing_url,
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


@pytest.fixture(autouse=True)
def _isolated_store(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-3c3-artifact-secret")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.setenv("CLAW_RECIPIENT_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("CLAW_DATABASE_URL", raising=False)
    monkeypatch.delenv("CLAW_AGREEMENT_DATABASE_URL", raising=False)
    monkeypatch.delenv("CLAW_AGREEMENT_POSTGRES_DSN", raising=False)
    monkeypatch.delenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", raising=False)
    monkeypatch.delenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", raising=False)
    usage_economics_store_mod._store = None  # noqa: SLF001
    from backend.services.recipient_bootstrap_session_store import (
        reset_recipient_bootstrap_session_store_for_tests,
    )

    reset_recipient_bootstrap_session_store_for_tests()
    reset_real_provider_attempt_count()
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001
    reset_recipient_bootstrap_session_store_for_tests()
    assert_slice3b_provider_isolation()


def _mutation_id() -> str:
    return f"mut-{uuid.uuid4().hex}"


def _field(client: TestClient, field_id: str, value: str, *, expected_revision: int = 0):
    return client.post(
        "/api/recipient/session/fields",
        json={
            "field_id": field_id,
            "value": value,
            "expected_revision": expected_revision,
            "mutation_id": _mutation_id(),
        },
        headers={"Origin": _ORIGIN},
    )


def _complete(client: TestClient):
    return client.post(
        "/api/recipient/session/complete",
        json={},
        headers={"Origin": _ORIGIN},
    )


def _setup_multi_party_delivered(monkeypatch, tmp_path, party_count: int = 2):
    client = TestClient(app)
    _enable_delivery_gates(monkeypatch)
    agreement_id, draft, _accepted, portable = _prepare_authorities(client, party_count=party_count)
    register_test_agreement_owner(
        db_path=str(tmp_path / "usage.sqlite3"),
        agreement_id=agreement_id,
        org_id=_ORG_H["X-Claw-Org-Id"],
    )
    party_ids = [party["id"] for party in draft["parties"]]
    fields = []
    for index, party_id in enumerate(party_ids):
        role_id = _stable_role_id(agreement_id, index, party_id)
        fields.append(
            {
                "id": f"sig_{index}",
                "type": "signature",
                "page": 0,
                "x": 0.1,
                "y": 0.1 + (index * 0.1),
                "width": 0.2,
                "height": 0.05,
                "counterpartyId": party_id,
                "assignedSignerRoleId": role_id,
            }
        )
    portable = {**portable, "fields": fields}
    assert _activate(client, agreement_id, portable).status_code == 200
    provider = _mock_provider()
    with patch(
        "backend.services.email.signing_delivery.default_authoritative_provider_send_fn",
        lambda draft: provider,
    ):
        deliver_res = _deliver(client, agreement_id)
    assert deliver_res.status_code == 200, deliver_res.text
    assert deliver_res.json()["aggregate_status"] == "delivered"
    tokens = [_token_from_signing_url(call["signing_url"]) for call in provider.calls]
    assert len(tokens) == party_count
    return client, agreement_id, tokens


def _complete_signer_session(client: TestClient, token: str, field_id: str, value: str):
    client.cookies.clear()
    assert _exchange(client, token).status_code == 200
    assert _field(client, field_id, value).status_code == 200
    return _complete(client)


def _retry_complete_signer_session(client: TestClient, token: str):
    if not client.cookies.get("claw_recipient_session"):
        assert _exchange(client, token).status_code == 200
    return _complete(client)


def _session_secret_for_token(token: str) -> str:
    client = TestClient(app)
    assert _exchange(client, token).status_code == 200
    secret = client.cookies.get("claw_recipient_session")
    assert secret
    return secret


def _assert_pre_final_not_certified(client: TestClient, agreement_id: str) -> None:
    draft = load_draft(agreement_id)
    assert not completed_artifact_ready(draft)
    owner = client.get(f"/api/agreements/{agreement_id}", headers=_ORG_H)
    assert owner.status_code == 200
    assert owner.json().get("completed_artifact") is None
    anon = client.get(f"/api/agreements/{agreement_id}/completed-artifact", headers=_ORG_H)
    assert anon.status_code == 404
    monkeypatch_verify = client.get(f"/api/agreements/public/{agreement_id}/verify")
    if monkeypatch_verify.status_code == 200:
        assert monkeypatch_verify.json().get("verification", {}).get("completed_artifact") is None
    from backend.services.completed_signed_pdf_export import read_completed_signed_corpus_plain

    assert not read_completed_signed_corpus_plain(draft)


def _assert_artifact_authority_bindings(draft: dict, artifact: dict) -> None:
    frozen = draft.get("frozen_signing_authority_v1") or {}
    activation = draft.get(VS01_SIGNING_PACKET_ACTIVATION_FIELD) or {}
    assert artifact["agreement_id"] == draft.get("id")
    assert artifact["accepted_version_id"] == frozen.get("acceptedVersionId")
    assert artifact["accepted_corpus_sha256"] == str(frozen.get("acceptedCorpusSha256") or "").lower()
    assert artifact["frozen_authority_material_hash"]
    assert artifact["packet_revision"] == activation.get("packet_revision")
    execution = frozen.get("execution") or {}
    expected_order = execution.get("signerOrder") or []
    actual_order = [
        signer.get("signerRecordId")
        for signer in sorted(
            [s for s in (frozen.get("signers") or []) if isinstance(s, dict)],
            key=lambda s: int(s.get("signingOrder") or 0),
        )
    ]
    assert actual_order == expected_order
    assert len(artifact.get("signer_completion_actions") or []) == len(expected_order)
    assert len(artifact.get("final_field_values") or {}) == len(expected_order)
    snap = (draft.get("vs01_signing_packet_v1") or {}).get("fully_executed_snapshot") or {}
    assert artifact["completed_corpus_sha256"] == snap.get("corpus_hash")


def _assert_all_sessions_revoked(agreement_id: str, draft: dict) -> None:
    assert count_active_sessions_for_agreement(agreement_id) == 0
    sessions = get_sessions_field(draft).get("sessions") or {}
    for session in sessions.values():
        if isinstance(session, dict):
            assert session.get("revoked_at")


def _establish_three_party_through_penultimate(
    monkeypatch, tmp_path
) -> tuple[TestClient, str, list[str], list[str]]:
    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=3)
    session_secrets: list[str] = []
    for index, token in enumerate(tokens[:-1]):
        secret = _session_secret_for_token(token)
        session_secrets.append(secret)
        client.cookies.set("claw_recipient_session", secret)
        assert _field(client, f"sig_{index}", f"Signer {index + 1}").status_code == 200
        res = _complete(client)
        assert res.status_code == 200
        assert res.json()["globally_executed"] is False
    _assert_pre_final_not_certified(client, agreement_id)
    final_secret = _session_secret_for_token(tokens[-1])
    session_secrets.append(final_secret)
    client.cookies.set("claw_recipient_session", final_secret)
    assert _field(client, "sig_2", "Signer Three").status_code == 200
    return client, agreement_id, tokens, session_secrets


def test_three_party_pre_final_blocks_certified_projections(monkeypatch, tmp_path):
    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=3)
    _complete_signer_session(client, tokens[0], "sig_0", "Signer One")
    _complete_signer_session(client, tokens[1], "sig_1", "Signer Two")
    _assert_pre_final_not_certified(client, agreement_id)
    draft = load_draft(agreement_id)
    assert len(completed_vs01_signer_role_ids(draft.get("audit_log") or [])) == 2


def test_three_party_final_signer_establishes_artifact_and_revokes_sessions(monkeypatch, tmp_path):
    client, agreement_id, tokens, session_secrets = _establish_three_party_through_penultimate(
        monkeypatch, tmp_path
    )
    before_sessions = count_active_sessions_for_agreement(agreement_id)
    assert before_sessions == 3

    final = _complete(client)
    assert final.status_code == 200
    assert final.json()["globally_executed"] is True

    draft = load_draft(agreement_id)
    artifact = read_completed_artifact_from_draft(draft)
    assert artifact
    _assert_artifact_authority_bindings(draft, artifact)
    _assert_all_sessions_revoked(agreement_id, draft)
    assert count_fully_executed_signed_audit_events(draft.get("audit_log") or []) == 1

    for secret in session_secrets:
        assert _lookup_active_session(secret) is None
        blocked = TestClient(app)
        blocked.cookies.set("claw_recipient_session", secret)
        assert blocked.post(
            "/api/recipient/session/fields",
            json={
                "field_id": "sig_0",
                "value": "Tampered",
                "expected_revision": 0,
                "mutation_id": _mutation_id(),
            },
            headers={"Origin": _ORIGIN},
        ).status_code == 403

    owner = client.get(f"/api/agreements/{agreement_id}/completed-artifact", headers=_ORG_H)
    assert owner.status_code == 200
    assert owner.json()["completed_artifact"]["material_hash"] == artifact["material_hash"]


def test_three_party_concurrent_final_completion_one_artifact(monkeypatch, tmp_path):
    client, agreement_id, tokens, session_secrets = _establish_three_party_through_penultimate(
        monkeypatch, tmp_path
    )
    final_secret = session_secrets[-1]
    barrier = threading.Barrier(2)
    results: list[dict] = []

    def _race():
        barrier.wait()
        racer = TestClient(app)
        racer.cookies.set("claw_recipient_session", final_secret)
        res = racer.post("/api/recipient/session/complete", json={}, headers={"Origin": _ORIGIN})
        results.append(res.json())

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda _: _race(), range(2)))

    draft = load_draft(agreement_id)
    assert completed_artifact_ready(draft)
    artifact = read_completed_artifact_from_draft(draft)
    assert artifact
    assert count_fully_executed_signed_audit_events(draft.get("audit_log") or []) == 1
    _assert_all_sessions_revoked(agreement_id, draft)
    assert all(r.get("globally_executed") or r.get("idempotent") for r in results)


def test_three_party_final_completion_wins_logout_race(monkeypatch, tmp_path):
    """Completion acquires the agreement file lock first; logout blocks until completion finishes."""
    from contextlib import contextmanager

    from backend.services.email.signing_completion_delivery import SIGNING_COMPLETION_EMAILS_SENT_EVENT

    client, agreement_id, tokens, session_secrets = _establish_three_party_through_penultimate(
        monkeypatch, tmp_path
    )
    client.cookies.set("claw_recipient_session", session_secrets[-1])

    lock_held = threading.Event()
    release_completion = threading.Event()
    real_lock = agreement_file_lock
    send_calls: list[str] = []

    @contextmanager
    def holding_lock(aid):
        with real_lock(aid):
            lock_held.set()
            release_completion.wait(timeout=5)
            yield

    def mock_send(*, agreement_id, draft, org_id=None):
        send_calls.append(agreement_id)
        return {
            "event_type": SIGNING_COMPLETION_EMAILS_SENT_EVENT,
            "at": "2026-07-17T12:00:00Z",
            "value": {},
        }

    with patch("backend.services.agreement_draft_store.agreement_file_lock", holding_lock), patch(
        "backend.services.email.signing_completion_delivery.maybe_send_signing_completion_emails",
        mock_send,
    ):
        with ThreadPoolExecutor(max_workers=2) as pool:
            complete_future = pool.submit(lambda: _complete(client).status_code)
            assert lock_held.wait(timeout=5)
            logout_future = pool.submit(
                lambda: client.post("/api/recipient/session/logout", headers={"Origin": _ORIGIN}).status_code
            )
            release_completion.set()
            complete_status = complete_future.result(timeout=5)
            logout_status = logout_future.result(timeout=5)

    assert complete_status == 200
    assert logout_status == 200
    draft = load_draft(agreement_id)
    assert completed_artifact_ready(draft)
    assert count_fully_executed_signed_audit_events(draft.get("audit_log") or []) == 1
    _assert_all_sessions_revoked(agreement_id, draft)
    assert send_calls == [agreement_id]


def test_three_party_logout_wins_final_completion_race(monkeypatch, tmp_path):
    """Logout revokes the session before completion acquires the agreement lock."""
    from backend.services import recipient_session_signing_mutations as mutations_mod

    client, agreement_id, tokens, session_secrets = _establish_three_party_through_penultimate(
        monkeypatch, tmp_path
    )
    client.cookies.set("claw_recipient_session", session_secrets[-1])
    before_audit_len = len(load_draft(agreement_id).get("audit_log") or [])

    gate_entered = threading.Event()
    release_gate = threading.Event()
    complete_codes: list[int] = []
    send_calls: list[dict] = []
    real_with_locked = mutations_mod._with_locked_draft_mutation

    def blocking_with_locked(*, session_secret: str, mutate_fn):
        from backend.services.vs01_recipient_bootstrap_exchange import _lookup_active_session

        if not _lookup_active_session(session_secret):
            raise mutations_mod.RecipientSessionSigningMutationError()
        gate_entered.set()
        release_gate.wait(timeout=5)
        return real_with_locked(session_secret=session_secret, mutate_fn=mutate_fn)

    with patch.object(mutations_mod, "_with_locked_draft_mutation", blocking_with_locked), patch(
        "backend.services.email.signing_completion_delivery.maybe_send_signing_completion_emails",
        lambda **kw: send_calls.append(kw) or None,
    ):
        with ThreadPoolExecutor(max_workers=2) as pool:
            complete_future = pool.submit(lambda: complete_codes.append(_complete(client).status_code))
            assert gate_entered.wait(timeout=5)
            assert client.post("/api/recipient/session/logout", headers={"Origin": _ORIGIN}).status_code == 200
            release_gate.set()
            complete_future.result(timeout=5)

    assert complete_codes == [403]
    draft = load_draft(agreement_id)
    assert not completed_artifact_ready(draft)
    assert count_fully_executed_signed_audit_events(draft.get("audit_log") or []) == 0
    assert len(draft.get("audit_log") or []) == before_audit_len
    assert send_calls == []


def test_three_party_artifact_idempotency_material_conflict_and_generic_save_guard(monkeypatch, tmp_path):
    client, agreement_id, tokens, _ = _establish_three_party_through_penultimate(monkeypatch, tmp_path)
    final = _complete(client)
    assert final.json()["globally_executed"] is True
    draft = load_draft(agreement_id)
    artifact = read_completed_artifact_from_draft(draft)
    assert artifact

    retry = _retry_complete_signer_session(client, tokens[-1])
    assert retry.status_code == 200
    assert retry.json()["idempotent"] is True
    after_retry = read_completed_artifact_from_draft(load_draft(agreement_id))
    assert after_retry["material_hash"] == artifact["material_hash"]
    assert after_retry["completion_timestamp"] == artifact["completion_timestamp"]

    tampered = load_draft(agreement_id)
    tampered[VS01_COMPLETED_AGREEMENT_ARTIFACT_FIELD] = {
        **artifact,
        "accepted_version_id": "tampered-version-id",
    }
    with pytest.raises(ValueError, match="completed_agreement_artifact_immutable"):
        save_draft(tampered)

    owner = client.get(f"/api/agreements/{agreement_id}", headers=_ORG_H)
    assert owner.json()["completed_artifact"]["material_hash"] == artifact["material_hash"]
    from backend.services.completed_signed_pdf_export import read_completed_signed_corpus_plain

    assert read_completed_signed_corpus_plain(load_draft(agreement_id))


def test_two_party_final_signer_creates_exactly_one_artifact(monkeypatch, tmp_path):
    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=2)
    assert _complete_signer_session(client, tokens[0], "sig_0", "Signer One").json()["globally_executed"] is False
    final = _complete_signer_session(client, tokens[1], "sig_1", "Signer Two")
    assert final.status_code == 200
    assert final.json()["globally_executed"] is True
    draft = load_draft(agreement_id)
    assert completed_artifact_ready(draft)
    artifact = read_completed_artifact_from_draft(draft)
    assert artifact
    assert artifact["material_hash"] == completed_artifact_material_hash(artifact)
    assert fully_executed_signed_already_recorded(draft.get("audit_log") or [])
    retry = _retry_complete_signer_session(client, tokens[1])
    assert retry.status_code == 200
    assert retry.json()["idempotent"] is True
    assert retry.json()["globally_executed"] is True
    assert read_completed_artifact_from_draft(load_draft(agreement_id))["material_hash"] == artifact["material_hash"]


def test_three_party_completion(monkeypatch, tmp_path):
    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=3)
    for index, token in enumerate(tokens[:-1]):
        res = _complete_signer_session(client, token, f"sig_{index}", f"Signer {index + 1}")
        assert res.json()["globally_executed"] is False
    final = _complete_signer_session(client, tokens[-1], f"sig_{len(tokens) - 1}", f"Signer {len(tokens)}")
    assert final.json()["globally_executed"] is True
    draft = load_draft(agreement_id)
    assert len(completed_vs01_signer_role_ids(draft.get("audit_log") or [])) == 3
    assert completed_artifact_ready(draft)


def test_four_party_completion(monkeypatch, tmp_path):
    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=4)
    for index, token in enumerate(tokens[:-1]):
        _complete_signer_session(client, token, f"sig_{index}", f"Signer {index + 1}")
    final = _complete_signer_session(client, tokens[-1], f"sig_{3}", "Signer 4")
    assert final.json()["globally_executed"] is True
    assert completed_artifact_ready(load_draft(agreement_id))


def test_missing_field_blocks_completion(monkeypatch, tmp_path):
    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=2)
    client.cookies.clear()
    assert _exchange(client, tokens[1]).status_code == 200
    assert _complete(client).status_code == 400


def test_equivalent_retry_is_idempotent(monkeypatch, tmp_path):
    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=2)
    _complete_signer_session(client, tokens[0], "sig_0", "Signer One")
    final = _complete_signer_session(client, tokens[1], "sig_1", "Signer Two")
    assert final.json()["globally_executed"] is True
    artifact_hash = read_completed_artifact_from_draft(load_draft(agreement_id))["material_hash"]
    retry = _retry_complete_signer_session(client, tokens[1])
    assert retry.json()["idempotent"] is True
    assert read_completed_artifact_from_draft(load_draft(agreement_id))["material_hash"] == artifact_hash


def test_generic_save_cannot_replace_completed_artifact(monkeypatch, tmp_path):
    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=2)
    _complete_signer_session(client, tokens[0], "sig_0", "Signer One")
    _complete_signer_session(client, tokens[1], "sig_1", "Signer Two")
    draft = load_draft(agreement_id)
    artifact_hash = read_completed_artifact_from_draft(draft)["material_hash"]
    draft["title"] = "Updated title after completion"
    save_draft(draft)
    after = load_draft(agreement_id)
    assert read_completed_artifact_from_draft(after)["material_hash"] == artifact_hash


def test_concurrent_final_signers_create_one_artifact(monkeypatch, tmp_path):
    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=2)
    _complete_signer_session(client, tokens[0], "sig_0", "Signer One")
    racer = TestClient(app)
    racer.cookies.clear()
    assert _exchange(racer, tokens[1]).status_code == 200
    assert _field(racer, "sig_1", "Signer Two").status_code == 200
    barrier = threading.Barrier(2)
    results: list[dict] = []

    def _race_complete():
        barrier.wait()
        res = racer.post("/api/recipient/session/complete", json={}, headers={"Origin": _ORIGIN})
        results.append(res.json())

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda _: _race_complete(), range(2)))
    assert any(r.get("globally_executed") for r in results)
    draft = load_draft(agreement_id)
    assert completed_artifact_ready(draft)


def _cross_process_worker(start_event, result_queue, session_secret: str):
    start_event.wait()
    try:
        from fastapi.testclient import TestClient

        from backend.main import app
        from backend.tests.test_vs01_recipient_bootstrap_exchange import _ORIGIN

        local = TestClient(app)
        local.cookies.set("claw_recipient_session", session_secret)
        complete = local.post("/api/recipient/session/complete", json={}, headers={"Origin": _ORIGIN})
        result_queue.put(("ok", complete.status_code, complete.json()))
    except Exception as exc:  # pragma: no cover
        result_queue.put(("error", str(exc), {}))


def test_cross_process_file_mode_finalization(monkeypatch, tmp_path):
    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=2)
    _complete_signer_session(client, tokens[0], "sig_0", "Signer One")
    client.cookies.clear()
    assert _exchange(client, tokens[1]).status_code == 200
    assert _field(client, "sig_1", "Signer Two").status_code == 200
    session_secret = client.cookies.get("claw_recipient_session")
    assert session_secret
    ctx = multiprocessing.get_context("spawn")
    start_event = ctx.Event()
    result_queue = ctx.Queue()
    proc = ctx.Process(
        target=_cross_process_worker,
        args=(start_event, result_queue, session_secret),
    )
    proc.start()
    start_event.set()
    proc.join(timeout=30)
    assert proc.exitcode == 0
    status, code, payload = result_queue.get(timeout=5)
    assert status == "ok"
    assert code == 200
    assert payload.get("globally_executed") is True
    assert completed_artifact_ready(load_draft(agreement_id))


def test_owner_completed_artifact_endpoint_requires_auth(monkeypatch, tmp_path):
    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=2)
    _complete_signer_session(client, tokens[0], "sig_0", "Signer One")
    _complete_signer_session(client, tokens[1], "sig_1", "Signer Two")
    anon = TestClient(app)
    res = anon.get(f"/api/agreements/{agreement_id}/completed-artifact")
    assert res.status_code in (401, 403, 404)
    owner = client.get(
        f"/api/agreements/{agreement_id}/completed-artifact",
        headers=_ORG_H,
    )
    assert owner.status_code == 200
    body = owner.json()
    assert body["completed_artifact"]["agreement_id"] == agreement_id
    assert len(body["completed_artifact"]["material_hash"]) == 64


def test_public_verify_includes_completed_artifact(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_PUBLIC_AGREEMENT_VERIFY_ENABLED", "1")
    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=2)
    _complete_signer_session(client, tokens[0], "sig_0", "Signer One")
    _complete_signer_session(client, tokens[1], "sig_1", "Signer Two")
    verify = client.get(f"/api/agreements/public/{agreement_id}/verify")
    assert verify.status_code == 200
    body = verify.json()
    artifact = body["verification"]["completed_artifact"]
    assert artifact
    assert artifact["agreement_id"] == agreement_id
    assert "signer2@example.test" not in json.dumps(body)
    assert "session" not in json.dumps(body).lower()


def test_revalidate_completed_artifact_detects_tamper(monkeypatch, tmp_path):
    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=2)
    _complete_signer_session(client, tokens[0], "sig_0", "Signer One")
    _complete_signer_session(client, tokens[1], "sig_1", "Signer Two")
    draft = load_draft(agreement_id)
    from backend.services.agreement_signing_lock_store import read_signing_lock

    assert revalidate_completed_artifact(draft, signing_lock=read_signing_lock(agreement_id))
    draft[VS01_COMPLETED_AGREEMENT_ARTIFACT_FIELD]["material_hash"] = "a" * 64
    assert revalidate_completed_artifact(draft, signing_lock=read_signing_lock(agreement_id)) is False


def test_concurrent_ordinary_update_and_completion_preserve_both(monkeypatch, tmp_path):
    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=2)
    _complete_signer_session(client, tokens[0], "sig_0", "Signer One")
    barrier = threading.Barrier(2)

    def _complete_final():
        barrier.wait()
        return _complete_signer_session(client, tokens[1], "sig_1", "Signer Two")

    def _save_title():
        barrier.wait()
        draft = load_draft(agreement_id)
        draft["title"] = "Concurrent title update"
        save_draft(draft)
        return True

    with ThreadPoolExecutor(max_workers=2) as pool:
        complete_future = pool.submit(_complete_final)
        save_future = pool.submit(_save_title)
        assert complete_future.result(timeout=10).status_code == 200
        assert save_future.result(timeout=10) is True
    draft = load_draft(agreement_id)
    assert completed_artifact_ready(draft)
    assert draft.get("title") == "Concurrent title update"


def test_partial_completion_does_not_create_artifact(monkeypatch, tmp_path):
    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=2)
    res = _complete_signer_session(client, tokens[0], "sig_0", "Signer One")
    assert res.json()["globally_executed"] is False
    assert not completed_artifact_ready(load_draft(agreement_id))


def test_activated_packet_blocks_legacy_vs01_signer_complete(monkeypatch, tmp_path):
    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=2)
    draft = load_draft(agreement_id)
    role_id = _stable_role_id(agreement_id, 0, draft["parties"][0]["id"])
    res = client.post(
        f"/api/agreements/{agreement_id}/vs01-signer-complete",
        headers=_ORG_H,
        json={
            "signer_role_id": role_id,
            "participant_id": draft["parties"][0]["id"],
            "document_id": _DOCUMENT_ID,
        },
    )
    assert res.status_code == 404
    assert res.json()["detail"]["code"] == "session_required"


def test_completed_artifact_excludes_secrets_and_unrelated_emails(monkeypatch, tmp_path):
    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=2)
    _complete_signer_session(client, tokens[0], "sig_0", "Signer One")
    _complete_signer_session(client, tokens[1], "sig_1", "Signer Two")
    artifact = read_completed_artifact_from_draft(load_draft(agreement_id))
    dumped = json.dumps(artifact)
    assert "claw_recipient_session" not in dumped.lower()
    assert "cookie" not in dumped.lower()
    assert count_fully_executed_signed_audit_events(load_draft(agreement_id).get("audit_log") or []) == 1


def test_pdf_export_prefers_artifact_bound_corpus(monkeypatch, tmp_path):
    from backend.services.completed_signed_pdf_export import read_completed_signed_corpus_plain

    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=2)
    _complete_signer_session(client, tokens[0], "sig_0", "Signer One")
    _complete_signer_session(client, tokens[1], "sig_1", "Signer Two")
    draft = load_draft(agreement_id)
    corpus = read_completed_signed_corpus_plain(draft)
    assert len(corpus) >= 80
    artifact = read_completed_artifact_from_draft(draft)
    snap = draft.get("vs01_signing_packet_v1", {}).get("fully_executed_snapshot", {})
    assert artifact["completed_corpus_sha256"] == snap.get("corpus_hash")


# --- Global completion follow-up after session revocation (P2-1) ---


def test_global_completion_returns_authoritative_agreement_id(monkeypatch, tmp_path):
    from backend.services import recipient_session_signing_mutations as mutations_mod

    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=2)
    _complete_signer_session(client, tokens[0], "sig_0", "Signer One")
    client.cookies.clear()
    assert _exchange(client, tokens[1]).status_code == 200
    assert _field(client, "sig_1", "Signer Two").status_code == 200
    secret = client.cookies.get("claw_recipient_session")
    assert secret

    result = mutations_mod.complete_recipient_session_signer(session_secret=secret)
    assert result.get("globally_executed") is True
    assert result.get("agreement_id") == agreement_id


def test_global_completion_followup_after_session_revocation(monkeypatch, tmp_path):
    from backend.services.email.signing_completion_delivery import SIGNING_COMPLETION_EMAILS_SENT_EVENT
    from backend.services.vs01_signer_completion import completion_emails_already_sent

    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=2)
    _complete_signer_session(client, tokens[0], "sig_0", "Signer One")
    client.cookies.clear()
    assert _exchange(client, tokens[1]).status_code == 200
    assert _field(client, "sig_1", "Signer Two").status_code == 200
    final_secret = client.cookies.get("claw_recipient_session")
    assert final_secret

    followup_reached = threading.Event()

    def mock_send(*, agreement_id: str, draft, org_id=None):
        assert count_active_sessions_for_agreement(agreement_id) == 0
        assert _lookup_active_session(final_secret) is None
        followup_reached.set()
        return {
            "event_type": SIGNING_COMPLETION_EMAILS_SENT_EVENT,
            "at": "2026-07-17T12:00:00Z",
            "value": {},
        }

    with patch(
        "backend.services.email.signing_completion_delivery.maybe_send_signing_completion_emails",
        mock_send,
    ):
        res = _complete(client)

    assert res.status_code == 200
    assert res.json()["globally_executed"] is True
    assert followup_reached.is_set()
    draft = load_draft(agreement_id)
    assert completed_artifact_ready(draft)
    assert completion_emails_already_sent(draft.get("audit_log") or [])


def test_global_completion_followup_survives_provider_failure(monkeypatch, tmp_path):
    from backend.services.vs01_signer_completion import completion_emails_already_sent

    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=2)
    _complete_signer_session(client, tokens[0], "sig_0", "Signer One")
    client.cookies.clear()
    assert _exchange(client, tokens[1]).status_code == 200
    assert _field(client, "sig_1", "Signer Two").status_code == 200

    def boom(**kwargs):
        raise RuntimeError("provider_down")

    with patch(
        "backend.services.email.signing_completion_delivery.maybe_send_signing_completion_emails",
        boom,
    ):
        res = _complete(client)

    assert res.status_code == 200
    assert res.json()["globally_executed"] is True
    draft = load_draft(agreement_id)
    assert completed_artifact_ready(draft)
    assert count_fully_executed_signed_audit_events(draft.get("audit_log") or []) == 1
    _assert_all_sessions_revoked(agreement_id, draft)
    assert not completion_emails_already_sent(draft.get("audit_log") or [])


def test_global_completion_retry_does_not_duplicate_notification(monkeypatch, tmp_path):
    from backend.services.email.signing_completion_delivery import SIGNING_COMPLETION_EMAILS_SENT_EVENT

    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=2)
    _complete_signer_session(client, tokens[0], "sig_0", "Signer One")
    send_count = 0

    def mock_send(**kwargs):
        nonlocal send_count
        send_count += 1
        return {
            "event_type": SIGNING_COMPLETION_EMAILS_SENT_EVENT,
            "at": "2026-07-17T12:00:00Z",
            "value": {},
        }

    with patch(
        "backend.services.email.signing_completion_delivery.maybe_send_signing_completion_emails",
        mock_send,
    ):
        first = _complete_signer_session(client, tokens[1], "sig_1", "Signer Two")
        assert first.status_code == 200
        retry = _retry_complete_signer_session(client, tokens[1])
        assert retry.status_code == 200
        assert retry.json()["idempotent"] is True

    assert send_count == 1
    draft = load_draft(agreement_id)
    from backend.services.vs01_signer_completion import completion_emails_already_sent

    assert completion_emails_already_sent(draft.get("audit_log") or [])


def test_global_completion_followup_uses_mutation_agreement_id_not_request(monkeypatch, tmp_path):
    from backend.services.email.signing_completion_delivery import SIGNING_COMPLETION_EMAILS_SENT_EVENT

    client, agreement_id, tokens = _setup_multi_party_delivered(monkeypatch, tmp_path, party_count=2)
    _complete_signer_session(client, tokens[0], "sig_0", "Signer One")
    loaded_ids: list[str] = []
    from backend.routers import agreements_v2_api

    real_load = agreements_v2_api._load_or_404

    def tracking_load(aid):
        loaded_ids.append(aid)
        return real_load(aid)

    def mock_send(*, agreement_id, draft, org_id=None):
        return {
            "event_type": SIGNING_COMPLETION_EMAILS_SENT_EVENT,
            "at": "2026-07-17T12:00:00Z",
            "value": {},
        }

    with patch.object(agreements_v2_api, "_load_or_404", tracking_load), patch(
        "backend.services.email.signing_completion_delivery.maybe_send_signing_completion_emails",
        mock_send,
    ):
        res = _complete_signer_session(client, tokens[1], "sig_1", "Signer Two")

    assert res.status_code == 200
    assert loaded_ids
    assert all(lid == agreement_id for lid in loaded_ids)


# --- PostgreSQL concurrency certification ---

_PG = "postgresql://anthem@localhost/lawdog_security3b_test"


def _configure_postgres_test_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_AGREEMENT_DATABASE_URL", _PG)
    monkeypatch.setenv("CLAW_AGREEMENT_POSTGRES_DSN", _PG)
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.delenv("CLAW_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)


def _reset_postgres_migrations() -> None:
    from backend.db import agreement_sql

    agreement_sql._pg_migrations_applied = False  # noqa: SLF001


def _pg_prepare_signer_field_session(token: str, field_id: str, value: str) -> str:
    from fastapi.testclient import TestClient

    from backend.main import app
    from backend.tests.test_vs01_recipient_bootstrap_exchange import _ORIGIN, _exchange

    client = TestClient(app)
    assert _exchange(client, token).status_code == 200
    assert client.post(
        "/api/recipient/session/fields",
        json={
            "field_id": field_id,
            "value": value,
            "expected_revision": 0,
            "mutation_id": f"mut-{uuid.uuid4().hex}",
        },
        headers={"Origin": _ORIGIN},
    ).status_code == 200
    session_secret = client.cookies.get("claw_recipient_session")
    assert session_secret
    return session_secret


def _pg_complete_signer_one(agreement_id: str, token: str, field_id: str, value: str):
    from fastapi.testclient import TestClient

    from backend.main import app
    from backend.tests.test_vs01_recipient_bootstrap_exchange import _ORIGIN, _exchange

    client = TestClient(app)
    assert _exchange(client, token).status_code == 200
    assert client.post(
        "/api/recipient/session/fields",
        json={
            "field_id": field_id,
            "value": value,
            "expected_revision": 0,
            "mutation_id": f"mut-{uuid.uuid4().hex}",
        },
        headers={"Origin": _ORIGIN},
    ).status_code == 200
    return client.post("/api/recipient/session/complete", json={}, headers={"Origin": _ORIGIN})


def _pg_final_signer_worker(start_event, result_queue, agreement_id: str, session_secret: str):
    start_event.wait()
    try:
        from fastapi.testclient import TestClient

        from backend.main import app
        from backend.tests.test_vs01_recipient_bootstrap_exchange import _ORIGIN

        client = TestClient(app)
        client.cookies.set("claw_recipient_session", session_secret)
        res = client.post("/api/recipient/session/complete", json={}, headers={"Origin": _ORIGIN})
        result_queue.put(("ok", res.status_code, res.json()))
    except Exception as exc:  # pragma: no cover
        result_queue.put(("error", str(exc), {}))


@pytest.mark.skipif(not _PG, reason="PostgreSQL DSN unavailable")
def test_postgres_concurrent_final_signers_establish_one_artifact(monkeypatch, tmp_path):
    _configure_postgres_test_env(monkeypatch)
    _reset_postgres_migrations()
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "pg-test-3c3-artifact-secret")
    monkeypatch.setenv("CLAW_RECIPIENT_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", "1")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", "1")

    from backend.services import agreement_draft_store as ads
    from backend.services import agreement_signing_lock_store as als
    from backend.tests.test_agreement_postgres_storage import _setup_pg_3c1b_delivery_agreement

    agreement_id = f"test_pg_3c3_artifact_{uuid.uuid4().hex}"
    draft, accepted = _setup_pg_3c1b_delivery_agreement(
        ads,
        als,
        agreement_id=agreement_id,
        document_id=_DOCUMENT_ID,
        extra_portable_fields=[
            {
                "id": "sig_1",
                "type": "signature",
                "page": 0,
                "x": 0.1,
                "y": 0.2,
                "width": 0.2,
                "height": 0.05,
                "counterpartyId": "party-signer",
                "assignedSignerRoleId": _stable_role_id(agreement_id, 1, "party-signer"),
            }
        ],
    )
    ads.save_draft(
        {
            **ads.load_draft(agreement_id),
            "created_at": draft.get("created_at") or "2026-07-17T12:00:00Z",
            "updated_at": draft.get("updated_at") or "2026-07-17T12:00:00Z",
        }
    )
    register_test_agreement_owner(
        db_path=str(tmp_path / "usage.sqlite3"),
        agreement_id=agreement_id,
        org_id=_ORG_H["X-Claw-Org-Id"],
    )
    provider_calls: list[dict] = []

    def _mock_provider_send(
        _agreement_id: str,
        _delivery_identity: str,
        _recipient_email: str,
        signing_url: str,
        _idempotency_key: str,
    ):
        provider_calls.append({"signing_url": signing_url})
        return True, "msg", None

    ads.deliver_vs01_signing_invites_authoritative(
        agreement_id,
        document_id=_DOCUMENT_ID,
        attempted_at="2026-07-17T12:00:00Z",
        provider_send_fn=_mock_provider_send,
        delivery_allowed=True,
    )
    tokens = [_token_from_signing_url(call["signing_url"]) for call in provider_calls]
    assert len(tokens) == 2

    first = _pg_complete_signer_one(agreement_id, tokens[0], "f1", "Signer One")
    assert first.status_code == 200
    assert first.json()["globally_executed"] is False

    prep_secret = _pg_prepare_signer_field_session(tokens[1], "sig_1", "Signer Two")

    ctx = multiprocessing.get_context("spawn")
    start_event = ctx.Event()
    result_queue = ctx.Queue()
    workers = [
        ctx.Process(
            target=_pg_final_signer_worker,
            args=(start_event, result_queue, agreement_id, prep_secret),
        )
        for _ in range(2)
    ]
    for proc in workers:
        proc.start()
    start_event.set()
    for proc in workers:
        proc.join(timeout=60)
        assert proc.exitcode == 0

    outcomes = [result_queue.get(timeout=10) for _ in workers]
    assert all(item[0] == "ok" for item in outcomes)
    assert sum(1 for item in outcomes if item[2].get("globally_executed")) >= 1

    draft = ads.load_draft(agreement_id)
    assert completed_artifact_ready(draft)
    artifact = read_completed_artifact_from_draft(draft)
    assert artifact
    assert count_fully_executed_signed_audit_events(draft.get("audit_log") or []) == 1

    retry_client = TestClient(app)
    retry_client.cookies.set("claw_recipient_session", prep_secret)
    retry = retry_client.post("/api/recipient/session/complete", json={}, headers={"Origin": _ORIGIN})
    assert retry.status_code == 200
    assert retry.json().get("idempotent") is True
    after = read_completed_artifact_from_draft(ads.load_draft(agreement_id))
    assert after["material_hash"] == artifact["material_hash"]
    assert after["completion_timestamp"] == artifact["completion_timestamp"]

    owner = TestClient(app).get(
        f"/api/agreements/{agreement_id}/completed-artifact",
        headers=_ORG_H,
    )
    assert owner.status_code == 200
    assert owner.json()["completed_artifact"]["material_hash"] == artifact["material_hash"]
    _assert_all_sessions_revoked(agreement_id, draft)


@pytest.mark.skipif(not _PG, reason="PostgreSQL DSN unavailable")
def test_postgres_three_party_final_completion_revokes_all_sessions(monkeypatch, tmp_path):
    _configure_postgres_test_env(monkeypatch)
    _reset_postgres_migrations()
    monkeypatch.setenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", "1")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", "1")
    client, agreement_id, tokens, session_secrets = _establish_three_party_through_penultimate(
        monkeypatch, tmp_path
    )
    assert count_active_sessions_for_agreement(agreement_id) == 3
    final = _complete(client)
    assert final.status_code == 200
    assert final.json()["globally_executed"] is True
    draft = load_draft(agreement_id)
    artifact = read_completed_artifact_from_draft(draft)
    assert artifact
    _assert_artifact_authority_bindings(draft, artifact)
    _assert_all_sessions_revoked(agreement_id, draft)
    assert count_fully_executed_signed_audit_events(draft.get("audit_log") or []) == 1
    for secret in session_secrets:
        assert _lookup_active_session(secret) is None


@pytest.mark.skipif(not _PG, reason="PostgreSQL DSN unavailable")
def test_postgres_three_party_final_completion_wins_logout_race(monkeypatch, tmp_path):
    """Completion holds the Postgres agreement row lock; logout blocks until completion commits."""
    from backend.db import agreement_sql
    from backend.services.email.signing_completion_delivery import SIGNING_COMPLETION_EMAILS_SENT_EVENT

    _configure_postgres_test_env(monkeypatch)
    _reset_postgres_migrations()
    monkeypatch.setenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", "1")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", "1")
    client, agreement_id, tokens, session_secrets = _establish_three_party_through_penultimate(
        monkeypatch, tmp_path
    )
    client.cookies.set("claw_recipient_session", session_secrets[-1])

    lock_held = threading.Event()
    release_completion = threading.Event()
    real_execute = agreement_sql.pg_execute
    send_calls: list[str] = []

    def gated_pg_execute(cx, sql, params=None):
        result = real_execute(cx, sql, params)
        sql_text = str(sql or "")
        if "agreement_drafts" in sql_text and "FOR UPDATE" in sql_text:
            lock_held.set()
            release_completion.wait(timeout=5)
        return result

    def mock_send(*, agreement_id, draft, org_id=None):
        send_calls.append(agreement_id)
        return {
            "event_type": SIGNING_COMPLETION_EMAILS_SENT_EVENT,
            "at": "2026-07-17T12:00:00Z",
            "value": {},
        }

    with patch.object(agreement_sql, "pg_execute", gated_pg_execute), patch(
        "backend.services.email.signing_completion_delivery.maybe_send_signing_completion_emails",
        mock_send,
    ):
        with ThreadPoolExecutor(max_workers=2) as pool:
            complete_future = pool.submit(lambda: _complete(client).status_code)
            assert lock_held.wait(timeout=5)
            logout_future = pool.submit(
                lambda: client.post("/api/recipient/session/logout", headers={"Origin": _ORIGIN}).status_code
            )
            release_completion.set()
            complete_status = complete_future.result(timeout=5)
            logout_status = logout_future.result(timeout=5)

    assert complete_status == 200
    assert logout_status == 200
    draft = load_draft(agreement_id)
    assert completed_artifact_ready(draft)
    assert count_fully_executed_signed_audit_events(draft.get("audit_log") or []) == 1
    _assert_all_sessions_revoked(agreement_id, draft)
    assert send_calls == [agreement_id]


@pytest.mark.skipif(not _PG, reason="PostgreSQL DSN unavailable")
def test_postgres_three_party_logout_wins_final_completion_race(monkeypatch, tmp_path):
    """Logout revokes the session before completion acquires the Postgres agreement lock."""
    from backend.services import recipient_session_signing_mutations as mutations_mod

    _configure_postgres_test_env(monkeypatch)
    _reset_postgres_migrations()
    monkeypatch.setenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", "1")
    monkeypatch.setenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", "1")
    client, agreement_id, tokens, session_secrets = _establish_three_party_through_penultimate(
        monkeypatch, tmp_path
    )
    client.cookies.set("claw_recipient_session", session_secrets[-1])
    before_audit_len = len(load_draft(agreement_id).get("audit_log") or [])

    gate_entered = threading.Event()
    release_gate = threading.Event()
    complete_codes: list[int] = []
    send_calls: list[dict] = []
    real_with_locked = mutations_mod._with_locked_draft_mutation

    def blocking_with_locked(*, session_secret: str, mutate_fn):
        from backend.services.vs01_recipient_bootstrap_exchange import _lookup_active_session

        if not _lookup_active_session(session_secret):
            raise mutations_mod.RecipientSessionSigningMutationError()
        gate_entered.set()
        release_gate.wait(timeout=5)
        return real_with_locked(session_secret=session_secret, mutate_fn=mutate_fn)

    with patch.object(mutations_mod, "_with_locked_draft_mutation", blocking_with_locked), patch(
        "backend.services.email.signing_completion_delivery.maybe_send_signing_completion_emails",
        lambda **kw: send_calls.append(kw) or None,
    ):
        with ThreadPoolExecutor(max_workers=2) as pool:
            complete_future = pool.submit(lambda: complete_codes.append(_complete(client).status_code))
            assert gate_entered.wait(timeout=5)
            assert client.post("/api/recipient/session/logout", headers={"Origin": _ORIGIN}).status_code == 200
            release_gate.set()
            complete_future.result(timeout=5)

    assert complete_codes == [403]
    draft = load_draft(agreement_id)
    assert not completed_artifact_ready(draft)
    assert count_fully_executed_signed_audit_events(draft.get("audit_log") or []) == 0
    assert len(draft.get("audit_log") or []) == before_audit_len
    assert send_calls == []
