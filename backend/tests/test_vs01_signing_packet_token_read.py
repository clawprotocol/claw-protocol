"""VS01 public packet GET is reachable but not readable without a sign-mode token."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.auth_fixtures import persist_and_accept_review_snapshot
from backend.tests.entitlement_test_support import ensure_headers_entitled
from backend.tests.vs01_packet_token_support import mint_vs01_packet_sign_token

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-vs01-packet-read", "X-Claw-Test-Auth-User-Id": "test-owner"}


@pytest.fixture(autouse=True)
def _entitle_owner(tmp_path, monkeypatch):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    from backend.economics.store import reset_economics_store_for_tests

    reset_economics_store_for_tests()
    ensure_headers_entitled(_ORG_H)
    yield
    reset_economics_store_for_tests()


def _seed_packet(client: TestClient) -> str:
    create = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Packet Read Agreement",
            "jurisdiction": "TX",
            "parties": [
                {"id": "p_owner", "name": "Alpha LLC", "role": "owner", "email": "owner@example.com"},
                {"id": "p_cp", "name": "Beta LLC", "role": "party", "email": "cp@example.com"},
            ],
            "purpose": "Services",
            "payment_terms": "Net 30",
        },
    )
    assert create.status_code == 200
    aid = create.json()["id"]
    persist_and_accept_review_snapshot(client, aid, headers=_ORG_H, corpus="x" * 1600)
    return aid


def test_packet_get_requires_sign_mode_token(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    client = TestClient(app)
    aid = _seed_packet(client)
    missing = client.get(
        f"/api/agreements/public/{aid}/vs01-signing-packet",
        params={"document_id": "doc_missing"},
    )
    assert missing.status_code == 403
    assert missing.json()["detail"]["code"] == "recipient_token_required"

    tok = mint_vs01_packet_sign_token(aid, "p_cp")
    no_packet = client.get(
        f"/api/agreements/public/{aid}/vs01-signing-packet",
        params={"document_id": "doc_missing", "t": tok},
    )
    assert no_packet.status_code == 404

    from backend.config.agreement_signing_token import resolve_signing_token_secret_raw
    from backend.security.recipient_access_token import mint_recipient_access_token

    review_tok = mint_recipient_access_token(
        secret=resolve_signing_token_secret_raw().encode("utf-8"),
        agreement_id=aid,
        locked_version_id="v1",
        mode="review",
        role="reviewer",
        ttl_seconds=3600,
        recipient_party_id="p_cp",
    )
    review_res = client.get(
        f"/api/agreements/public/{aid}/vs01-signing-packet",
        params={"document_id": "doc_missing", "t": review_tok},
    )
    assert review_res.status_code == 404
