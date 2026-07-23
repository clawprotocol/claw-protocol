"""
Patch 1 adversarial: commercial draft/read/write fail-closed when economics is off.

Proves anonymous / forged-org reads cannot bypass via CLAW_USAGE_ECONOMICS_ENABLED=0.
Public verify remains intentionally public and minimally disclosing.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.recipient_access_token import mint_recipient_access_token


_SECRET = "unit-test-commercial-read-scope-secret"


@pytest.fixture()
def client(monkeypatch, tmp_path):
    from backend.usage_economics import store as usage_economics_store_mod

    usage_economics_store_mod._store = None  # noqa: SLF001
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _SECRET)
    monkeypatch.setenv("CLAW_PUBLIC_AGREEMENT_VERIFY", "1")
    monkeypatch.delenv("CLAW_RECIPIENT_ACCESS_TOKEN_REQUIRED", raising=False)
    monkeypatch.delenv("CLAW_ALLOW_TOKENLESS_SIGNER_COMPLETE", raising=False)
    return TestClient(app)


def _owner(user: str = "owner-a") -> dict[str, str]:
    return {"X-Claw-Org-Id": f"user-{user}", "X-Claw-Test-Auth-User-Id": user}


def _create_owned_draft(client: TestClient, *, user: str = "owner-a", title: str = "Owned") -> str:
    """Create under economics ON so ownership is registered, then caller may disable economics."""
    r = client.post(
        "/api/agreements/draft",
        headers=_owner(user),
        json={
            "title": title,
            "jurisdiction": "TX",
            "parties": [
                {"name": "Owner Co", "role": "Client", "id": "p1", "email": "o@x.com"},
                {"name": "Signer Co", "role": "Service Provider", "id": "p2", "email": "s@x.com"},
            ],
            "purpose": "CONFIDENTIAL_PURPOSE_BODY",
            "payment_terms": "CONFIDENTIAL_PAYMENT_TERMS",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _enable_commercial_economics_off(monkeypatch) -> None:
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "0")
    monkeypatch.delenv("CLAW_RECIPIENT_ACCESS_TOKEN_REQUIRED", raising=False)


def test_anonymous_full_draft_read_fails_commercial_economics_off(monkeypatch, client: TestClient):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    aid = _create_owned_draft(client)
    _enable_commercial_economics_off(monkeypatch)

    anon = client.get(f"/api/agreements/{aid}")
    assert anon.status_code in (401, 403), anon.text
    detail = anon.json().get("detail")
    if isinstance(detail, dict):
        assert detail.get("code") in {
            "authenticated_session_required",
            "org_header_required",
            "agreement_read_denied",
            "recipient_token_required",
        }


def test_forged_org_header_cannot_read_other_org_draft(monkeypatch, client: TestClient):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    aid = _create_owned_draft(client, user="owner-a")
    _enable_commercial_economics_off(monkeypatch)

    forged = client.get(
        f"/api/agreements/{aid}",
        headers={
            "X-Claw-Org-Id": "user-attacker",
            "X-Claw-Test-Auth-User-Id": "attacker",
        },
    )
    assert forged.status_code == 403, forged.text
    assert forged.json()["detail"]["code"] == "agreement_read_denied"


def test_anonymous_canonical_review_snapshot_read_fails(monkeypatch, client: TestClient):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    aid = _create_owned_draft(client)
    _enable_commercial_economics_off(monkeypatch)

    anon = client.get(f"/api/agreements/{aid}/canonical-review-snapshot")
    assert anon.status_code in (401, 403), anon.text


def test_anonymous_export_and_render_fail(monkeypatch, client: TestClient):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    aid = _create_owned_draft(client)
    _enable_commercial_economics_off(monkeypatch)

    for path in (
        f"/api/agreements/{aid}/export-draft.txt",
        f"/api/agreements/{aid}/export-draft.docx",
    ):
        r = client.get(path)
        assert r.status_code in (401, 403), (path, r.status_code, r.text)

    render = client.post(f"/api/agreements/{aid}/render", json={})
    assert render.status_code in (401, 403), render.text


def test_anonymous_proof_status_fails_when_gated(monkeypatch, client: TestClient):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    aid = _create_owned_draft(client)
    _enable_commercial_economics_off(monkeypatch)

    r = client.get(f"/api/agreements/{aid}/proof-status")
    assert r.status_code in (401, 403), r.text


def test_valid_owner_reads_only_own_agreement(monkeypatch, client: TestClient):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    aid_a = _create_owned_draft(client, user="owner-a", title="A-Draft")
    aid_b = _create_owned_draft(client, user="owner-b", title="B-Draft")
    _enable_commercial_economics_off(monkeypatch)

    ok = client.get(f"/api/agreements/{aid_a}", headers=_owner("owner-a"))
    assert ok.status_code == 200, ok.text
    assert ok.json()["draft"]["title"] == "A-Draft"

    cross = client.get(f"/api/agreements/{aid_b}", headers=_owner("owner-a"))
    assert cross.status_code == 403, cross.text
    assert cross.json()["detail"]["code"] == "agreement_read_denied"


def test_valid_recipient_token_scoped_to_agreement(monkeypatch, client: TestClient):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    aid = _create_owned_draft(client, user="owner-a")
    aid_other = _create_owned_draft(client, user="owner-b", title="Other")

    tok = mint_recipient_access_token(
        secret=_SECRET.encode("utf-8"),
        agreement_id=aid,
        mode="review",
        role="signer",
        locked_version_id="v1",
        recipient_party_id="p2",
        inviter_display_name="Owner",
        ttl_seconds=3600,
    )
    _enable_commercial_economics_off(monkeypatch)

    ok = client.get(
        f"/api/agreements/{aid}",
        headers={"X-Claw-Recipient-Access-Token": tok},
    )
    assert ok.status_code == 200, ok.text

    wrong_aid = client.get(
        f"/api/agreements/{aid_other}",
        headers={"X-Claw-Recipient-Access-Token": tok},
    )
    assert wrong_aid.status_code == 403, wrong_aid.text


def test_anonymous_recipient_write_fails_commercial_economics_off(monkeypatch, client: TestClient):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    aid = _create_owned_draft(client)
    _enable_commercial_economics_off(monkeypatch)

    r = client.post(
        f"/api/agreements/{aid}/recipient-approve",
        json={"participant_id": "p2"},
    )
    assert r.status_code in (401, 403), r.text


def test_public_verify_remains_public_and_minimally_disclosing(monkeypatch, client: TestClient):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    aid = _create_owned_draft(client, title="PublicVerify")
    _enable_commercial_economics_off(monkeypatch)

    v = client.get(f"/api/agreements/public/{aid}/verify")
    assert v.status_code == 200, v.text
    body = v.json()
    assert body.get("agreement_id") == aid
    dumped = str(body)
    assert "CONFIDENTIAL_PURPOSE_BODY" not in dumped
    assert "CONFIDENTIAL_PAYMENT_TERMS" not in dumped
    # Read-only: no mutation surface on public verify response.
    assert "draft" not in body or body.get("draft") in (None, {})
