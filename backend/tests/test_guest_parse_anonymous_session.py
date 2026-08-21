"""Guest parse with anonymous session — homepage→create flow without sign-in."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.anonymous_session_store import reset_anonymous_session_store_for_tests
from backend.tests.conftest_auth_security import auth_secrets, mint_anonymous_session


pytestmark = pytest.mark.unit


@pytest.fixture()
def isolated_stores(tmp_path, monkeypatch: pytest.MonkeyPatch, auth_secrets):
    """Configure isolated DB paths and reset singletons."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite3"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_STRICT_IN_DEV", "1")

    import backend.usage_economics.store as ue_store_mod
    from backend.economics.store import reset_economics_store_for_tests

    ue_store_mod._store = None
    reset_economics_store_for_tests()
    reset_anonymous_session_store_for_tests()
    yield
    ue_store_mod._store = None
    reset_economics_store_for_tests()
    reset_anonymous_session_store_for_tests()


def test_anonymous_session_basic_parse_succeeds(isolated_stores, monkeypatch):
    """Guest with valid anonymous session can call basic parse (not 401)."""
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps({
            "title": "Referral Agreement",
            "jurisdiction": "Arizona",
            "parties": [
                {"name": "Harbor Pool & Patio", "role": "party"},
                {"name": "Mesa Realty Group", "role": "party"},
            ],
            "purpose": "7% referral fee for leads, deposit triggers payment, 12 months term",
            "payment_terms": "7% on deposit",
            "duration": "12 months",
            "due_date": None,
            "effective_date": None,
        })

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)

    client = TestClient(app)
    _anon_org, _token, headers = mint_anonymous_session(client)

    res = client.post(
        "/api/agreements/parse",
        headers=headers,
        json={
            "intake_text": (
                "Harbor Pool & Patio and Mesa Realty Group referral deal. "
                "7% fee when deposit received. 12 months. AZ."
            ),
            "ai_model_class": "basic",
        },
    )
    assert res.status_code == 200, f"Expected 200 but got {res.status_code}: {res.text}"
    body = res.json()
    assert "draft" in body
    draft = body["draft"]
    assert draft["jurisdiction"] == "Arizona"
    parties = draft.get("parties") or []
    party_names = [p["name"] for p in parties]
    assert "Harbor Pool & Patio" in party_names
    assert "Mesa Realty Group" in party_names


def test_anonymous_session_parse_heuristic_fallback_on_llm_failure(isolated_stores, monkeypatch):
    """Guest basic parse falls back to heuristic when LLM fails (not 401, not 503)."""
    import backend.routers.agreements_v2_api as av2

    def boom(*args, **kwargs):
        raise RuntimeError("simulated_llm_failure")

    monkeypatch.setattr(av2, "call_legal_llm", boom)

    client = TestClient(app)
    _anon_org, _token, headers = mint_anonymous_session(client)

    res = client.post(
        "/api/agreements/parse",
        headers=headers,
        json={
            "intake_text": "Acme Corp and Beta LLC for landscaping services",
            "ai_model_class": "basic",
        },
    )
    assert res.status_code == 200, f"Expected 200 fallback but got {res.status_code}: {res.text}"
    body = res.json()
    assert "draft" in body
    assert body["draft"].get("title")


def test_parse_without_anonymous_session_returns_401(isolated_stores):
    """Parse request without any auth credentials returns 401."""
    client = TestClient(app)

    res = client.post(
        "/api/agreements/parse",
        headers={"X-Claw-Org-Id": "anon-fake-session-id"},
        json={"intake_text": "Test deal", "ai_model_class": "basic"},
    )
    assert res.status_code == 401, f"Expected 401 but got {res.status_code}: {res.text}"


def test_parse_with_invalid_anonymous_session_returns_401(isolated_stores):
    """Parse request with invalid/forged anonymous session token returns 401."""
    client = TestClient(app)

    res = client.post(
        "/api/agreements/parse",
        headers={
            "X-Claw-Org-Id": "anon-forged-org-12345",
            "X-Claw-Anon-Session": "forged-token-not-server-minted",
        },
        json={"intake_text": "Test deal", "ai_model_class": "basic"},
    )
    assert res.status_code == 401, f"Expected 401 but got {res.status_code}: {res.text}"


def test_premium_parse_requires_authenticated_user_not_anonymous(isolated_stores, monkeypatch):
    """Premium parse requires authenticated user — anonymous session is insufficient."""
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps({
            "title": "T",
            "jurisdiction": "TX",
            "parties": [{"name": "A", "role": "party"}, {"name": "B", "role": "party"}],
            "purpose": "p",
            "payment_terms": "",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        })

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)

    client = TestClient(app)
    _anon_org, _token, headers = mint_anonymous_session(client)

    res = client.post(
        "/api/agreements/parse",
        headers=headers,
        json={"intake_text": "Premium rewrite request", "ai_model_class": "premium"},
    )
    assert res.status_code == 401, f"Expected 401 for premium parse with anon session but got {res.status_code}"
    detail = res.json().get("detail", {})
    assert detail.get("code") in ("authenticated_session_required", "invalid_auth_token", "auth_required")
