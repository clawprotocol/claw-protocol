"""Read-scope boundaries for full agreement drafts (owner org vs recipient token vs public verify)."""

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    """``get_usage_economics_store()`` caches DB path; reset so per-test ``CLAW_USAGE_ECONOMICS_DB_PATH`` applies."""
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001

_ORG_A = {"X-Claw-Org-Id": "read-scope-org-a", "X-Claw-Test-Auth-User-Id": "owner-a"}
_ORG_B = {"X-Claw-Org-Id": "read-scope-org-b", "X-Claw-Test-Auth-User-Id": "owner-b"}


def test_no_credentials_returns_401_not_403(monkeypatch, tmp_path):
    """Credentialless read must be 401 (no identity), not 403 (forbidden resource)."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    c = client.post(
        "/api/agreements/draft",
        headers=_ORG_A,
        json={
            "title": "Auth contract",
            "jurisdiction": "TX",
            "parties": [{"name": "O", "role": "owner"}],
            "purpose": "P",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert c.status_code == 200
    aid = c.json()["id"]
    anon = client.get(f"/api/agreements/{aid}")
    assert anon.status_code == 401
    assert anon.json()["detail"]["code"] == "org_header_required"


def test_wrong_org_returns_403_ownership_denied(monkeypatch, tmp_path):
    """Valid workspace header but non-owner org is 403 authorization failure."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    c = client.post(
        "/api/agreements/draft",
        headers=_ORG_A,
        json={
            "title": "Auth contract",
            "jurisdiction": "TX",
            "parties": [{"name": "O", "role": "owner"}],
            "purpose": "P",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert c.status_code == 200
    aid = c.json()["id"]
    other = client.get(f"/api/agreements/{aid}", headers=_ORG_B)
    assert other.status_code == 403
    assert other.json()["detail"]["code"] == "agreement_read_denied"


def test_full_draft_get_requires_owner_org_when_economics_on(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    c = client.post(
        "/api/agreements/draft",
        headers=_ORG_A,
        json={
            "title": "Scope test",
            "jurisdiction": "TX",
            "parties": [{"name": "O", "role": "owner"}],
            "purpose": "P",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert c.status_code == 200
    aid = c.json()["id"]

    anon = client.get(f"/api/agreements/{aid}")
    assert anon.status_code == 401
    assert anon.json()["detail"]["code"] == "org_header_required"

    other = client.get(f"/api/agreements/{aid}", headers=_ORG_B)
    assert other.status_code == 403
    assert other.json()["detail"]["code"] == "agreement_read_denied"

    ok = client.get(f"/api/agreements/{aid}", headers=_ORG_A)
    assert ok.status_code == 200
    assert ok.json()["draft"]["title"] == "Scope test"


def test_full_draft_get_with_recipient_token(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-read-scope-secret")
    client = TestClient(app)

    c = client.post(
        "/api/agreements/draft",
        headers=_ORG_A,
        json={
            "title": "Token read",
            "jurisdiction": "TX",
            "parties": [
                {"name": "O", "role": "owner", "id": "p-o"},
                {"name": "R", "role": "signer", "id": "p-r"},
            ],
            "purpose": "P",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    aid = c.json()["id"]
    client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_ORG_A,
        json={"field": "parties", "value": c.json()["draft"]["parties"]},
    )

    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG_A,
        json={
            "mode": "review",
            "role": "signer",
            "recipient_party_id": "p-r",
            "inviter_display_name": "Owner",
        },
    )
    assert mint.status_code == 200
    tok = mint.json()["token"]

    r = client.get(
        f"/api/agreements/{aid}",
        headers={"X-Claw-Recipient-Access-Token": tok},
    )
    assert r.status_code == 200
    assert r.json()["draft"]["title"] == "Token read"

    bad = client.get(
        f"/api/agreements/{aid}",
        headers={"X-Claw-Recipient-Access-Token": "not-a-real-token"},
    )
    assert bad.status_code == 403


def test_public_verify_unauthenticated_unchanged(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_PUBLIC_AGREEMENT_VERIFY", "1")
    client = TestClient(app)
    c = client.post(
        "/api/agreements/draft",
        headers=_ORG_A,
        json={
            "title": "Public",
            "jurisdiction": "WA",
            "parties": [{"name": "A", "role": "owner"}],
            "purpose": "SECRET",
            "payment_terms": "SECRET",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    aid = c.json()["id"]
    v = client.get(f"/api/agreements/public/{aid}/verify")
    assert v.status_code == 200
    body = v.json()
    assert body["agreement_id"] == aid
    assert "SECRET" not in str(body)


def _draft_with_two_signers(client: TestClient, org: dict) -> tuple[str, dict]:
    c = client.post(
        "/api/agreements/draft",
        headers=org,
        json={
            "title": "Write scope",
            "jurisdiction": "TX",
            "parties": [
                {"name": "O", "role": "owner", "id": "p-o"},
                {"name": "R1", "role": "signer", "id": "p-r1"},
                {"name": "R2", "role": "signer", "id": "p-r2"},
            ],
            "purpose": "P",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert c.status_code == 200
    aid = c.json()["id"]
    d = client.get(f"/api/agreements/{aid}", headers=org).json()
    return aid, d["draft"]


def test_recipient_writes_require_token_when_strict(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-recipient-write-secret")
    client = TestClient(app)
    aid, draft = _draft_with_two_signers(client, _ORG_A)
    na = client.post(
        f"/api/agreements/{aid}/negotiate-assist",
        json={
            "mode": "summary",
            "recipient_instruction": "Summarize the draft for me.",
            "prior_snapshot": {},
            "current_snapshot": draft,
            "session_type": "recipient",
            "negotiation_posture": "cooperative",
        },
    )
    assert na.status_code == 403
    assert na.json()["detail"]["code"] == "recipient_token_required"
    rv = client.post(
        f"/api/agreements/{aid}/revise",
        json={
            "instruction": "Set payment terms to Net 60",
            "session_type": "recipient",
            "persist": False,
        },
    )
    assert rv.status_code == 403
    assert rv.json()["detail"]["code"] == "recipient_token_required"
    rp = client.post(
        f"/api/agreements/{aid}/recipient-proposal/stage",
        json={
            "instruction": "x",
            "proposer_id": "p-r1",
            "draft": {
                "title": draft["title"],
                "jurisdiction": draft["jurisdiction"],
                "parties": draft["parties"],
                "purpose": draft["purpose"],
                "payment_terms": draft["payment_terms"],
                "duration": draft.get("duration"),
                "due_date": draft.get("due_date"),
                "effective_date": draft.get("effective_date"),
            },
            "rendered_html": "<p>t</p>",
        },
    )
    assert rp.status_code == 403
    assert rp.json()["detail"]["code"] == "recipient_token_required"
    ap = client.post(
        f"/api/agreements/{aid}/recipient-approve",
        json={"participant_id": "p-r1", "participant_display_name": "R1"},
    )
    assert ap.status_code == 403
    assert ap.json()["detail"]["code"] == "recipient_token_required"


def test_recipient_writes_accept_review_token_and_reject_wrong_party(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-recipient-write-secret-b")
    client = TestClient(app)
    aid, draft = _draft_with_two_signers(client, _ORG_A)
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG_A,
        json={
            "mode": "review",
            "role": "signer",
            "recipient_party_id": "p-r1",
            "inviter_display_name": "Owner",
        },
    )
    assert mint.status_code == 200
    tok = mint.json()["token"]
    rh = {"X-Claw-Recipient-Access-Token": tok}
    rv = client.post(
        f"/api/agreements/{aid}/revise",
        headers=rh,
        json={
            "instruction": "Set payment terms to Net 60",
            "session_type": "recipient",
            "persist": False,
        },
    )
    assert rv.status_code == 200
    bad_prop = client.post(
        f"/api/agreements/{aid}/recipient-proposal/stage",
        headers=rh,
        json={
            "instruction": "Change terms",
            "proposer_id": "p-r2",
            "draft": {
                "title": draft["title"],
                "jurisdiction": draft["jurisdiction"],
                "parties": draft["parties"],
                "purpose": draft["purpose"],
                "payment_terms": draft["payment_terms"],
                "duration": draft.get("duration"),
                "due_date": draft.get("due_date"),
                "effective_date": draft.get("effective_date"),
            },
            "rendered_html": "<p>t</p>",
        },
    )
    assert bad_prop.status_code == 403
    assert bad_prop.json()["detail"]["code"] == "recipient_party_token_mismatch"


def test_recipient_revise_rejects_sign_mode_token(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-recipient-write-secret-c")
    client = TestClient(app)
    aid, _draft = _draft_with_two_signers(client, _ORG_A)
    mint_rev = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG_A,
        json={"mode": "review", "role": "signer"},
    )
    assert mint_rev.status_code == 200
    review_tok = mint_rev.json()["token"]
    rh = {"X-Claw-Recipient-Access-Token": review_tok}
    for pid, label in (("p-r1", "R1"), ("p-r2", "R2")):
        ap = client.post(
            f"/api/agreements/{aid}/recipient-approve",
            headers=rh,
            json={"participant_id": pid, "participant_display_name": label},
        )
        assert ap.status_code == 200
    lock = client.put(
        f"/api/agreements/{aid}/signing-lock",
        headers=_ORG_A,
        json={
            "locked_version_id": "lv-ws-1",
            "locked_at": "2026-04-01T12:00:00Z",
            "locked_by": "owner",
        },
    )
    assert lock.status_code == 200
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG_A,
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p-acme"},
    )
    assert mint.status_code == 200
    sign_tok = mint.json()["token"]
    rv = client.post(
        f"/api/agreements/{aid}/revise",
        headers={"X-Claw-Recipient-Access-Token": sign_tok},
        json={
            "instruction": "Set payment terms to Net 60",
            "session_type": "recipient",
            "persist": False,
        },
    )
    assert rv.status_code == 403
    assert rv.json()["detail"]["code"] == "recipient_token_mode_not_allowed"
