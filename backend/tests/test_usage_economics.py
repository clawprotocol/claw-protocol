"""Usage economics — Guest / Genesis / Pro model (authenticated Free tier removed)."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.entitlement_test_support import ensure_headers_entitled, ensure_user_genesis_entitlement
from backend.tests.conftest_auth_security import mint_anonymous_session
from backend.usage_economics.store import UsageEconomicsStore


@pytest.fixture()
def isolated_usage_db(tmp_path, monkeypatch: pytest.MonkeyPatch):
    path = str(tmp_path / "usage_eco.sqlite3")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", path)
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite3"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite3"))
    import backend.usage_economics.store as ue_store

    ue_store._store = None
    st = UsageEconomicsStore(path)
    st.init_schema()
    yield path
    ue_store._store = None


def test_authenticated_without_entitlement_blocked(isolated_usage_db, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_STRICT_IN_DEV", "1")
    client = TestClient(app)
    h = {"X-Claw-Org-Id": "test-org-free", "X-Claw-Test-Auth-User-Id": "test-owner"}
    r = client.post(
        "/api/agreements/draft",
        headers=h,
        json={
            "title": "T",
            "jurisdiction": "CA",
            "parties": [{"name": "A", "role": "owner"}],
            "purpose": "p",
            "payment_terms": "pt",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert r.status_code == 403, r.text
    assert r.json().get("detail", {}).get("code") == "entitlement_required"


def test_review_first_paid_pro_persist_allowed_with_pro(isolated_usage_db, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_STRICT_IN_DEV", "1")
    client = TestClient(app)
    h = {"X-Claw-Org-Id": "test-org-review-first", "X-Claw-Test-Auth-User-Id": "test-owner"}
    ensure_headers_entitled(h)
    body = {
        "title": "Paid Pro Review",
        "jurisdiction": "CA",
        "parties": [{"name": "A", "role": "owner"}],
        "purpose": "x" * 600,
        "payment_terms": "pt",
        "duration": None,
        "due_date": None,
        "effective_date": None,
    }
    r = client.post(
        "/api/agreements/draft",
        headers={**h, "X-Claw-Review-First-Persist": "1"},
        json=body,
    )
    assert r.status_code == 200, r.text


def test_draft_requires_x_claw_org_id_header(isolated_usage_db, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    client = TestClient(app)
    body = {
        "title": "T",
        "jurisdiction": "CA",
        "parties": [{"name": "A", "role": "owner"}],
        "purpose": "p",
        "payment_terms": "pt",
        "duration": None,
        "due_date": None,
        "effective_date": None,
    }
    r = client.post("/api/agreements/draft", json=body)
    assert r.status_code == 401
    detail = r.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("code") == "org_header_required"


def test_ip_burst_sets_soft_throttle_for_guest(isolated_usage_db, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")
    from backend.security.anonymous_session_store import reset_anonymous_session_store_for_tests
    from backend.usage_economics import constants as ue_constants

    reset_anonymous_session_store_for_tests()
    monkeypatch.setattr(ue_constants, "IP_AGREEMENT_BURST_MAX_CREATES", 3)

    client = TestClient(app)
    body = {
        "title": "T",
        "jurisdiction": "CA",
        "parties": [{"name": "A", "role": "owner"}],
        "purpose": "p",
        "payment_terms": "pt",
        "duration": None,
        "due_date": None,
        "effective_date": None,
    }
    last_headers = {}
    for _ in range(4):
        r_sess = client.post("/v1/workspace/anonymous-session")
        assert r_sess.status_code == 200, r_sess.text
        sess = r_sess.json()
        headers = {
            "X-Claw-Org-Id": sess["org_id"],
            "X-Claw-Anon-Session": sess["token"],
        }
        last_headers = headers
        r = client.post("/api/agreements/draft", headers=headers, json=body)
        assert r.status_code == 200, r.text

    rsum = client.get("/api/agreements/usage/summary", headers=last_headers)
    assert rsum.status_code == 200, rsum.text
    assert rsum.json().get("soft_throttle") is True


def test_usage_summary_no_keys_in_payload(isolated_usage_db, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_ANON_SESSION_SECRET", "test-anon-session-secret")
    from backend.security.anonymous_session_store import reset_anonymous_session_store_for_tests

    reset_anonymous_session_store_for_tests()
    client = TestClient(app)
    r_sess = client.post("/v1/workspace/anonymous-session")
    assert r_sess.status_code == 200, r_sess.text
    sess = r_sess.json()
    headers = {
        "X-Claw-Org-Id": sess["org_id"],
        "X-Claw-Anon-Session": sess["token"],
    }
    r = client.get("/api/agreements/usage/summary", headers=headers)
    assert r.status_code == 200, r.text
    payload = r.json()
    assert "keys" not in str(payload).lower()
    assert "drafts_remaining" in payload
    assert payload.get("draft_ttl_hours") == 24
    assert payload.get("temporary_storage_note")
