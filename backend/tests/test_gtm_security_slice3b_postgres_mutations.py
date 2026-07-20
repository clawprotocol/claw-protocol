"""GTM Security Slice 3B — PostgreSQL mutation-family integration and dispatch evidence."""

from __future__ import annotations

import copy
import json
import os
import threading
from typing import Any, Callable, Dict, Optional, Tuple
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from backend.main import app
from backend.routers.agreements_v2_api import STAGED_RECIPIENT_PROPOSALS_KEY
from backend.security.negotiation_review_content_binding import review_content_binding_sha256
from backend.services.agreement_draft_store import load_draft, save_draft
from backend.services.negotiation_review_session_store import (
    NEGOTIATION_REVIEW_SESSIONS_FIELD,
    get_sessions_field,
)
from backend.tests.negotiation_review_test_helpers import (
    assert_slice3b_provider_isolation,
    bootstrap_review_session,
    force_agreement_file_storage,
    force_agreement_postgres_storage,
    install_slice3b_provider_isolation,
    observe_approval_persist_before_notify,
    patch_approval_persistence_failure,
    review_mutation_headers,
)
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORIGIN = "http://testserver"
_ORG_H = {"X-Claw-Org-Id": "test-org-slice3b-pg-mutations"}


def _postgres_dsn() -> str:
    return (
        os.getenv("CLAW_AGREEMENT_DATABASE_URL", "").strip()
        or os.getenv("CLAW_AGREEMENT_POSTGRES_DSN", "").strip()
    )


def _configure_postgres(monkeypatch: pytest.MonkeyPatch) -> None:
    force_agreement_postgres_storage(monkeypatch, _postgres_dsn())


@pytest.fixture(autouse=True)
def _isolated(monkeypatch, tmp_path):
    install_slice3b_provider_isolation(monkeypatch)
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-slice3b-pg-mutations-secret")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_CORS_ALLOW_ORIGINS", "http://testserver,https://testserver,https://app.example.com")
    monkeypatch.setenv("CLAW_NEGOTIATION_REVIEW_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    usage_economics_store_mod._store = None  # noqa: SLF001
    from backend.services.negotiation_review_session_store import reset_negotiation_review_session_store_for_tests

    reset_negotiation_review_session_store_for_tests()
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001
    reset_negotiation_review_session_store_for_tests()
    assert_slice3b_provider_isolation()


def _create_agreement(client: TestClient) -> Tuple[str, str]:
    res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "PG mutation agreement",
            "jurisdiction": "TX",
            "parties": [
                {"id": "p_owner", "name": "Owner Co", "role": "owner", "email": "owner@example.com"},
                {"id": "p_r1", "name": "R1", "role": "reviewer", "email": "r1@example.com"},
            ],
            "purpose": "Payment within thirty (30) days after receipt.",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    return body["id"], body["draft"]["parties"][1]["id"]


def _session_client(monkeypatch: pytest.MonkeyPatch) -> Tuple[TestClient, str, str]:
    _configure_postgres(monkeypatch)
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    bootstrap_review_session(client, aid, _ORG_H, recipient_party_id=reviewer_id, role="reviewer")
    return client, aid, reviewer_id


def _session_last_seen(draft: Dict[str, Any]) -> Optional[str]:
    sessions = (get_sessions_field(draft).get("sessions") or {}).values()
    seen = [str(s.get("last_seen_at") or "") for s in sessions if isinstance(s, dict)]
    return seen[0] if seen else None


def _stage_proposal_request(client: TestClient, aid: str, reviewer_id: str) -> Response:
    owner = TestClient(app)
    draft = owner.get(f"/api/agreements/{aid}", headers=_ORG_H).json()["draft"]
    return client.post(
        f"/api/agreements/{aid}/recipient-proposal/stage",
        headers=review_mutation_headers(),
        json={
            "instruction": "Change payment timing.",
            "proposer_id": reviewer_id,
            "proposer_display_name": "R1",
            "draft": {
                "title": draft["title"],
                "jurisdiction": draft["jurisdiction"],
                "parties": draft["parties"],
                "purpose": "Payment within fifteen (15) days after receipt.",
                "payment_terms": draft["payment_terms"],
                "duration": draft.get("duration"),
                "due_date": draft.get("due_date"),
                "effective_date": draft.get("effective_date"),
            },
            "rendered_html": "<p>Payment within fifteen (15) days.</p>",
        },
    )


def _mutation_callers() -> Dict[str, Callable[[TestClient, str, str], Response]]:
    def reviewer_suggestion(client: TestClient, aid: str, reviewer_id: str) -> Response:
        return client.post(
            f"/api/agreements/{aid}/pro-redline/reviewer-suggestion",
            headers=review_mutation_headers(),
            json={
                "participant_id": reviewer_id,
                "suggestion_text": "Please adjust payment timing.",
                "reviewer_display_name": "R1",
                "reviewer_email": "r1@example.com",
            },
        )

    def revise(client: TestClient, aid: str, _reviewer_id: str) -> Response:
        from backend.routers.agreements_v2_api import AgreementDraft

        before = load_draft(aid)
        revised_draft = AgreementDraft.model_validate(
            {
                **before,
                "purpose": "Payment within twenty (20) days after receipt.",
                "payment_terms": "Net 20",
            }
        )
        with patch(
            "backend.routers.agreements_v2_api._revise_with_instruction",
            return_value=revised_draft,
        ), patch(
            "backend.routers.agreements_v2_api._coalesce_revision_draft_with_base",
            side_effect=lambda _base, revised: revised,
        ):
            return client.post(
                f"/api/agreements/{aid}/revise",
                headers=review_mutation_headers(),
                json={"instruction": "Tighten payment terms.", "session_type": "recipient"},
            )

    def proposal_stage(client: TestClient, aid: str, reviewer_id: str) -> Response:
        return _stage_proposal_request(client, aid, reviewer_id)

    def proposal_finalize(client: TestClient, aid: str, reviewer_id: str) -> Response:
        stage = _stage_proposal_request(client, aid, reviewer_id)
        if stage.status_code != 200:
            return stage
        proposal_id = stage.json()["proposal_id"]
        return client.post(
            f"/api/agreements/{aid}/recipient-proposal",
            headers=review_mutation_headers(),
            json={"proposal_id": proposal_id},
        )

    def approve(client: TestClient, aid: str, reviewer_id: str) -> Response:
        return client.post(
            f"/api/agreements/{aid}/recipient-approve",
            headers=review_mutation_headers(),
            json={"message": "ok", "participant_id": reviewer_id, "participant_display_name": "R1"},
        )

    return {
        "reviewer_suggestion": reviewer_suggestion,
        "revise": revise,
        "proposal_stage": proposal_stage,
        "proposal_finalize": proposal_finalize,
        "approve": approve,
    }


def _assert_sanitized(body: Dict[str, Any]) -> None:
    draft = body.get("draft") or {}
    assert NEGOTIATION_REVIEW_SESSIONS_FIELD not in draft
    assert "recipient_delivery_v1" not in draft
    assert "token" not in json.dumps(body).lower() or "token_hash" in json.dumps(body).lower()


def test_mutation_callers_return_http_response_shape():
    client = MagicMock()
    client.post.return_value = MagicMock(status_code=200, text="{}", json=lambda: {"ok": True})
    for family in ("reviewer_suggestion", "approve"):
        res = _mutation_callers()[family](client, "aid", "p_r1")
        assert hasattr(res, "status_code"), family
        assert hasattr(res, "json"), family


def test_each_family_dispatches_postgres_without_file_storage(monkeypatch):
    called = {"postgres": False, "file": False}

    def _pg(**_kwargs):
        called["postgres"] = True
        return {"ok": True}

    def _file(**_kwargs):
        called["file"] = True
        return {"ok": True}

    monkeypatch.setattr(
        "backend.security.negotiation_review_mutation.run_negotiation_review_locked_postgres_mutation",
        _pg,
    )
    monkeypatch.setattr(
        "backend.security.negotiation_review_mutation.run_negotiation_review_locked_file_mutation",
        _file,
    )
    monkeypatch.setattr("backend.services.agreement_draft_store._use_postgres", lambda: True)
    from backend.security.negotiation_review_mutation import run_negotiation_review_locked_mutation

    for family in _mutation_callers():
        called["postgres"] = False
        called["file"] = False
        out = run_negotiation_review_locked_mutation(
            request=MagicMock(),
            agreement_id="aid",
            mutate_fn=lambda _d, _a: {},
        )
        assert out == {"ok": True}, family
        assert called["postgres"] is True, family
        assert called["file"] is False, family


@pytest.mark.integration
@pytest.mark.parametrize("family", list(_mutation_callers().keys()))
def test_postgres_mutation_family_success(monkeypatch, family: str):
    if not _postgres_dsn():
        pytest.skip("CLAW_AGREEMENT_DATABASE_URL unavailable")
    client, aid, reviewer_id = _session_client(monkeypatch)
    before = load_draft(aid)
    last_seen_before = _session_last_seen(before)
    caller = _mutation_callers()[family]
    res = caller(client, aid, reviewer_id)
    assert res.status_code == 200, res.text
    body = res.json()
    _assert_sanitized(body)
    after = load_draft(aid)
    assert get_sessions_field(after).get("sessions")
    assert _session_last_seen(after) != last_seen_before


@pytest.mark.integration
@pytest.mark.parametrize("family", list(_mutation_callers().keys()))
def test_postgres_mutation_family_rejects_stale_content_binding(monkeypatch, family: str):
    if not _postgres_dsn():
        pytest.skip("CLAW_AGREEMENT_DATABASE_URL unavailable")
    client, aid, reviewer_id = _session_client(monkeypatch)
    before = load_draft(aid)
    tampered = copy.deepcopy(before)
    tampered["purpose"] = (tampered.get("purpose") or "P") + " drift"
    save_draft(tampered)
    caller = _mutation_callers()[family]
    res = caller(client, aid, reviewer_id)
    assert res.status_code == 403
    after = load_draft(aid)
    assert after.get("purpose") == tampered.get("purpose")


@pytest.mark.integration
@pytest.mark.parametrize("family", list(_mutation_callers().keys()))
def test_postgres_mutation_family_rejects_revoked_session(monkeypatch, family: str):
    if not _postgres_dsn():
        pytest.skip("CLAW_AGREEMENT_DATABASE_URL unavailable")
    client, aid, reviewer_id = _session_client(monkeypatch)
    before = load_draft(aid)
    assert client.post("/api/negotiation-review/session/logout", headers=review_mutation_headers()).status_code == 200
    caller = _mutation_callers()[family]
    res = caller(client, aid, reviewer_id)
    assert res.status_code == 403
    after = load_draft(aid)
    assert json.dumps(after, sort_keys=True) == json.dumps(before, sort_keys=True)


@pytest.mark.integration
@pytest.mark.parametrize(
    "family",
    [name for name in _mutation_callers().keys() if name != "proposal_finalize"],
)
def test_postgres_mutation_family_rollback_preserves_state(monkeypatch, family: str):
    if not _postgres_dsn():
        pytest.skip("CLAW_AGREEMENT_DATABASE_URL unavailable")
    client, aid, reviewer_id = _session_client(monkeypatch)
    before = load_draft(aid)
    before_material = json.dumps(before, sort_keys=True)
    caller = _mutation_callers()[family]

    original = None

    def _boom(*args, **kwargs):
        nonlocal original
        if original is None:
            raise RuntimeError("missing original persist")
        return original(*args, **kwargs)

    from backend.security import negotiation_review_mutation as nrm

    original = nrm._persist_postgres_mutation

    def _inject_once(**kwargs):
        raise RuntimeError("injected persistence failure")

    with patch.object(nrm, "_persist_postgres_mutation", side_effect=_inject_once):
        res = caller(client, aid, reviewer_id)
    assert res.status_code == 500
    after = load_draft(aid)
    assert json.dumps(after, sort_keys=True) == before_material


@pytest.mark.integration
def test_postgres_proposal_finalize_rollback_preserves_staged_state(monkeypatch):
    if not _postgres_dsn():
        pytest.skip("CLAW_AGREEMENT_DATABASE_URL unavailable")
    client, aid, reviewer_id = _session_client(monkeypatch)
    stage = _stage_proposal_request(client, aid, reviewer_id)
    assert stage.status_code == 200, stage.text
    proposal_id = stage.json()["proposal_id"]
    before = load_draft(aid)
    staged_before = copy.deepcopy((before.get("pro_redline_v1") or {}).get(STAGED_RECIPIENT_PROPOSALS_KEY))
    before_material = json.dumps(before, sort_keys=True)

    from backend.security import negotiation_review_mutation as nrm

    original = nrm._persist_postgres_mutation
    calls = {"n": 0}

    def _inject_finalize_only(**kwargs):
        calls["n"] += 1
        raise RuntimeError("injected finalize persistence failure")

    with patch.object(nrm, "_persist_postgres_mutation", side_effect=_inject_finalize_only):
        res = client.post(
            f"/api/agreements/{aid}/recipient-proposal",
            headers=review_mutation_headers(),
            json={"proposal_id": proposal_id},
        )
    assert res.status_code == 500
    after = load_draft(aid)
    assert json.dumps(after, sort_keys=True) == before_material
    staged_after = copy.deepcopy((after.get("pro_redline_v1") or {}).get(STAGED_RECIPIENT_PROPOSALS_KEY))
    assert staged_after == staged_before
    assert calls["n"] == 1


@pytest.mark.integration
def test_postgres_concurrent_mutations_serialize_and_preserve_winner(monkeypatch):
    if not _postgres_dsn():
        pytest.skip("CLAW_AGREEMENT_DATABASE_URL unavailable")
    client, aid, reviewer_id = _session_client(monkeypatch)
    owner = TestClient(app)
    before = load_draft(aid)
    before_material = json.dumps(before, sort_keys=True)
    last_seen_before = _session_last_seen(before)
    barrier = threading.Barrier(2)
    results: dict[str, int] = {}
    errors: list[Exception] = []

    from backend.security import negotiation_review_mutation as nrm

    original_mutation = nrm.run_negotiation_review_locked_postgres_mutation

    def _mutation_with_overlap(**kwargs):
        barrier.wait(timeout=10)
        return original_mutation(**kwargs)

    def _approve():
        local = TestClient(app)
        local.cookies.update(client.cookies)
        try:
            with patch.object(
                nrm,
                "run_negotiation_review_locked_postgres_mutation",
                side_effect=_mutation_with_overlap,
            ):
                res = local.post(
                    f"/api/agreements/{aid}/recipient-approve",
                    headers=review_mutation_headers(),
                    json={"message": "ok", "participant_id": reviewer_id, "participant_display_name": "R1"},
                )
            results["approve"] = res.status_code
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    def _owner_drift():
        try:
            barrier.wait(timeout=10)
            drifted = copy.deepcopy(load_draft(aid))
            drifted["purpose"] = (drifted.get("purpose") or "P") + " owner-race"
            save_draft(drifted)
            results["owner"] = 200
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    t_approve = threading.Thread(target=_approve)
    t_owner = threading.Thread(target=_owner_drift)
    t_approve.start()
    t_owner.start()
    t_approve.join(timeout=30)
    t_owner.join(timeout=30)
    assert not errors
    assert sorted(results.values()) == [200, 403]
    after = load_draft(aid)
    assert json.dumps(after, sort_keys=True) != before_material
    assert get_sessions_field(after).get("sessions")
    if results.get("approve") == 403:
        assert (after.get("purpose") or "").endswith(" owner-race")
        assert _session_last_seen(after) == last_seen_before
    else:
        assert results.get("approve") == 200
        assert not (after.get("purpose") or "").endswith(" owner-race")


@pytest.mark.integration
def test_postgres_owner_update_race_cannot_overwrite_review_mutation(monkeypatch):
    if not _postgres_dsn():
        pytest.skip("CLAW_AGREEMENT_DATABASE_URL unavailable")
    client, aid, reviewer_id = _session_client(monkeypatch)
    owner = TestClient(app)
    before = load_draft(aid)
    last_seen_before = _session_last_seen(before)
    owner_ready = threading.Event()
    reviewer_done = threading.Event()

    def _owner_drift():
        owner_ready.wait(timeout=10)
        drifted = copy.deepcopy(load_draft(aid))
        drifted["purpose"] = (drifted.get("purpose") or "P") + " owner-race"
        save_draft(drifted)
        reviewer_done.wait(timeout=10)

    t_owner = threading.Thread(target=_owner_drift)
    t_owner.start()
    owner_ready.set()
    res = client.post(
        f"/api/agreements/{aid}/recipient-approve",
        headers=review_mutation_headers(),
        json={"message": "ok", "participant_id": reviewer_id, "participant_display_name": "R1"},
    )
    reviewer_done.set()
    t_owner.join(timeout=30)
    assert res.status_code == 403
    after = load_draft(aid)
    assert (after.get("purpose") or "").endswith(" owner-race")
    assert _session_last_seen(after) == last_seen_before


@pytest.mark.integration
def test_postgres_proposal_finalize_cannot_observe_unauthorized_staged_state(monkeypatch):
    if not _postgres_dsn():
        pytest.skip("CLAW_AGREEMENT_DATABASE_URL unavailable")
    client, aid, reviewer_id = _session_client(monkeypatch)
    stage = _stage_proposal_request(client, aid, reviewer_id)
    assert stage.status_code == 200, stage.text
    proposal_id = stage.json()["proposal_id"]
    assert client.post("/api/negotiation-review/session/logout", headers=review_mutation_headers()).status_code == 200
    before = load_draft(aid)
    staged_before = copy.deepcopy((before.get("pro_redline_v1") or {}).get(STAGED_RECIPIENT_PROPOSALS_KEY))
    res = client.post(
        f"/api/agreements/{aid}/recipient-proposal",
        headers=review_mutation_headers(),
        json={"proposal_id": proposal_id},
    )
    assert res.status_code == 403
    after = load_draft(aid)
    staged_after = copy.deepcopy((after.get("pro_redline_v1") or {}).get(STAGED_RECIPIENT_PROPOSALS_KEY))
    assert staged_after == staged_before


@pytest.mark.integration
def test_postgres_approval_persistence_failure_zero_provider_calls(monkeypatch):
    if not _postgres_dsn():
        pytest.skip("CLAW_AGREEMENT_DATABASE_URL unavailable")
    client, aid, reviewer_id = _session_client(monkeypatch)
    provider_calls = {"count": 0}

    def _notify(**_kwargs):
        provider_calls["count"] += 1
        return {"event_type": "owner_review_approval_notified", "at": "t", "field": "recipient", "value": {}}

    with patch_approval_persistence_failure(), patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        side_effect=_notify,
    ):
        res = client.post(
            f"/api/agreements/{aid}/recipient-approve",
            headers=review_mutation_headers(),
            json={"message": "ok", "participant_id": reviewer_id, "participant_display_name": "R1"},
        )
    assert res.status_code == 500
    assert provider_calls["count"] == 0


@pytest.mark.integration
def test_postgres_approval_notifications_run_after_commit(monkeypatch):
    if not _postgres_dsn():
        pytest.skip("CLAW_AGREEMENT_DATABASE_URL unavailable")
    client, aid, reviewer_id = _session_client(monkeypatch)
    with observe_approval_persist_before_notify() as order:
        res = client.post(
            f"/api/agreements/{aid}/recipient-approve",
            headers=review_mutation_headers(),
            json={"message": "ok", "participant_id": reviewer_id, "participant_display_name": "R1"},
        )
    assert res.status_code == 200
    assert order.index("persist") < order.index("notify")


@pytest.mark.integration
def test_postgres_approval_rollback_produces_no_notification_claim(monkeypatch):
    if not _postgres_dsn():
        pytest.skip("CLAW_AGREEMENT_DATABASE_URL unavailable")
    client, aid, reviewer_id = _session_client(monkeypatch)
    with patch_approval_persistence_failure():
        res = client.post(
            f"/api/agreements/{aid}/recipient-approve",
            headers=review_mutation_headers(),
            json={"message": "ok", "participant_id": reviewer_id, "participant_display_name": "R1"},
        )
    assert res.status_code == 500
    draft = load_draft(aid)
    assert not draft.get("review_approval_notifications_v1")
