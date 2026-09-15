"""Recipient-approve: two-party owner rejection vs 3–4 party legal-party approve."""

from __future__ import annotations

from typing import Any, Dict, List

from backend.tests.entitlement_test_support import ensure_headers_entitled

import pytest
from fastapi.testclient import TestClient

from backend.main import app

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-multiparty-approve", "X-Claw-Test-Auth-User-Id": "test-owner"}


@pytest.fixture(autouse=True)
def _entitle_and_dirs(tmp_path, monkeypatch):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite3"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-multiparty-approve-secret")
    monkeypatch.delenv("CLAW_COMMERCIAL_MODE", raising=False)
    from backend.economics.store import reset_economics_store_for_tests

    reset_economics_store_for_tests()
    ensure_headers_entitled(_ORG_H)
    yield
    reset_economics_store_for_tests()


def _create_parties(client: TestClient, parties: List[Dict[str, Any]], *, title: str = "Services") -> str:
    ensure_headers_entitled(_ORG_H)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": title,
            "jurisdiction": "MA",
            "parties": parties,
            "purpose": "Platform services",
            "payment_terms": "Milestone",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200, create_res.text
    return create_res.json()["id"]


def _mint_review(client: TestClient, agreement_id: str, party_id: str) -> str:
    mint = client.post(
        f"/api/agreements/{agreement_id}/recipient-access-token",
        headers=_ORG_H,
        json={"mode": "review", "role": "reviewer", "recipient_party_id": party_id},
    )
    assert mint.status_code == 200, mint.text
    return mint.json()["token"]


def _approve(client: TestClient, agreement_id: str, token: str, participant_id: str, **extra: object):
    return client.post(
        f"/api/agreements/{agreement_id}/recipient-approve",
        headers={"X-Claw-Recipient-Access-Token": token},
        json={"participant_id": participant_id, "participant_display_name": participant_id, **extra},
    )


def test_two_party_owner_still_cannot_recipient_approve() -> None:
    client = TestClient(app)
    aid = _create_parties(
        client,
        [
            {"id": "p_owner", "name": "Blue Canyon Analytics LLC", "role": "owner", "email": "owner@example.com"},
            {"id": "p_reviewer", "name": "Iron Vale Systems Inc", "role": "reviewer", "email": "reviewer@example.com"},
        ],
        title="Harbor-style",
    )
    token = _mint_review(client, aid, "p_owner")
    res = _approve(client, aid, token, "p_owner")
    assert res.status_code == 403
    assert res.json().get("detail") == "owner_uses_workspace_not_recipient_approve"


def test_four_party_owner_stamped_legal_party_can_recipient_approve() -> None:
    client = TestClient(app)
    aid = _create_parties(
        client,
        [
            {
                "id": "p_lumen",
                "name": "Lumen Bioinformatics Inc.",
                "role": "owner",
                "email": "elena.vasquez@lumenbio.com",
                "signerName": "Dr. Elena Vasquez",
                "signerTitle": "CSO",
            },
            {
                "id": "p_thalassa",
                "name": "Thalassa Data Systems LLC",
                "role": "reviewer",
                "email": "marcus.webb@thalassadata.com",
                "signerName": "Marcus Webb",
            },
            {
                "id": "p_coastal",
                "name": "Coastal Meridian Analytics LLC",
                "role": "reviewer",
                "email": "priya.nair@coastalmeridian.com",
                "signerName": "Priya Nair",
            },
            {
                "id": "p_vanguard",
                "name": "Vanguard Regulatory Sciences Ltd.",
                "role": "reviewer",
                "email": "james.osullivan@vanguardregulatory.co",
                "signerName": "James O'Sullivan",
            },
        ],
        title="Precision-medicine platform",
    )
    got = client.get(f"/api/agreements/{aid}", headers=_ORG_H)
    assert got.status_code == 200
    parties = got.json()["draft"]["parties"]
    lumen = next(p for p in parties if p["id"] == "p_lumen")
    assert (lumen.get("signer_name") or lumen.get("signerName")) == "Dr. Elena Vasquez"
    token = _mint_review(client, aid, "p_lumen")
    res = _approve(client, aid, token, "p_lumen")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body.get("ok") is True
    events = [e for e in (body["draft"].get("audit_log") or []) if e.get("event_type") == "participant_approved"]
    assert any((e.get("value") or {}).get("participant_id") == "p_lumen" for e in events)


def test_same_revision_retry_is_idempotent_and_does_not_duplicate() -> None:
    client = TestClient(app)
    aid = _create_parties(
        client,
        [
            {"id": "p_a", "name": "Stonebridge Wellness LLC", "role": "reviewer", "email": "a@example.com"},
            {"id": "p_b", "name": "NovaPath Imaging LLC", "role": "reviewer", "email": "b@example.com"},
            {"id": "p_c", "name": "ClearSpring Capital LLC", "role": "reviewer", "email": "c@example.com"},
        ],
        title="Three-party",
    )
    token = _mint_review(client, aid, "p_a")
    first = _approve(client, aid, token, "p_a")
    assert first.status_code == 200, first.text
    second = _approve(client, aid, token, "p_a")
    assert second.status_code == 200, second.text
    assert second.json().get("idempotent") is True
    events = [
        e
        for e in (second.json()["draft"].get("audit_log") or [])
        if e.get("event_type") == "participant_approved"
        and (e.get("value") or {}).get("participant_id") == "p_a"
    ]
    assert len(events) == 1
