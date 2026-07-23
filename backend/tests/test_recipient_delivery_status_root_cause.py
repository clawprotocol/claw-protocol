"""Root-cause proof + exact Paid Pro review-first regression for recipient-delivery-status."""

from __future__ import annotations

import json

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.tests.conftest_usage_economics_helpers import register_test_agreement_owner
from backend.main import app
from backend.routers import agreements_v2_api as agreements_api
from backend.services.agreement_draft_store import save_draft
from backend.services.recipient_delivery_status import (
    build_recipient_delivery_status,
    draft_diagnostic_types,
)

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-recipient-status-root-cause", "X-Claw-Test-Auth-User-Id": "test-owner"}


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


def _paid_pro_review_first_draft_dict(aid: str) -> dict:
    """Mirror production: Red Mesa owner + Harbor Peak reviewer, review sent, no registry."""
    return {
        "id": aid,
        "title": "Services Agreement",
        "jurisdiction": "TX",
        "purpose": "Consulting services",
        "payment_terms": "Net 30",
        "duration": "1 year",
        "due_date": None,
        "effective_date": None,
        "created_at": "2026-06-07T10:00:00Z",
        "updated_at": "2026-06-07T10:14:00Z",
        "review_sent_at": "2026-06-07T10:14:30Z",
        "review_invite_emails_sent_at": "2026-06-07T10:14:31Z",
        "parties": [
            {
                "id": "p-red-mesa",
                "name": "Red Mesa Logistics LLC",
                "role": "owner",
                "email": "anthemhayek@me.com",
                "signer_name": "Lee Mee",
                "signer_title": "Member",
            },
            {
                "id": "p-harbor-peak",
                "name": "Harbor Peak Automation LLC",
                "role": "reviewer",
                "email": "cryptocurated22@gmail.com",
                "signer_name": "Harry Park",
                "signer_title": "Manager",
            },
        ],
        "audit_log": [
            {"event_type": "created", "at": "2026-06-07T10:00:00Z"},
            {
                "event_type": "invite_sent",
                "value": {"phase": "review", "participant_id": "p-harbor-peak"},
            },
        ],
    }


def test_root_cause_load_or_404_validation_error_on_missing_audit_at(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """Pre-fix production path: _load_or_404 raised ValidationError -> global 500 handler."""
    _env_common(monkeypatch, tmp_path)
    aid = "ag_root_cause"
    draft = _paid_pro_review_first_draft_dict(aid)
    save_draft(draft)
    with pytest.raises(ValidationError) as excinfo:
        agreements_api._load_or_404(aid)
    assert "at" in str(excinfo.value).lower() or excinfo.value.error_count() >= 1


def test_raw_load_and_build_survive_missing_audit_at(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    _env_common(monkeypatch, tmp_path)
    aid = "ag_root_cause_build"
    draft = _paid_pro_review_first_draft_dict(aid)
    save_draft(draft)
    raw = agreements_api._load_draft_dict_or_404(aid)
    diag = draft_diagnostic_types(raw)
    assert diag["audit_log_type"] == "list"
    assert diag["parties_type"] == "list"
    payload = build_recipient_delivery_status(raw)
    json.dumps(payload)
    row = next(r for r in payload["recipients"] if r["phase"] == "review")
    assert row["entity_name"] == "Harbor Peak Automation LLC"
    assert row["role"] == "reviewer"
    assert row["status"] == "sent"
    assert row["can_resend_invite"] is True


def test_root_cause_load_or_404_validation_error_on_datetime_review_sent_at() -> None:
    """Postgres JSONB can hydrate timestamp fields as datetime objects."""
    draft = _paid_pro_review_first_draft_dict("ag_datetime_review_sent")
    draft["review_sent_at"] = datetime(2026, 6, 7, 10, 14, 30, tzinfo=timezone.utc)
    draft["audit_log"] = [{"event_type": "created", "at": "2026-06-07T10:00:00Z"}]
    with pytest.raises(ValidationError) as excinfo:
        agreements_api.AgreementDraft.model_validate(draft)
    assert "review_sent_at" in str(excinfo.value)


def test_datetime_review_sent_at_returns_200_with_raw_load(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    aid = "ag_datetime_review_sent_route"
    draft = _paid_pro_review_first_draft_dict(aid)
    draft["review_sent_at"] = datetime(2026, 6, 7, 10, 14, 30, tzinfo=timezone.utc)
    draft["review_invite_emails_sent_at"] = datetime(2026, 6, 7, 10, 14, 31, tzinfo=timezone.utc)
    draft["audit_log"] = [{"event_type": "created", "at": "2026-06-07T10:00:00Z"}]

    def _fake_load(agreement_id: str) -> dict:
        assert agreement_id == aid
        return draft

    monkeypatch.setattr(agreements_api, "load_draft", _fake_load)
    register_test_agreement_owner(
        db_path=str(tmp_path / "usage.sqlite3"),
        agreement_id=aid,
        org_id="test-org-recipient-status-root-cause",
    )
    res = client.get(f"/api/agreements/{aid}/recipient-delivery-status", headers=_ORG_H)
    assert res.status_code == 200, res.text
    row = next(r for r in res.json()["recipients"] if r["phase"] == "review")
    assert row["status"] == "sent"


def test_exact_paid_pro_review_first_state_returns_200(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """recipientCount=1 reviewer, signerCount=2 parties, reviewSent=true, in_review."""
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    aid = "18f696ba-ae33-49cb-8a41-fe995fe8ef95"
    draft = _paid_pro_review_first_draft_dict(aid)
    draft.pop("recipient_delivery_v1", None)
    save_draft(draft)
    register_test_agreement_owner(
        db_path=str(tmp_path / "usage.sqlite3"),
        agreement_id=aid,
        org_id="test-org-recipient-status-root-cause",
    )

    res = client.get(f"/api/agreements/{aid}/recipient-delivery-status", headers=_ORG_H)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body.get("ok") is True
    assert body.get("review_sent") is True
    review_rows = [r for r in body.get("recipients") or [] if r.get("phase") == "review"]
    assert len(review_rows) == 1
    row = review_rows[0]
    assert row.get("email") == "cryptocurated22@gmail.com"
    assert row.get("role") == "reviewer"
    assert row.get("status") == "sent"
    json.dumps(body)
