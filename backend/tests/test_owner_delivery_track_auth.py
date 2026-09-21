"""Owner-scoped delivery-track persist: owner can write; other org / unsigned cannot."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.entitlement_test_support import ensure_headers_entitled


@pytest.fixture()
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    return TestClient(app)


def _headers(user_id: str) -> dict[str, str]:
    h = {
        "X-Claw-Org-Id": f"user-{user_id}",
        "X-Claw-Test-Auth-User-Id": user_id,
    }
    ensure_headers_entitled(h)
    return h


def _create(client: TestClient, headers: dict[str, str]) -> str:
    res = client.post(
        "/api/agreements/draft",
        headers=headers,
        json={
            "title": "Delivery track",
            "jurisdiction": "DE",
            "parties": [
                {"name": "Owner Co", "role": "Client"},
                {"name": "Vendor Co", "role": "Service Provider"},
            ],
            "purpose": "Resume continuity",
            "payment_terms": "Fixed",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert res.status_code == 200
    return res.json()["id"]


def test_owner_can_persist_delivery_track_and_workspace_index_returns_it(client: TestClient):
    owner = _headers("owner-track")
    aid = _create(client, owner)
    patched = client.post(
        f"/api/agreements/{aid}/update-field",
        headers=owner,
        json={"field": "owner_delivery_track", "value": "signature"},
    )
    assert patched.status_code == 200
    assert patched.json()["draft"]["owner_delivery_track"] == "signature"
    index = client.get("/api/agreements/workspace-index", headers=owner)
    assert index.status_code == 200
    row = next(r for r in index.json()["agreements"] if r["id"] == aid)
    assert row["owner_delivery_track"] == "signature"


def test_other_org_cannot_set_owner_delivery_track(client: TestClient):
    owner = _headers("owner-track-a")
    other = _headers("owner-track-b")
    aid = _create(client, owner)
    denied = client.post(
        f"/api/agreements/{aid}/update-field",
        headers=other,
        json={"field": "owner_delivery_track", "value": "review"},
    )
    assert denied.status_code in (403, 404)
    got = client.get(f"/api/agreements/{aid}", headers=owner)
    assert (got.json().get("draft") or {}).get("owner_delivery_track") in (None, "")


def test_unsigned_cannot_set_owner_delivery_track(client: TestClient):
    owner = _headers("owner-track-unauth")
    aid = _create(client, owner)
    denied = client.post(
        f"/api/agreements/{aid}/update-field",
        json={"field": "owner_delivery_track", "value": "review"},
    )
    assert denied.status_code in (401, 403)
