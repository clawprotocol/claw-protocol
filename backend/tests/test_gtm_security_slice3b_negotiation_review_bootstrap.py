"""GTM Security Slice 3B — negotiation-review fragment bootstrap and session auth."""

from __future__ import annotations

import json
import multiprocessing
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.negotiation_review_bootstrap_token import (
    mint_negotiation_review_bootstrap_token,
)
from backend.security.negotiation_review_session_cookie import (
    NEGOTIATION_REVIEW_SESSION_COOKIE,
    NEGOTIATION_REVIEW_SESSION_COOKIE_HOST,
)
from backend.services.agreement_draft_store import (
    _agreement_path,
    _decode_draft_payload,
    _write_draft_file_unlocked,
    agreement_file_lock,
    load_draft,
)
from backend.services.negotiation_review_session_store import (
    NEGOTIATION_REVIEW_SESSIONS_FIELD,
    count_sessions_for_agreement,
    find_session_in_draft_by_token_hash,
    reset_negotiation_review_session_store_for_tests,
    session_token_hash,
)
from backend.services.recipient_delivery_registry import get_registry
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORIGIN = "http://testserver"
_ORG_H = {"X-Claw-Org-Id": "test-org-slice3b"}


@pytest.fixture(autouse=True)
def _isolated_store(monkeypatch, tmp_path):
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
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-slice3b-secret")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_CORS_ALLOW_ORIGINS", "http://testserver,https://testserver,https://app.example.com")
    monkeypatch.setenv("CLAW_NEGOTIATION_REVIEW_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    usage_economics_store_mod._store = None  # noqa: SLF001
    reset_negotiation_review_session_store_for_tests()
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001
    reset_negotiation_review_session_store_for_tests()
    assert_slice3b_provider_isolation()


def _mock_resend_success() -> MagicMock:
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = '{"id":"msg_ok"}'
    mock_response.json.return_value = {"id": "msg_ok"}
    mock_client = MagicMock()
    mock_client.post.return_value = mock_response
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    return mock_client


def _create_agreement_with_reviewers(client: TestClient) -> str:
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Slice 3B Review Agreement",
            "jurisdiction": "TX",
            "parties": [
                {"id": "p_owner", "name": "Owner Co", "role": "owner", "email": "owner@example.com"},
                {"id": "p_r1", "name": "R1", "role": "reviewer", "email": "r1@example.com"},
            ],
            "purpose": "P",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    return create_res.json()["id"]


def _send_review_invites(client: TestClient, agreement_id: str) -> str:
    mock_client = _mock_resend_success()
    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(f"/api/agreements/{agreement_id}/review-sent", headers=_ORG_H, json={})
    assert res.status_code == 200
    html = mock_client.post.call_args_list[0][1]["json"]["html"]
    match = re.search(r"/agreements/[^\"']+/review#t=([^\"'&]+)", html)
    assert match, "email must use fragment review URL"
    assert "?t=" not in html.split("#")[0], "plaintext query token must not appear before fragment"
    return match.group(1)


def _exchange(client: TestClient, token: str, *, origin: str = _ORIGIN):
    return client.post(
        "/api/negotiation-review/bootstrap/exchange",
        json={"token": token},
        headers={"Origin": origin},
    )


def _status(client: TestClient):
    return client.get("/api/negotiation-review/session/status")


def test_email_urls_use_fragment_not_query_token():
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)
    token = _send_review_invites(client, aid)
    assert token
    assert "." in token


def test_valid_exchange_sets_httponly_cookie_and_consumes_jti():
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)
    token = _send_review_invites(client, aid)
    before = count_sessions_for_agreement(aid)
    res = _exchange(client, token)
    assert res.status_code == 200
    body = res.json()
    assert body["authenticated"] is True
    assert body["agreement_id"] == aid
    assert "token" not in json.dumps(body)
    set_cookie = res.headers.get("set-cookie") or ""
    assert NEGOTIATION_REVIEW_SESSION_COOKIE in set_cookie
    assert "httponly" in set_cookie.lower()
    assert count_sessions_for_agreement(aid) == before + 1
    draft = load_draft(aid)
    row = get_registry(draft)["recipients"]["review:p_r1"]
    assert row.get("bootstrap_exchanged_at")
    assert row.get("recipient_session_id")


def test_replay_cannot_create_second_session():
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)
    token = _send_review_invites(client, aid)
    assert _exchange(client, token).status_code == 200
    replay = _exchange(client, token)
    assert replay.status_code == 403
    assert count_sessions_for_agreement(aid) == 1


def test_reload_uses_session_without_token():
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)
    token = _send_review_invites(client, aid)
    exchange = _exchange(client, token)
    assert exchange.status_code == 200
    status = _status(client)
    assert status.status_code == 200
    assert status.json()["authenticated"] is True
    assert status.json()["agreement_id"] == aid


def test_query_token_cannot_authenticate_authority_bound_invite(monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)
    secret = os.environ["CLAW_AGREEMENT_SIGNING_TOKEN_SECRET"].encode("utf-8")
    with agreement_file_lock(aid):
        path = _agreement_path(aid)
        draft = _decode_draft_payload(path.read_text(encoding="utf-8"))
    from backend.security.negotiation_review_content_binding import review_content_binding_sha256

    _, jti, _ = mint_negotiation_review_bootstrap_token(
        secret=secret,
        agreement_id=aid,
        locked_version_id="",
        party_id="p_r1",
        role="reviewer",
        content_sha256=review_content_binding_sha256(draft),
        ttl_seconds=3600,
    )
    with agreement_file_lock(aid):
        path = _agreement_path(aid)
        draft = _decode_draft_payload(path.read_text(encoding="utf-8"))
        from backend.services.recipient_delivery_registry import record_invite_sent

        record_invite_sent(
            draft,
            phase="review",
            participant_id="p_r1",
            jti=jti,
            bootstrap_authority=True,
        )
        _write_draft_file_unlocked(path, draft)

    from backend.security.recipient_access_token import mint_recipient_access_token

    legacy_query = mint_recipient_access_token(
        secret=secret,
        agreement_id=aid,
        locked_version_id="",
        mode="review",
        role="reviewer",
        ttl_seconds=3600,
        recipient_party_id="p_r1",
    )
    res = client.get(
        f"/api/agreements/{aid}",
        headers={"X-Claw-Recipient-Access-Token": legacy_query},
    )
    assert res.status_code == 403

    from backend.security.vs01_recipient_bootstrap_token import mint_vs01_recipient_bootstrap_token

    signing_token, _jti, _exp = mint_vs01_recipient_bootstrap_token(
        secret=secret,
        agreement_id=aid,
        accepted_version_id="v1",
        accepted_corpus_sha256="a" * 64,
        packet_revision="pr1",
        frozen_authority_material_hash="b" * 64,
        signer_record_id="sr1",
        party_id="p_r1",
        locked_version_id="v1",
        ttl_seconds=3600,
    )
    assert _exchange(client, signing_token).status_code == 403


def test_concurrent_exchanges_yield_one_session():
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)
    token = _send_review_invites(client, aid)

    def _worker():
        c = TestClient(app)
        return _exchange(c, token).status_code

    with ThreadPoolExecutor(max_workers=4) as pool:
        codes = list(pool.map(lambda _: _worker(), range(4)))
    assert codes.count(200) == 1
    assert count_sessions_for_agreement(aid) == 1


def test_production_ignores_weaker_cookie_name(monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)
    token = _send_review_invites(client, aid)
    exchange = _exchange(client, token)
    assert exchange.status_code == 200
    set_cookie = exchange.headers.get("set-cookie") or ""
    assert NEGOTIATION_REVIEW_SESSION_COOKIE_HOST in set_cookie
    weak = TestClient(app)
    weak.cookies.set(NEGOTIATION_REVIEW_SESSION_COOKIE, "weak-secret")
    assert weak.get("/api/negotiation-review/session/status").json()["authenticated"] is False


def test_cross_origin_exchange_fails_closed_in_production(monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)
    token = _send_review_invites(client, aid)
    res = _exchange(client, token, origin="https://evil.example")
    assert res.status_code == 403


def test_session_authorizes_recipient_approve():
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)
    token = _send_review_invites(client, aid)
    assert _exchange(client, token).status_code == 200
    approve = client.post(
        f"/api/agreements/{aid}/recipient-approve",
        headers={"Origin": _ORIGIN, "Content-Type": "application/json"},
        json={"message": "ok", "participant_id": "p_r1", "participant_display_name": "R1"},
    )
    assert approve.status_code == 200


@pytest.mark.integration
def test_postgres_exchange_atomicity(monkeypatch):
    dsn = os.getenv("CLAW_AGREEMENT_DATABASE_URL", "").strip() or os.getenv(
        "CLAW_AGREEMENT_POSTGRES_DSN", ""
    ).strip()
    if not dsn:
        pytest.skip("CLAW_AGREEMENT_DATABASE_URL unavailable")
    monkeypatch.setenv("CLAW_AGREEMENT_DATABASE_URL", dsn)
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)
    token = _send_review_invites(client, aid)
    res = _exchange(client, token)
    assert res.status_code == 200
    assert count_sessions_for_agreement(aid) == 1


def test_review_session_denied_on_export_and_full_draft(monkeypatch):
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)
    token = _send_review_invites(client, aid)
    assert _exchange(client, token).status_code == 200
    assert client.get(f"/api/agreements/{aid}").status_code == 403
    assert client.get(f"/api/agreements/{aid}/export-draft.txt").status_code == 403
    review = client.get(f"/api/agreements/{aid}/negotiation-review/draft")
    assert review.status_code == 200
    body = review.json()
    assert body["draft"]["title"]
    assert "review_authorization" in body


def test_cookie_mutation_requires_same_origin(monkeypatch):
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)
    token = _send_review_invites(client, aid)
    assert _exchange(client, token).status_code == 200
    denied = client.post(
        f"/api/agreements/{aid}/recipient-approve",
        json={"message": "ok", "participant_id": "p_r1", "participant_display_name": "R1"},
    )
    assert denied.status_code == 403
    ok = client.post(
        f"/api/agreements/{aid}/recipient-approve",
        headers={"Origin": _ORIGIN, "Content-Type": "application/json"},
        json={"message": "ok", "participant_id": "p_r1", "participant_display_name": "R1"},
    )
    assert ok.status_code == 200


def test_logout_revokes_postgres_session_authoritatively(monkeypatch):
    dsn = os.getenv("CLAW_AGREEMENT_DATABASE_URL", "").strip() or os.getenv(
        "CLAW_AGREEMENT_POSTGRES_DSN", ""
    ).strip()
    if not dsn:
        pytest.skip("CLAW_AGREEMENT_DATABASE_URL unavailable")
    monkeypatch.setenv("CLAW_AGREEMENT_DATABASE_URL", dsn)
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)
    token = _send_review_invites(client, aid)
    assert _exchange(client, token).status_code == 200
    assert _status(client).json()["authenticated"] is True
    logout = client.post(
        "/api/negotiation-review/session/logout",
        headers={"Origin": _ORIGIN},
    )
    assert logout.status_code == 200
    assert _status(client).json()["authenticated"] is False


def test_generic_draft_write_preserves_negotiation_review_sessions(monkeypatch, tmp_path):
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)
    token = _send_review_invites(client, aid)
    assert _exchange(client, token).status_code == 200
    before = count_sessions_for_agreement(aid)
    assert before == 1
    owner_client = TestClient(app)
    owner = owner_client.get(f"/api/agreements/{aid}", headers=_ORG_H)
    assert owner.status_code == 200
    draft = owner.json()["draft"]
    draft.pop(NEGOTIATION_REVIEW_SESSIONS_FIELD, None)
    updated = owner_client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_ORG_H,
        json={"field": "purpose", "value": (draft.get("purpose") or "P") + " updated"},
    )
    assert updated.status_code == 200
    assert count_sessions_for_agreement(aid) == before


def test_pre_lock_session_rejected_after_signing_lock(monkeypatch):
    from backend.services.agreement_signing_lock_store import write_signing_lock

    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)
    token = _send_review_invites(client, aid)
    assert _exchange(client, token).status_code == 200
    write_signing_lock(aid, {"locked_version_id": "v_locked_1", "locked_at": "2020-01-01T00:00:00Z"})
    assert _status(client).json()["authenticated"] is False
