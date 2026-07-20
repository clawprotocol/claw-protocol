"""GTM Security Slice 3B — resend ordering, signing-lock race, approval notifications."""

from __future__ import annotations

import copy
import json
import threading
from typing import Any, Dict, Tuple
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.negotiation_review_content_binding import review_content_binding_sha256
from backend.security.negotiation_review_version_binding import PRE_LOCK_VERSION_BINDING
from backend.services.agreement_draft_store import (
    load_draft,
    save_draft,
    save_draft_establish_review_bootstrap_delivery,
)
from backend.services.recipient_delivery_registry import delivery_registry_material, get_registry, record_invite_sent
from backend.tests.negotiation_review_test_helpers import (
    DEFAULT_EXCHANGE_ORIGIN,
    assert_conflicting_establishment_race_outcomes,
    assert_slice3b_provider_isolation,
    bootstrap_review_session,
    force_agreement_file_storage,
    install_slice3b_provider_isolation,
    mint_owner_review_copy_link,
    observe_approval_persist_before_notify,
    patch_approval_persistence_failure,
    review_mutation_headers,
    run_conflicting_establishment_persistence_race,
    synchronize_establishment_persist_barrier,
    update_delivery_registry_row,
)
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-slice3b-resend-release"}


def _resend_headers() -> Dict[str, str]:
    return {**_ORG_H, **review_mutation_headers()}


@pytest.fixture(autouse=True)
def _isolated(monkeypatch, tmp_path):
    install_slice3b_provider_isolation(monkeypatch)
    force_agreement_file_storage(monkeypatch)
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-slice3b-resend-release-secret")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_CORS_ALLOW_ORIGINS", "http://testserver,https://testserver,https://app.example.com")
    monkeypatch.setenv("CLAW_NEGOTIATION_REVIEW_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001
    assert_slice3b_provider_isolation()


def _create_agreement(client: TestClient, *, with_bootstrap: bool = True) -> Tuple[str, str]:
    res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Resend release agreement",
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
    aid = body["id"]
    reviewer_id = body["draft"]["parties"][1]["id"]
    sent = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})
    assert sent.status_code == 200, sent.text
    if with_bootstrap:
        mint_owner_review_copy_link(client, aid, _ORG_H, recipient_party_id=reviewer_id)
    return aid, reviewer_id


def _registry_material(draft: Dict[str, Any]) -> bytes:
    return delivery_registry_material(get_registry(draft))


def _prepare_resend_establishment(aid: str, reviewer_id: str, *, jti_suffix: str) -> Dict[str, Any]:
    draft = load_draft(aid)
    content_sha256 = review_content_binding_sha256(draft)
    incoming = copy.deepcopy(draft)
    record_invite_sent(
        incoming,
        phase="review",
        participant_id=reviewer_id,
        jti=f"jti-resend-{jti_suffix}",
        email="r1@example.com",
        bootstrap_authority=True,
        locked_version_id=PRE_LOCK_VERSION_BINDING,
        content_sha256=content_sha256,
        role="reviewer",
    )
    incoming["id"] = aid
    return incoming


def test_resend_persistence_failure_zero_provider_calls():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    provider_calls = {"count": 0}

    def _boom(_draft):
        raise ValueError("delivery_establishment_active_invitation_conflict")

    def _provider(**_kwargs):
        provider_calls["count"] += 1
        return True

    with patch(
        "backend.services.agreement_draft_store.save_draft_establish_review_bootstrap_delivery",
        side_effect=_boom,
    ), patch(
        "backend.services.email.review_delivery.send_review_invite_with_prepared_token",
        side_effect=_provider,
    ):
        res = client.post(
            f"/api/agreements/{aid}/recipient-invite-resend",
            headers=_resend_headers(),
            json={"phase": "review", "participant_id": reviewer_id},
        )
    assert res.status_code == 409
    assert provider_calls["count"] == 0


def test_resend_racing_exchange_rejected():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    update_delivery_registry_row(
        aid,
        reviewer_id,
        bootstrap_exchanged_at="2026-01-01T00:00:00Z",
    )
    before = _registry_material(load_draft(aid))
    res = client.post(
        f"/api/agreements/{aid}/recipient-invite-resend",
        headers=_resend_headers(),
        json={"phase": "review", "participant_id": reviewer_id},
    )
    assert res.status_code == 409
    assert _registry_material(load_draft(aid)) == before


def _mint_establishment_candidate(
    aid: str,
    reviewer_id: str,
    *,
    jti_suffix: str,
) -> Dict[str, Any]:
    draft = load_draft(aid)
    content_sha256 = review_content_binding_sha256(draft)
    incoming = copy.deepcopy(draft)
    reg = get_registry(incoming)
    row = reg["recipients"].setdefault(
        f"review:{reviewer_id}",
        {
            "phase": "review",
            "participant_id": reviewer_id,
            "active_jti": None,
            "superseded_jtis": [],
            "last_sent_at": None,
            "last_opened_at": None,
            "resent_count": 0,
            "active_signing_email": None,
        },
    )
    row["active_jti"] = f"jti-resend-{jti_suffix}"
    row["bootstrap_authority"] = True
    row["bootstrap_locked_version_id"] = PRE_LOCK_VERSION_BINDING
    row["bootstrap_content_sha256"] = content_sha256
    row["bootstrap_role"] = "reviewer"
    row["last_sent_at"] = "2026-07-19T00:00:00Z"
    incoming["recipient_delivery_v1"] = reg
    incoming["id"] = aid
    return incoming


def test_resend_racing_ordinary_establishment_loser_cannot_overwrite_winner():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    first = _prepare_resend_establishment(aid, reviewer_id, jti_suffix="winner")
    save_draft_establish_review_bootstrap_delivery(first)
    winner_material = _registry_material(load_draft(aid))
    stale = _mint_establishment_candidate(aid, reviewer_id, jti_suffix="loser")
    with pytest.raises(ValueError, match="delivery_establishment_active_invitation_conflict"):
        save_draft_establish_review_bootstrap_delivery(stale)
    assert _registry_material(load_draft(aid)) == winner_material


def test_resend_stale_binding_rejected():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    stale = _prepare_resend_establishment(aid, reviewer_id, jti_suffix="stale")
    stale["recipient_delivery_v1"]["recipients"][f"review:{reviewer_id}"]["bootstrap_content_sha256"] = "deadbeef"
    before = _registry_material(load_draft(aid))
    with pytest.raises(ValueError, match="delivery_establishment_stale_content_binding"):
        save_draft_establish_review_bootstrap_delivery(stale)
    assert _registry_material(load_draft(aid)) == before


def test_concurrent_resends_serialize_with_single_winner():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    before_material = _registry_material(load_draft(aid))
    provider_calls = {"count": 0}
    statuses: list[int] = []

    def _provider(**_kwargs: Any) -> bool:
        provider_calls["count"] += 1
        return True

    def _resend() -> None:
        local = TestClient(app)
        res = local.post(
            f"/api/agreements/{aid}/recipient-invite-resend",
            headers=_resend_headers(),
            json={"phase": "review", "participant_id": reviewer_id},
        )
        statuses.append(res.status_code)

    with patch(
        "backend.services.recipient_invite_resend.send_review_invite_with_prepared_token",
        side_effect=_provider,
    ), synchronize_establishment_persist_barrier():
        t1 = threading.Thread(target=_resend)
        t2 = threading.Thread(target=_resend)
        t1.start()
        t2.start()
        t1.join(timeout=30)
        t2.join(timeout=30)

    assert sorted(statuses) == [200, 409]
    assert provider_calls["count"] == 1
    after_material = _registry_material(load_draft(aid))
    assert after_material != before_material


@pytest.mark.parametrize("rep", range(20))
def test_concurrent_resends_serialize_with_single_winner_repeated(rep: int):
    test_concurrent_resends_serialize_with_single_winner()


def test_conflicting_establishment_persistence_race_file_mode():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client, with_bootstrap=False)
    before_material = _registry_material(load_draft(aid))
    result = run_conflicting_establishment_persistence_race(
        aid,
        reviewer_id,
        mint_incoming_a=lambda a, r: _mint_establishment_candidate(a, r, jti_suffix="winner"),
        mint_incoming_b=lambda a, r: _mint_establishment_candidate(a, r, jti_suffix="loser"),
    )
    assert_conflicting_establishment_race_outcomes(result)
    assert result.stored_material != before_material


@pytest.mark.parametrize("rep", range(20))
def test_conflicting_establishment_persistence_race_file_mode_repeated(rep: int):
    test_conflicting_establishment_persistence_race_file_mode()


def test_consumed_session_bound_invitation_cannot_be_replaced():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    update_delivery_registry_row(aid, reviewer_id, recipient_session_id="sess-bound")
    before = _registry_material(load_draft(aid))
    res = client.post(
        f"/api/agreements/{aid}/recipient-invite-resend",
        headers=_resend_headers(),
        json={"phase": "review", "participant_id": reviewer_id},
    )
    assert res.status_code == 409
    assert _registry_material(load_draft(aid)) == before


def test_provider_failure_after_establishment_preserves_retry_state():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    row_key = f"review:{reviewer_id}"
    before_jti = get_registry(load_draft(aid))["recipients"][row_key]["active_jti"]
    assert before_jti
    with patch(
        "backend.services.recipient_invite_resend.send_review_invite_with_prepared_token",
        return_value=False,
    ):
        res = client.post(
            f"/api/agreements/{aid}/recipient-invite-resend",
            headers=_resend_headers(),
            json={"phase": "review", "participant_id": reviewer_id},
        )
    assert res.status_code == 200
    assert res.json()["sent_invite"] is False
    after_row = get_registry(load_draft(aid))["recipients"][f"review:{reviewer_id}"]
    assert after_row["active_jti"] != before_jti
    assert after_row.get("bootstrap_authority") is True


def test_signing_lock_race_rejects_stale_establishment_without_mutation():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    incoming = _prepare_resend_establishment(aid, reviewer_id, jti_suffix="race")
    before = _registry_material(load_draft(aid))
    provider_calls = {"count": 0}

    original = save_draft_establish_review_bootstrap_delivery

    def _race_guard(draft):
        drifted = copy.deepcopy(load_draft(aid))
        drifted["purpose"] = (drifted.get("purpose") or "P") + " drift"
        save_draft(drifted)
        return original(draft)

    with patch(
        "backend.services.agreement_draft_store.save_draft_establish_review_bootstrap_delivery",
        side_effect=_race_guard,
    ), patch(
        "backend.services.email.review_delivery.send_review_invite_with_prepared_token",
        side_effect=lambda **_k: provider_calls.__setitem__("count", provider_calls["count"] + 1) or True,
    ):
        res = client.post(
            f"/api/agreements/{aid}/recipient-invite-resend",
            headers=_resend_headers(),
            json={"phase": "review", "participant_id": reviewer_id},
        )
    assert res.status_code == 409
    assert provider_calls["count"] == 0
    assert _registry_material(load_draft(aid)) == before


def test_approval_persistence_failure_zero_provider_calls():
    client = TestClient(app, raise_server_exceptions=False)
    aid, reviewer_id = _create_agreement(client)
    bootstrap_review_session(client, aid, _ORG_H, recipient_party_id=reviewer_id, role="reviewer")
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


def test_approval_notifications_run_after_commit():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    bootstrap_review_session(client, aid, _ORG_H, recipient_party_id=reviewer_id, role="reviewer")
    with observe_approval_persist_before_notify() as order:
        res = client.post(
            f"/api/agreements/{aid}/recipient-approve",
            headers=review_mutation_headers(),
            json={"message": "ok", "participant_id": reviewer_id, "participant_display_name": "R1"},
        )
    assert res.status_code == 200
    assert order.index("persist") < order.index("notify")


def test_approval_provider_failure_does_not_undo_committed_state():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    bootstrap_review_session(client, aid, _ORG_H, recipient_party_id=reviewer_id, role="reviewer")
    with patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        side_effect=RuntimeError("provider failed"),
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_counterparties_all_reviews_complete",
        return_value=None,
    ):
        res = client.post(
            f"/api/agreements/{aid}/recipient-approve",
            headers=review_mutation_headers(),
            json={"message": "ok", "participant_id": reviewer_id, "participant_display_name": "R1"},
        )
    assert res.status_code == 200
    audit = load_draft(aid).get("audit_log") or []
    assert any(e.get("event_type") == "recipient_approved" for e in audit if isinstance(e, dict))


def test_concurrent_approvals_single_provider_call():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    bootstrap_review_session(client, aid, _ORG_H, recipient_party_id=reviewer_id, role="reviewer")
    provider_calls = {"count": 0}
    barrier = threading.Barrier(2)
    statuses: list[int] = []

    def _counterparty(**_kwargs):
        provider_calls["count"] += 1
        return {
            "event_type": "counterparty_reviews_complete_notified",
            "at": "t",
            "field": "counterparty_notification",
            "value": {},
        }

    def _approve():
        local = TestClient(app)
        local.cookies.update(client.cookies)
        barrier.wait(timeout=10)
        res = local.post(
            f"/api/agreements/{aid}/recipient-approve",
            headers=review_mutation_headers(),
            json={"message": "ok", "participant_id": reviewer_id, "participant_display_name": "R1"},
        )
        statuses.append(res.status_code)

    with patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        return_value=None,
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_counterparties_all_reviews_complete",
        side_effect=_counterparty,
    ):
        t1 = threading.Thread(target=_approve)
        t2 = threading.Thread(target=_approve)
        t1.start()
        t2.start()
        t1.join(timeout=30)
        t2.join(timeout=30)
    assert len(statuses) == 2
    assert all(code == 200 for code in statuses)
    assert provider_calls["count"] <= 1


def test_sequential_duplicate_approval_single_provider_call():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    bootstrap_review_session(client, aid, _ORG_H, recipient_party_id=reviewer_id, role="reviewer")
    provider_calls = {"count": 0}

    def _counterparty(**_kwargs):
        provider_calls["count"] += 1
        return {
            "event_type": "counterparty_reviews_complete_notified",
            "at": "t",
            "field": "counterparty_notification",
            "value": {},
        }

    with patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        return_value=None,
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_counterparties_all_reviews_complete",
        side_effect=_counterparty,
    ):
        first = client.post(
            f"/api/agreements/{aid}/recipient-approve",
            headers=review_mutation_headers(),
            json={"message": "ok", "participant_id": reviewer_id, "participant_display_name": "R1"},
        )
        second = client.post(
            f"/api/agreements/{aid}/recipient-approve",
            headers=review_mutation_headers(),
            json={"message": "ok", "participant_id": reviewer_id, "participant_display_name": "R1"},
        )
    assert first.status_code == 200
    assert second.status_code == 200
    assert provider_calls["count"] == 1


def test_approval_rollback_produces_no_notification_claim():
    client = TestClient(app, raise_server_exceptions=False)
    aid, reviewer_id = _create_agreement(client)
    bootstrap_review_session(client, aid, _ORG_H, recipient_party_id=reviewer_id, role="reviewer")
    with patch_approval_persistence_failure():
        res = client.post(
            f"/api/agreements/{aid}/recipient-approve",
            headers=review_mutation_headers(),
            json={"message": "ok", "participant_id": reviewer_id, "participant_display_name": "R1"},
        )
    assert res.status_code == 500
    draft = load_draft(aid)
    assert not draft.get("review_approval_notifications_v1")


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Content-Type": "application/json"},
        {"Origin": "null", "Content-Type": "application/json"},
        {"Origin": "https://evil.example", "Content-Type": "application/json"},
        {"Origin": "http://testserver:9999", "Content-Type": "application/json"},
    ],
)
def test_review_resend_rejects_untrusted_origin_before_side_effects(headers):
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    before = _registry_material(load_draft(aid))
    provider_calls = {"count": 0}
    with patch(
        "backend.services.recipient_invite_resend.send_review_invite_with_prepared_token",
        side_effect=lambda **_k: provider_calls.__setitem__("count", provider_calls["count"] + 1),
    ):
        res = client.post(
            f"/api/agreements/{aid}/recipient-invite-resend",
            headers={**_ORG_H, **headers},
            json={"phase": "review", "participant_id": reviewer_id},
        )
    assert res.status_code == 403
    assert provider_calls["count"] == 0
    assert _registry_material(load_draft(aid)) == before


def test_review_resend_allows_trusted_origin():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    with patch(
        "backend.services.recipient_invite_resend.send_review_invite_with_prepared_token",
        return_value=True,
    ):
        res = client.post(
            f"/api/agreements/{aid}/recipient-invite-resend",
            headers={**_ORG_H, **review_mutation_headers()},
            json={"phase": "review", "participant_id": reviewer_id},
        )
    assert res.status_code == 200
