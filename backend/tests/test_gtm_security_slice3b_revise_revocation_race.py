"""GTM Security Slice 3B — revise revocation between route recognition and locked revalidation."""

from __future__ import annotations

import json
import os
from typing import Any, Dict
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.agreement_draft_store import load_draft
from backend.services.negotiation_review_session_store import get_sessions_field
from backend.tests.negotiation_review_test_helpers import (
    bootstrap_review_session,
    review_mutation_headers,
)
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORIGIN = "http://testserver"
_ORG_H = {"X-Claw-Org-Id": "test-org-slice3b-revise-race"}


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
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-slice3b-revise-race-secret")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_CORS_ALLOW_ORIGINS", "http://testserver,https://testserver,https://app.example.com")
    monkeypatch.setenv("CLAW_NEGOTIATION_REVIEW_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    usage_economics_store_mod._store = None  # noqa: SLF001
    from backend.services.negotiation_review_session_store import reset_negotiation_review_session_store_for_tests

    reset_negotiation_review_session_store_for_tests()
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001
    assert_slice3b_provider_isolation()
    reset_negotiation_review_session_store_for_tests()


def _create_agreement(client: TestClient) -> tuple[str, str]:
    res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Revise race agreement",
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


def _session_cookie(client: TestClient) -> str:
    for name in ("claw_negotiation_review_session", "__Host-claw_negotiation_review_session"):
        value = client.cookies.get(name)
        if value:
            return value
    return ""


def _draft_snapshot(draft: Dict[str, Any]) -> str:
    slim = {
        "purpose": draft.get("purpose"),
        "payment_terms": draft.get("payment_terms"),
        "session_count": len((get_sessions_field(draft).get("sessions") or {})),
    }
    return json.dumps(slim, sort_keys=True)


@pytest.mark.parametrize("run_idx", range(5))
def test_revise_revocation_between_route_recognition_and_locked_revalidation(run_idx: int):
    client = TestClient(app)
    aid, _reviewer_id = _create_agreement(client)
    bootstrap_review_session(client, aid, _ORG_H, recipient_party_id="p_r1", role="reviewer")
    before = load_draft(aid)
    before_snapshot = _draft_snapshot(before)
    from backend.routers.agreements_v2_api import AgreementDraft

    revised_draft = AgreementDraft.model_validate(
        {
            **before,
            "purpose": "Payment within twenty (20) days after receipt.",
            "payment_terms": "Net 20",
        }
    )

    from backend.security import negotiation_review_mutation as nrm
    from backend.security.negotiation_review_session_cookie import read_negotiation_review_session_cookie
    from backend.services.negotiation_review_bootstrap_exchange import revoke_negotiation_review_session

    original_assert = nrm.assert_negotiation_review_session_mutation_allowed

    def _assert_then_revoke(request, agreement_id, **kwargs):
        auth = original_assert(request, agreement_id, **kwargs)
        revoke_negotiation_review_session(
            session_secret=read_negotiation_review_session_cookie(request),
        )
        return auth

    with patch(
        "backend.routers.agreements_v2_api._revise_with_instruction",
        return_value=revised_draft,
    ), patch(
        "backend.routers.agreements_v2_api._coalesce_revision_draft_with_base",
        side_effect=lambda _base, revised: revised,
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval"
    ) as notify_owner, patch.object(
        nrm,
        "assert_negotiation_review_session_mutation_allowed",
        side_effect=_assert_then_revoke,
    ):
        res = client.post(
            f"/api/agreements/{aid}/revise",
            headers=review_mutation_headers(),
            json={"instruction": "Tighten payment terms.", "session_type": "recipient"},
        )

    assert res.status_code == 403, res.text
    detail = res.json().get("detail")
    if isinstance(detail, dict):
        assert detail.get("code") in ("negotiation_review_session_invalid", "negotiation_review_write_denied")
    body_text = json.dumps(res.json())
    assert "recipient_delivery_v1" not in body_text
    assert "negotiation_review_sessions_v1" not in body_text
    notify_owner.assert_not_called()
    after = load_draft(aid)
    assert _draft_snapshot(after) == before_snapshot
    assert get_sessions_field(after).get("sessions")
