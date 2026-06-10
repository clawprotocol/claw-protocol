"""Review invitation email delivery on review-sent (mocked Resend)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-review-email"}


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _create_agreement_with_reviewers(client: TestClient) -> str:
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Review Email Agreement",
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
    assert create_res.status_code == 200
    return create_res.json()["id"]


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


def test_manual_mode_sends_zero_emails(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "manual")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "noreply@example.com")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")

    mock_client = _mock_resend_success()
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})

    assert res.status_code == 200
    assert res.json().get("ok") is True
    mock_client.post.assert_not_called()


def test_email_mode_sends_review_invites(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.com>")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")

    mock_client = _mock_resend_success()
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})

    assert res.status_code == 200
    assert res.json().get("ok") is True
    assert mock_client.post.call_count == 2
    recipients = {call[1]["json"]["to"][0] for call in mock_client.post.call_args_list}
    assert recipients == {"r1@example.com", "r2@example.com"}
    first_payload = mock_client.post.call_args_list[0][1]["json"]
    assert first_payload["subject"].startswith("Review requested:")
    assert "Open review" in first_payload["html"]
    assert "https://app.example.com/agreements/" in first_payload["html"]


def test_resend_failure_does_not_fail_review_sent(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "noreply@example.com")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")

    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.text = "server error"
    mock_client = MagicMock()
    mock_client.post.return_value = mock_response
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})

    assert res.status_code == 200
    assert res.json().get("ok") is True
    assert "review_sent_at" in (res.json().get("draft") or {})


def test_missing_email_config_does_not_fail_review_sent(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("EMAIL_FROM", raising=False)
    monkeypatch.delenv("CLAW_APP_PUBLIC_ORIGIN", raising=False)

    mock_client = _mock_resend_success()
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})

    assert res.status_code == 200
    assert res.json().get("ok") is True
    mock_client.post.assert_not_called()


def test_owner_party_excluded_external_reviewer_receives_invite(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """Owner/self party email is excluded; external reviewer receives the Resend invite."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "manual_and_email")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "noreply@example.com")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")

    mock_client = _mock_resend_success()
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Two-party review",
            "jurisdiction": "TX",
            "parties": [
                {
                    "id": "p_owner",
                    "name": "Blue Canyon Analytics LLC",
                    "role": "owner",
                    "email": "owner-user@example.com",
                },
                {
                    "id": "p_ext",
                    "name": "Iron Vale Systems Inc.",
                    "role": "reviewer",
                    "email": "external-reviewer@example.com",
                },
            ],
            "purpose": "P",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})

    assert res.status_code == 200
    body = res.json()
    assert mock_client.post.call_count == 1
    assert mock_client.post.call_args_list[0][1]["json"]["to"] == ["external-reviewer@example.com"]
    assert body.get("draft", {}).get("review_invite_emails_sent_at")


def test_paid_pro_corpus_persist_then_review_sent_still_sends_emails(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """Paid Pro: token mint corpus persist sets review_sent_at before review-sent; emails still send once."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-review-email-paid-pro")
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "manual_and_email")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "noreply@example.com")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")

    mock_client = _mock_resend_success()
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)
    final_corpus = "PAID_PRO_REVIEW_CORPUS\n" + ("review body text " * 40)

    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG_H,
        json={
            "mode": "review",
            "role": "reviewer",
            "recipient_party_id": "p_r1",
            "review_first_document_text": final_corpus,
            "review_first_document_source": "unit_test_paid_pro",
        },
    )
    assert mint.status_code == 200

    got = client.get(f"/api/agreements/{aid}", headers=_ORG_H)
    assert got.status_code == 200
    draft = got.json()["draft"]
    assert draft.get("review_sent_at")

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})

    assert res.status_code == 200
    body = res.json()
    assert body.get("ok") is True
    assert mock_client.post.call_count == 2
    assert body["draft"].get("review_invite_emails_sent_at")


def test_duplicate_review_sent_does_not_resend_emails(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "noreply@example.com")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")

    mock_client = _mock_resend_success()
    client = TestClient(app)
    aid = _create_agreement_with_reviewers(client)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        first = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})
        assert first.status_code == 200
        assert mock_client.post.call_count == 2
        second = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})
        assert second.status_code == 200
        assert mock_client.post.call_count == 2


def test_review_invite_template_excludes_agreement_body() -> None:
    from backend.services.email.templates.review_invite import build_review_invite_email

    email = build_review_invite_email(
        party_name="Pat",
        agreement_title="NDA",
        review_url="https://app.example.com/agreements/a/review?t=abc",
    )
    assert email.subject == "Review requested: NDA"
    assert "NDA" in email.html
    assert "Pat" in email.html
    assert "Open review" in email.html
    assert "payment_terms" not in email.html.lower()
    assert "purpose" not in email.text.lower()


def _invite_emails(draft: dict) -> set[str]:
    from backend.services.email.review_delivery import _live_resend_review_invite_targets_from_draft

    return {t.to for t in _live_resend_review_invite_targets_from_draft(draft)}


class TestLiveResendReviewInviteOwnerExclusionPolicy:
    """Live Resend targets: explicit owner role required; role-only exclusion (no index-0 fallback)."""

    def test_owner_at_party_1_index_0_excluded(self) -> None:
        draft = {
            "title": "Two-party",
            "parties": [
                {"id": "p1", "name": "Owner Co", "role": "owner", "email": "owner@example.com"},
                {"id": "p2", "name": "Counter", "role": "reviewer", "email": "ext@example.com"},
            ],
        }
        assert _invite_emails(draft) == {"ext@example.com"}

    def test_owner_at_party_2_index_1_counterparty_at_0_invited(self) -> None:
        """Explicit owner role at index 1 — index-0 counterparty must not be excluded by position alone."""
        draft = {
            "title": "Reordered parties",
            "parties": [
                {"id": "p_cp", "name": "Iron Vale", "role": "party", "email": "counter@example.com"},
                {"id": "p_own", "name": "Blue Canyon", "role": "owner", "email": "owner@example.com"},
            ],
        }
        assert _invite_emails(draft) == {"counter@example.com"}

    def test_owner_at_party_n_middle_of_list(self) -> None:
        draft = {
            "title": "Four-party",
            "parties": [
                {"id": "a", "name": "A", "role": "reviewer", "email": "a@example.com"},
                {"id": "b", "name": "B", "role": "signer", "email": "b@example.com"},
                {"id": "c", "name": "Owner", "role": "owner", "email": "owner@example.com"},
                {"id": "d", "name": "D", "role": "party", "email": "d@example.com"},
            ],
        }
        assert _invite_emails(draft) == {"a@example.com", "b@example.com", "d@example.com"}

    def test_missing_owner_role_yields_no_targets(self) -> None:
        """Without owner-normalized role, live Resend must not select any recipients."""
        draft = {
            "title": "No owner role",
            "parties": [
                {"id": "p0", "name": "First", "role": "party", "email": "first@example.com"},
                {"id": "p1", "name": "Second", "role": "party", "email": "second@example.com"},
            ],
        }
        assert _invite_emails(draft) == set()

    def test_sender_and_landlord_roles_count_as_owner(self) -> None:
        draft = {
            "title": "Sender alias",
            "parties": [
                {"id": "s", "name": "Sender", "role": "sender", "email": "sender@example.com"},
                {"id": "r", "name": "Rev", "role": "reviewer", "email": "rev@example.com"},
            ],
        }
        assert _invite_emails(draft) == {"rev@example.com"}

    def test_org_id_not_used_for_target_selection(self) -> None:
        """org_id is logging-only; draft parties alone determine exclusion."""
        from backend.services.email.review_delivery import maybe_send_review_invites_after_review_sent

        draft = {
            "title": "Auth vs draft",
            "parties": [
                {"id": "p0", "name": "Owner", "role": "owner", "email": "owner@example.com"},
                {"id": "p1", "name": "Ext", "role": "reviewer", "email": "ext@example.com"},
            ],
        }
        with patch("backend.services.email.review_delivery.send_email_non_fatal") as send_mock:
            send_mock.return_value.ok = True
            with patch(
                "backend.services.email.review_delivery.resolve_signing_token_secret_raw",
                return_value="unit-test-secret",
            ):
                with patch("backend.services.email.review_delivery.read_signing_lock", return_value=None):
                    with patch.dict(
                        "os.environ",
                        {
                            "CLAW_REVIEW_DELIVERY_MODE": "email",
                            "RESEND_API_KEY": "re_test",
                            "EMAIL_FROM": "noreply@example.com",
                            "CLAW_APP_PUBLIC_ORIGIN": "https://app.example.com",
                        },
                        clear=False,
                    ):
                        maybe_send_review_invites_after_review_sent(
                            agreement_id="ag-audit",
                            draft=draft,
                            org_id="different-workspace-subject",
                        )
        recipients = {call.kwargs["to"] for call in send_mock.call_args_list}
        assert recipients == {"ext@example.com"}
        assert "owner@example.com" not in recipients


def test_no_owner_role_skips_resend_and_leaves_marker_unset(
    monkeypatch: pytest.MonkeyPatch, tmp_path, caplog: pytest.LogCaptureFixture
) -> None:
    """Missing owner role: zero Resend calls, owner_role_missing log, no idempotency marker."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "noreply@example.com")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")

    mock_client = _mock_resend_success()
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "No owner metadata",
            "jurisdiction": "TX",
            "parties": [
                {"id": "p0", "name": "First", "role": "party", "email": "first@example.com"},
                {"id": "p1", "name": "Second", "role": "party", "email": "second@example.com"},
            ],
            "purpose": "P",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]

    with caplog.at_level("INFO"):
        with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
            res = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})

    assert res.status_code == 200
    body = res.json()
    assert body.get("ok") is True
    mock_client.post.assert_not_called()
    assert not body.get("draft", {}).get("review_invite_emails_sent_at")
    assert "review_sent_at" in (body.get("draft") or {})
    assert any(
        "skip_reason=owner_role_missing" in r.message and "recipient_row_count=0" in r.message
        for r in caplog.records
    )


def test_owner_at_index_1_counterparty_invited_integration(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """Owner at index 1: counterparty at index 0 receives Resend invite."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "noreply@example.com")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")

    mock_client = _mock_resend_success()
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Reordered",
            "jurisdiction": "TX",
            "parties": [
                {"id": "p_cp", "name": "Counter", "role": "party", "email": "counter@example.com"},
                {"id": "p_own", "name": "Owner", "role": "owner", "email": "owner@example.com"},
            ],
            "purpose": "P",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})

    assert res.status_code == 200
    assert mock_client.post.call_count == 1
    assert mock_client.post.call_args_list[0][1]["json"]["to"] == ["counter@example.com"]
    assert res.json()["draft"].get("review_invite_emails_sent_at")


def test_owner_in_middle_of_four_party_list_integration(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """Owner in middle of list: only owner excluded; all other valid parties invited."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "noreply@example.com")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")

    mock_client = _mock_resend_success()
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Four-party",
            "jurisdiction": "TX",
            "parties": [
                {"id": "a", "name": "A", "role": "reviewer", "email": "a@example.com"},
                {"id": "b", "name": "B", "role": "signer", "email": "b@example.com"},
                {"id": "c", "name": "Owner", "role": "owner", "email": "owner@example.com"},
                {"id": "d", "name": "D", "role": "party", "email": "d@example.com"},
            ],
            "purpose": "P",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})

    assert res.status_code == 200
    assert mock_client.post.call_count == 3
    recipients = {call[1]["json"]["to"][0] for call in mock_client.post.call_args_list}
    assert recipients == {"a@example.com", "b@example.com", "d@example.com"}
