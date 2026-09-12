"""Production-handler proof for Core Paid Journey drafting facts (model stubbed)."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.entitlement_test_support import ensure_org_pro_entitlement


OWNER = "core-paid-owner"
ORG = f"user-{OWNER}"
FILLED = (
    "Draft a consulting services agreement between Harbor Peak Analytics LLC (Consultant) "
    "and Ironvale Manufacturing Inc. (Client). Scope is AI workflow implementation. "
    "Fixed fee $48,000. Term twelve months starting October 1, 2026. Governing law Delaware. "
    "Consultant owns pre-existing tools; Client owns deliverables after payment."
)


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_LLM_ACCEPTANCE_STUB", "1")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-acceptance-stub-not-live")
    import backend.routers.agreements_v2_api as av2
    import backend.economics.store as eco_store

    monkeypatch.setattr(av2, "OPENAI_API_KEY", "sk-acceptance-stub-not-live")
    eco_store.reset_economics_store_for_tests()
    ensure_org_pro_entitlement(ORG, user_id=OWNER)
    return TestClient(app, raise_server_exceptions=False)


def _headers() -> dict:
    return {
        "X-Claw-Org-Id": ORG,
        "X-Claw-Test-Auth-User-Id": OWNER,
        "Content-Type": "application/json",
    }


def test_sparse_stub_does_not_invent_parties(client: TestClient) -> None:
    from backend.llm_acceptance_stub import stub_legal_llm_completion

    sparse = stub_legal_llm_completion(
        [{"role": "user", "content": "need a consulting agreement for about 48k"}],
        call_purpose="agreement_drafting",
    )
    assert "Harbor Peak Analytics LLC" not in sparse
    assert "missing_material_info" in sparse


def test_premium_full_draft_returns_expected_consulting_facts(client: TestClient) -> None:
    res = client.post(
        "/api/agreements/premium-full-draft",
        headers=_headers(),
        json={"intake_text": FILLED, "user_gap_answers": ""},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    doc = str(body.get("document_text") or body.get("server_full_document_text") or "")
    assert "CONSULTING SERVICES AGREEMENT" in doc
    assert "Harbor Peak Analytics LLC" in doc
    assert "Ironvale Manufacturing Inc." in doc
    assert "$48,000" in doc
    assert "Delaware" in doc
    assert "AI workflow implementation" in doc
    assert "Orion Labs" not in doc
    assert "[" not in doc or "insert" not in doc.lower()


def test_commercial_es256_bearer_binds_and_sees_pro(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from backend.jwt_acceptance_jwks import (
        DEFAULT_ISSUER,
        install_acceptance_jwks_fetch_if_configured,
        mint_acceptance_es256_jwt,
        write_acceptance_jwks_bundle,
    )

    bundle = write_acceptance_jwks_bundle(tmp_path)
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_JWT_ACCEPTANCE_JWKS_PATH", bundle["jwks_path"])
    monkeypatch.setenv("SUPABASE_JWT_ISSUER", DEFAULT_ISSUER)
    monkeypatch.setenv("SUPABASE_JWT_AUDIENCE", "authenticated")
    import backend.economics.store as eco_store

    eco_store.reset_economics_store_for_tests()
    ensure_org_pro_entitlement(ORG, user_id=OWNER)
    import backend.security.supabase_jwt as jwt_mod

    original_fetch = jwt_mod._fetch_jwks_document
    try:
        assert install_acceptance_jwks_fetch_if_configured() is True
        token = mint_acceptance_es256_jwt(
            OWNER,
            pem_path=Path(bundle["pem_path"]),
            extra={"email": "core.paid.owner@lawdog.test"},
        )
        client = TestClient(app, raise_server_exceptions=False)
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Claw-Org-Id": ORG,
            "Content-Type": "application/json",
        }
        bind = client.post(
            "/v1/workspace/bind-user-org",
            headers=headers,
            json={
                "user_id": OWNER,
                "email": "core.paid.owner@lawdog.test",
                "display_name": "Core Paid Owner",
                "previous_org_id": ORG,
                "claim_method": "session_restore",
            },
        )
        assert bind.status_code == 200, bind.text
        assert bind.json()["org_id"] == ORG
        usage = client.get("/api/agreements/usage/summary", headers=headers)
        assert usage.status_code == 200, usage.text
        body = usage.json()
        commercial = body.get("commercial") or {}
        assert (
            commercial.get("state") == "pro"
            or commercial.get("entitlement") == "paid_pro"
            or body.get("state") == "pro"
            or body.get("tier") in {"paid", "pro"}
        )
    finally:
        jwt_mod._fetch_jwks_document = original_fetch
        jwt_mod.reset_supabase_jwks_cache_for_tests()
