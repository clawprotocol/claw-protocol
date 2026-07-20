"""GTM Security Slice 3B — proposal-finalize header fallback nondisclosure and binding order."""

from __future__ import annotations

import copy
import os
from typing import Any, Dict, Tuple
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.routers.agreements_v2_api import STAGED_RECIPIENT_PROPOSALS_KEY
from backend.security.negotiation_review_content_binding import review_content_binding_sha256
from backend.security.negotiation_review_session_cookie import NEGOTIATION_REVIEW_SESSION_COOKIE
from backend.security.negotiation_review_version_binding import PRE_LOCK_VERSION_BINDING
from backend.security.recipient_access_token import mint_recipient_access_token
from backend.services.agreement_draft_store import load_draft
from backend.services.negotiation_review_session_store import get_sessions_field
from backend.services.recipient_delivery_registry import extract_jti_from_token
from backend.tests.negotiation_review_test_helpers import (
    assert_slice3b_provider_isolation,
    bootstrap_review_session,
    force_agreement_file_storage,
    install_slice3b_provider_isolation,
    review_mutation_headers,
    update_delivery_registry_row,
)
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORIGIN = "http://testserver"
_ORG_H = {"X-Claw-Org-Id": "test-org-slice3b-proposal-fallback"}
_FAKE_PROPOSAL_ID = "00000000-0000-4000-8000-000000000001"
_LOCKED_SIGNING_LOCK = {"locked_version_id": "lv-test-locked"}


@pytest.fixture(autouse=True)
def _isolated(monkeypatch, tmp_path):
    install_slice3b_provider_isolation(monkeypatch)
    force_agreement_file_storage(monkeypatch)
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-slice3b-proposal-fallback-secret")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_CORS_ALLOW_ORIGINS", "http://testserver,https://testserver,https://app.example.com")
    monkeypatch.setenv("CLAW_NEGOTIATION_REVIEW_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
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
            "title": "Proposal fallback nondisclosure",
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


def _create_two_reviewer_agreement(client: TestClient) -> Tuple[str, str, str]:
    res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Two reviewer fallback",
            "jurisdiction": "TX",
            "parties": [
                {"id": "p_owner", "name": "Owner Co", "role": "owner", "email": "owner@example.com"},
                {"id": "p_r1", "name": "R1", "role": "reviewer", "email": "r1@example.com"},
                {"id": "p_r2", "name": "R2", "role": "reviewer", "email": "r2@example.com"},
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
    parties = body["draft"]["parties"]
    return body["id"], parties[1]["id"], parties[2]["id"]


def _session_client() -> Tuple[TestClient, str, str]:
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    bootstrap_review_session(client, aid, _ORG_H, recipient_party_id=reviewer_id, role="reviewer")
    return client, aid, reviewer_id


def _mint_header_review_token(aid: str, reviewer_id: str) -> str:
    return mint_recipient_access_token(
        secret=os.environ["CLAW_AGREEMENT_SIGNING_TOKEN_SECRET"].encode("utf-8"),
        agreement_id=aid,
        locked_version_id=PRE_LOCK_VERSION_BINDING,
        mode="review",
        role="reviewer",
        ttl_seconds=3600,
        recipient_party_id=reviewer_id,
    )


def _register_header_review_token(aid: str, reviewer_id: str) -> Dict[str, str]:
    review_token = _mint_header_review_token(aid, reviewer_id)
    draft = load_draft(aid)
    jti = extract_jti_from_token(review_token)
    update_delivery_registry_row(
        aid,
        reviewer_id,
        active_jti=jti,
        bootstrap_authority=False,
        bootstrap_locked_version_id=PRE_LOCK_VERSION_BINDING,
        bootstrap_content_sha256=review_content_binding_sha256(draft),
        bootstrap_role="reviewer",
        phase="review",
        participant_id=reviewer_id,
    )
    return {
        "Content-Type": "application/json",
        "X-Claw-Recipient-Access-Token": review_token,
    }


def _active_overlay() -> Dict[str, Any]:
    return {
        "watermark_required": True,
        "free_draft_expires_at": "2099-01-01T00:00:00Z",
        "free_draft_expired": False,
        "tier": "free",
    }


def _expired_overlay() -> Dict[str, Any]:
    return {
        "watermark_required": True,
        "free_draft_expires_at": "2020-01-01T00:00:00Z",
        "free_draft_expired": True,
        "tier": "free",
    }


def _stage_proposal_with_headers(client: TestClient, aid: str, reviewer_id: str, headers: Dict[str, str]) -> str:
    owner = TestClient(app)
    draft = owner.get(f"/api/agreements/{aid}", headers=_ORG_H).json()["draft"]
    res = client.post(
        f"/api/agreements/{aid}/recipient-proposal/stage",
        headers=headers,
        json={
            "instruction": "Change payment timing.",
            "proposer_id": reviewer_id,
            "proposer_display_name": "Reviewer",
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
            "rendered_html": "<p>Payment within fifteen (15) days after receipt.</p>",
        },
    )
    assert res.status_code == 200, res.text
    return str(res.json()["proposal_id"])


def _stage_proposal_session(client: TestClient, aid: str, reviewer_id: str) -> str:
    return _stage_proposal_with_headers(client, aid, reviewer_id, review_mutation_headers())


def _provider_notify_stub(provider_calls: Dict[str, int]):
    def _notify(**_kwargs: Any) -> Dict[str, Any]:
        provider_calls["count"] += 1
        return {"event_type": "owner_review_approval_notified", "at": "t", "field": "recipient", "value": {}}

    return _notify


def _assert_rejected_without_side_effects(
    before: Dict[str, Any],
    after: Dict[str, Any],
    *,
    provider_calls: Dict[str, int],
) -> None:
    pr_before = before.get("pro_redline_v1") or {}
    pr_after = after.get("pro_redline_v1") or {}
    assert pr_after.get(STAGED_RECIPIENT_PROPOSALS_KEY) == pr_before.get(STAGED_RECIPIENT_PROPOSALS_KEY)
    assert pr_after.get("recipient_proposals") == pr_before.get("recipient_proposals")
    assert after.get("audit_log") == before.get("audit_log")
    assert not after.get("review_approval_notifications_v1")
    assert get_sessions_field(after) == get_sessions_field(before)
    assert provider_calls["count"] == 0


def _finalize(client: TestClient, aid: str, proposal_id: str, headers: Dict[str, str]):
    return client.post(
        f"/api/agreements/{aid}/recipient-proposal",
        headers=headers,
        json={"proposal_id": proposal_id},
    )


def test_unauthenticated_nonexistent_proposal_returns_auth_failure_not_not_staged():
    client = TestClient(app)
    aid, _reviewer_id = _create_agreement(client)
    before = copy.deepcopy(load_draft(aid))
    provider_calls = {"count": 0}
    with patch(
        "backend.routers.agreements_v2_api.read_signing_lock",
        return_value=_LOCKED_SIGNING_LOCK,
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        side_effect=_provider_notify_stub(provider_calls),
    ):
        res = _finalize(
            client,
            aid,
            _FAKE_PROPOSAL_ID,
            {"Content-Type": "application/json"},
        )
    assert res.status_code == 403
    detail = res.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("code") == "recipient_token_required"
    assert detail.get("code") != "proposal_not_staged"
    assert res.json().get("detail") != "proposal_not_staged"
    _assert_rejected_without_side_effects(before, load_draft(aid), provider_calls=provider_calls)


def test_unauthenticated_locked_agreement_returns_auth_failure_not_negotiation_locked():
    client = TestClient(app)
    aid, _reviewer_id = _create_agreement(client)
    before = copy.deepcopy(load_draft(aid))
    provider_calls = {"count": 0}
    with patch(
        "backend.routers.agreements_v2_api.read_signing_lock",
        return_value=_LOCKED_SIGNING_LOCK,
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        side_effect=_provider_notify_stub(provider_calls),
    ):
        res = _finalize(
            client,
            aid,
            _FAKE_PROPOSAL_ID,
            {"Content-Type": "application/json"},
        )
    assert res.status_code == 403
    detail = res.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("code") == "recipient_token_required"
    assert res.json().get("detail") != "negotiation_locked"
    _assert_rejected_without_side_effects(before, load_draft(aid), provider_calls=provider_calls)


def test_invalid_cookie_nonexistent_proposal_returns_session_failure_not_not_staged():
    client = TestClient(app)
    aid, _reviewer_id = _create_agreement(client)
    before = copy.deepcopy(load_draft(aid))
    provider_calls = {"count": 0}
    with patch(
        "backend.routers.agreements_v2_api.read_signing_lock",
        return_value=_LOCKED_SIGNING_LOCK,
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        side_effect=_provider_notify_stub(provider_calls),
    ):
        res = _finalize(
            client,
            aid,
            _FAKE_PROPOSAL_ID,
            {
                "Content-Type": "application/json",
                "Origin": _ORIGIN,
                "Cookie": f"{NEGOTIATION_REVIEW_SESSION_COOKIE}=not-a-valid-session",
            },
        )
    assert res.status_code == 403
    detail = res.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("code") == "negotiation_review_session_invalid"
    assert detail.get("code") != "proposal_not_staged"
    _assert_rejected_without_side_effects(before, load_draft(aid), provider_calls=provider_calls)


def test_invalid_cookie_locked_agreement_returns_session_failure_not_negotiation_locked():
    client = TestClient(app)
    aid, _reviewer_id = _create_agreement(client)
    before = copy.deepcopy(load_draft(aid))
    provider_calls = {"count": 0}
    with patch(
        "backend.routers.agreements_v2_api.read_signing_lock",
        return_value=_LOCKED_SIGNING_LOCK,
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        side_effect=_provider_notify_stub(provider_calls),
    ):
        res = _finalize(
            client,
            aid,
            _FAKE_PROPOSAL_ID,
            {
                "Content-Type": "application/json",
                "Origin": _ORIGIN,
                "Cookie": f"{NEGOTIATION_REVIEW_SESSION_COOKIE}=not-a-valid-session",
            },
        )
    assert res.status_code == 403
    detail = res.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("code") == "negotiation_review_session_invalid"
    assert res.json().get("detail") != "negotiation_locked"
    _assert_rejected_without_side_effects(before, load_draft(aid), provider_calls=provider_calls)


def test_header_token_nonexistent_proposal_returns_not_staged_after_authorization():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    headers = _register_header_review_token(aid, reviewer_id)
    before = copy.deepcopy(load_draft(aid))
    provider_calls = {"count": 0}
    with patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        side_effect=_provider_notify_stub(provider_calls),
    ):
        res = _finalize(client, aid, _FAKE_PROPOSAL_ID, headers)
    assert res.status_code == 400
    assert res.json().get("detail") == "proposal_not_staged"
    _assert_rejected_without_side_effects(before, load_draft(aid), provider_calls=provider_calls)


def test_header_token_locked_agreement_returns_negotiation_locked_after_authorization():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    headers = _register_header_review_token(aid, reviewer_id)
    before = copy.deepcopy(load_draft(aid))
    provider_calls = {"count": 0}
    with patch(
        "backend.routers.agreements_v2_api.read_signing_lock",
        return_value=_LOCKED_SIGNING_LOCK,
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        side_effect=_provider_notify_stub(provider_calls),
    ):
        res = _finalize(client, aid, _FAKE_PROPOSAL_ID, headers)
    assert res.status_code == 400
    assert res.json().get("detail") == "negotiation_locked"
    _assert_rejected_without_side_effects(before, load_draft(aid), provider_calls=provider_calls)


def test_header_token_mismatched_participant_binding_rejected_without_mutation():
    client = TestClient(app)
    aid, reviewer_r1, reviewer_r2 = _create_two_reviewer_agreement(client)
    headers_r1 = _register_header_review_token(aid, reviewer_r1)
    headers_r2 = _register_header_review_token(aid, reviewer_r2)
    proposal_id = _stage_proposal_with_headers(client, aid, reviewer_r1, headers_r1)
    before = copy.deepcopy(load_draft(aid))
    provider_calls = {"count": 0}
    with patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        side_effect=_provider_notify_stub(provider_calls),
    ):
        res = _finalize(client, aid, proposal_id, headers_r2)
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "recipient_party_token_mismatch"
    _assert_rejected_without_side_effects(before, load_draft(aid), provider_calls=provider_calls)


def test_header_token_matching_participant_expired_draft_returns_draft_expired_after_binding():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    headers = _register_header_review_token(aid, reviewer_id)
    proposal_id = _stage_proposal_with_headers(client, aid, reviewer_id, headers)
    before = copy.deepcopy(load_draft(aid))
    provider_calls = {"count": 0}
    with patch(
        "backend.usage_economics.policy.economics_overlay_for_agreement",
        return_value=_expired_overlay(),
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        side_effect=_provider_notify_stub(provider_calls),
    ):
        res = _finalize(client, aid, proposal_id, headers)
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "draft_expired"
    _assert_rejected_without_side_effects(before, load_draft(aid), provider_calls=provider_calls)


def test_header_token_matching_participant_non_expired_draft_finalization_succeeds():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    headers = _register_header_review_token(aid, reviewer_id)
    with patch(
        "backend.usage_economics.policy.economics_overlay_for_agreement",
        return_value=_active_overlay(),
    ):
        proposal_id = _stage_proposal_with_headers(client, aid, reviewer_id, headers)
        res = _finalize(client, aid, proposal_id, headers)
    assert res.status_code == 200, res.text
    after = load_draft(aid)
    staged = (after.get("pro_redline_v1") or {}).get(STAGED_RECIPIENT_PROPOSALS_KEY) or {}
    assert proposal_id not in staged


def test_cookie_session_proposal_finalize_remains_successful():
    client, aid, reviewer_id = _session_client()
    with patch(
        "backend.usage_economics.policy.economics_overlay_for_agreement",
        return_value=_active_overlay(),
    ):
        proposal_id = _stage_proposal_session(client, aid, reviewer_id)
        res = _finalize(client, aid, proposal_id, review_mutation_headers())
    assert res.status_code == 200, res.text
