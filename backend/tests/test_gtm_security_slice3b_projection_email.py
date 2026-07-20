"""GTM Security Slice 3B — audit projection and email duplicate-ID validation."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch

from backend.main import app
from backend.security.negotiation_review_authorization import NegotiationReviewAuthorization
from backend.services.negotiation_review_draft_projection import (
    build_negotiation_review_draft_projection,
    collect_forbidden_projection_audit_values,
)
from backend.services.email.review_delivery import (
    _live_resend_review_invite_targets_from_draft,
    maybe_send_review_invites_after_review_sent,
)
from backend.tests.negotiation_review_test_helpers import (
    assert_slice3b_provider_isolation,
    force_agreement_file_storage,
    install_slice3b_provider_isolation,
)
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-slice3b-projection-email"}


@pytest.fixture(autouse=True)
def _isolated(monkeypatch, tmp_path):
    install_slice3b_provider_isolation(monkeypatch)
    force_agreement_file_storage(monkeypatch)
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-slice3b-projection-email-secret")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001
    assert_slice3b_provider_isolation()


def _auth() -> NegotiationReviewAuthorization:
    return NegotiationReviewAuthorization(
        agreement_id="ag_test",
        recipient_party_id="p_r1",
        mode="review",
        role="reviewer",
        locked_version_id="__pre_lock__",
        session_id="sess",
    )


@pytest.mark.parametrize(
    "audit_event",
    [
        {
            "event_type": "recipient_approved",
            "at": "2026-01-01T00:00:00Z",
            "field": "recipient",
            "value": "SECRET_PII_MARKER bare leak",
        },
        {
            "event_type": "participant_approved",
            "at": "2026-01-01T00:00:00Z",
            "field": "recipient",
            "value": {"message": "arbitrary_audit_leak", "participant_id": "p_r1"},
        },
        {
            "event_type": "recipient_proposal_staged",
            "at": "2026-01-01T00:00:00Z",
            "field": "recipient",
            "value": {"instruction": "SECRET_PII_MARKER", "status": "staged"},
        },
    ],
)
def test_projection_strips_forbidden_audit_values(audit_event):
    draft = {
        "title": "T",
        "parties": [{"id": "p_r1", "name": "R1", "role": "reviewer", "email": "r1@example.com"}],
        "audit_log": [audit_event],
    }
    projected = build_negotiation_review_draft_projection(draft=draft, auth=_auth())
    assert not collect_forbidden_projection_audit_values(projected)
    for event in projected.get("audit_log") or []:
        value = event.get("value")
        if isinstance(value, str):
            pytest.fail("bare audit string leaked")
        if isinstance(value, dict):
            assert "message" not in value
            assert "instruction" not in value


def test_email_duplicate_party_ids_produce_no_targets_or_provider_calls():
    draft = {
        "title": "Dup IDs",
        "parties": [
            {"id": "dup", "name": "Owner", "role": "owner", "email": "owner@example.com"},
            {"id": "dup", "name": "R1", "role": "reviewer", "email": "r1@example.com"},
        ],
    }
    assert _live_resend_review_invite_targets_from_draft(draft) == []
    provider_calls = {"count": 0}

    def _send(**_kwargs):
        provider_calls["count"] += 1
        return MagicMock(ok=True)

    with patch("backend.services.email.review_delivery.send_email_non_fatal", side_effect=_send):
        marker = maybe_send_review_invites_after_review_sent(
            agreement_id="ag_dup",
            draft=draft,
            org_id="org",
        )
    assert marker is None
    assert provider_calls["count"] == 0
    assert "recipient_delivery_v1" not in draft


def test_email_ambiguous_role_party_excluded_from_targets():
    draft = {
        "title": "Ambiguous role",
        "parties": [
            {"id": "p_owner", "name": "Owner", "role": "owner", "email": "owner@example.com"},
            {"id": "p_viewer", "name": "Viewer", "role": "viewer", "email": "viewer@example.com"},
        ],
    }
    assert _live_resend_review_invite_targets_from_draft(draft) == []


def test_review_sent_duplicate_id_skips_provider(monkeypatch):
    client = TestClient(app)
    res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Dup email draft",
            "jurisdiction": "TX",
            "parties": [
                {"id": "dup", "name": "Owner", "role": "owner", "email": "owner@example.com"},
                {"id": "dup", "name": "R1", "role": "reviewer", "email": "r1@example.com"},
            ],
            "purpose": "P",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert res.status_code == 200
    aid = res.json()["id"]
    sent = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})
    assert sent.status_code == 200
    assert not sent.json()["draft"].get("review_invite_emails_sent_at")
