"""Paid Pro route entitlement gates."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.commercial_test_helpers import activate_pro_on_org, isolated_economics_store
from backend.tests.conftest_auth_security import make_authenticated_user_headers

_ORG = "org-premium-gate-test"
_HEADERS = {"X-Claw-Org-Id": _ORG}
_PREMIUM_BODY = {
    "intake_text": "A" * 600,
    "context": {"title": "Test Agreement", "jurisdiction": "DE"},
}
_PREMIUM_REFINE_BODY = {
    "current_document_text": "B" * 200,
    "intake_text": "A" * 200,
    "action": "ready",
}
_PREMIUM_REVIEW_BODY = {
    "intake_text": "A" * 200,
    "document_text": "B" * 200,
}
_PREMIUM_ROUTE_BODY = {
    "intake_text": "A" * 200,
    "agreement_text": "B" * 200,
    "party_count": 2,
    "agreement_family": "services",
}
_PREMIUM_MISSING_FACTS_BODY = {
    "intake_text": "A" * 200,
}

_PREMIUM_ROUTES = [
    ("/api/agreements/premium-full-draft", _PREMIUM_BODY),
    ("/api/agreements/premium/finalize", {
        "original_intake": "A" * 200,
        "first_draft": "B" * 200,
        "clarification_answers": [],
        "force_finalize": True,
    }),
    ("/api/agreements/premium-finalize-audit", {
        "intake_text": "A" * 200,
        "document_text": "B" * 200,
    }),
    ("/api/agreements/premium-refine", _PREMIUM_REFINE_BODY),
    ("/api/agreements/premium-review", _PREMIUM_REVIEW_BODY),
    ("/api/agreements/premium-review-route", _PREMIUM_ROUTE_BODY),
    ("/api/agreements/premium-missing-facts", _PREMIUM_MISSING_FACTS_BODY),
    ("/api/agreements/parse", {"intake_text": "A" * 200, "ai_model_class": "premium"}),
]


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


@pytest.mark.parametrize("path,body", _PREMIUM_ROUTES)
def test_premium_routes_reject_without_entitlement(
    client: TestClient, tmp_path, monkeypatch, path: str, body: dict
) -> None:
    isolated_economics_store(tmp_path, monkeypatch)
    res = client.post(path, headers=_HEADERS, json=body)
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "subscription_required"


def test_premium_full_draft_allows_with_pro_entitlement(client: TestClient, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr("backend.routers.agreements_v2_api.OPENAI_API_KEY", "sk-test-gate")
    eco = isolated_economics_store(tmp_path, monkeypatch)
    activate_pro_on_org(eco, _ORG)
    res = client.post("/api/agreements/premium-full-draft", headers=_HEADERS, json=_PREMIUM_BODY)
    assert res.status_code != 403


@pytest.mark.parametrize("path,body", _PREMIUM_ROUTES)
def test_premium_routes_reject_canceled_subscription(
    client: TestClient, tmp_path, monkeypatch, path: str, body: dict
) -> None:
    eco = isolated_economics_store(tmp_path, monkeypatch)
    activate_pro_on_org(eco, _ORG, status="canceled")
    res = client.post(path, headers=_HEADERS, json=body)
    assert res.status_code == 403


@pytest.mark.parametrize("path,body", _PREMIUM_ROUTES)
def test_premium_routes_reject_foreign_workspace(
    client: TestClient, tmp_path, monkeypatch, path: str, body: dict
) -> None:
    eco = isolated_economics_store(tmp_path, monkeypatch)
    activate_pro_on_org(eco, "org-other-workspace")
    user_id = "foreign-gate-user"
    res = client.post(
        path,
        headers=make_authenticated_user_headers(user_id, org_id=f"user-{user_id}"),
        json=body,
    )
    assert res.status_code == 403
