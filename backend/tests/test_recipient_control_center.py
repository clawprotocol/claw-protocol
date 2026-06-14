"""Recipient Control Center — delivery status, superseded links, resend."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.recipient_access_token import (
    RECIPIENT_INVITE_SUPERSEDED,
    mint_recipient_access_token,
)
from backend.services.agreement_draft_store import load_draft, save_draft
from backend.services.email.signing_delivery import SIGNING_INVITE_EMAILS_SENT_EVENT
from backend.services.recipient_delivery_registry import extract_jti_from_token, record_invite_sent
from backend.config.agreement_signing_token import resolve_signing_token_secret_raw

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-recipient-control"}


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    from backend.usage_economics import store as usage_economics_store_mod

    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _env_common(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <notifications@lawdog.me>")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-signing-invite-secret")
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")


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


def _create_agreement(client: TestClient, monkeypatch_resend: bool = True) -> tuple[str, str]:
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Services Agreement",
            "jurisdiction": "TX",
            "parties": [
                {"id": "p_owner", "name": "Owner LLC", "role": "owner", "email": "owner@example.com"},
                {"id": "p_cp", "name": "Counterparty LLC", "role": "party", "email": "wrong@example.com"},
            ],
            "purpose": "Services",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]
    if monkeypatch_resend:
        with patch("backend.services.email.resend_client.httpx.Client", return_value=_mock_resend_success()):
            client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H)
    else:
        client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H)
    return aid, "p_cp"


def test_recipient_delivery_status_shows_sent_reviewers(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    with patch("backend.services.email.resend_client.httpx.Client", return_value=_mock_resend_success()):
        aid, cp_id = _create_agreement(client)
        client.post(
            f"/api/agreements/{aid}/review-recipient-email",
            headers=_ORG_H,
            json={"participant_id": cp_id, "new_email": "fixed@example.com", "resend_invite": True},
        )
    res = client.get(f"/api/agreements/{aid}/recipient-delivery-status", headers=_ORG_H)
    assert res.status_code == 200
    body = res.json()
    assert body.get("review_sent") is True
    recipients = body.get("recipients") or []
    review_rows = [r for r in recipients if r.get("phase") == "review" and r.get("participant_id") == cp_id]
    assert len(review_rows) == 1
    assert review_rows[0].get("email") == "fixed@example.com"
    assert review_rows[0].get("status") in ("sent", "opened")


def test_superseded_review_link_blocked(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    with patch("backend.services.email.resend_client.httpx.Client", return_value=_mock_resend_success()):
        aid, cp_id = _create_agreement(client)
    secret = resolve_signing_token_secret_raw().encode("utf-8")
    old_token = mint_recipient_access_token(
        secret=secret,
        agreement_id=aid,
        locked_version_id="v1",
        mode="review",
        role="reviewer",
        ttl_seconds=3600,
        recipient_party_id=cp_id,
    )
    draft = load_draft(aid)
    record_invite_sent(
        draft,
        phase="review",
        participant_id=cp_id,
        jti=extract_jti_from_token(old_token),
        email="wrong@example.com",
        audit_log=draft.setdefault("audit_log", []),
    )
    save_draft({**draft, "id": aid})

    with patch("backend.services.email.resend_client.httpx.Client", return_value=_mock_resend_success()):
        client.post(
            f"/api/agreements/{aid}/review-recipient-email",
            headers=_ORG_H,
            json={"participant_id": cp_id, "new_email": "fixed@example.com", "resend_invite": True},
        )

    res = client.get(
        f"/api/agreements/access/validate?token={old_token}&agreement_id={aid}",
    )
    assert res.status_code == 403
    detail = res.json().get("detail") or {}
    assert detail.get("code") == "invite_superseded"
    assert RECIPIENT_INVITE_SUPERSEDED in str(detail.get("message") or "")


def test_superseded_signing_link_blocked_on_packet_fetch(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid, cp_id = _create_agreement(client)
    draft = load_draft(aid)
    draft["audit_log"] = [
        *(draft.get("audit_log") or []),
        {
            "event_type": SIGNING_INVITE_EMAILS_SENT_EVENT,
            "at": "2026-06-07T00:00:00Z",
            "field": "signing_invite",
            "value": {"packet_revision": "rev_test", "sent_count": 1},
        },
    ]
    draft["vs01_signing_packet_v1"] = {
        "v": 1,
        "document_id": "doc_test",
        "packet_revision": "rev_test",
        "portable": {"v": 1, "seed": {"documentId": "doc_test", "agreementId": aid}, "fields": [], "roles": []},
    }
    record_invite_sent(
        draft,
        phase="signing",
        participant_id=cp_id,
        email="fixed@example.com",
        audit_log=draft.setdefault("audit_log", []),
    )
    for p in draft.get("parties") or []:
        if p.get("id") == cp_id:
            p["email"] = "fixed@example.com"
    save_draft({**draft, "id": aid})

    res = client.get(
        f"/api/agreements/public/{aid}/vs01-signing-packet"
        f"?document_id=doc_test&packet_revision=rev_test"
        f"&recipient_email=wrong@example.com&participant_id={cp_id}",
    )
    assert res.status_code == 403
    detail = res.json().get("detail") or {}
    assert detail.get("code") == "invite_superseded"


def test_resend_invite_preserves_corpus_hash(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid, cp_id = _create_agreement(client)
    before = client.get(f"/api/agreements/{aid}", headers=_ORG_H).json()["draft"]
    corpus_before = before.get("document_text") or before.get("corpus_text")

    with patch("backend.services.email.resend_client.httpx.Client", return_value=_mock_resend_success()):
        res = client.post(
            f"/api/agreements/{aid}/recipient-invite-resend",
            headers=_ORG_H,
            json={"phase": "review", "participant_id": cp_id},
        )
    assert res.status_code == 200
    after = res.json()["draft"]
    corpus_after = after.get("document_text") or after.get("corpus_text")
    assert corpus_before == corpus_after


def test_approved_recipient_locked_in_delivery_status(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid, cp_id = _create_agreement(client)
    draft = load_draft(aid)
    draft["audit_log"] = [
        *(draft.get("audit_log") or []),
        {"event_type": "recipient_approved", "at": "2026-06-07T00:00:00Z", "value": {"participant_id": cp_id}},
    ]
    save_draft({**draft, "id": aid})
    res = client.get(f"/api/agreements/{aid}/recipient-delivery-status", headers=_ORG_H)
    row = next(
        r
        for r in res.json().get("recipients") or []
        if r.get("participant_id") == cp_id and r.get("phase") == "review"
    )
    assert row.get("status") == "approved"
    assert row.get("locked") is True
    assert row.get("can_correct_email") is False


def test_recipient_delivery_status_fresh_review_without_registry(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """test350: review-sent drafts without recipient_delivery_v1 must return usable rows."""
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    with patch("backend.services.email.resend_client.httpx.Client", return_value=_mock_resend_success()):
        aid, cp_id = _create_agreement(client, monkeypatch_resend=False)
    draft = load_draft(aid)
    draft.pop("recipient_delivery_v1", None)
    save_draft({**draft, "id": aid})

    res = client.get(f"/api/agreements/{aid}/recipient-delivery-status", headers=_ORG_H)
    assert res.status_code == 200
    body = res.json()
    assert body.get("review_sent") is True
    row = next(
        r
        for r in body.get("recipients") or []
        if r.get("participant_id") == cp_id and r.get("phase") == "review"
    )
    assert row.get("email")
    assert row.get("status") in ("sent", "opened", "not_sent")
    assert row.get("can_resend_invite") is True


def test_recipient_delivery_status_tolerates_legacy_audit_and_malformed_registry(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    aid, cp_id = _create_agreement(client, monkeypatch_resend=False)
    draft = load_draft(aid)
    draft["audit_log"] = [
        {"event_type": "invite_sent", "value": {"participant_id": cp_id}},
        *(draft.get("audit_log") or []),
    ]
    draft["recipient_delivery_v1"] = {
        "v": 1,
        "recipients": {
            "review:p_cp": {"resent_count": {"bad": 1}, "last_sent_at": "2026-06-07T00:00:00Z"},
            "not-a-dict": "skip",
        },
        "recipients_list_typo": [],
    }
    save_draft({**draft, "id": aid})

    res = client.get(f"/api/agreements/{aid}/recipient-delivery-status", headers=_ORG_H)
    assert res.status_code == 200
    row = next(
        r
        for r in res.json().get("recipients") or []
        if r.get("participant_id") == cp_id and r.get("phase") == "review"
    )
    assert row.get("resent_count") == 0
    assert row.get("can_correct_email") is True


def test_recipient_delivery_status_paid_pro_reviewer_without_party_ids(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """test351: Harbor Peak-style reviewer row without persisted party ids."""
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Services Agreement",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Red Mesa Logistics LLC", "role": "owner", "email": "owner@example.com"},
                {
                    "name": "Harbor Peak Automation LLC",
                    "role": "reviewer",
                    "email": "reviewer@harborpeak.test",
                },
            ],
            "purpose": "Services",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]
    draft = load_draft(aid)
    for party in draft.get("parties") or []:
        if isinstance(party, dict):
            party.pop("id", None)
    draft["review_sent_at"] = "2026-06-07T12:00:00Z"
    draft["review_invite_emails_sent_at"] = "2026-06-07T12:00:00Z"
    draft.pop("recipient_delivery_v1", None)
    save_draft({**draft, "id": aid})

    res = client.get(f"/api/agreements/{aid}/recipient-delivery-status", headers=_ORG_H)
    assert res.status_code == 200
    review_rows = [r for r in res.json().get("recipients") or [] if r.get("phase") == "review"]
    assert len(review_rows) == 1
    row = review_rows[0]
    assert row.get("participant_id") == "party_index_1"
    assert row.get("entity_name") == "Harbor Peak Automation LLC"
    assert row.get("email") == "reviewer@harborpeak.test"
    assert row.get("role") == "reviewer"
    assert row.get("status") == "sent"
    assert row.get("can_correct_email") is True
    assert row.get("can_resend_invite") is True


def test_recipient_delivery_status_client_service_provider_roles(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Consulting Agreement",
            "jurisdiction": "TX",
            "parties": [
                {
                    "id": "p_client",
                    "name": "Blue Canyon Analytics LLC",
                    "role": "client",
                    "email": "owner-user@example.com",
                },
                {
                    "id": "p_provider",
                    "name": "Harbor Peak Automation LLC",
                    "role": "service_provider",
                    "email": "external-reviewer@example.com",
                },
            ],
            "purpose": "Services",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]
    draft = load_draft(aid)
    draft["review_sent_at"] = "2026-06-07T12:00:00Z"
    draft["review_invite_emails_sent_at"] = "2026-06-07T12:00:00Z"
    save_draft({**draft, "id": aid})

    res = client.get(f"/api/agreements/{aid}/recipient-delivery-status", headers=_ORG_H)
    assert res.status_code == 200
    row = next(
        r
        for r in res.json().get("recipients") or []
        if r.get("participant_id") == "p_provider" and r.get("phase") == "review"
    )
    assert row.get("role") == "reviewer"
    assert row.get("status") == "sent"
