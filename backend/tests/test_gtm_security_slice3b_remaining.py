"""GTM Security Slice 3B — requirements 8–12 (owner copy-link, cookie lifetime, matrix)."""

from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.routers import negotiation_review_bootstrap_api as nr_api
from backend.security.negotiation_review_version_binding import PRE_LOCK_VERSION_BINDING
from backend.services.negotiation_review_session_store import NEGOTIATION_REVIEW_SESSIONS_FIELD
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORIGIN = "http://testserver"
_ORG_H = {"X-Claw-Org-Id": "test-org-slice3b-remaining"}


@pytest.fixture(autouse=True)
def _isolated(monkeypatch, tmp_path):
    from backend.tests.negotiation_review_test_helpers import (
        assert_slice3b_provider_isolation,
        force_agreement_file_storage,
        install_slice3b_provider_isolation,
    )

    install_slice3b_provider_isolation(monkeypatch)
    force_agreement_file_storage(monkeypatch)
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-slice3b-remaining-secret")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_CORS_ALLOW_ORIGINS", "http://testserver,https://testserver,https://app.example.com")
    monkeypatch.setenv("CLAW_NEGOTIATION_REVIEW_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    usage_economics_store_mod._store = None  # noqa: SLF001
    from backend.services.negotiation_review_session_store import reset_negotiation_review_session_store_for_tests

    reset_negotiation_review_session_store_for_tests()
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001
    reset_negotiation_review_session_store_for_tests()
    assert_slice3b_provider_isolation()


def _mock_resend():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = '{"id":"msg_ok"}'
    mock_response.json.return_value = {"id": "msg_ok"}
    mock_client = MagicMock()
    mock_client.post.return_value = mock_response
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    return mock_client


def _create_agreement(client: TestClient) -> str:
    res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Remaining reqs agreement",
            "jurisdiction": "TX",
            "parties": [
                {"id": "p_owner", "name": "Owner Co", "role": "owner", "email": "owner@example.com"},
                {"id": "p_r1", "name": "R1", "role": "reviewer", "email": "r1@example.com"},
                {"id": "p_r2", "name": "R2", "role": "reviewer", "email": "r2@example.com"},
            ],
            "purpose": "P",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert res.status_code == 200
    return res.json()["id"]


def _email_token(client: TestClient, aid: str) -> str:
    mock_client = _mock_resend()
    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})
    assert res.status_code == 200
    body_text = json.dumps(res.json())
    assert "#t=" not in body_text
    assert "review_url" not in body_text
    html = mock_client.post.call_args_list[0][1]["json"]["html"]
    match = re.search(r"/agreements/[^\"']+/review#t=([^\"'&]+)", html)
    assert match
    return match.group(1)


def _exchange(client: TestClient, token: str, *, origin: str = _ORIGIN):
    return client.post(
        "/api/negotiation-review/bootstrap/exchange",
        json={"token": token},
        headers={"Origin": origin},
    )


def test_review_sent_response_has_no_bootstrap_material():
    client = TestClient(app)
    aid = _create_agreement(client)
    with patch("backend.services.email.resend_client.httpx.Client", return_value=_mock_resend()):
        res = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})
    assert res.status_code == 200
    payload = json.dumps(res.json())
    assert "review_url" not in payload
    assert "#t=" not in payload
    assert "token" not in payload.lower() or "token_hash" in payload.lower()


def test_owner_copy_link_requires_owner_and_is_no_store():
    client = TestClient(app)
    aid = _create_agreement(client)
    denied = client.post(
        f"/api/agreements/{aid}/owner-review-copy-link",
        json={"mode": "review", "role": "reviewer", "recipient_party_id": "p_r1"},
    )
    assert denied.status_code in (401, 403)
    res = client.post(
        f"/api/agreements/{aid}/owner-review-copy-link",
        headers=_ORG_H,
        json={"mode": "review", "role": "reviewer", "recipient_party_id": "p_r1"},
    )
    assert res.status_code == 200
    body = res.json()
    assert "token" not in body
    assert body.get("review_url", "").find("#t=") > 0
    assert "no-store" in (res.headers.get("cache-control") or "").lower()
    legacy = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG_H,
        json={"mode": "review", "role": "reviewer", "recipient_party_id": "p_r1"},
    )
    assert legacy.status_code == 403
    assert legacy.json()["detail"]["code"] == "owner_review_copy_link_required"


def test_committed_cookie_max_age_never_exceeds_remaining():
    committed = int(time.time())
    exp = datetime.fromtimestamp(committed + 30, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    assert nr_api._committed_cookie_max_age_seconds(expires_at=exp, committed_now_ts=committed) == 30
    assert nr_api._committed_cookie_max_age_seconds(expires_at=exp, committed_now_ts=committed + 1) == 29
    exp1 = datetime.fromtimestamp(committed + 1, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    assert nr_api._committed_cookie_max_age_seconds(expires_at=exp1, committed_now_ts=committed) == 1


def test_near_expiry_bootstrap_rejected_before_session(monkeypatch):
    monkeypatch.setenv("CLAW_NEGOTIATION_REVIEW_BOOTSTRAP_MIN_EXCHANGE_WINDOW_SECONDS", "3601")
    client = TestClient(app)
    aid = _create_agreement(client)
    from backend.security.negotiation_review_bootstrap_token import mint_negotiation_review_bootstrap_token
    from backend.security.negotiation_review_content_binding import review_content_binding_sha256

    secret = os.environ["CLAW_AGREEMENT_SIGNING_TOKEN_SECRET"].encode("utf-8")
    from backend.services.agreement_draft_store import load_draft
    from backend.services.recipient_delivery_registry import record_invite_sent

    draft = load_draft(aid)
    token, jti, _ = mint_negotiation_review_bootstrap_token(
        secret=secret,
        agreement_id=aid,
        locked_version_id=PRE_LOCK_VERSION_BINDING,
        party_id="p_r1",
        role="reviewer",
        content_sha256=review_content_binding_sha256(draft),
        ttl_seconds=3600,
    )
    record_invite_sent(draft, phase="review", participant_id="p_r1", jti=jti, bootstrap_authority=True)
    from backend.services.agreement_draft_store import _agreement_path, _write_draft_file_unlocked, agreement_file_lock

    with agreement_file_lock(aid):
        _write_draft_file_unlocked(_agreement_path(aid), draft)
    assert _exchange(client, token).status_code == 403


@pytest.mark.parametrize(
    "env,origin,expected",
    [
        ("local", _ORIGIN, 200),
        ("production", _ORIGIN, 200),
        ("production", "https://evil.example", 403),
        ("production", "http://testserver:9999", 403),
    ],
)
def test_exchange_origin_matrix(env, origin, expected, monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", env)
    client = TestClient(app)
    aid = _create_agreement(client)
    from backend.security.negotiation_review_bootstrap_token import mint_negotiation_review_bootstrap_token
    from backend.services.agreement_draft_store import load_draft
    from backend.services.recipient_delivery_registry import record_invite_sent, get_registry

    secret = os.environ["CLAW_AGREEMENT_SIGNING_TOKEN_SECRET"].encode("utf-8")
    from backend.security.negotiation_review_content_binding import review_content_binding_sha256

    draft = load_draft(aid)
    token, jti, _ = mint_negotiation_review_bootstrap_token(
        secret=secret,
        agreement_id=aid,
        locked_version_id=PRE_LOCK_VERSION_BINDING,
        party_id="p_r1",
        role="reviewer",
        content_sha256=review_content_binding_sha256(draft),
        ttl_seconds=3600,
    )
    record_invite_sent(draft, phase="review", participant_id="p_r1", jti=jti, bootstrap_authority=True)
    from backend.services.agreement_draft_store import _agreement_path, _write_draft_file_unlocked, agreement_file_lock

    with agreement_file_lock(aid):
        _write_draft_file_unlocked(_agreement_path(aid), draft)
    headers = {"Origin": origin}
    res = client.post(
        "/api/negotiation-review/bootstrap/exchange",
        json={"token": token},
        headers=headers,
    )
    assert res.status_code == expected


def test_review_projection_excludes_internal_authority_fields():
    client = TestClient(app)
    aid = _create_agreement(client)
    token = _email_token(client, aid)
    assert _exchange(client, token).status_code == 200
    res = client.get(f"/api/agreements/{aid}/negotiation-review/draft")
    assert res.status_code == 200
    draft = res.json()["draft"]
    for forbidden in (
        "recipient_delivery_v1",
        NEGOTIATION_REVIEW_SESSIONS_FIELD,
        "frozen_signing_authority_v1",
        "vs01_signing_packet_activation_v1",
    ):
        assert forbidden not in draft
    for party in draft.get("parties") or []:
        if party.get("id") != "p_r1":
            assert not party.get("email")
            assert not party.get("phone")


def test_recipient_approve_same_origin_matrix():
    client = TestClient(app)
    aid = _create_agreement(client)
    token = _email_token(client, aid)
    assert _exchange(client, token).status_code == 200
    body = {"message": "ok", "participant_id": "p_r1", "participant_display_name": "R1"}
    assert client.post(f"/api/agreements/{aid}/recipient-approve", json=body).status_code == 403
    ok = client.post(
        f"/api/agreements/{aid}/recipient-approve",
        headers={"Origin": _ORIGIN, "Content-Type": "application/json"},
        json=body,
    )
    assert ok.status_code == 200


@pytest.mark.parametrize(
    "party,expected",
    [
        ({"id": "p1", "role": "reviewer"}, "reviewer"),
        ({"id": "p2", "role": "service_provider"}, "recipient"),
        ({"id": "p3", "role": "party"}, "recipient"),
        ({"id": "p4", "role": "owner"}, None),
        ({"id": "p5", "role": "viewer"}, None),
        ({"id": "p6", "role": "creator"}, None),
        ({"id": "p7", "role": ""}, None),
        ({"id": "p8", "role": "astronaut"}, None),
    ],
)
def test_canonical_review_role_fail_closed_mapping(party, expected):
    from backend.security.negotiation_review_canonical_role import canonical_review_role_for_party

    assert canonical_review_role_for_party(party) == expected


def test_canonical_review_role_rejects_duplicate_party_ids():
    from backend.security.negotiation_review_canonical_role import canonical_review_role_for_party_id

    draft = {
        "parties": [
            {"id": "dup", "role": "reviewer"},
            {"id": "dup", "role": "party"},
        ]
    }
    assert canonical_review_role_for_party_id(draft, "dup") is None


def test_assert_eligible_review_participant_role_substitution_rejected():
    from backend.security.negotiation_review_canonical_role import assert_eligible_review_participant

    draft = {"parties": [{"id": "p_r1", "role": "reviewer"}]}
    with pytest.raises(ValueError, match="review_role_mismatch"):
        assert_eligible_review_participant(draft, party_id="p_r1", requested_role="recipient")
