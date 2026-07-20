"""Phase 3C2C: session-bound recipient signing mutations."""

from __future__ import annotations

import json
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
from backend.services.recipient_session_signing_mutations import (
    VS01_RECIPIENT_SIGNER_STATE_FIELD,
)
from backend.services.vs01_signer_completion import (
    completed_vs01_signer_role_ids,
    fully_executed_signed_already_recorded,
    signer_role_already_completed,
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
from backend.tests.test_vs01_signing_invite_delivery import (
    _enable_delivery_gates,
    _mock_provider,
)
from backend.tests.test_vs01_signing_packet_activation import (
    _DOCUMENT_ID,
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
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-3c2c-signing-secret")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
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
    reset_real_provider_attempt_count()
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001
    reset_recipient_bootstrap_session_store_for_tests()
    assert_slice3b_provider_isolation()


def _mutation_id() -> str:
    return f"mut-{uuid.uuid4().hex}"


def _field(
    client: TestClient,
    field_id: str,
    value: str,
    *,
    origin: str = _ORIGIN,
    expected_revision: int = 0,
    mutation_id: str | None = None,
):
    return client.post(
        "/api/recipient/session/fields",
        json={
            "field_id": field_id,
            "value": value,
            "expected_revision": expected_revision,
            "mutation_id": mutation_id or _mutation_id(),
        },
        headers={"Origin": origin},
    )

def _auth_client(monkeypatch) -> tuple[TestClient, str, str]:
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    return client, agreement_id, token


def _complete(client: TestClient, *, origin: str = _ORIGIN):
    return client.post(
        "/api/recipient/session/complete",
        json={},
        headers={"Origin": origin},
    )


def _packet(client: TestClient):
    return client.get("/api/recipient/session/packet")


def _add_second_signer_field(agreement_id: str, *, field_id: str = "cp_sig") -> str:
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
                        "id": field_id,
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
    return role_ids[0]


def test_valid_signer_updates_assigned_signature_field(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    role_id = _add_second_signer_field(agreement_id)
    res = _field(client, "owner_sig", "Jane Signer")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["field_values"]["owner_sig"] == "Jane Signer"
    assert body["finish_ready"] is True
    draft = load_draft(agreement_id)
    stored = draft[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    signer_record_id = next(iter(stored.keys()))
    assert stored[signer_record_id]["field_values"]["owner_sig"]["value"] == "Jane Signer"
    assert role_id


def test_signer_cannot_update_other_signers_field(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    _add_second_signer_field(agreement_id)
    assert _field(client, "cp_sig", "Wrong Signer").status_code == 403


def test_client_supplied_signer_identity_rejected(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    _add_second_signer_field(agreement_id)
    res = client.post(
        "/api/recipient/session/fields",
        json={
            "field_id": "owner_sig",
            "value": "Jane Signer",
            "expected_revision": 0,
            "mutation_id": _mutation_id(),
            "signer_role_id": "forged",
            "party_id": "forged",
        },
        headers={"Origin": _ORIGIN},
    )
    assert res.status_code == 422


def test_missing_session_cookie_fails_closed():
    client = TestClient(app)
    assert _field(client, "owner_sig", "x").status_code == 403
    assert _complete(client).status_code == 403


def test_expired_session_fails_closed(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    from backend.services.recipient_bootstrap_session_store import (
        apply_session_to_draft,
        get_session_by_token_hash,
        session_token_hash,
    )

    session = get_session_by_token_hash(session_token_hash(client.cookies.get("claw_recipient_session")))
    assert session
    session["expires_at"] = "2020-01-01T00:00:00Z"
    with agreement_file_lock(agreement_id):
        path = _agreement_path(agreement_id)
        draft = _decode_draft_payload(path.read_text(encoding="utf-8"))
        _write_draft_file_unlocked(path, apply_session_to_draft(draft, session))
    assert _field(client, "f1", "Jane").status_code == 403


def test_revoked_session_fails_closed(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    client.post("/api/recipient/session/logout", headers={"Origin": _ORIGIN})
    assert _field(client, "owner_sig", "Jane").status_code == 403


def test_stale_packet_revision_fails_closed(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    _mutate_draft(
        agreement_id,
        lambda draft: draft[VS01_SIGNING_PACKET_ACTIVATION_FIELD].update(
            {"packet_revision": "deadbeef" * 8}
        ),
    )
    assert _field(client, "owner_sig", "Jane").status_code == 403


def test_premature_signer_completion_rejected(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    assert _complete(client).status_code == 400
    assert _complete(client).json()["detail"]["code"] == "signer_not_ready"


def test_successful_signer_completion_idempotent_and_monotonic(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    assert _field(client, "f1", "Jane Signer").status_code == 200
    first = _complete(client)
    assert first.status_code == 200
    assert first.json()["signer_complete"] is True
    assert first.json()["globally_executed"] is False
    second = _complete(client)
    assert second.status_code == 200
    assert second.json()["idempotent"] is True
    draft = load_draft(agreement_id)
    assert fully_executed_signed_already_recorded(draft.get("audit_log") or []) is False
    completed = completed_vs01_signer_role_ids(draft.get("audit_log") or [])
    assert len(completed) == 1


def test_concurrent_distinct_field_updates_preserve_both(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    _mutate_draft(
        agreement_id,
        lambda draft: draft[VS01_SIGNING_PACKET_ACTIVATION_FIELD]["portable"]["fields"].append(
            {
                "id": "init1",
                "type": "initials",
                "page": 1,
                "x": 0.1,
                "y": 0.1,
                "width": 0.1,
                "height": 0.05,
                "counterpartyId": draft["parties"][0]["id"],
                "assignedSignerRoleId": _stable_role_id(
                    agreement_id, 0, draft["parties"][0]["id"]
                ),
            }
        ),
    )
    barrier = threading.Barrier(2)
    results: list[dict] = []

    def _update(field_id: str, value: str) -> None:
        barrier.wait()
        res = _field(client, field_id, value)
        results.append(res.json())

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda args: _update(*args), [("f1", "Sig A"), ("init1", "JA")]))
    values = {
        r["field_values"].get("f1")
        for r in results
        if r.get("ok")
    } | {
        r["field_values"].get("init1")
        for r in results
        if r.get("ok")
    }
    assert "Sig A" in values
    assert "JA" in values


def test_same_field_concurrent_updates_deterministic(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    barrier = threading.Barrier(2)
    responses: list = []

    def _write(value: str) -> None:
        barrier.wait()
        responses.append(_field(client, "f1", value))

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(_write, ["Winner", "Loser"]))
    statuses = {res.status_code for res in responses}
    assert 200 in statuses
    assert statuses <= {200, 409}
    draft = load_draft(agreement_id)
    stored = draft[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    value = next(iter(stored.values()))["field_values"]["f1"]["value"]
    assert value in {"Winner", "Loser"}
    revision = next(iter(stored.values()))["field_values"]["f1"]["revision"]
    assert revision == 1


def test_stale_revision_cannot_overwrite_newer_value(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    first = _field(client, "f1", "Current", expected_revision=0)
    assert first.status_code == 200
    assert first.json()["field_revisions"]["f1"] == 1
    stale = _field(client, "f1", "Stale", expected_revision=0)
    assert stale.status_code == 409
    draft = load_draft(agreement_id)
    stored = draft[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    field = next(iter(stored.values()))["field_values"]["f1"]
    assert field["value"] == "Current"
    assert field["revision"] == 1


def test_generic_draft_save_preserves_newer_signer_state(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    stale_draft = load_draft(agreement_id)
    assert _field(client, "f1", "Authoritative").status_code == 200
    mutated = dict(stale_draft)
    mutated["title"] = "Updated title only"
    mutated[VS01_RECIPIENT_SIGNER_STATE_FIELD] = stale_draft.get(VS01_RECIPIENT_SIGNER_STATE_FIELD)
    save_draft(mutated)
    after = load_draft(agreement_id)
    assert after["title"] == "Updated title only"
    stored = after[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    assert next(iter(stored.values()))["field_values"]["f1"]["value"] == "Authoritative"


def test_generic_draft_save_preserves_signer_state(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    assert _field(client, "f1", "Persisted").status_code == 200
    draft = load_draft(agreement_id)
    mutated = dict(draft)
    mutated["title"] = "Updated title only"
    save_draft(mutated)
    after = load_draft(agreement_id)
    assert after["title"] == "Updated title only"
    stored = after[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    assert next(iter(stored.values()))["field_values"]["f1"]["value"] == "Persisted"


def test_public_vs01_signer_complete_cannot_mutate_authority_bound_packet(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    draft = load_draft(agreement_id)
    role_id = draft[VS01_SIGNING_PACKET_ACTIVATION_FIELD]["portable"]["roles"][0]["roleId"]
    res = client.post(
        f"/api/agreements/{agreement_id}/vs01-signer-complete",
        json={
            "signer_role_id": role_id,
            "participant_id": draft["parties"][0]["id"],
            "document_id": _DOCUMENT_ID,
        },
    )
    assert res.status_code in (403, 404)
    assert res.json()["detail"]["code"] in ("session_required", "recipient_token_required")


def test_legacy_sign_sessions_blocked_in_production_like(monkeypatch, tmp_path):
    from backend.security.sensitive_mutation_authorization import LEGACY_SIGNING_DEFERRED_DETAIL
    from backend.tests.test_gtm_security_slice3_signing_mutations import (
        _configure_production_like,
        _seed_document_direct,
    )

    _configure_production_like(monkeypatch, tmp_path)
    client = TestClient(app)
    doc_id, sha = _seed_document_direct()
    res = client.post(
        "/v1/sign-sessions",
        json={"document_id": doc_id, "content_sha256": sha},
    )
    assert res.status_code == 409
    assert res.json()["detail"] == LEGACY_SIGNING_DEFERRED_DETAIL


def test_same_origin_enforcement(monkeypatch):
    client, _, _ = _auth_client(monkeypatch)
    bad = _field(client, "f1", "Jane", origin="https://evil.example")
    assert bad.status_code == 403


def test_response_does_not_leak_other_signer_pii(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    _add_second_signer_field(agreement_id)
    body = _packet(client).json()
    dumped = json.dumps(body)
    assert "signer2@example.test" not in dumped
    assert "Display Signer 2" not in dumped
    assert "cp_sig" not in {field["id"] for field in body["fields"]}


def test_oversized_signature_value_rejected(monkeypatch):
    client, _, _ = _auth_client(monkeypatch)
    res = _field(client, "f1", "x" * 600)
    assert res.status_code == 422


def test_packet_projection_includes_signing_readiness(monkeypatch):
    client, _, _ = _auth_client(monkeypatch)
    body = _packet(client).json()
    assert body["readiness"] == "ready_for_signing"
    assert body["signer_complete"] is False
    assert "document_id" in body


def test_completion_racing_with_required_field_mutation_cannot_complete_prematurely(monkeypatch):
    """File lock serializes mutations; completion blocks until the in-flight field write persists."""
    client, agreement_id, _ = _auth_client(monkeypatch)
    assert _complete(client).status_code == 400
    write_entered = threading.Event()
    release_write = threading.Event()
    complete_codes: list[int] = []
    original_write = _write_draft_file_unlocked

    def blocking_write(path, draft):
        write_entered.set()
        release_write.wait(timeout=5)
        return original_write(path, draft)

    with patch(
        "backend.services.agreement_draft_store._write_draft_file_unlocked",
        blocking_write,
    ):
        with ThreadPoolExecutor(max_workers=2) as pool:
            field_future = pool.submit(lambda: _field(client, "f1", "Jane Signer").status_code)
            assert write_entered.wait(timeout=5)
            complete_future = pool.submit(lambda: complete_codes.append(_complete(client).status_code))
            draft_mid = load_draft(agreement_id)
            signer_state_mid = (draft_mid.get(VS01_RECIPIENT_SIGNER_STATE_FIELD) or {}).get(
                "by_signer_record_id", {}
            )
            if signer_state_mid:
                field_values_mid = next(iter(signer_state_mid.values())).get("field_values", {})
                assert "f1" not in field_values_mid
            release_write.set()
            assert field_future.result(timeout=5) == 200
            complete_future.result(timeout=5)
    assert complete_codes == [200]
    draft = load_draft(agreement_id)
    stored = draft[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    assert next(iter(stored.values()))["field_values"]["f1"]["value"] == "Jane Signer"


def test_completion_racing_logout_when_logout_wins_completion_fails(monkeypatch):
    """If logout wins the race, completion cannot mutate signer state afterward."""
    from backend.services import recipient_session_signing_mutations as mutations_mod

    client, agreement_id, _ = _auth_client(monkeypatch)
    assert _field(client, "f1", "Jane Signer").status_code == 200
    before = load_draft(agreement_id)
    before_audit = len(before.get("audit_log") or [])

    gate_entered = threading.Event()
    release_gate = threading.Event()
    complete_codes: list[int] = []
    real_with_locked = mutations_mod._with_locked_draft_mutation

    def blocking_with_locked(*, session_secret: str, mutate_fn):
        from backend.services.vs01_recipient_bootstrap_exchange import _lookup_active_session

        if not _lookup_active_session(session_secret):
            raise mutations_mod.RecipientSessionSigningMutationError()
        gate_entered.set()
        release_gate.wait(timeout=5)
        return real_with_locked(session_secret=session_secret, mutate_fn=mutate_fn)

    with patch.object(mutations_mod, "_with_locked_draft_mutation", blocking_with_locked):
        with ThreadPoolExecutor(max_workers=2) as pool:
            complete_future = pool.submit(lambda: complete_codes.append(_complete(client).status_code))
            assert gate_entered.wait(timeout=5)
            assert client.post("/api/recipient/session/logout", headers={"Origin": _ORIGIN}).status_code == 200
            release_gate.set()
            complete_future.result(timeout=5)

    assert complete_codes == [403]
    after = load_draft(agreement_id)
    stored = after[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    signer_state = next(iter(stored.values()))
    assert not signer_state.get("completed_at")
    assert len(after.get("audit_log") or []) == before_audit
    assert not signer_role_already_completed(after.get("audit_log") or [], _stable_role_id(agreement_id, 0, after["parties"][0]["id"]))


def test_completion_racing_logout_when_completion_wins_logout_revokes_after(monkeypatch):
    """If completion wins the race, logout revokes afterward without duplicate completion."""
    from backend.services import recipient_session_signing_mutations as mutations_mod

    client, agreement_id, _ = _auth_client(monkeypatch)
    assert _field(client, "f1", "Jane Signer").status_code == 200

    gate_entered = threading.Event()
    release_gate = threading.Event()
    logout_codes: list[int] = []
    real_complete = mutations_mod._complete_signer_locked

    def blocking_complete(*args, **kwargs):
        gate_entered.set()
        release_gate.wait(timeout=5)
        return real_complete(*args, **kwargs)

    with patch.object(mutations_mod, "_complete_signer_locked", blocking_complete):
        with ThreadPoolExecutor(max_workers=2) as pool:
            complete_future = pool.submit(lambda: _complete(client).status_code)
            assert gate_entered.wait(timeout=5)
            logout_future = pool.submit(
                lambda: logout_codes.append(
                    client.post("/api/recipient/session/logout", headers={"Origin": _ORIGIN}).status_code
                )
            )
            release_gate.set()
            complete_status = complete_future.result(timeout=5)
            logout_future.result(timeout=5)

    assert complete_status == 200
    assert logout_codes == [200]
    draft = load_draft(agreement_id)
    stored = draft[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    assert next(iter(stored.values())).get("completed_at")
    assert len(completed_vs01_signer_role_ids(draft.get("audit_log") or [])) == 1
    second_complete = _complete(client)
    assert second_complete.status_code == 403
    assert _field(client, "f1", "Tampered").status_code == 403


def test_concurrent_same_field_identical_mutations_are_idempotent(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    shared_mutation_id = _mutation_id()
    barrier = threading.Barrier(2)
    bodies: list[dict] = []

    def _write() -> None:
        barrier.wait()
        bodies.append(
            _field(client, "f1", "Same Value", mutation_id=shared_mutation_id).json()
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda _: _write(), range(2)))
    assert all(body.get("ok") is True for body in bodies)
    draft = load_draft(agreement_id)
    stored = draft[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    assert next(iter(stored.values()))["field_values"]["f1"]["value"] == "Same Value"
    ledger = next(iter(stored.values())).get("mutation_ledger") or {}
    assert shared_mutation_id in ledger


def test_signer_completion_is_monotonic_under_repeat_complete(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    assert _field(client, "f1", "Jane Signer").status_code == 200
    first = _complete(client).json()
    second = _complete(client).json()
    assert first["signer_complete"] is True
    assert second["idempotent"] is True
    draft = load_draft(agreement_id)
    assert len(completed_vs01_signer_role_ids(draft.get("audit_log") or [])) == 1


def test_unactivated_legacy_signer_complete_remains_available(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-legacy-open-link")
    client = TestClient(app)
    agreement_id, draft, _, portable = _prepare_authorities(client)
    draft["vs01_signing_packet_v1"] = {"v": 1, "document_id": _DOCUMENT_ID, "portable": portable}
    save_draft(draft)
    role_id = portable["roles"][0]["roleId"]
    res = client.post(
        f"/api/agreements/{agreement_id}/vs01-signer-complete",
        json={
            "signer_role_id": role_id,
            "participant_id": draft["parties"][0]["id"],
            "document_id": _DOCUMENT_ID,
        },
    )
    assert res.status_code == 200


def test_unknown_environment_does_not_relax_legacy_sign_sessions(monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "preview")
    from backend.security.sensitive_mutation_authorization import (
        is_explicit_legacy_signing_relaxed_environment,
        raise_if_legacy_signing_sessions_disabled,
    )

    assert is_explicit_legacy_signing_relaxed_environment() is False
    with pytest.raises(Exception):
        raise_if_legacy_signing_sessions_disabled()


@pytest.mark.parametrize(
    "env,relaxed",
    [
        ("local", True),
        ("dev", True),
        ("test", True),
        (None, False),
        ("", False),
        (" ", False),
        ("Local", False),
        ("ci", False),
        ("preview", False),
        ("stage", False),
        ("staging", False),
        ("prod", False),
        ("production", False),
        ("unknown", False),
    ],
)
def test_claw_environment_classification_truth_table(monkeypatch, env, relaxed):
    if env is None:
        monkeypatch.delenv("CLAW_ENVIRONMENT", raising=False)
    else:
        monkeypatch.setenv("CLAW_ENVIRONMENT", env)
    from backend.security.claw_environment import is_relaxed_claw_environment, is_strict_claw_environment

    assert is_relaxed_claw_environment() is relaxed
    assert is_strict_claw_environment() is (not relaxed)


@pytest.mark.parametrize(
    "env,uses_host_cookie",
    [
        ("local", False),
        ("production", True),
        ("preview", True),
        (None, True),
    ],
)
def test_recipient_cookie_name_truth_table(monkeypatch, env, uses_host_cookie):
    if env is None:
        monkeypatch.delenv("CLAW_ENVIRONMENT", raising=False)
    else:
        monkeypatch.setenv("CLAW_ENVIRONMENT", env)
    from backend.security.recipient_bootstrap_session_cookie import (
        RECIPIENT_BOOTSTRAP_SESSION_COOKIE,
        RECIPIENT_BOOTSTRAP_SESSION_COOKIE_HOST,
        recipient_session_cookie_name,
    )

    expected = (
        RECIPIENT_BOOTSTRAP_SESSION_COOKIE_HOST
        if uses_host_cookie
        else RECIPIENT_BOOTSTRAP_SESSION_COOKIE
    )
    assert recipient_session_cookie_name() == expected


@pytest.mark.parametrize("value", ["line\nbreak", "carriage\rreturn", "null\x00byte", "sep\u2028break"])
def test_signature_control_characters_rejected(monkeypatch, value):
    client, _, _ = _auth_client(monkeypatch)
    res = _field(client, "f1", value)
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "field_value_invalid"


def test_legitimate_unicode_signature_accepted(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    res = _field(client, "f1", "José García")
    assert res.status_code == 200
    draft = load_draft(agreement_id)
    stored = draft[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    assert next(iter(stored.values()))["field_values"]["f1"]["value"] == "José García"


def test_client_signing_date_authority_rejected(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    assert _field(client, "f1", "Jane Signer").status_code == 200
    before = load_draft(agreement_id)
    audit_before = len(before.get("audit_log") or [])
    res = client.post(
        "/api/recipient/session/complete",
        json={"signed_date_iso": "2099-01-01", "signed_date_display": "<script>"},
        headers={"Origin": _ORIGIN},
    )
    assert res.status_code == 422
    after = load_draft(agreement_id)
    assert len(after.get("audit_log") or []) == audit_before


def test_signing_date_generated_server_side(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    assert _field(client, "f1", "Jane Signer").status_code == 200
    frozen = "2026-07-20T12:00:00Z"
    with patch(
        "backend.services.recipient_session_signing_mutations._utc_now_iso",
        return_value=frozen,
    ):
        res = _complete(client)
    assert res.status_code == 200
    draft = load_draft(agreement_id)
    stored = draft[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    signer_state = next(iter(stored.values()))
    assert signer_state["signed_date_iso"] == "2026-07-20"
    assert signer_state["signed_date_display"]


def test_revoked_session_during_mutation_lock_fails_closed(monkeypatch):
    from backend.services import recipient_session_signing_mutations as mutations_mod

    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    before = load_draft(agreement_id)
    before_state = json.dumps(before.get(VS01_RECIPIENT_SIGNER_STATE_FIELD))
    before_audit = len(before.get("audit_log") or [])

    gate_entered = threading.Event()
    release_gate = threading.Event()
    real_with_locked = mutations_mod._with_locked_draft_mutation

    def blocking_with_locked(*, session_secret: str, mutate_fn):
        from backend.services.vs01_recipient_bootstrap_exchange import _lookup_active_session

        if not _lookup_active_session(session_secret):
            raise mutations_mod.RecipientSessionSigningMutationError()
        gate_entered.set()
        release_gate.wait(timeout=5)
        return real_with_locked(session_secret=session_secret, mutate_fn=mutate_fn)

    with patch.object(mutations_mod, "_with_locked_draft_mutation", blocking_with_locked):
        with ThreadPoolExecutor(max_workers=2) as pool:
            mutation_future = pool.submit(lambda: _field(client, "f1", "Jane").status_code)
            assert gate_entered.wait(timeout=5)
            client.post("/api/recipient/session/logout", headers={"Origin": _ORIGIN})
            release_gate.set()
            status = mutation_future.result(timeout=5)

    assert status == 403
    after = load_draft(agreement_id)
    assert json.dumps(after.get(VS01_RECIPIENT_SIGNER_STATE_FIELD)) == before_state
    assert len(after.get("audit_log") or []) == before_audit


def test_same_mutation_id_identical_retry_is_idempotent(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    mid = _mutation_id()
    first = _field(client, "f1", "Jane Signer", mutation_id=mid)
    assert first.status_code == 200
    assert first.json()["idempotent"] is False
    second = _field(client, "f1", "Jane Signer", mutation_id=mid)
    assert second.status_code == 200
    assert second.json()["idempotent"] is True
    draft = load_draft(agreement_id)
    stored = draft[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    assert next(iter(stored.values()))["field_values"]["f1"]["revision"] == 1


def test_same_mutation_id_different_material_conflict(monkeypatch):
    client, _, _ = _auth_client(monkeypatch)
    mid = _mutation_id()
    assert _field(client, "f1", "First", mutation_id=mid).status_code == 200
    conflict = _field(client, "f1", "Different", expected_revision=1, mutation_id=mid)
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "mutation_id_conflict"


def test_different_mutation_id_stale_revision_conflict(monkeypatch):
    client, agreement_id, _ = _auth_client(monkeypatch)
    assert _field(client, "f1", "Current").status_code == 200
    stale = _field(client, "f1", "Stale", expected_revision=0, mutation_id=_mutation_id())
    assert stale.status_code == 409
    draft = load_draft(agreement_id)
    stored = draft[VS01_RECIPIENT_SIGNER_STATE_FIELD]["by_signer_record_id"]
    assert next(iter(stored.values()))["field_values"]["f1"]["value"] == "Current"


@pytest.mark.parametrize(
    "extra",
    [
        {"signed_at": "2026-01-01T00:00:00Z"},
        {"signedAt": "2026-01-01T00:00:00Z"},
        {"completed_at": "2026-01-01T00:00:00Z"},
        {"completedAt": "2026-01-01T00:00:00Z"},
        {"signer_role_id": "forged"},
        {"party_id": "forged"},
        {"accepted_version_id": "forged"},
        {"packet_revision": "forged"},
        {"corpus_sha256": "forged"},
        {"unexpected_key": "value"},
    ],
)
def test_field_mutation_rejects_unexpected_authority_fields(monkeypatch, extra):
    client, _, _ = _auth_client(monkeypatch)
    payload = {
        "field_id": "f1",
        "value": "Jane Signer",
        "expected_revision": 0,
        "mutation_id": _mutation_id(),
        **extra,
    }
    res = client.post("/api/recipient/session/fields", json=payload, headers={"Origin": _ORIGIN})
    assert res.status_code == 422


@pytest.mark.parametrize("mutation_id", ["", " ", "x" * 200, "bad\nid", "bad\x00id"])
def test_mutation_id_validation_rejects_invalid_values(monkeypatch, mutation_id):
    client, _, _ = _auth_client(monkeypatch)
    res = client.post(
        "/api/recipient/session/fields",
        json={
            "field_id": "f1",
            "value": "Jane",
            "expected_revision": 0,
            "mutation_id": mutation_id,
        },
        headers={"Origin": _ORIGIN},
    )
    assert res.status_code in (400, 422)
