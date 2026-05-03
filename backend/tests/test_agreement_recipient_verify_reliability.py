"""Reliability for recipient-access-token mint, access/validate, and public /verify API."""

from unittest import mock

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORG = {"X-Claw-Org-Id": "test-org-recipient-verify-reliability"}


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _create_draft_with_parties(client: TestClient) -> str:
    c = client.post(
        "/api/agreements/draft",
        headers=_ORG,
        json={
            "title": "Reliability mint",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Owner Co", "role": "owner", "id": "p-owner"},
                {"name": "Signer Co", "role": "signer", "id": "p-signer"},
            ],
            "purpose": "P",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert c.status_code == 200
    return c.json()["id"]


def test_recipient_access_token_mint_succeeds_without_explicit_secret_non_prod(
    monkeypatch, tmp_path
):
    """(a) Valid agreement + parties: mint returns 200 and token when secret uses non-prod fallback."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.delenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", raising=False)
    client = TestClient(app)
    aid = _create_draft_with_parties(client)
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG,
        json={
            "mode": "review",
            "role": "signer",
            "recipient_party_id": "p-signer",
            "inviter_display_name": "Owner Co",
        },
    )
    assert mint.status_code == 200
    body = mint.json()
    assert body.get("token")
    assert body.get("expires_in_seconds")


def test_recipient_access_token_does_not_503_without_signing_lock(monkeypatch, tmp_path):
    """(b) Review mint must not 503 when optional signing-lock / proof fields are absent."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    monkeypatch.delenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", raising=False)
    client = TestClient(app)
    aid = _create_draft_with_parties(client)
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG,
        json={"mode": "review", "role": "signer"},
    )
    assert mint.status_code == 200
    assert mint.status_code != 503
    assert mint.json().get("token")


def test_public_verify_does_not_500_when_overview_hash_raises(monkeypatch, tmp_path):
    """(c) Existing agreement: degraded 200 payload if verification bundle raises."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_PUBLIC_AGREEMENT_VERIFY", "1")
    client = TestClient(app)
    aid = _create_draft_with_parties(client)

    def _boom(*_a, **_kw):
        raise RuntimeError("simulated incomplete proof")

    monkeypatch.setattr(
        "backend.routers.agreements_v2_api._public_agreement_overview_hash",
        _boom,
    )
    r = client.get(f"/api/agreements/public/{aid}/verify")
    assert r.status_code == 200
    data = r.json()
    assert data["agreement_id"] == aid
    assert data.get("record_status") == "pending"
    assert data.get("record_status_reason") == "verification_bundle_incomplete"
    assert data["summary"]["title"] == "Reliability mint"


def test_public_verify_missing_agreement_404_structured(monkeypatch, tmp_path):
    """(d) Missing agreement returns 404 with safe structured detail."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_PUBLIC_AGREEMENT_VERIFY", "1")
    client = TestClient(app)
    r = client.get("/api/agreements/public/agreement-id-that-does-not-exist-000/verify")
    assert r.status_code == 404
    detail = r.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("code") == "agreement_not_found"


def test_recipient_access_token_mint_422_when_prod_and_secret_unset(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.delenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", raising=False)
    client = TestClient(app)
    aid = _create_draft_with_parties(client)
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG,
        json={"mode": "review", "role": "signer"},
    )
    assert mint.status_code == 422
    d = mint.json().get("detail")
    assert isinstance(d, dict)
    assert d.get("code") == "signing_token_secret_not_configured"


def test_recipient_access_token_mint_retries_on_transient_mint_failure(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-mint-retry-secret")
    client = TestClient(app)
    aid = _create_draft_with_parties(client)
    with mock.patch(
        "backend.routers.agreements_v2_api.mint_recipient_access_token",
        side_effect=[RuntimeError("transient"), RuntimeError("transient"), "ok-token"],
    ):
        mint = client.post(
            f"/api/agreements/{aid}/recipient-access-token",
            headers=_ORG,
            json={"mode": "review", "role": "signer"},
        )
    assert mint.status_code == 200
    assert mint.json().get("token") == "ok-token"


def test_recipient_access_token_mint_422_after_exhausted_retries(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-mint-exhaust-secret")
    client = TestClient(app)
    aid = _create_draft_with_parties(client)
    with mock.patch(
        "backend.routers.agreements_v2_api.mint_recipient_access_token",
        side_effect=RuntimeError("persistent"),
    ):
        mint = client.post(
            f"/api/agreements/{aid}/recipient-access-token",
            headers=_ORG,
            json={"mode": "review", "role": "signer"},
        )
    assert mint.status_code == 422
    assert mint.json()["detail"]["code"] == "recipient_token_mint_unavailable"


def test_recipient_access_validate_422_when_prod_and_secret_unset(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.delenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", raising=False)
    client = TestClient(app)
    r = client.get("/api/agreements/access/validate", params={"token": "x", "agreement_id": "y"})
    assert r.status_code == 422
    d = r.json().get("detail")
    assert isinstance(d, dict)
    assert d.get("code") == "signing_token_secret_not_configured"
