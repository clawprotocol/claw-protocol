"""Regression tests for recipient-delivery-status never returning 500."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.agreement_draft_store import load_draft, save_draft
from backend.services.recipient_delivery_status import build_recipient_delivery_status

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-recipient-delivery-regression"}


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


def _paid_pro_review_first_draft() -> dict:
    return {
        "title": "Services Agreement",
        "jurisdiction": "TX",
        "parties": [
            {
                "name": "Red Mesa Logistics LLC",
                "role": "owner",
                "email": "owner@example.com",
            },
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
    }


def _assert_reviewer_sent_row(body: dict) -> dict:
    review_rows = [r for r in body.get("recipients") or [] if r.get("phase") == "review"]
    assert len(review_rows) == 1
    row = review_rows[0]
    assert row.get("entity_name") == "Harbor Peak Automation LLC"
    assert row.get("role") == "reviewer"
    assert row.get("status") == "sent"
    assert row.get("can_correct_email") is True
    assert row.get("can_resend_invite") is True
    return row


@pytest.mark.parametrize(
    "mutator",
    [
        lambda d: d,
        lambda d: {**d, "recipient_delivery_v1": None},
        lambda d: {**d, "recipient_delivery_v1": {"v": 1, "recipients": "bad"}},
        lambda d: {
            **d,
            "recipient_delivery_v1": {
                "v": 1,
                "recipients": {
                    "review:party_index_1": {
                        "resent_count": {"bad": 1},
                        "last_sent_at": "2026-06-07T12:00:00Z",
                    }
                },
            },
        },
        lambda d: {**d, "audit_log": 42},
        lambda d: {**d, "audit_log": [{"event_type": "invite_sent", "value": {"phase": "review"}}]},
        lambda d: {
            **d,
            "audit_log": [
                {
                    "event_type": "invite_sent",
                    "value": {"phase": "review", "participant_id": "party_index_1"},
                }
            ],
        },
        lambda d: {
            **d,
            "parties": {
                "0": {"name": "Red Mesa Logistics LLC", "role": "owner", "email": "owner@example.com"},
                "1": {
                    "name": "Harbor Peak Automation LLC",
                    "role": "reviewer",
                    "email": "reviewer@harborpeak.test",
                },
            },
        },
    ],
    ids=[
        "fresh_after_review_send",
        "missing_registry",
        "malformed_registry",
        "malformed_registry_resent_count",
        "audit_log_int",
        "audit_missing_at",
        "audit_missing_participant",
        "parties_object_map",
    ],
)
def test_recipient_delivery_status_never_500_on_malformed_metadata(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
    mutator,
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json=_paid_pro_review_first_draft(),
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
    draft = mutator(draft)
    save_draft({**draft, "id": aid})

    res = client.get(f"/api/agreements/{aid}/recipient-delivery-status", headers=_ORG_H)
    assert res.status_code == 200
    body = res.json()
    assert body.get("ok") is True
    _assert_reviewer_sent_row(body)


def test_build_recipient_delivery_status_survives_audit_log_int() -> None:
    payload = build_recipient_delivery_status(
        {
            "review_sent_at": "2026-06-07T12:00:00Z",
            "review_invite_emails_sent_at": "2026-06-07T12:00:00Z",
            "parties": [
                {"name": "Owner LLC", "role": "owner", "email": "owner@example.com"},
                {
                    "name": "Harbor Peak Automation LLC",
                    "role": "reviewer",
                    "email": "reviewer@harborpeak.test",
                },
            ],
            "audit_log": 42,
        }
    )
    _assert_reviewer_sent_row(payload)


def test_build_recipient_delivery_status_survives_datetime_registry_values() -> None:
    payload = build_recipient_delivery_status(
        {
            "review_sent_at": "2026-06-07T12:00:00Z",
            "review_invite_emails_sent_at": "2026-06-07T12:00:00Z",
            "parties": [
                {"name": "Owner LLC", "role": "owner", "email": "owner@example.com"},
                {
                    "name": "Harbor Peak Automation LLC",
                    "role": "reviewer",
                    "email": "reviewer@harborpeak.test",
                },
            ],
            "recipient_delivery_v1": {
                "v": 1,
                "recipients": {
                    "review:party_index_1": {
                        "last_sent_at": datetime(2026, 6, 7, 12, 0, tzinfo=timezone.utc),
                        "last_opened_at": datetime(2026, 6, 7, 13, 0, tzinfo=timezone.utc),
                    }
                },
            },
            "audit_log": 42,
        }
    )
    row = next(r for r in payload["recipients"] if r["phase"] == "review")
    assert row.get("entity_name") == "Harbor Peak Automation LLC"
    assert row.get("last_sent_at")
    assert row.get("status") in ("sent", "opened")


def test_approved_reviewer_locked_even_with_malformed_audit() -> None:
    payload = build_recipient_delivery_status(
        {
            "review_sent_at": "2026-06-07T12:00:00Z",
            "review_invite_emails_sent_at": "2026-06-07T12:00:00Z",
            "parties": [
                {"id": "p_owner", "name": "Owner LLC", "role": "owner", "email": "owner@example.com"},
                {
                    "id": "party_index_1",
                    "name": "Harbor Peak Automation LLC",
                    "role": "reviewer",
                    "email": "reviewer@harborpeak.test",
                },
            ],
            "audit_log": [
                {
                    "event_type": "recipient_approved",
                    "value": {"participant_id": "party_index_1"},
                }
            ],
        }
    )
    row = next(r for r in payload["recipients"] if r["phase"] == "review")
    assert row["status"] == "approved"
    assert row["locked"] is True
    assert row["can_correct_email"] is False
