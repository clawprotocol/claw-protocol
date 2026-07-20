"""GTM Security Slice 3B — expired free-draft enforcement for cookie-session mutations."""

from __future__ import annotations

import copy
import os
from typing import Any, Dict, Tuple
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.routers.agreements_v2_api import STAGED_RECIPIENT_PROPOSALS_KEY
from backend.security.negotiation_review_session_cookie import NEGOTIATION_REVIEW_SESSION_COOKIE
from backend.security.negotiation_review_version_binding import PRE_LOCK_VERSION_BINDING
from backend.security.recipient_access_token import mint_recipient_access_token
from backend.services.agreement_draft_store import load_draft
from backend.services.negotiation_review_session_store import get_sessions_field
from backend.tests.negotiation_review_test_helpers import (
    assert_slice3b_provider_isolation,
    bootstrap_review_session,
    force_agreement_file_storage,
    install_slice3b_provider_isolation,
    review_mutation_headers,
)
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORIGIN = "http://testserver"
_ORG_H = {"X-Claw-Org-Id": "test-org-slice3b-expired-session"}


@pytest.fixture(autouse=True)
def _isolated(monkeypatch, tmp_path):
    install_slice3b_provider_isolation(monkeypatch)
    force_agreement_file_storage(monkeypatch)
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-slice3b-expired-session-secret")
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
            "title": "Expired session agreement",
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


def _session_client() -> Tuple[TestClient, str, str]:
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    bootstrap_review_session(client, aid, _ORG_H, recipient_party_id=reviewer_id, role="reviewer")
    return client, aid, reviewer_id


def _expired_overlay() -> Dict[str, Any]:
    return {
        "watermark_required": True,
        "free_draft_expires_at": "2020-01-01T00:00:00Z",
        "free_draft_expired": True,
        "tier": "free",
    }


def _active_overlay() -> Dict[str, Any]:
    return {
        "watermark_required": True,
        "free_draft_expires_at": "2099-01-01T00:00:00Z",
        "free_draft_expired": False,
        "tier": "free",
    }


def _stage_proposal(client: TestClient, aid: str, reviewer_id: str) -> str:
    owner = TestClient(app)
    draft = owner.get(f"/api/agreements/{aid}", headers=_ORG_H).json()["draft"]
    res = client.post(
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
            "rendered_html": "<p>Payment within fifteen (15) days after receipt.</p>",
        },
    )
    assert res.status_code == 200, res.text
    return str(res.json()["proposal_id"])


def test_expired_cookie_session_suggestion_rejected_without_mutation():
    client, aid, reviewer_id = _session_client()
    before = copy.deepcopy(load_draft(aid))
    provider_calls = {"count": 0}

    def _notify(**_kwargs: Any) -> Dict[str, Any]:
        provider_calls["count"] += 1
        return {"event_type": "owner_review_approval_notified", "at": "t", "field": "recipient", "value": {}}

    with patch(
        "backend.usage_economics.policy.economics_overlay_for_agreement",
        return_value=_expired_overlay(),
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        side_effect=_notify,
    ):
        res = client.post(
            f"/api/agreements/{aid}/pro-redline/reviewer-suggestion",
            headers=review_mutation_headers(),
            json={
                "participant_id": reviewer_id,
                "suggestion_text": "Please adjust payment timing.",
                "reviewer_display_name": "R1",
                "reviewer_email": "r1@example.com",
            },
        )
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "draft_expired"
    after = load_draft(aid)
    assert after.get("pro_redline_v1") == before.get("pro_redline_v1")
    assert after.get("audit_log") == before.get("audit_log")
    assert get_sessions_field(after) == get_sessions_field(before)
    assert provider_calls["count"] == 0


def test_expired_cookie_session_proposal_stage_rejected_without_mutation():
    client, aid, reviewer_id = _session_client()
    before = copy.deepcopy(load_draft(aid))
    provider_calls = {"count": 0}

    def _notify(**_kwargs: Any) -> Dict[str, Any]:
        provider_calls["count"] += 1
        return {"event_type": "owner_review_approval_notified", "at": "t", "field": "recipient", "value": {}}

    with patch(
        "backend.usage_economics.policy.economics_overlay_for_agreement",
        return_value=_expired_overlay(),
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        side_effect=_notify,
    ):
        owner = TestClient(app)
        draft = owner.get(f"/api/agreements/{aid}", headers=_ORG_H).json()["draft"]
        res = client.post(
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
                "rendered_html": "<p>Payment within fifteen (15) days after receipt.</p>",
            },
        )
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "draft_expired"
    after = load_draft(aid)
    staged_before = (before.get("pro_redline_v1") or {}).get(STAGED_RECIPIENT_PROPOSALS_KEY)
    staged_after = (after.get("pro_redline_v1") or {}).get(STAGED_RECIPIENT_PROPOSALS_KEY)
    assert staged_after == staged_before
    assert get_sessions_field(after) == get_sessions_field(before)
    assert provider_calls["count"] == 0


def test_expired_cookie_session_proposal_finalize_rejected_without_mutation():
    client, aid, reviewer_id = _session_client()
    proposal_id = _stage_proposal(client, aid, reviewer_id)
    before = copy.deepcopy(load_draft(aid))
    provider_calls = {"count": 0}

    def _notify(**_kwargs: Any) -> Dict[str, Any]:
        provider_calls["count"] += 1
        return {"event_type": "owner_review_approval_notified", "at": "t", "field": "recipient", "value": {}}

    with patch(
        "backend.usage_economics.policy.economics_overlay_for_agreement",
        return_value=_expired_overlay(),
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        side_effect=_notify,
    ):
        res = client.post(
            f"/api/agreements/{aid}/recipient-proposal",
            headers=review_mutation_headers(),
            json={"proposal_id": proposal_id},
        )
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "draft_expired"
    after = load_draft(aid)
    staged_before = (before.get("pro_redline_v1") or {}).get(STAGED_RECIPIENT_PROPOSALS_KEY)
    staged_after = (after.get("pro_redline_v1") or {}).get(STAGED_RECIPIENT_PROPOSALS_KEY)
    assert staged_after == staged_before
    assert get_sessions_field(after) == get_sessions_field(before)
    assert provider_calls["count"] == 0


def test_expired_cookie_session_approval_rejected_without_mutation_or_claim():
    client, aid, reviewer_id = _session_client()
    before = copy.deepcopy(load_draft(aid))
    provider_calls = {"count": 0}

    def _notify(**_kwargs: Any) -> Dict[str, Any]:
        provider_calls["count"] += 1
        return {"event_type": "owner_review_approval_notified", "at": "t", "field": "recipient", "value": {}}

    with patch(
        "backend.usage_economics.policy.economics_overlay_for_agreement",
        return_value=_expired_overlay(),
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        side_effect=_notify,
    ):
        res = client.post(
            f"/api/agreements/{aid}/recipient-approve",
            headers=review_mutation_headers(),
            json={"message": "ok", "participant_id": reviewer_id, "participant_display_name": "R1"},
        )
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "draft_expired"
    after = load_draft(aid)
    assert after.get("audit_log") == before.get("audit_log")
    assert not after.get("review_approval_notifications_v1")
    assert get_sessions_field(after) == get_sessions_field(before)
    assert provider_calls["count"] == 0


def test_non_expired_cookie_session_suggestion_still_works():
    client, aid, reviewer_id = _session_client()
    with patch(
        "backend.usage_economics.policy.economics_overlay_for_agreement",
        return_value=_active_overlay(),
    ):
        res = client.post(
            f"/api/agreements/{aid}/pro-redline/reviewer-suggestion",
            headers=review_mutation_headers(),
            json={
                "participant_id": reviewer_id,
                "suggestion_text": "Please adjust payment timing.",
                "reviewer_display_name": "R1",
                "reviewer_email": "r1@example.com",
            },
        )
    assert res.status_code == 200, res.text


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


def test_unauthenticated_finalize_on_expired_draft_does_not_disclose_expiry():
    client, aid, reviewer_id = _session_client()
    proposal_id = _stage_proposal(client, aid, reviewer_id)
    before = copy.deepcopy(load_draft(aid))
    provider_calls = {"count": 0}

    def _notify(**_kwargs: Any) -> Dict[str, Any]:
        provider_calls["count"] += 1
        return {"event_type": "owner_review_approval_notified", "at": "t", "field": "recipient", "value": {}}

    unauth = TestClient(app)
    with patch(
        "backend.usage_economics.policy.economics_overlay_for_agreement",
        return_value=_expired_overlay(),
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        side_effect=_notify,
    ):
        res = unauth.post(
            f"/api/agreements/{aid}/recipient-proposal",
            headers={"Content-Type": "application/json"},
            json={"proposal_id": proposal_id},
        )
    assert res.status_code == 403
    detail = res.json().get("detail")
    if isinstance(detail, dict):
        assert detail.get("code") == "recipient_token_required"
        assert detail.get("code") != "draft_expired"
    after = load_draft(aid)
    assert (after.get("pro_redline_v1") or {}).get(STAGED_RECIPIENT_PROPOSALS_KEY) == (
        before.get("pro_redline_v1") or {}
    ).get(STAGED_RECIPIENT_PROPOSALS_KEY)
    assert provider_calls["count"] == 0


def test_invalid_cookie_finalize_on_expired_draft_does_not_disclose_expiry():
    client, aid, reviewer_id = _session_client()
    proposal_id = _stage_proposal(client, aid, reviewer_id)
    before = copy.deepcopy(load_draft(aid))
    provider_calls = {"count": 0}

    def _notify(**_kwargs: Any) -> Dict[str, Any]:
        provider_calls["count"] += 1
        return {"event_type": "owner_review_approval_notified", "at": "t", "field": "recipient", "value": {}}

    invalid = TestClient(app)
    with patch(
        "backend.usage_economics.policy.economics_overlay_for_agreement",
        return_value=_expired_overlay(),
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        side_effect=_notify,
    ):
        res = invalid.post(
            f"/api/agreements/{aid}/recipient-proposal",
            headers={
                "Content-Type": "application/json",
                "Origin": _ORIGIN,
                "Cookie": f"{NEGOTIATION_REVIEW_SESSION_COOKIE}=not-a-valid-session",
            },
            json={"proposal_id": proposal_id},
        )
    assert res.status_code == 403
    detail = res.json().get("detail")
    if isinstance(detail, dict):
        assert detail.get("code") == "negotiation_review_session_invalid"
        assert detail.get("code") != "draft_expired"
    after = load_draft(aid)
    staged_before = (before.get("pro_redline_v1") or {}).get(STAGED_RECIPIENT_PROPOSALS_KEY)
    staged_after = (after.get("pro_redline_v1") or {}).get(STAGED_RECIPIENT_PROPOSALS_KEY)
    assert staged_after == staged_before
    assert provider_calls["count"] == 0


def test_header_token_finalize_on_expired_draft_returns_draft_expired():
    from backend.security.negotiation_review_content_binding import review_content_binding_sha256
    from backend.services.recipient_delivery_registry import extract_jti_from_token
    from backend.tests.negotiation_review_test_helpers import update_delivery_registry_row

    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
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
    header_headers = {
        "Content-Type": "application/json",
        "X-Claw-Recipient-Access-Token": review_token,
    }
    owner = TestClient(app)
    draft_body = owner.get(f"/api/agreements/{aid}", headers=_ORG_H).json()["draft"]
    stage = client.post(
        f"/api/agreements/{aid}/recipient-proposal/stage",
        headers=header_headers,
        json={
            "instruction": "Change payment timing.",
            "proposer_id": reviewer_id,
            "proposer_display_name": "R1",
            "draft": {
                "title": draft_body["title"],
                "jurisdiction": draft_body["jurisdiction"],
                "parties": draft_body["parties"],
                "purpose": "Payment within fifteen (15) days after receipt.",
                "payment_terms": draft_body["payment_terms"],
                "duration": draft_body.get("duration"),
                "due_date": draft_body.get("due_date"),
                "effective_date": draft_body.get("effective_date"),
            },
            "rendered_html": "<p>Payment within fifteen (15) days after receipt.</p>",
        },
    )
    assert stage.status_code == 200, stage.text
    proposal_id = str(stage.json()["proposal_id"])
    before = copy.deepcopy(load_draft(aid))
    provider_calls = {"count": 0}

    def _notify(**_kwargs: Any) -> Dict[str, Any]:
        provider_calls["count"] += 1
        return {"event_type": "owner_review_approval_notified", "at": "t", "field": "recipient", "value": {}}

    with patch(
        "backend.usage_economics.policy.economics_overlay_for_agreement",
        return_value=_expired_overlay(),
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        side_effect=_notify,
    ):
        res = client.post(
            f"/api/agreements/{aid}/recipient-proposal",
            headers=header_headers,
            json={"proposal_id": proposal_id},
        )
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "draft_expired"
    after = load_draft(aid)
    staged_before = (before.get("pro_redline_v1") or {}).get(STAGED_RECIPIENT_PROPOSALS_KEY)
    staged_after = (after.get("pro_redline_v1") or {}).get(STAGED_RECIPIENT_PROPOSALS_KEY)
    assert staged_after == staged_before
    assert provider_calls["count"] == 0


def test_non_expired_cookie_session_proposal_finalize_still_works():
    client, aid, reviewer_id = _session_client()
    with patch(
        "backend.usage_economics.policy.economics_overlay_for_agreement",
        return_value=_active_overlay(),
    ):
        proposal_id = _stage_proposal(client, aid, reviewer_id)
        res = client.post(
            f"/api/agreements/{aid}/recipient-proposal",
            headers=review_mutation_headers(),
            json={"proposal_id": proposal_id},
        )
    assert res.status_code == 200, res.text


def test_non_expired_cookie_session_approval_still_works():
    client, aid, reviewer_id = _session_client()
    with patch(
        "backend.usage_economics.policy.economics_overlay_for_agreement",
        return_value=_active_overlay(),
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        return_value={"event_type": "owner_review_approval_notified", "at": "t", "field": "recipient", "value": {}},
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_counterparties_all_reviews_complete",
        return_value=None,
    ):
        res = client.post(
            f"/api/agreements/{aid}/recipient-approve",
            headers=review_mutation_headers(),
            json={"message": "ok", "participant_id": reviewer_id, "participant_display_name": "R1"},
        )
    assert res.status_code == 200, res.text
