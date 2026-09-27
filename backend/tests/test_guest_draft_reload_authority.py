"""Same-owner anonymous guest may reload their temporary draft; others cannot."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.anonymous_session_store import reset_anonymous_session_store_for_tests
from backend.tests.conftest_auth_security import auth_secrets, make_test_auth_headers, mint_anonymous_session
from backend.tests.entitlement_test_support import ensure_org_pro_entitlement
from backend.usage_economics.store import UsageEconomicsStore

_GUEST_DRAFT = {
    "title": "Anonymous Free Agreement",
    "jurisdiction": "Delaware",
    "parties": [
        {"name": "Cedar Ridge Labs LLC", "role": "Client"},
        {"name": "Harbor Peak Automation LLC", "role": "Service Provider"},
    ],
    "purpose": "Software automation and implementation services.",
    "payment_terms": "$4,900 per month",
    "duration": "12 months",
}

@pytest.fixture()
def isolated_commercial(tmp_path, monkeypatch: pytest.MonkeyPatch, auth_secrets):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage_eco.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    import backend.economics.store as eco_store_mod
    import backend.usage_economics.store as ue_store_mod
    ue_store_mod._store = None
    eco_store_mod._store = None
    reset_anonymous_session_store_for_tests()
    usage = UsageEconomicsStore(str(tmp_path / "usage_eco.sqlite3"))
    usage.init_schema()
    yield usage
    ue_store_mod._store = None
    eco_store_mod._store = None
    reset_anonymous_session_store_for_tests()

def test_same_anonymous_owner_can_reload_guest_draft(isolated_commercial):
    client = TestClient(app)
    org_a, _token, headers_a = mint_anonymous_session(client)
    created = client.post("/api/agreements/draft", headers={**headers_a, "Content-Type": "application/json"}, json=_GUEST_DRAFT)
    assert created.status_code == 200, created.text
    aid = created.json()["id"]
    assert isolated_commercial.owner_subject_for_agreement(aid) == f"org:{org_a}"
    got = client.get(f"/api/agreements/{aid}", headers=headers_a)
    assert got.status_code == 200, got.text
    body = got.json()
    assert body.get("id") == aid
    assert (body.get("draft") or {}).get("id") == aid
    assert "Cedar Ridge Labs LLC" in str(body.get("draft") or {})

def test_different_anonymous_session_cannot_read_guest_draft(isolated_commercial):
    client = TestClient(app)
    _org_a, _token_a, headers_a = mint_anonymous_session(client)
    created = client.post("/api/agreements/draft", headers={**headers_a, "Content-Type": "application/json"}, json=_GUEST_DRAFT)
    assert created.status_code == 200, created.text
    aid = created.json()["id"]
    _org_b, _token_b, headers_b = mint_anonymous_session(client)
    got = client.get(f"/api/agreements/{aid}", headers=headers_b)
    assert got.status_code in (401, 403), got.text
    detail = got.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("code") in {"agreement_read_denied", "org_session_mismatch"}
    assert "Cedar Ridge Labs LLC" not in got.text

def test_unrelated_authenticated_user_cannot_read_guest_draft(isolated_commercial):
    client = TestClient(app)
    _org_a, _token_a, headers_a = mint_anonymous_session(client)
    created = client.post("/api/agreements/draft", headers={**headers_a, "Content-Type": "application/json"}, json=_GUEST_DRAFT)
    assert created.status_code == 200, created.text
    aid = created.json()["id"]
    user_id = "unrelated-pro-reader"
    ensure_org_pro_entitlement(f"user-{user_id}", user_id=user_id)
    got = client.get(f"/api/agreements/{aid}", headers={"X-Claw-Org-Id": f"user-{user_id}", **make_test_auth_headers(user_id)})
    assert got.status_code == 403, got.text
    assert got.json()["detail"]["code"] == "agreement_read_denied"
    assert "Cedar Ridge Labs LLC" not in got.text

def test_unauthenticated_cannot_read_guest_draft(isolated_commercial):
    client = TestClient(app)
    _org_a, _token_a, headers_a = mint_anonymous_session(client)
    created = client.post("/api/agreements/draft", headers={**headers_a, "Content-Type": "application/json"}, json=_GUEST_DRAFT)
    assert created.status_code == 200, created.text
    aid = created.json()["id"]
    got = client.get(f"/api/agreements/{aid}")
    assert got.status_code == 401, got.text
    assert "Cedar Ridge Labs LLC" not in got.text
